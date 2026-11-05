import { describe, expect, test } from 'bun:test';
import type { Die, RoomView } from '@deshi/game';
import { diceReducer, diceSnapshot, initialDiceState } from './dicePresentation';

function snapshot(event: number | null, position = 0, dice: readonly [Die, Die] = [3, 5]) {
  return { event, dice, positions: { player: position }, hasRoll: event !== null };
}

function sync(state: ReturnType<typeof initialDiceState>, next: ReturnType<typeof snapshot>, requestingRoll = false, reducedMotion = false) {
  return diceReducer(state, { type: 'sync', snapshot: next, requestingRoll, reducedMotion });
}

describe('dice presentation', () => {
  test('initial room state and equal snapshots do not replay an existing roll', () => {
    const state = initialDiceState(snapshot(10, 8), false);
    expect(state.presentation.phase).toBe('settled');
    expect(sync(state, snapshot(10, 8))).toBe(state);
  });

  test('identical dice with a new log ID animate and hold the new pawn target', () => {
    const state = sync(initialDiceState(snapshot(10, 8), false), snapshot(11, 16));
    expect(state.presentation).toMatchObject({ phase: 'landing', event: 11, dice: [3, 5], positions: { player: 8 }, destination: { player: 16 } });
    expect(sync(state, snapshot(11, 16))).toBe(state);
    expect(diceReducer(state, { type: 'settle', event: 11 }).presentation).toMatchObject({ phase: 'settled', positions: { player: 16 }, resultVisible: true });
  });

  test('a slow HTTP reply cannot restart waiting after realtime confirmation', () => {
    let state = initialDiceState(snapshot(10, 8), false);
    state = sync(state, snapshot(10, 8), true);
    expect(state.presentation.phase).toBe('waiting');
    state = sync(state, snapshot(11, 16), true);
    state = diceReducer(state, { type: 'settle', event: 11 });
    expect(sync(state, snapshot(11, 16), true)).toBe(state);
    state = sync(state, snapshot(11, 16));
    expect(state.presentation).toMatchObject({ phase: 'settled', resultVisible: true });
  });

  test('a failed request leaves waiting without announcing the old result', () => {
    let state = initialDiceState(snapshot(10, 8), false);
    state = sync(state, snapshot(10, 8), true);
    state = sync(state, snapshot(10, 8));
    expect(state.presentation).toMatchObject({ phase: 'settled', dice: [3, 5], resultVisible: false });
    expect(sync(state, snapshot(10, 8))).toBe(state);
  });

  test('the newest confirmed event wins and ignores an older completion', () => {
    let state = sync(initialDiceState(snapshot(10, 8), false), snapshot(11, 16));
    state = sync(state, snapshot(12, 22, [3, 3]));
    expect(diceReducer(state, { type: 'settle', event: 11 })).toBe(state);
    expect(diceReducer(state, { type: 'settle', event: 12 }).presentation).toMatchObject({ phase: 'settled', dice: [3, 3], positions: { player: 22 } });
  });

  test('unrelated snapshots preserve a landing and its held position', () => {
    const state = sync(initialDiceState(snapshot(10, 8), false), snapshot(11, 16));
    expect(sync(state, snapshot(11, 16))).toBe(state);
    expect(state.presentation.positions.player).toBe(8);
  });

  test('reduced motion reveals and releases a result immediately', () => {
    const initial = initialDiceState(snapshot(10, 8), false);
    expect(sync(initial, snapshot(11, 16), false, true).presentation).toMatchObject({ phase: 'settled', positions: { player: 16 }, resultVisible: true });
    const landing = sync(initial, snapshot(11, 16));
    expect(sync(landing, snapshot(11, 16), false, true).presentation.phase).toBe('settled');
  });

  test('a later roll holds published targets while an earlier pawn path can continue', () => {
    let state = sync(initialDiceState(snapshot(10, 0), false), snapshot(11, 8));
    state = diceReducer(state, { type: 'settle', event: 11 });
    const targets = state.presentation.positions;
    state = sync(state, snapshot(12, 16));
    expect(state.presentation.positions).toBe(targets);
  });

  test('the log adapter uses the latest exact name, pair, and doubles punctuation', () => {
    const room: RoomView = {
      code: 'TEST', kind: 'friends', revision: 99, hostId: 'player', startingCash: 1500,
      seats: [{ id: 'player', name: 'Rafi', color: '#abc', token: 'boat', kind: 'human', connected: true, ready: true }],
      game: {
        status: 'playing', turn: { playerId: 'player', phase: 'end' }, turnNumber: 1,
        players: [{ id: 'player', position: 10, cash: 1500, status: 'active', jail: null }], deeds: {}, trades: [], legalActions: [],
        lastRoll: { playerId: 'player', dice: [4, 4] },
        log: [{ id: 1, text: 'Rafi rolled 4 + 4 · doubles!' }, { id: 2, text: 'Rafi rolled 4 + 4 · doubles!' }, { id: 3, text: 'Rafi rolled doubles and left jail.' }],
      },
    };
    expect(diceSnapshot(room).event).toBe(2);
    expect(diceSnapshot({ ...room, seats: [{ ...room.seats[0]!, name: 'Someone else' }] }).event).toBeNull();
  });
});
