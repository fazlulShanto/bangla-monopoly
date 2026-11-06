import { describe, expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import type { CreateRoom, EnterReply, Failure, RoomCommand } from '@deshi/game';
import { RoomService, type Credentials, type RoomEvent, type RoomPublisher } from './rooms';
import { createSchema, roomCommandSchema, roomSchema, type RoomDocument } from './schema';
import { MemoryRoomStore, StorageConflict } from './store';
import { chooseUnoBotAction } from './uno';
import { createApp } from './index';

type Entry = Extract<EnterReply, { ok: true }>;
const token = () => randomBytes(32).toString('base64url');
const publisher: RoomPublisher = { async publish() {} };
const credentials = (entry: Entry): Credentials => ({ resumeToken: entry.resumeToken, connectionId: entry.connectionId });
const input = (): CreateRoom => ({ gameType: 'uno', kind: 'friends', name: 'Asha', token: 'tiger', requestId: randomUUID(), resumeToken: token() });
function success<T extends { ok: true }>(reply: T | Failure): T {
  if (!reply.ok) throw new Error(JSON.stringify(reply));
  return reply;
}
async function command(service: RoomService, entry: Entry, value: RoomCommand) {
  const snapshot = success(await service.snapshot(credentials(entry)));
  return service.command(credentials(entry), { requestId: randomUUID(), expectedRevision: snapshot.view.revision, command: value });
}
async function join(service: RoomService, host: Entry, name = 'Bashir') {
  return success(await service.join({ code: host.view.code, gameType: 'uno', name, token: 'cat', requestId: randomUUID(), resumeToken: token() }));
}
async function friends(service: RoomService, playerCount = 2) {
  const host = success(await service.create(input()));
  const entries = [host];
  for (let index = 1; index < playerCount; index += 1) {
    const guest = await join(service, host, `Guest ${index}`);
    entries.push(guest);
    success(await command(service, guest, { type: 'ready', ready: true }));
  }
  success(await command(service, host, { type: 'start' }));
  return entries;
}
async function savedRoom(store: MemoryRoomStore, code: string) {
  const room = await store.get(code);
  if (!room) throw new Error('Expected a saved room');
  return room;
}
async function nextTurn(service: RoomService, store: MemoryRoomStore, entries: Entry[]) {
  const room = await savedRoom(store, entries[0]!.view.code);
  const game = room.unoGame;
  if (game?.status !== 'playing') throw new Error('Expected a playing UNO game');
  const actor = entries.find(entry => entry.playerId === game.turnPlayerId);
  if (!actor) throw new Error('Expected a human turn');
  const action = chooseUnoBotAction(game, actor.playerId);
  if (!action) throw new Error('Expected a legal action');
  return { actor, action, revision: room.revision };
}
async function waitFor(check: () => Promise<boolean>, timeout = 4000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await Bun.sleep(10);
  }
  throw new Error('Timed out waiting for saved UNO bot progress');
}

class ValidatedStore extends MemoryRoomStore {
  override async save(room: RoomDocument, revision: number | null) {
    // Exercise the same JSON/schema boundary used by durable room storage.
    return super.save(roomSchema.parse(JSON.parse(JSON.stringify(room))), revision);
  }
}

class ConflictOnceStore extends ValidatedStore {
  conflict = false;
  override async save(room: RoomDocument, revision: number | null) {
    if (this.conflict) {
      this.conflict = false;
      throw new StorageConflict();
    }
    return super.save(room, revision);
  }
}

describe('UNO in the shared room service', () => {
  test('six friends can join and start; a seventh player and unready starts are rejected', async () => {
    const store = new ValidatedStore();
    const service = new RoomService(store, publisher);
    try {
      const host = success(await service.create(input()));
      expect(host.view).toMatchObject({ gameType: 'uno', game: null, unoGame: null });
      const entries = await Promise.all(Array.from({ length: 5 }, (_, index) => join(service, host, `Guest ${index + 1}`)));
      expect(success(await service.snapshot(credentials(host))).view.seats).toHaveLength(6);
      expect(await service.join({ code: host.view.code, gameType: 'uno', name: 'Seventh', token: 'tiger', requestId: randomUUID(), resumeToken: token() })).toMatchObject({ ok: false, code: 'RULE', message: 'This room already has six players.' });
      expect(await command(service, host, { type: 'start' })).toMatchObject({ ok: false, code: 'RULE' });
      for (const entry of entries) success(await command(service, entry, { type: 'ready', ready: true }));
      expect(await command(service, entries[0]!, { type: 'start' })).toMatchObject({ ok: false, code: 'RULE' });
      const started = success(await command(service, host, { type: 'start' }));
      expect(started.view.game).toBeNull();
      expect(started.view.unoGame?.players).toHaveLength(6);
      expect(started.view.unoGame?.hand).toHaveLength(7);
      expect((await savedRoom(store, host.view.code)).unoGame?.players.every(player => player.hand.length === 7)).toBe(true);
      expect(await command(service, host, { type: 'addBot' })).toMatchObject({ ok: false, code: 'RULE' });
      expect(await command(service, host, { type: 'ready', ready: false })).toMatchObject({ ok: false, code: 'RULE' });
    } finally { await service.close(); }
  });

  test('snapshots keep other hands private, and realtime publishes revision hints only', async () => {
    const events: RoomEvent[] = [];
    const store = new ValidatedStore();
    const service = new RoomService(store, { async publish(_channels, event) { events.push(event); } });
    try {
      const entries = await friends(service, 3);
      const room = await savedRoom(store, entries[0]!.view.code);
      const state = room.unoGame;
      if (!state) throw new Error('Expected saved UNO state');
      for (const entry of entries) {
        const view = success(await service.snapshot(credentials(entry))).view.unoGame;
        expect(view?.hand).toEqual(state.players.find(player => player.id === entry.playerId)?.hand);
        expect(view).not.toHaveProperty('deck');
        expect(view).not.toHaveProperty('discard');
        expect(view).not.toHaveProperty('seed');
        for (const player of view!.players) expect(player).not.toHaveProperty('hand');
        const response = JSON.stringify(view);
        for (const player of state.players.filter(player => player.id !== entry.playerId)) {
          for (const card of player.hand) expect(response).not.toContain(`"${card.id}"`);
        }
      }
      expect(events.length).toBeGreaterThan(0);
      for (const event of events) expect(event).toEqual({ event: 'room:updated', data: { revision: expect.any(Number) } });
    } finally { await service.close(); }
  });

  test('commands authenticate seats, reject stale revisions, and apply retries only once', async () => {
    const store = new ValidatedStore();
    const service = new RoomService(store, publisher);
    try {
      const entries = await friends(service);
      const { actor, action, revision } = await nextTurn(service, store, entries);
      const request = { requestId: randomUUID(), expectedRevision: revision, command: { type: 'uno', action } } satisfies Parameters<RoomService['command']>[1];
      expect(await service.command({ resumeToken: token(), connectionId: actor.connectionId }, request)).toMatchObject({ ok: false, code: 'INVALID_SESSION' });
      expect(await service.command({ resumeToken: actor.resumeToken, connectionId: randomUUID() }, request)).toMatchObject({ ok: false, code: 'SESSION_REPLACED' });
      const applied = success(await service.command(credentials(actor), request));
      const persisted = await savedRoom(store, actor.view.code);
      expect(success(await service.command(credentials(actor), request)).revision).toBe(applied.revision);
      expect(await savedRoom(store, actor.view.code)).toEqual(persisted);
      expect(await service.command(credentials(actor), { ...request, requestId: randomUUID() })).toMatchObject({ ok: false, code: 'STALE_REVISION', view: { revision: applied.revision } });
      expect(await command(service, actor, { type: 'play', action: { type: 'roll' } })).toMatchObject({ ok: false, code: 'RULE' });
      expect(await command(service, actor, { type: 'trade', action: { type: 'cancel', tradeId: 1 } })).toMatchObject({ ok: false, code: 'RULE' });
      expect(await command(service, actor, { type: 'uno', action: { type: 'play', cardId: 'not-your-card', color: 'red' } })).toMatchObject({ ok: false, code: 'RULE' });
      expect((await savedRoom(store, actor.view.code)).revision).toBe(applied.revision);
    } finally { await service.close(); }
  });

  test('saved hands survive restart and resume revokes the previous connection', async () => {
    const store = new ValidatedStore();
    let service = new RoomService(store, publisher);
    try {
      const entries = await friends(service);
      const host = entries[0]!;
      const { actor, action } = await nextTurn(service, store, entries);
      success(await command(service, actor, { type: 'uno', action }));
      const before = success(await service.snapshot(credentials(host))).view.unoGame;
      await service.close();
      service = new RoomService(store, publisher);
      const resumed = success(await service.resume(host.resumeToken));
      expect(resumed.view.gameType).toBe('uno');
      expect(resumed.view.unoGame).toEqual(before);
      expect(resumed.connectionId).not.toBe(host.connectionId);
      expect(await service.snapshot(credentials(host))).toMatchObject({ ok: false, code: 'SESSION_REPLACED' });
      expect(success(await service.authorize(credentials(resumed))).channel).toBe(resumed.channel);
      expect(roomSchema.parse(await savedRoom(store, host.view.code)).unoGame).toEqual((await savedRoom(store, host.view.code)).unoGame);
    } finally { await service.close(); }
  });

  test('leaving resigns the player; only the host can reopen a finished game for a rematch', async () => {
    const store = new ValidatedStore();
    const service = new RoomService(store, publisher);
    try {
      const [host, guest, third] = await friends(service, 3);
      if (!host || !guest || !third) throw new Error('Expected three seats');
      expect(await command(service, host, { type: 'rematch' })).toMatchObject({ ok: false, code: 'RULE' });
      success(await command(service, guest, { type: 'uno', action: { type: 'resign' } }));
      const ended = success(await command(service, third, { type: 'leave' }));
      expect(ended.view.unoGame).toMatchObject({ status: 'finished', winnerId: host.playerId });
      expect(await service.resume(third.resumeToken)).toMatchObject({ ok: false, code: 'INVALID_SESSION' });
      expect((await savedRoom(store, host.view.code)).unoGame?.players.find(player => player.id === third.playerId)?.status).toBe('out');
      expect(await command(service, guest, { type: 'rematch' })).toMatchObject({ ok: false, code: 'RULE' });
      const lobby = success(await command(service, host, { type: 'rematch' }));
      expect(lobby.view.unoGame).toBeNull();
      expect(lobby.view.seats.map(seat => seat.id)).toEqual([host.playerId, guest.playerId]);
      expect(lobby.view.seats.find(seat => seat.id === guest.playerId)?.ready).toBe(false);
      success(await command(service, guest, { type: 'ready', ready: true }));
      const restarted = success(await command(service, host, { type: 'start' }));
      expect(restarted.view.unoGame?.status).toBe('playing');
      expect(restarted.view.unoGame?.hand).toHaveLength(7);
    } finally { await service.close(); }
  });

  test('UNO bots use the same durable scheduler and pause while no human is connected', async () => {
    const store = new ValidatedStore();
    const service = new RoomService(store, publisher, 50);
    try {
      const host = success(await service.create({ ...input(), kind: 'practice', botCount: 5 }));
      expect(host.view.unoGame?.players).toHaveLength(6);
      for (let index = 0; index < 20; index += 1) {
        const room = await savedRoom(store, host.view.code);
        if (room.unoGame?.status !== 'playing' || room.unoGame.turnPlayerId !== host.playerId) break;
        const action = chooseUnoBotAction(room.unoGame, host.playerId);
        if (!action) throw new Error('Expected a legal human action');
        success(await command(service, host, { type: 'uno', action }));
      }
      const before = await savedRoom(store, host.view.code);
      expect(before.unoGame?.status === 'playing' && before.unoGame.turnPlayerId !== host.playerId).toBe(true);
      success(await service.disconnect(credentials(host)));
      await Bun.sleep(100);
      expect((await savedRoom(store, host.view.code)).revision).toBe(before.revision);
      const resumed = success(await service.resume(host.resumeToken));
      const revision = resumed.view.revision;
      await waitFor(async () => (await savedRoom(store, host.view.code)).revision > revision);
      expect(success(await service.snapshot(credentials(resumed))).view.unoGame).not.toBeNull();
    } finally { await service.close(); }
  });

  test('a bot reloads saved UNO state and retries after a storage conflict', async () => {
    const store = new ConflictOnceStore();
    const service = new RoomService(store, publisher, 50);
    try {
      const host = success(await service.create({ ...input(), kind: 'practice', botCount: 1 }));
      for (let index = 0; index < 20; index += 1) {
        const room = await savedRoom(store, host.view.code);
        if (room.unoGame?.status !== 'playing' || room.unoGame.turnPlayerId !== host.playerId) break;
        const action = chooseUnoBotAction(room.unoGame, host.playerId);
        if (!action) throw new Error('Expected a legal human action');
        success(await command(service, host, { type: 'uno', action }));
      }
      const before = await savedRoom(store, host.view.code);
      expect(before.unoGame?.status === 'playing' && before.unoGame.turnPlayerId !== host.playerId).toBe(true);
      store.conflict = true;
      await waitFor(async () => (await savedRoom(store, host.view.code)).revision > before.revision);
      expect(store.conflict).toBe(false);
      expect(success(await service.snapshot(credentials(host))).view.revision).toBeGreaterThan(before.revision);
    } finally { await service.close(); }
  });

  test('game selection rejects wrong-game entries and preserves legacy Tycoon rooms', async () => {
    const store = new ValidatedStore();
    const service = new RoomService(store, publisher);
    try {
      const creation = input();
      const host = success(await service.create(creation));
      expect(await service.create({ ...creation, gameType: 'tycoon' })).toMatchObject({ ok: false, code: 'RULE' });
      const guestInput = { code: host.view.code, gameType: 'uno' as const, name: 'Bashir', token: 'cat' as const, requestId: randomUUID(), resumeToken: token() };
      expect(await service.join({ ...guestInput, gameType: 'tycoon' })).toMatchObject({ ok: false, code: 'RULE' });
      const guest = success(await service.join(guestInput));
      expect(await service.join({ ...guestInput, gameType: 'tycoon' })).toMatchObject({ ok: false, code: 'RULE' });
      expect(await command(service, host, { type: 'setStartingCash', startingCash: 2000 })).toMatchObject({ ok: false, code: 'RULE' });

      const { gameType: ignored, ...legacyInput } = input();
      expect(createSchema.parse(legacyInput).gameType).toBe('tycoon');
      const legacyHost = success(await service.create(legacyInput));
      expect(legacyHost.view).toMatchObject({ gameType: 'tycoon', unoGame: null });
      expect(await command(service, legacyHost, { type: 'uno', action: { type: 'draw' } })).toMatchObject({ ok: false, code: 'RULE' });
      const { gameType, unoGame, ...legacyDocument } = await savedRoom(store, legacyHost.view.code);
      expect(roomSchema.parse(legacyDocument)).toMatchObject({ gameType: 'tycoon', unoGame: null });
      success(await command(service, guest, { type: 'ready', ready: true }));
      success(await command(service, host, { type: 'start' }));
      expect(roomSchema.safeParse({ ...legacyDocument, gameType: 'tycoon', unoGame: (await savedRoom(store, host.view.code)).unoGame }).success).toBe(false);
    } finally { await service.close(); }
  });

  test('HTTP accepts UNO rooms and validates actions before the game engine receives them', async () => {
    const app = await createApp({ store: new ValidatedStore(), port: 0, host: '127.0.0.1', realtime: {
      key: 'uno-test-public-key', async publish() {}, authorize() { return { auth: 'test' }; }, async ping() { return true; },
    } });
    const url = `http://127.0.0.1:${app.port}`;
    try {
      const response = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input(), kind: 'practice', botCount: 1 }) });
      expect(response.status).toBe(200);
      const entry = success<Entry>(await response.json());
      expect(entry.view).toMatchObject({ gameType: 'uno', game: null, unoGame: { status: 'playing' } });
      const headers = { Authorization: `Bearer ${entry.resumeToken}`, 'X-Connection-Id': entry.connectionId, 'Content-Type': 'application/json' };
      for (const action of [{ type: 'play', cardId: 'card', color: 'purple' }, { type: 'draw', deck: [] }, { type: 'skip' }]) {
        const result = await fetch(`${url}/api/commands`, { method: 'POST', headers, body: JSON.stringify({ requestId: randomUUID(), expectedRevision: entry.view.revision, command: { type: 'uno', action } }) });
        expect(result.status).toBe(400);
        expect(await result.json()).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
      }
      expect(roomCommandSchema.safeParse({ requestId: randomUUID(), expectedRevision: entry.view.revision, command: { type: 'uno', action: { type: 'draw' } } }).success).toBe(true);
    } finally { await app.close(); }
  });
});
