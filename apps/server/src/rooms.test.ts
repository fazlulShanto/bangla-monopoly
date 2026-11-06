import { describe, expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import type { EnterReply, Failure, RoomCommand, SnapshotReply } from '@deshi/game';
import { STARTING_CASH, TOKENS } from '@deshi/game';
import { RoomService, type Credentials, type RoomEvent, type RoomPublisher } from './rooms';
import { MemoryRoomStore, StorageConflict } from './store';
import { gameSchema, roomCommandSchema, roomSchema, type RoomDocument } from './schema';
import { createGame } from './game';

const token = () => randomBytes(32).toString('base64url');
function success<T extends { ok: true }>(reply: T | Failure): T {
  if (!reply.ok) throw new Error(JSON.stringify(reply));
  return reply;
}
const credentials = (entry: Extract<EnterReply, { ok: true }>): Credentials => ({ resumeToken: entry.resumeToken, connectionId: entry.connectionId });
const publisher: RoomPublisher = { async publish() {} };
const createInput = () => ({ kind: 'friends' as const, name: 'Asha', token: 'rickshaw' as const, requestId: randomUUID(), resumeToken: token() });
async function waitFor(check: () => Promise<boolean>, timeout = 4000): Promise<void> {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await check()) return; await Bun.sleep(10); }
  throw new Error('Timed out waiting for durable bot progress');
}
class FaultStore extends MemoryRoomStore {
  fault: 'after' | 'after-and-read' | 'conflict' | null = null;
  private readsToFail = 0;
  override async save(room: RoomDocument, revision: number | null): Promise<void> {
    const fault = this.fault;
    this.fault = null;
    if (fault === 'conflict') throw new StorageConflict();
    await super.save(room, revision);
    if (fault === 'after-and-read') this.readsToFail += 1;
    if (fault === 'after' || fault === 'after-and-read') throw new Error('Acknowledgment lost after durable save');
  }
  override async get(code: string): Promise<RoomDocument | null> {
    if (this.readsToFail) { this.readsToFail -= 1; throw new Error('Temporary recovery read failure'); }
    return super.get(code);
  }
  saved(code: string) { return super.get(code); }
}
async function command(service: RoomService, auth: Credentials, value: RoomCommand) {
  const snapshot = success(await service.snapshot(auth));
  return service.command(auth, { requestId: randomUUID(), expectedRevision: snapshot.view.revision, command: value });
}

async function friends(service: RoomService) {
  const host = success(await service.create(createInput()));
  const guest = success(await service.join({ code: host.view.code, name: 'Bashir', token: 'boat', requestId: randomUUID(), resumeToken: token() }));
  success(await command(service, credentials(guest), { type: 'ready', ready: true }));
  success(await command(service, credentials(host), { type: 'start' }));
  return { host, guest };
}

describe('durable HTTP room service', () => {
  test('existing rooms retain old data while room replies omit chat', async () => {
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher);
    try {
      const host = success(await service.create(createInput()));
      const saved = await store.get(host.view.code);
      if (!saved) throw new Error('Missing saved room');
      const requestId = randomUUID();
      const oldChat = [{ id: randomUUID(), playerId: host.playerId, name: 'Asha', text: 'Hello', sentAt: 1 }];
      const legacy = roomSchema.parse({ ...saved, chat: oldChat, requests: [{ playerId: host.playerId, requestId, revision: saved.revision, kind: 'chat' }] });
      await store.save(legacy, saved.revision);
      await service.close();
      service = new RoomService(store, publisher);

      const snapshot = success(await service.snapshot(credentials(host)));
      expect(snapshot).not.toHaveProperty('chat');
      const updated = success(await service.command(credentials(host), { requestId, expectedRevision: snapshot.view.revision, command: { type: 'addBot' } }));
      expect(updated.view.seats).toHaveLength(2);
      expect(updated).not.toHaveProperty('chat');
      expect((await store.get(host.view.code))?.chat).toEqual(oldChat);
    } finally { await service.close(); }
  });

  test('the host sets starting cash, guests see it, and every player receives it once', async () => {
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher);
    try {
      const input = { ...createInput(), startingCash: 3000 };
      const host = success(await service.create(input));
      expect(host.view.startingCash).toBe(3000);
      const retry = success(await service.create({ ...input, startingCash: 4000 }));
      expect(retry.view.startingCash).toBe(3000);
      const guest = success(await service.join({ code: host.view.code, name: 'Bashir', token: 'boat', requestId: randomUUID(), resumeToken: token() }));
      expect(guest.view.startingCash).toBe(3000);
      const forbidden = await command(service, credentials(guest), { type: 'setStartingCash', startingCash: 5000 });
      expect(forbidden).toMatchObject({ ok: false, code: 'RULE' });
      expect(success(await service.snapshot(credentials(host))).view.startingCash).toBe(3000);

      const request = { requestId: randomUUID(), expectedRevision: guest.view.revision, command: { type: 'setStartingCash', startingCash: 2500 } } satisfies Parameters<RoomService['command']>[1];
      const updated = success(await service.command(credentials(host), request));
      expect(updated.view.startingCash).toBe(2500);
      expect(success(await service.command(credentials(host), request)).view.revision).toBe(updated.view.revision);
      expect(success(await service.snapshot(credentials(guest))).view.startingCash).toBe(2500);
      expect((await store.get(host.view.code))?.startingCash).toBe(2500);
      success(await command(service, credentials(guest), { type: 'ready', ready: true }));
      const started = success(await command(service, credentials(host), { type: 'start' }));
      expect(started.view.game?.players.map(player => player.cash)).toEqual([2500, 2500]);
      expect(await command(service, credentials(host), { type: 'setStartingCash', startingCash: 5000 })).toMatchObject({ ok: false, code: 'RULE' });
      expect(success(await service.snapshot(credentials(host))).view.game?.players.map(player => player.cash)).toEqual([2500, 2500]);

      await service.close();
      service = new RoomService(store, publisher);
      const resumed = success(await service.resume(host.resumeToken));
      expect(resumed.view.startingCash).toBe(2500);
      expect(resumed.view.game?.players.map(player => player.cash)).toEqual([2500, 2500]);
    } finally { await service.close(); }
  });

  test('practice games give the selected starting cash to humans and bots', async () => {
    const service = new RoomService(new MemoryRoomStore(), publisher);
    try {
      const entry = success(await service.create({ ...createInput(), kind: 'practice', botCount: 3, startingCash: 3750 }));
      expect(entry.view.startingCash).toBe(3750);
      expect(entry.view.game?.players.map(player => player.cash)).toEqual([3750, 3750, 3750, 3750]);
    } finally { await service.close(); }
  });

  test('lobby starting cash survives a service restart and changes to configured limits', async () => {
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher);
    try {
      const host = success(await service.create(createInput()));
      expect(host.view.startingCash).toBe(STARTING_CASH);
      const saved = await store.get(host.view.code);
      if (!saved) throw new Error('Missing saved room');
      const { startingCash, ...legacy } = saved;
      expect(roomSchema.parse(legacy).startingCash).toBe(STARTING_CASH);
      expect(roomSchema.parse({ ...saved, startingCash: 250 }).startingCash).toBe(250);
      success(await command(service, credentials(host), { type: 'setStartingCash', startingCash: 4250 }));
      await service.close();
      service = new RoomService(store, publisher);
      const resumed = success(await service.resume(host.resumeToken));
      expect(resumed.view.startingCash).toBe(4250);
      success(await command(service, credentials(resumed), { type: 'addBot' }));
      const started = success(await command(service, credentials(resumed), { type: 'start' }));
      expect(started.view.game?.players.map(player => player.cash)).toEqual([4250, 4250]);
    } finally { await service.close(); }
  });

  test('joining preserves a preferred token when it is available', async () => {
    const store = new MemoryRoomStore();
    const service = new RoomService(store, publisher);
    try {
      const created = success(await service.create(createInput()));
      const joined = success(await service.join({ code: created.view.code, name: 'Bashir', token: 'fish', requestId: randomUUID(), resumeToken: token() }));
      expect(joined.view.seats.find(seat => seat.id === joined.playerId)?.token).toBe('fish');
      expect(joined.view.seats).toHaveLength(2);
    } finally { await service.close(); }
  });

  test('concurrent joins with an occupied preference get unique tokens and preserve the six-player limit', async () => {
    const store = new MemoryRoomStore();
    const service = new RoomService(store, publisher);
    try {
      const created = success(await service.create(createInput()));
      const joins = await Promise.all(Array.from({ length: 5 }, (_, index) => service.join({ code: created.view.code, name: `Guest ${index + 1}`, token: 'rickshaw', requestId: randomUUID(), resumeToken: token() })));
      const joined = joins.map(reply => success(reply));
      expect(new Set(joined.map(reply => reply.playerId)).size).toBe(5);
      const saved = await store.get(created.view.code);
      expect(saved?.seats).toHaveLength(6);
      expect(saved?.seats.map(seat => seat.token).sort()).toEqual(TOKENS.map(item => item.id).sort());
      const rejected = await service.join({ code: created.view.code, name: 'Seventh guest', token: 'rickshaw', requestId: randomUUID(), resumeToken: token() });
      expect(rejected).toEqual({ ok: false, code: 'RULE', message: 'This room already has six players.' });
      const afterRejection = await store.get(created.view.code);
      expect(afterRejection?.seats).toHaveLength(6);
      expect(afterRejection?.revision).toBe(saved?.revision);
    } finally { await service.close(); }
  });

  test('ambiguous join saves recover immediately and entry retries recover across restart', async () => {
    const store = new FaultStore();
    let service = new RoomService(store, publisher);
    try {
      const created = success(await service.create(createInput()));
      const input = { code: created.view.code, name: 'Bashir', token: 'rickshaw' as const, requestId: randomUUID(), resumeToken: token() };
      store.fault = 'after';
      const joined = success(await service.join(input));
      expect(joined.view.seats).toHaveLength(2);
      expect(joined.view.seats.find(seat => seat.id === joined.playerId)?.token).toBe('boat');
      await service.close();
      service = new RoomService(store, publisher);
      const recovered = success(await service.join(input));
      expect(recovered.playerId).toBe(joined.playerId);
      expect(recovered.connectionId).toBe(joined.connectionId);
      expect(recovered.view.seats).toHaveLength(2);
      expect(recovered.view.seats.find(seat => seat.id === joined.playerId)?.token).toBe('boat');
      expect(recovered.view.seats.find(seat => seat.id === created.playerId)?.connected).toBe(false);
      expect(recovered.view.seats.find(seat => seat.id === joined.playerId)?.connected).toBe(true);
      expect(JSON.stringify(await store.saved(created.view.code))).not.toContain(input.resumeToken);
    } finally { await service.close(); }
  });

  test('a lost save acknowledgment plus failed read recovers from the pre-saved entry receipt', async () => {
    const store = new FaultStore();
    let service = new RoomService(store, publisher);
    const input = createInput();
    try {
      store.fault = 'after-and-read';
      const uncertain = await service.create(input);
      expect(uncertain.ok).toBe(false);
      await service.close();
      service = new RoomService(store, publisher);
      const recovered = success(await service.create(input));
      expect(recovered.view.seats).toHaveLength(1);
      const retry = success(await service.create(input));
      expect(retry.playerId).toBe(recovered.playerId);
      expect(retry.view.code).toBe(recovered.view.code);
    } finally { await service.close(); }
  });

  test.each(['after-and-read', 'conflict'] as const)('bots reload and reschedule after %s even when the cache was evicted', async fault => {
    const store = new FaultStore();
    const service = new RoomService(store, publisher, 50);
    try {
      const entry = success(await service.create({ ...createInput(), kind: 'practice', botCount: 1 }));
      const auth = credentials(entry);
      let snapshot: Extract<SnapshotReply, { ok: true }> = success(await service.snapshot(auth));
      for (let index = 0; index < 15; index += 1) {
        const game = snapshot.view.game;
        if (!game || game.status !== 'playing' || game.turn.playerId !== entry.playerId) break;
        const action = game.turn.phase === 'roll' ? { type: 'roll' as const } : game.turn.phase === 'purchase' ? { type: 'decline' as const } : { type: 'endTurn' as const };
        success(await command(service, auth, { type: 'play', action }));
        snapshot = success(await service.snapshot(auth));
      }
      expect(snapshot.view.game?.status === 'playing' && snapshot.view.game.turn.playerId !== entry.playerId).toBe(true);
      const revision = snapshot.view.revision;
      store.fault = fault;
      await waitFor(async () => (await store.saved(entry.view.code))!.revision >= revision + 2);
      const fresh = success(await service.snapshot(auth));
      expect(fresh.view.revision).toBeGreaterThanOrEqual(revision + 2);
    } finally { await service.close(); }
  });

  test('committed commands succeed when publishing fails, deduplicate, and revoke old generations', async () => {
    const store = new MemoryRoomStore();
    const events: RoomEvent[] = [];
    let rejectPublish = false;
    const service = new RoomService(store, { async publish(_channels, event) { events.push(event); if (rejectPublish) throw new Error('Realtime down'); } });
    try {
      const entry = success(await service.create(createInput()));
      const auth = credentials(entry);
      rejectPublish = true;
      const request = { requestId: randomUUID(), expectedRevision: entry.view.revision, command: { type: 'addBot' as const } };
      const result = success(await service.command(auth, request));
      expect(result.view.seats).toHaveLength(2);
      expect(success(await service.command(auth, request)).revision).toBe(result.revision);
      expect((await store.get(entry.view.code))?.revision).toBe(result.revision);
      rejectPublish = false;
      const resumed = success(await service.resume(entry.resumeToken));
      expect(resumed.connectionId).not.toBe(entry.connectionId);
      const replaced = await service.snapshot(auth);
      expect(!replaced.ok && replaced.code).toBe('SESSION_REPLACED');
      expect(events.some(event => event.event === 'room:closed' && event.data.reason === 'replaced')).toBe(true);
      expect(success(await service.authorize(credentials(resumed))).channel).toBe(resumed.channel);
      success(await command(service, credentials(resumed), { type: 'leave' }));
      const revoked = await service.resume(entry.resumeToken);
      expect(!revoked.ok && revoked.code).toBe('INVALID_SESSION');
      for (const event of events) if (event.event === 'room:updated') expect(Object.keys(event.data)).toEqual(['revision']);
    } finally { await service.close(); }
  });

  test('heartbeats and disconnects change ephemeral presence without saving a revision', async () => {
    const store = new MemoryRoomStore();
    const service = new RoomService(store, publisher, 900, 30);
    try {
      const entry = success(await service.create(createInput()));
      const auth = credentials(entry);
      success(await service.disconnect(auth));
      let snapshot = success(await service.snapshot(auth));
      expect(snapshot.view.seats[0]?.connected).toBe(false);
      snapshot = success(await service.snapshot(auth, true));
      expect(snapshot.view.seats[0]?.connected).toBe(true);
      await Bun.sleep(50);
      snapshot = success(await service.snapshot(auth));
      expect(snapshot.view.seats[0]?.connected).toBe(false);
      expect((await store.get(entry.view.code))?.revision).toBe(entry.view.revision);
    } finally { await service.close(); }
  });

  test('trade offers survive restart; acceptance is authoritative and duplicate requests transfer cash once', async () => {
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher);
    try {
      const { host, guest } = await friends(service);
      const offered = success(await command(service, credentials(host), { type: 'trade', action: {
        type: 'offer', toPlayerId: guest.playerId, give: { cash: 120, tiles: [] }, receive: { cash: 20, tiles: [] },
      } }));
      const trade = offered.view.game?.trades[0];
      if (!trade) throw new Error('Missing fixture trade');
      const unauthorized = await command(service, credentials(host), { type: 'trade', action: { type: 'accept', tradeId: trade.id } });
      expect(!unauthorized.ok && unauthorized.code).toBe('RULE');
      expect((await store.get(host.view.code))?.revision).toBe(offered.revision);
      await service.close();
      service = new RoomService(store, publisher);
      const restored = success(await service.snapshot(credentials(guest)));
      expect(restored.view.game?.trades).toEqual([trade]);
      expect(restored.view.game?.tradeLog).toEqual(offered.view.game?.tradeLog);
      const request = { requestId: randomUUID(), expectedRevision: restored.view.revision, command: { type: 'trade' as const, action: { type: 'accept' as const, tradeId: trade.id } } };
      const accepted = success(await service.command(credentials(guest), request));
      expect(accepted.view.game?.trades).toEqual([]);
      expect(success(await service.snapshot(credentials(host))).view.game?.tradeLog).toEqual(accepted.view.game?.tradeLog);
      expect(accepted.view.game?.players.find(player => player.id === host.playerId)?.cash).toBe(1400);
      expect(accepted.view.game?.players.find(player => player.id === guest.playerId)?.cash).toBe(1600);
      expect(success(await service.command(credentials(guest), request)).revision).toBe(accepted.revision);
      const saved = await store.get(host.view.code);
      expect(saved?.revision).toBe(accepted.revision);
      expect(saved?.game?.nextTradeId).toBe(2);
      expect(saved?.game?.players.map(player => player.cash)).toEqual([1400, 1600]);
    } finally { await service.close(); }
  });

  test('concurrent accept commands at one revision settle only once and refresh the losing client', async () => {
    const store = new MemoryRoomStore();
    const service = new RoomService(store, publisher);
    try {
      const { host, guest } = await friends(service);
      const offered = success(await command(service, credentials(guest), { type: 'trade', action: {
        type: 'offer', toPlayerId: host.playerId, give: { cash: 40, tiles: [] }, receive: { cash: 0, tiles: [] },
      } }));
      const trade = offered.view.game?.trades[0];
      if (!trade) throw new Error('Missing fixture trade');
      const replies = await Promise.all([1, 2].map(() => service.command(credentials(host), {
        requestId: randomUUID(), expectedRevision: offered.revision, command: { type: 'trade', action: { type: 'accept', tradeId: trade.id } },
      })));
      expect(replies.filter(reply => reply.ok)).toHaveLength(1);
      const stale = replies.find(reply => !reply.ok);
      expect(stale && !stale.ok && stale.code).toBe('STALE_REVISION');
      expect(stale && !stale.ok && stale.view?.game?.trades).toEqual([]);
      expect((await store.get(host.view.code))?.game?.players.map(player => player.cash)).toEqual([1540, 1460]);
    } finally { await service.close(); }
  });

  test('bots respond to fair and unfair trades while the human retains the turn', async () => {
    const store = new MemoryRoomStore();
    const service = new RoomService(store, publisher, 10);
    try {
      const entry = success(await service.create({ ...createInput(), kind: 'practice', botCount: 1 }));
      const bot = entry.view.seats.find(seat => seat.kind === 'bot');
      if (!bot) throw new Error('Missing fixture bot');
      const auth = credentials(entry);
      success(await command(service, auth, { type: 'trade', action: {
        type: 'offer', toPlayerId: bot.id, give: { cash: 50, tiles: [] }, receive: { cash: 0, tiles: [] },
      } }));
      await waitFor(async () => (await store.get(entry.view.code))?.game?.trades.length === 0);
      const accepted = success(await service.snapshot(auth));
      expect(accepted.view.game?.players.map(player => player.cash)).toEqual([1450, 1550]);
      expect(accepted.view.game?.status === 'playing' && accepted.view.game.turn).toEqual({ playerId: entry.playerId, phase: 'roll' });
      success(await command(service, auth, { type: 'trade', action: {
        type: 'offer', toPlayerId: bot.id, give: { cash: 0, tiles: [] }, receive: { cash: 10, tiles: [] },
      } }));
      await waitFor(async () => (await store.get(entry.view.code))?.game?.trades.length === 0);
      const declined = success(await service.snapshot(auth));
      expect(declined.view.game?.players.map(player => player.cash)).toEqual([1450, 1550]);
      expect(declined.view.game?.log.at(-1)?.text).toContain('declined trade');
    } finally { await service.close(); }
  });

  test('a pending bot trade resolves in the same saved step as its normal turn action', async () => {
    const store = new MemoryRoomStore();
    let service = new RoomService(store, publisher, 10);
    try {
      const entry = success(await service.create({ ...createInput(), kind: 'practice', botCount: 1 }));
      const bot = entry.view.seats.find(seat => seat.kind === 'bot');
      if (!bot) throw new Error('Missing fixture bot');
      await service.close();
      const saved = await store.get(entry.view.code);
      if (!saved?.game || saved.game.status !== 'playing') throw new Error('Missing fixture game');
      saved.game.turn = { playerId: bot.id, phase: 'roll' };
      saved.game.trades = [{ id: 1, fromPlayerId: entry.playerId, toPlayerId: bot.id, give: { cash: 1, tiles: [] }, receive: { cash: 0, tiles: [] } }];
      saved.game.nextTradeId = 2;
      await store.save(saved, saved.revision);
      service = new RoomService(store, publisher, 10);
      success(await service.snapshot(credentials(entry), true));
      await waitFor(async () => (await store.get(entry.view.code))!.revision > saved.revision);
      const progressed = await store.get(entry.view.code);
      expect(progressed?.game?.trades).toEqual([]);
      expect(progressed?.game?.lastRoll?.playerId).toBe(bot.id);
      expect(progressed?.game?.log.some(line => line.text.includes('accepted trade #1'))).toBe(true);
    } finally { await service.close(); }
  });

  test('legacy saved games default trading state and HTTP input rejects unsafe cash and extra fields', () => {
    const legacy = createGame({ players: [{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Bashir' }], seed: 1 });
    Reflect.deleteProperty(legacy, 'trades');
    Reflect.deleteProperty(legacy, 'nextTradeId');
    const restored = gameSchema.parse(legacy);
    expect(restored.trades).toEqual([]);
    expect(restored.nextTradeId).toBe(1);
    const valid = { requestId: randomUUID(), expectedRevision: 1, command: { type: 'trade', action: {
      type: 'offer', toPlayerId: randomUUID(), give: { cash: 10, tiles: [1] }, receive: { cash: 0, tiles: [] },
    } } };
    expect(roomCommandSchema.safeParse(valid).success).toBe(true);
    for (const cash of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN]) {
      expect(roomCommandSchema.safeParse({ ...valid, command: { ...valid.command, action: { ...valid.command.action, give: { cash, tiles: [] } } } }).success).toBe(false);
    }
    expect(roomCommandSchema.safeParse({ ...valid, command: { ...valid.command, action: { ...valid.command.action, fromPlayerId: randomUUID() } } }).success).toBe(false);
  });
});
