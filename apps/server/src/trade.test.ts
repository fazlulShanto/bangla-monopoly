import { describe, expect, test } from 'bun:test';
import { GAME_CONFIG, type TradeAction, type TradeAssets, type Turn } from '@deshi/game';
import { applyAction, applyTradeAction, chooseBotTradeAction, createGame, gameView, RuleError, type GameState } from './game';
import { gameSchema } from './schema';

const PLAYERS = [
  { id: 'a', name: 'Asha' }, { id: 'b', name: 'Bashir' }, { id: 'c', name: 'Chitra' },
  { id: 'd', name: 'Dipa' }, { id: 'e', name: 'Eshan' }, { id: 'f', name: 'Farah' },
];

function game(count = 3): GameState { return createGame({ players: PLAYERS.slice(0, count), seed: 918273 }); }
function player(state: GameState, id = 'a') {
  const found = state.players.find(candidate => candidate.id === id);
  if (!found) throw new Error('Missing fixture player');
  return found;
}
function offer(state: GameState, fromPlayerId = 'a', toPlayerId = 'b', give: TradeAssets = { cash: 100, tiles: [] }, receive: TradeAssets = { cash: 0, tiles: [] }): GameState {
  return applyTradeAction(state, fromPlayerId, { type: 'offer', toPlayerId, give, receive });
}
function lastTrade(state: GameState) {
  const trade = state.trades.at(-1);
  if (!trade) throw new Error('Missing fixture trade');
  return trade;
}
function expectRejected(state: GameState, playerId: string, action: TradeAction): void {
  const saved = structuredClone(state);
  expect(() => applyTradeAction(state, playerId, action)).toThrow(RuleError);
  expect(state).toEqual(saved);
}

describe('player trading', () => {
  test('new games expose an empty offer list', () => {
    const state = game();
    expect(state.trades).toEqual([]);
    expect(gameView(state, 'a').trades).toEqual([]);
    expect(gameView(state, 'a').tradeLog).toEqual([]);
    expect(Number.isSafeInteger(state.nextTradeId)).toBe(true);
  });

  test('trade activity records offers and outcomes for every player', () => {
    let state = offer(game());
    state = applyTradeAction(state, 'b', { type: 'offer', toPlayerId: 'a', give: { cash: 20, tiles: [] }, receive: { cash: 0, tiles: [] }, replacesTradeId: 1 });
    state = applyTradeAction(state, 'a', { type: 'decline', tradeId: 2 });
    state = offer(state);
    state = applyTradeAction(state, 'a', { type: 'cancel', tradeId: 3 });
    state = offer(state);
    state = applyTradeAction(state, 'b', { type: 'accept', tradeId: 4 });
    state = offer(state);
    state = applyAction(state, 'a', { type: 'resign' });

    expect(state.tradeLog.map((entry) => entry.text)).toEqual([
      'Asha offered trade #1 to Bashir: ৳100 for nothing.',
      'Bashir countered trade #2 to Asha: ৳20 for nothing.',
      'Asha declined trade #2.',
      'Asha offered trade #3 to Bashir: ৳100 for nothing.',
      'Asha canceled trade #3.',
      'Asha offered trade #4 to Bashir: ৳100 for nothing.',
      'Bashir accepted trade #4 with Asha: ৳100 for nothing.',
      'Asha offered trade #5 to Bashir: ৳100 for nothing.',
      'Trade #5 expired because its players or assets changed.',
    ]);
    expect(gameView(state, 'a').tradeLog).toEqual(gameView(state, 'c').tradeLog);
  });

  test('ordinary game activity does not push trade activity out of the public history', () => {
    let state = offer(game());
    state = applyTradeAction(state, 'b', { type: 'accept', tradeId: 1 });
    const tradeLog = state.tradeLog;
    const lastTradeEventId = tradeLog.at(-1)?.id ?? 0;
    state.players.forEach((candidate) => { candidate.cash = 100000; });
    for (let step = 0; step < 250 && state.status === 'playing' && (state.log[0]?.id ?? 0) <= lastTradeEventId; step += 1) {
      const action = state.turn.phase === 'roll' ? 'roll' : state.turn.phase === 'purchase' ? 'decline' : 'endTurn';
      state = applyAction(state, state.turn.playerId, { type: action });
    }
    expect(state.log.every((entry) => entry.id > lastTradeEventId)).toBe(true);
    expect(state.tradeLog).toEqual(tradeLog);
  });

  test('trade history keeps the latest 100 events', () => {
    let state = game();
    for (let index = 0; index < 55; index += 1) {
      state = offer(state);
      state = applyTradeAction(state, 'a', { type: 'cancel', tradeId: lastTrade(state).id });
    }
    expect(state.tradeLog).toHaveLength(100);
    expect(state.tradeLog[0]?.text).toContain('offered trade #6');
    expect(state.tradeLog.at(-1)?.text).toContain('canceled trade #55');
  });

  test('saved games without a trade history recover trade events still in the game log', () => {
    let legacy = offer(game());
    legacy = applyTradeAction(legacy, 'b', { type: 'accept', tradeId: 1 });
    const expected = legacy.tradeLog;
    Reflect.deleteProperty(legacy, 'tradeLog');
    expect(gameSchema.parse(legacy).tradeLog).toEqual(expected);
  });

  const phases: Turn[] = [
    { playerId: 'a', phase: 'roll' },
    { playerId: 'a', phase: 'purchase', tile: 1 },
    { playerId: 'a', phase: 'end' },
  ];
  test.each(phases)('an out-of-turn player can offer during $phase without advancing play', turn => {
    const state = game();
    if (state.status !== 'playing') throw new Error('Fixture game finished');
    state.turn = turn;
    const saved = structuredClone(state);
    const after = offer(state, 'b', 'c');
    expect(after.trades).toHaveLength(1);
    expect(lastTrade(after)).toMatchObject({ fromPlayerId: 'b', toPlayerId: 'c', give: { cash: 100, tiles: [] }, receive: { cash: 0, tiles: [] } });
    expect(after.status === 'playing' && after.turn).toEqual(turn);
    expect(after.turnNumber).toBe(saved.turnNumber);
    expect(after.players).toEqual(saved.players);
    expect(state).toEqual(saved);
    expect(gameView(after, 'c').trades).toEqual(after.trades);
  });

  test('acceptance swaps cash and all property types without creating money or deeds', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    state.deeds[5] = { ownerId: 'a', level: 0 };
    state.deeds[6] = { ownerId: 'b', level: 0 };
    state.deeds[12] = { ownerId: 'b', level: 0 };
    state.deeds[39] = { ownerId: 'c', level: 0 };
    const pending = offer(state, 'a', 'b', { cash: 300, tiles: [1, 5] }, { cash: 120, tiles: [6, 12] });
    const saved = structuredClone(pending);
    const after = applyTradeAction(pending, 'b', { type: 'accept', tradeId: lastTrade(pending).id });
    expect(player(after, 'a').cash).toBe(1320);
    expect(player(after, 'b').cash).toBe(1680);
    expect(player(after, 'c').cash).toBe(1500);
    expect(after.players.reduce((sum, candidate) => sum + candidate.cash, 0)).toBe(4500);
    expect(after.deeds).toEqual({
      1: { ownerId: 'b', level: 0 }, 5: { ownerId: 'b', level: 0 },
      6: { ownerId: 'a', level: 0 }, 12: { ownerId: 'a', level: 0 },
      39: { ownerId: 'c', level: 0 },
    });
    expect(after.trades).toEqual([]);
    expect(after.status === 'playing' && after.turn).toEqual(saved.status === 'playing' && saved.turn);
    expect(after.turnNumber).toBe(saved.turnNumber);
    expect(pending).toEqual(saved);
  });

  test('a property can be gifted for no cash', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    const pending = offer(state, 'a', 'b', { cash: 0, tiles: [1] });
    const after = applyTradeAction(pending, 'b', { type: 'accept', tradeId: lastTrade(pending).id });
    expect(after.deeds[1]).toEqual({ ownerId: 'b', level: 0 });
    expect(after.players.map(candidate => candidate.cash)).toEqual([1500, 1500, 1500]);
  });

  test('offers do not reserve cash and the recipient must accept a cash gift', () => {
    const pending = offer(game(), 'a', 'b', { cash: 200, tiles: [] });
    expect(player(pending, 'a').cash).toBe(1500);
    expect(player(pending, 'b').cash).toBe(1500);
    const after = applyTradeAction(pending, 'b', { type: 'accept', tradeId: lastTrade(pending).id });
    expect(player(after, 'a').cash).toBe(1300);
    expect(player(after, 'b').cash).toBe(1700);
  });

  test('an offer snapshots asset arrays supplied by the caller', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    state.deeds[3] = { ownerId: 'a', level: 0 };
    const give = { cash: 0, tiles: [1] };
    const receive = { cash: 25, tiles: [] };
    const after = offer(state, 'a', 'b', give, receive);
    give.tiles.push(3);
    receive.cash = 500;
    expect(lastTrade(after).give).toEqual({ cash: 0, tiles: [1] });
    expect(lastTrade(after).receive).toEqual({ cash: 25, tiles: [] });
  });

  test.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid offered or requested cash %s', cash => {
    const state = game();
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash, tiles: [] }, receive: { cash: 10, tiles: [] } });
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 10, tiles: [] }, receive: { cash, tiles: [] } });
  });

  test('each participant must afford the gross cash they promise before receiving any cash', () => {
    const state = game();
    player(state, 'a').cash = 50;
    player(state, 'b').cash = 1000;
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 100, tiles: [] }, receive: { cash: 500, tiles: [] } });
    expectRejected(state, 'b', { type: 'offer', toPlayerId: 'a', give: { cash: 500, tiles: [] }, receive: { cash: 100, tiles: [] } });
  });

  test.each([0, 50])('rejects an empty exchange of equal cash %s', cash => {
    expectRejected(game(), 'a', { type: 'offer', toPlayerId: 'b', give: { cash, tiles: [] }, receive: { cash, tiles: [] } });
  });

  test.each([-1, 0, 2, 4, 40, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid or non-property tile %s', tile => {
    const state = game();
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 0, tiles: [tile] }, receive: { cash: 10, tiles: [] } });
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 10, tiles: [] }, receive: { cash: 0, tiles: [tile] } });
  });

  test('rejects unowned, another player\'s, and repeated deeds on either side', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    state.deeds[3] = { ownerId: 'b', level: 0 };
    state.deeds[5] = { ownerId: 'c', level: 0 };
    for (const tiles of [[3], [5], [6], [1, 1]]) {
      expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 0, tiles }, receive: { cash: 10, tiles: [] } });
    }
    for (const tiles of [[1], [5], [6], [3, 3]]) {
      expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 10, tiles: [] }, receive: { cash: 0, tiles } });
    }
  });

  test('rejects an undeveloped street when another street in its group has buildings', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    state.deeds[3] = { ownerId: 'a', level: 1 };
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 0, tiles: [1] }, receive: { cash: 10, tiles: [] } });
    expectRejected(state, 'b', { type: 'offer', toPlayerId: 'a', give: { cash: 10, tiles: [] }, receive: { cash: 0, tiles: [1] } });
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 0, tiles: [3] }, receive: { cash: 10, tiles: [] } });
    state.deeds[5] = { ownerId: 'a', level: 0 };
    expect(offer(state, 'a', 'b', { cash: 0, tiles: [5] }).trades).toHaveLength(1);
  });

  test('only distinct, active, seated participants can create an offer', () => {
    const state = game();
    const assets = { give: { cash: 10, tiles: [] }, receive: { cash: 0, tiles: [] } };
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'a', ...assets });
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'missing', ...assets });
    expectRejected(state, 'missing', { type: 'offer', toPlayerId: 'b', ...assets });
    player(state, 'c').status = 'bankrupt';
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'c', ...assets });
    expectRejected(state, 'c', { type: 'offer', toPlayerId: 'a', ...assets });
  });

  test('one unordered pair has one outstanding offer', () => {
    const pending = offer(game());
    expectRejected(pending, 'a', { type: 'offer', toPlayerId: 'b', give: { cash: 50, tiles: [] }, receive: { cash: 0, tiles: [] } });
    expectRejected(pending, 'b', { type: 'offer', toPlayerId: 'a', give: { cash: 50, tiles: [] }, receive: { cash: 0, tiles: [] } });
    expect(offer(pending, 'a', 'c').trades).toHaveLength(2);
  });

  test('six players can have all fifteen pairs outstanding, with unique identifiers', () => {
    let state = game(6);
    for (const [index, sender] of PLAYERS.entries()) {
      for (const recipient of PLAYERS.slice(index + 1)) state = offer(state, sender.id, recipient.id);
    }
    expect(state.trades).toHaveLength(15);
    expect(new Set(state.trades.map(trade => trade.id)).size).toBe(15);
    expectRejected(state, 'a', { type: 'offer', toPlayerId: 'f', give: { cash: 50, tiles: [] }, receive: { cash: 0, tiles: [] } });
    const first = state.trades[0];
    if (!first) throw new Error('Missing fixture trade');
    const cancelled = applyTradeAction(state, first.fromPlayerId, { type: 'cancel', tradeId: first.id });
    const reopened = offer(cancelled, first.fromPlayerId, first.toPlayerId);
    expect(reopened.trades).toHaveLength(15);
    expect(lastTrade(reopened).id).toBeGreaterThan(Math.max(...state.trades.map(trade => trade.id)));
  });

  test('only the recipient accepts or declines, and only the sender cancels', () => {
    const pending = offer(game());
    const tradeId = lastTrade(pending).id;
    for (const type of ['accept', 'decline'] satisfies ('accept' | 'decline')[]) {
      for (const actor of ['a', 'c', 'missing']) expectRejected(pending, actor, { type, tradeId });
    }
    for (const actor of ['b', 'c', 'missing']) expectRejected(pending, actor, { type: 'cancel', tradeId });
    const declined = applyTradeAction(pending, 'b', { type: 'decline', tradeId });
    const cancelled = applyTradeAction(pending, 'a', { type: 'cancel', tradeId });
    expect(declined.trades).toEqual([]);
    expect(cancelled.trades).toEqual([]);
    expect(declined.players).toEqual(pending.players);
    expect(cancelled.players).toEqual(pending.players);
    expect(declined.deeds).toEqual(pending.deeds);
    expect(cancelled.deeds).toEqual(pending.deeds);
  });

  test('a removed offer cannot be replayed', () => {
    const pending = offer(game());
    const tradeId = lastTrade(pending).id;
    const after = applyTradeAction(pending, 'b', { type: 'accept', tradeId });
    for (const type of ['accept', 'decline', 'cancel'] satisfies ('accept' | 'decline' | 'cancel')[]) {
      expectRejected(after, type === 'cancel' ? 'a' : 'b', { type, tradeId });
    }
    expect(player(after, 'a').cash).toBe(1400);
    expect(player(after, 'b').cash).toBe(1600);
  });

  test('a recipient counteroffer atomically replaces the original and reverses the participants', () => {
    const pending = offer(game());
    const original = lastTrade(pending);
    const saved = structuredClone(pending);
    const countered = applyTradeAction(pending, 'b', {
      type: 'offer', toPlayerId: 'a', give: { cash: 50, tiles: [] }, receive: { cash: 150, tiles: [] }, replacesTradeId: original.id,
    });
    expect(countered.trades).toHaveLength(1);
    const counter = lastTrade(countered);
    expect(counter).toMatchObject({ fromPlayerId: 'b', toPlayerId: 'a', give: { cash: 50, tiles: [] }, receive: { cash: 150, tiles: [] } });
    expect(counter.id).toBeGreaterThan(original.id);
    expectRejected(countered, 'b', { type: 'accept', tradeId: original.id });
    const accepted = applyTradeAction(countered, 'a', { type: 'accept', tradeId: counter.id });
    expect(player(accepted, 'a').cash).toBe(1400);
    expect(player(accepted, 'b').cash).toBe(1600);
    expect(pending).toEqual(saved);
  });

  test('invalid counters preserve the original offer, balances, and identifiers', () => {
    const pending = offer(game());
    const tradeId = lastTrade(pending).id;
    const assets = { give: { cash: 50, tiles: [] }, receive: { cash: 0, tiles: [] } };
    expectRejected(pending, 'a', { type: 'offer', toPlayerId: 'b', ...assets, replacesTradeId: tradeId });
    expectRejected(pending, 'c', { type: 'offer', toPlayerId: 'a', ...assets, replacesTradeId: tradeId });
    expectRejected(pending, 'b', { type: 'offer', toPlayerId: 'c', ...assets, replacesTradeId: tradeId });
    expectRejected(pending, 'b', { type: 'offer', toPlayerId: 'a', ...assets, replacesTradeId: tradeId + 100 });
    expectRejected(pending, 'b', { type: 'offer', toPlayerId: 'a', give: { cash: 1501, tiles: [] }, receive: { cash: 0, tiles: [] }, replacesTradeId: tradeId });
    expect(applyTradeAction(pending, 'b', { type: 'accept', tradeId }).trades).toEqual([]);
  });

  test('acceptance rechecks both balances, ownership, improvements, and participant status', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    state.deeds[3] = { ownerId: 'a', level: 0 };
    state.deeds[5] = { ownerId: 'b', level: 0 };
    const pending = offer(state, 'a', 'b', { cash: 100, tiles: [1] }, { cash: 200, tiles: [5] });
    const tradeId = lastTrade(pending).id;
    const changes: ((changed: GameState) => void)[] = [
      changed => { player(changed, 'a').cash = 99; },
      changed => { player(changed, 'b').cash = 199; },
      changed => { changed.deeds[1] = { ownerId: 'c', level: 0 }; },
      changed => { changed.deeds[5] = { ownerId: 'c', level: 0 }; },
      changed => { changed.deeds[3] = { ownerId: 'a', level: 1 }; },
      changed => { player(changed, 'a').status = 'bankrupt'; },
      changed => { player(changed, 'b').status = 'bankrupt'; },
    ];
    for (const change of changes) {
      const changed = structuredClone(pending);
      change(changed);
      expectRejected(changed, 'b', { type: 'accept', tradeId });
    }
  });

  test('acceptance rejects an unsafe resulting cash balance without partial transfers', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    const pending = offer(state, 'a', 'b', { cash: 100, tiles: [1] });
    player(pending, 'b').cash = Number.MAX_SAFE_INTEGER;
    expectRejected(pending, 'b', { type: 'accept', tradeId: lastTrade(pending).id });
    expect(pending.deeds[1]?.ownerId).toBe('a');
  });

  test('equal cash transfers can keep a safe balance at the maximum safe integer', () => {
    const state = game();
    player(state, 'a').cash = Number.MAX_SAFE_INTEGER;
    state.deeds[1] = { ownerId: 'a', level: 0 };
    const pending = offer(state, 'a', 'b', { cash: 100, tiles: [1] }, { cash: 100, tiles: [] });
    const after = applyTradeAction(pending, 'b', { type: 'accept', tradeId: lastTrade(pending).id });
    expect(player(after, 'a').cash).toBe(Number.MAX_SAFE_INTEGER);
    expect(player(after, 'b').cash).toBe(1500);
    expect(after.deeds[1]?.ownerId).toBe('b');
  });

  test('paying bail removes an unaffordable offer and retains unrelated offers', () => {
    const state = game();
    player(state, 'a').cash = 100;
    player(state, 'a').position = 10;
    player(state, 'a').jail = { failedRolls: 0 };
    const pending = offer(offer(state), 'b', 'c', { cash: 10, tiles: [] });
    const unrelatedId = lastTrade(pending).id;
    const after = applyAction(pending, 'a', { type: 'payBail' });
    expect(player(after, 'a').cash).toBe(50);
    expect(after.trades.map(trade => trade.id)).toEqual([unrelatedId]);
  });

  test('buying a property removes an offer the buyer can no longer afford', () => {
    const state = game();
    if (state.status !== 'playing') throw new Error('Fixture game finished');
    state.turn = { playerId: 'a', phase: 'purchase', tile: 5 };
    player(state, 'a').cash = 200;
    const pending = offer(state, 'a', 'b', { cash: 200, tiles: [] });
    const after = applyAction(pending, 'a', { type: 'buy' });
    expect(after.deeds[5]?.ownerId).toBe('a');
    expect(after.trades).toEqual([]);
  });

  test('building on a group removes an offer of another street in that group', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    state.deeds[3] = { ownerId: 'a', level: 0 };
    const pending = offer(state, 'a', 'b', { cash: 0, tiles: [1] });
    const after = applyAction(pending, 'a', { type: 'build', tile: 3 });
    expect(after.deeds[3]?.level).toBe(1);
    expect(after.trades).toEqual([]);
  });

  test('accepting an offer invalidates other offers of the same deed', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    const first = offer(state, 'a', 'b', { cash: 0, tiles: [1] });
    const second = offer(first, 'a', 'c', { cash: 0, tiles: [1] });
    const acceptedId = lastTrade(second).id;
    const pending = offer(second, 'b', 'c', { cash: 10, tiles: [] });
    const unrelatedId = lastTrade(pending).id;
    const after = applyTradeAction(pending, 'c', { type: 'accept', tradeId: acceptedId });
    expect(after.deeds[1]?.ownerId).toBe('c');
    expect(after.trades.map(trade => trade.id)).toEqual([unrelatedId]);
  });

  test('accepting a cash offer invalidates another offer its sender can no longer afford', () => {
    const state = game();
    player(state, 'a').cash = 100;
    const pending = offer(offer(state), 'a', 'c');
    const after = applyTradeAction(pending, 'c', { type: 'accept', tradeId: lastTrade(pending).id });
    expect(player(after, 'a').cash).toBe(0);
    expect(after.trades).toEqual([]);
  });

  test('resignation removes offers involving that player while other players keep trading', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    const first = offer(state, 'a', 'b', { cash: 0, tiles: [1] });
    const second = offer(first, 'c', 'a');
    const pending = offer(second, 'b', 'c');
    const unrelatedId = lastTrade(pending).id;
    const after = applyAction(pending, 'a', { type: 'resign' });
    expect(after.status).toBe('playing');
    expect(player(after, 'a').status).toBe('bankrupt');
    expect(after.deeds[1]).toBeUndefined();
    expect(after.trades.map(trade => trade.id)).toEqual([unrelatedId]);
  });

  test('finishing a game clears all offers and prevents further trading', () => {
    const pending = offer(game(2));
    const tradeId = lastTrade(pending).id;
    const finished = applyAction(pending, 'b', { type: 'resign' });
    expect(finished.status).toBe('finished');
    expect(finished.trades).toEqual([]);
    expect(gameView(finished, 'a').trades).toEqual([]);
    expect(finished.tradeLog.at(-1)?.text).toBe(`Trade #${tradeId} expired because the game finished.`);
    const actions: TradeAction[] = [
      { type: 'offer', toPlayerId: 'b', give: { cash: 10, tiles: [] }, receive: { cash: 0, tiles: [] } },
      { type: 'accept', tradeId }, { type: 'decline', tradeId }, { type: 'cancel', tradeId },
    ];
    for (const action of actions) expectRejected(finished, 'a', action);
    expect(chooseBotTradeAction(finished, 'a')).toBeUndefined();
  });
});

describe('bot trading', () => {
  test.each([
    { giveCash: 40, receiveCash: GAME_CONFIG.properties.dhaka.price + 40, expected: 'accept' },
    { giveCash: 41, receiveCash: GAME_CONFIG.properties.dhaka.price + 40, expected: 'accept' },
    { giveCash: 39, receiveCash: GAME_CONFIG.properties.dhaka.price + 40, expected: 'decline' },
  ])('uses street face value with cash: $giveCash against $receiveCash gives $expected', ({ giveCash, receiveCash, expected }) => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    const pending = offer(state, 'a', 'b', { cash: giveCash, tiles: [1] }, { cash: receiveCash, tiles: [] });
    const saved = structuredClone(pending);
    expect(chooseBotTradeAction(pending, 'b')).toEqual({ type: expected, tradeId: lastTrade(pending).id });
    expect(chooseBotTradeAction(pending, 'b')).toEqual(chooseBotTradeAction(pending, 'b'));
    expect(pending).toEqual(saved);
  });

  test('counts airport and utility face values on both sides', () => {
    const state = game();
    state.deeds[5] = { ownerId: 'a', level: 0 };
    state.deeds[12] = { ownerId: 'b', level: 0 };
    const fair = offer(state, 'a', 'b', { cash: 0, tiles: [5] }, { cash: 50, tiles: [12] });
    expect(chooseBotTradeAction(fair, 'b')).toEqual({ type: 'accept', tradeId: lastTrade(fair).id });
    const unfair = offer(state, 'a', 'b', { cash: 0, tiles: [5] }, { cash: 51, tiles: [12] });
    expect(chooseBotTradeAction(unfair, 'b')).toEqual({ type: 'decline', tradeId: lastTrade(unfair).id });
  });

  test('responds deterministically to an incoming offer when several exist', () => {
    const pending = offer(offer(game()), 'c', 'b');
    const chosen = chooseBotTradeAction(pending, 'b');
    expect(chosen?.type).toBe('accept');
    expect(chosen && 'tradeId' in chosen && pending.trades.some(trade => trade.id === chosen.tradeId && trade.toPlayerId === 'b')).toBe(true);
    expect(chooseBotTradeAction(pending, 'b')).toEqual(chosen);
  });

  test('does not create unsolicited offers or answer another player\'s offer', () => {
    expect(chooseBotTradeAction(game(), 'b')).toBeUndefined();
    const pending = offer(game());
    expect(chooseBotTradeAction(pending, 'a')).toBeUndefined();
    expect(chooseBotTradeAction(pending, 'c')).toBeUndefined();
    expect(chooseBotTradeAction(pending, 'missing')).toBeUndefined();
  });
});
