import { describe, expect, spyOn, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { GAME_CONFIG, type EnterReply, type Failure, type GameType, type RoomCommand } from '@deshi/game';
import { applyAction, createGame } from './game';
import { createUnoGame } from './games/uno/engine';
import { RoomService, type RoomEvent, type RoomPublisher } from './rooms';
import { roomSchema, type RoomDocument } from './schema';
import { MemoryRoomStore, StorageConflict } from './store';

type Entry = Extract<EnterReply, { ok: true }>;
const publisher: RoomPublisher = { async publish() {} };
const credentials = (entry: Entry) => ({ resumeToken: entry.resumeToken, connectionId: entry.connectionId });
function success<T extends { ok: true }>(reply: T | Failure): T {
  if (!reply.ok) throw new Error(JSON.stringify(reply));
  return reply;
}
async function savedRoom(store: MemoryRoomStore, code: string) {
  const room = await store.get(code);
  if (!room) throw new Error('Expected a saved room');
  return room;
}
async function command(service: RoomService, entry: Entry, value: RoomCommand) {
  const snapshot = success(await service.snapshot(credentials(entry)));
  return service.command(credentials(entry), { requestId: randomUUID(), expectedRevision: snapshot.view.revision, command: value });
}
async function friends(service: RoomService, gameType: GameType) {
  const host = success(await service.create({ gameType, kind: 'friends', name: 'Asha', token: 'tiger', requestId: randomUUID(), resumeToken: randomBytes(32).toString('base64url') }));
  const guest = success(await service.join({ code: host.view.code, name: 'Bashir', token: 'cat', requestId: randomUUID(), resumeToken: randomBytes(32).toString('base64url') }));
  success(await command(service, guest, { type: 'ready', ready: true }));
  success(await command(service, host, { type: 'start' }));
  return { host, guest };
}
async function waitFor(check: () => Promise<boolean>, timeout = 1500) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (await check()) return;
    await Bun.sleep(5);
  }
  throw new Error('Timed out waiting for saved turn progress');
}
function activePlayer(room: RoomDocument) {
  return room.game?.status === 'playing' ? room.game.turn.playerId : room.unoGame?.status === 'playing' ? room.unoGame.turnPlayerId : null;
}

class FaultStore extends MemoryRoomStore {
  fault: 'before' | 'after' | 'after-and-read' | 'conflict' | null = null;
  private failedRead = false;
  override async save(room: RoomDocument, revision: number | null) {
    const fault = this.fault;
    this.fault = null;
    if (fault === 'before') throw new Error('Save unavailable');
    if (fault === 'conflict') throw new StorageConflict();
    await super.save(roomSchema.parse(room), revision);
    this.failedRead = fault === 'after-and-read';
    if (fault === 'after' || fault === 'after-and-read') throw new Error('Save acknowledgment lost');
  }
  override async get(code: string) {
    if (this.failedRead) { this.failedRead = false; throw new Error('Recovery read unavailable'); }
    return super.get(code);
  }
  saved(code: string) { return super.get(code); }
}

describe('server-authoritative turn timeouts', () => {
  test('default timers start with play and clear when the game finishes', async () => {
    expect(GAME_CONFIG.turnTimeoutMs).toBe(30_000);
    const service = new RoomService(new MemoryRoomStore(), publisher);
    try {
      const { host, guest } = await friends(service, 'uno');
      expect(host.view.turnTimer).toBeNull();
      const snapshot = success(await service.snapshot(credentials(host)));
      expect(snapshot.view.turnTimer).toMatchObject({ playerId: host.playerId, durationMs: 30_000 });
      expect(snapshot.view.turnTimer?.expiresAt).toBeGreaterThan(snapshot.view.serverTime);
      const finished = success(await command(service, guest, { type: 'uno', action: { type: 'resign' } }));
      expect(finished.view.unoGame?.status).toBe('finished');
      expect(finished.view.turnTimer).toBeNull();
    } finally { await service.close(); }
  });

  test.each(['tycoon', 'uno'] satisfies GameType[])('%s completes an inactive turn once at the exact deadline before accepting concurrent commands', async gameType => {
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now());
    const store = new MemoryRoomStore();
    const service = new RoomService(store, publisher, 900, 35_000, 2000);
    try {
      const { host, guest } = await friends(service, gameType);
      const before = await savedRoom(store, host.view.code);
      if (!before.turnTimer) throw new Error('Expected a turn timer');
      clock.mockReturnValue(before.turnTimer.expiresAt);
      const action: RoomCommand = gameType === 'uno' ? { type: 'uno', action: { type: 'draw' } } : { type: 'play', action: { type: 'roll' } };
      const input = { requestId: randomUUID(), expectedRevision: before.revision, command: action };
      const replies = await Promise.all([service.command(credentials(host), input), service.command(credentials(host), { ...input, requestId: randomUUID() })]);
      expect(replies.map(reply => reply.ok ? null : reply.code)).toEqual(['STALE_REVISION', 'STALE_REVISION']);
      const after = await savedRoom(store, host.view.code);
      expect(after.revision).toBe(before.revision + 1);
      expect(activePlayer(after)).toBe(guest.playerId);
      expect(after.turnTimer).toEqual({ playerId: guest.playerId, expiresAt: before.turnTimer.expiresAt + 2000, durationMs: 2000 });
      expect((after.game ?? after.unoGame)?.log.filter(entry => entry.text.includes('ran out of time'))).toHaveLength(1);
      if (gameType === 'uno') {
        expect(after.unoGame?.players.find(player => player.id === host.playerId)?.hand).toHaveLength(8);
        expect(after.unoGame?.topCard).toEqual(before.unoGame?.topCard);
      } else expect(after.game?.deeds).toEqual(before.game?.deeds);
    } finally { await service.close(); clock.mockRestore(); }
  });

  test.each(['tycoon', 'uno'] satisfies GameType[])('%s schedules and broadcasts expiry without a browser command', async gameType => {
    const store = new MemoryRoomStore();
    const events: RoomEvent[] = [];
    const service = new RoomService(store, { async publish(_channels, event) { events.push(event); } }, 900, 35_000, 100);
    try {
      const { host, guest } = await friends(service, gameType);
      const before = await savedRoom(store, host.view.code);
      await waitFor(async () => (await savedRoom(store, host.view.code)).revision > before.revision);
      const after = await savedRoom(store, host.view.code);
      expect(after.revision).toBe(before.revision + 1);
      expect(activePlayer(after)).toBe(guest.playerId);
      expect(events).toContainEqual({ event: 'room:updated', data: { revision: after.revision } });
    } finally { await service.close(); }
  });

  test('only an accepted current-player action resets the deadline', async () => {
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now());
    const store = new MemoryRoomStore();
    const service = new RoomService(store, publisher, 900, 35_000, 2000);
    try {
      const { host, guest } = await friends(service, 'tycoon');
      const before = await savedRoom(store, host.view.code);
      if (!before.turnTimer) throw new Error('Expected a turn timer');
      clock.mockReturnValue(before.turnTimer.expiresAt - 1500);
      success(await service.snapshot(credentials(host), true));
      expect(await command(service, host, { type: 'play', action: { type: 'buy' } })).toMatchObject({ ok: false, code: 'RULE' });
      success(await command(service, guest, { type: 'trade', action: { type: 'offer', toPlayerId: host.playerId, give: { cash: 10, tiles: [] }, receive: { cash: 20, tiles: [] } } }));
      expect(await service.command(credentials(host), { requestId: randomUUID(), expectedRevision: before.revision, command: { type: 'play', action: { type: 'roll' } } })).toMatchObject({ ok: false, code: 'STALE_REVISION' });
      expect((await savedRoom(store, host.view.code)).turnTimer).toEqual(before.turnTimer);
      const snapshot = success(await service.snapshot(credentials(host)));
      const input = { requestId: randomUUID(), expectedRevision: snapshot.view.revision, command: { type: 'play', action: { type: 'roll' } } } satisfies Parameters<RoomService['command']>[1];
      const accepted = success(await service.command(credentials(host), input));
      expect(accepted.view.turnTimer?.expiresAt).toBe(Date.now() + 2000);
      clock.mockReturnValue(Date.now() + 100);
      const retry = success(await service.command(credentials(host), input));
      expect(retry.view.turnTimer).toEqual(accepted.view.turnTimer);
      expect(retry.view.revision).toBe(accepted.view.revision);
    } finally { await service.close(); clock.mockRestore(); }
  });

  test('UNO draws give a new decision deadline, then timeout passes without drawing again', async () => {
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now());
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher, 900, 35_000, 2000);
    try {
      const { host, guest } = await friends(service, 'uno');
      await service.close();
      const fixture = await savedRoom(store, host.view.code);
      fixture.unoGame = createUnoGame({ players: fixture.seats, seed: 1 });
      const wildIndex = fixture.unoGame.deck.findIndex(card => card.value === 'wild');
      const wild = fixture.unoGame.deck.splice(wildIndex, 1)[0];
      if (!wild || !fixture.turnTimer) throw new Error('Expected UNO fixture data');
      fixture.unoGame.deck.push(wild);
      await store.save(fixture, fixture.revision);
      service = new RoomService(store, publisher, 900, 35_000, 2000);
      clock.mockReturnValue(fixture.turnTimer.expiresAt - 1000);
      const drawn = success(await command(service, host, { type: 'uno', action: { type: 'draw' } }));
      expect(drawn.view.unoGame?.hand).toHaveLength(8);
      expect(drawn.view.unoGame?.canPass).toBe(true);
      expect(drawn.view.turnTimer?.expiresAt).toBe(Date.now() + 2000);
      if (!drawn.view.turnTimer) throw new Error('Expected renewed timer');
      clock.mockReturnValue(drawn.view.turnTimer.expiresAt);
      expect(await command(service, host, { type: 'uno', action: { type: 'pass' } })).toMatchObject({ ok: false, code: 'STALE_REVISION' });
      const after = await savedRoom(store, host.view.code);
      expect(activePlayer(after)).toBe(guest.playerId);
      expect(after.unoGame?.players.find(player => player.id === host.playerId)?.hand).toHaveLength(8);
    } finally { await service.close(); clock.mockRestore(); }
  });

  test('Tycoon expiry finishes doubles and leaves purchase choices with the bank', async () => {
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now());
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher, 900, 35_000, 2000);
    try {
      const { host, guest } = await friends(service, 'tycoon');
      await service.close();
      const fixture = await savedRoom(store, host.view.code);
      for (let seed = 1; seed < 1000; seed += 1) {
        const game = createGame({ players: fixture.seats, seed });
        const rolled = applyAction(game, host.playerId, { type: 'roll' });
        if (rolled.status === 'playing' && rolled.doubles > 0 && rolled.turn.phase === 'purchase') { fixture.game = game; break; }
      }
      if (!fixture.game || !fixture.turnTimer) throw new Error('Expected Tycoon fixture');
      expect(applyAction(fixture.game, host.playerId, { type: 'roll' }).doubles).toBeGreaterThan(0);
      await store.save(fixture, fixture.revision);
      service = new RoomService(store, publisher, 900, 35_000, 2000);
      clock.mockReturnValue(fixture.turnTimer.expiresAt);
      expect(await command(service, host, { type: 'play', action: { type: 'roll' } })).toMatchObject({ ok: false, code: 'STALE_REVISION' });
      const after = await savedRoom(store, host.view.code);
      expect(activePlayer(after)).toBe(guest.playerId);
      expect(after.game?.log.filter(entry => entry.text.includes('rolled ')).length).toBeGreaterThanOrEqual(2);
      expect(after.game?.deeds).toEqual({});
      expect(after.revision).toBe(fixture.revision + 1);
    } finally { await service.close(); clock.mockRestore(); }
  });

  test('other players catching UNO do not extend the current turn', async () => {
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now());
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher, 900, 35_000, 2000);
    try {
      const { host, guest } = await friends(service, 'uno');
      await service.close();
      const fixture = await savedRoom(store, host.view.code);
      if (!fixture.unoGame || !fixture.turnTimer) throw new Error('Expected UNO fixture');
      const player = fixture.unoGame.players.find(candidate => candidate.id === host.playerId);
      if (!player) throw new Error('Expected the current player');
      fixture.unoGame.discard.push(...player.hand.splice(1));
      fixture.unoGame.catchablePlayerId = host.playerId;
      await store.save(fixture, fixture.revision);
      service = new RoomService(store, publisher, 900, 35_000, 2000);
      clock.mockReturnValue(fixture.turnTimer.expiresAt - 1000);
      const caught = success(await command(service, guest, { type: 'uno', action: { type: 'catchUno', playerId: host.playerId } }));
      expect(caught.view.unoGame?.players.find(candidate => candidate.id === host.playerId)?.cardCount).toBe(3);
      expect(caught.view.turnTimer).toEqual(fixture.turnTimer);
    } finally { await service.close(); clock.mockRestore(); }
  });

  test('bot trade responses preserve human deadlines and bot turns have no human timer', async () => {
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now());
    const store = new MemoryRoomStore();
    const service = new RoomService(store, publisher, 20, 35_000, 2000);
    try {
      const host = success(await service.create({ gameType: 'tycoon', kind: 'practice', botCount: 1, name: 'Asha', token: 'tiger', requestId: randomUUID(), resumeToken: randomBytes(32).toString('base64url') }));
      const bot = host.view.seats.find(seat => seat.kind === 'bot');
      if (!bot) throw new Error('Expected a bot');
      const offered = success(await command(service, host, { type: 'trade', action: { type: 'offer', toPlayerId: bot.id, give: { cash: 100, tiles: [] }, receive: { cash: 0, tiles: [] } } }));
      clock.mockReturnValue(Date.now() + 500);
      await waitFor(async () => (await savedRoom(store, host.view.code)).revision > offered.view.revision);
      const answered = await savedRoom(store, host.view.code);
      expect(answered.game?.trades).toHaveLength(0);
      expect(answered.turnTimer).toEqual(offered.view.turnTimer);
      if (!answered.turnTimer) throw new Error('Expected a human deadline');
      clock.mockReturnValue(answered.turnTimer.expiresAt);
      expect(await command(service, host, { type: 'play', action: { type: 'roll' } })).toMatchObject({ ok: false, code: 'STALE_REVISION' });
      const expired = await savedRoom(store, host.view.code);
      expect(activePlayer(expired)).toBe(bot.id);
      expect(expired.turnTimer).toBeNull();
    } finally { await service.close(); clock.mockRestore(); }
  });

  test.each(['tycoon', 'uno'] satisfies GameType[])('%s pauses with no humans and honors the original deadline after restart and reconnect', async gameType => {
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher, 900, 35_000, 100);
    try {
      const { host, guest } = await friends(service, gameType);
      const before = await savedRoom(store, host.view.code);
      success(await service.disconnect(credentials(host)));
      success(await service.disconnect(credentials(guest)));
      await Bun.sleep(130);
      expect((await savedRoom(store, host.view.code)).revision).toBe(before.revision);
      await service.close();
      service = new RoomService(store, publisher, 900, 35_000, 100);
      expect(success(await service.snapshot(credentials(host))).view.turnTimer).toEqual(before.turnTimer);
      const resumed = success(await service.resume(host.resumeToken));
      expect(resumed.view.turnTimer).toEqual(before.turnTimer);
      await waitFor(async () => (await savedRoom(store, host.view.code)).revision > resumed.view.revision);
      expect(activePlayer(await savedRoom(store, host.view.code))).toBe(guest.playerId);
    } finally { await service.close(); }
  });

  test('legacy rooms acquire one durable timer without extending it on later reads', async () => {
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher);
    try {
      const { host } = await friends(service, 'tycoon');
      await service.close();
      const fixture = await savedRoom(store, host.view.code);
      const { turnTimer, ...legacy } = fixture;
      const restored = roomSchema.parse(legacy);
      expect(restored.turnTimer).toBeNull();
      await store.save(restored, fixture.revision);
      service = new RoomService(store, publisher);
      const first = success(await service.snapshot(credentials(host)));
      expect(first.view.turnTimer?.playerId).toBe(host.playerId);
      expect(first.view.revision).toBe(fixture.revision + 1);
      expect(success(await service.snapshot(credentials(host))).view.turnTimer).toEqual(first.view.turnTimer);
      expect((await savedRoom(store, host.view.code)).turnTimer).toEqual(first.view.turnTimer);
    } finally { await service.close(); }
  });

  test.each(['before', 'after', 'after-and-read', 'conflict'] satisfies NonNullable<FaultStore['fault']>[])('expiry recovers from %s without skipping two turns', async fault => {
    const clock = spyOn(Date, 'now').mockReturnValue(Date.now());
    const store = new FaultStore();
    const service = new RoomService(store, publisher, 900, 35_000, 2000);
    try {
      const { host, guest } = await friends(service, 'uno');
      const before = await savedRoom(store, host.view.code);
      if (!before.turnTimer) throw new Error('Expected a timer');
      store.fault = fault;
      clock.mockReturnValue(before.turnTimer.expiresAt);
      success(await service.snapshot(credentials(host), true));
      await waitFor(async () => (await store.saved(host.view.code))?.revision === before.revision + 1);
      await Bun.sleep(300);
      const after = await savedRoom(store, host.view.code);
      expect(after.revision).toBe(before.revision + 1);
      expect(activePlayer(after)).toBe(guest.playerId);
      expect(after.unoGame?.players.find(player => player.id === host.playerId)?.hand).toHaveLength(8);
      expect(success(await service.snapshot(credentials(host))).view.revision).toBe(after.revision);
    } finally { await service.close(); clock.mockRestore(); }
  });
});
