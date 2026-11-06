import { describe, expect, test } from 'bun:test';
import type { GameView, RoomView } from '@deshi/game';
import { gameSound, GameSoundTracker } from './gameSound';

type PlayingRoom = RoomView & { game: Extract<GameView, { status: 'playing' }> };

function room(): PlayingRoom {
  return {
    code: 'SOUND1', kind: 'friends', gameType: 'tycoon', revision: 1, hostId: 'a', startingCash: 1500,
    turnTimer: null, serverTime: 0, unoGame: null,
    seats: [
      { id: 'a', name: 'Asha', color: '#a00', token: 'cat', kind: 'human', connected: true, ready: true },
      { id: 'b', name: 'Bashir', color: '#0a0', token: 'tiger', kind: 'human', connected: true, ready: true },
    ],
    game: {
      status: 'playing', turn: { playerId: 'a', phase: 'roll' }, turnNumber: 1,
      players: [
        { id: 'a', cash: 1500, position: 20, jail: null, status: 'active' },
        { id: 'b', cash: 1500, position: 20, jail: null, status: 'active' },
      ],
      deeds: {}, lastRoll: null, log: [], tradeLog: [], legalActions: [], trades: [],
    },
  };
}

function next(before: PlayingRoom): PlayingRoom {
  return { ...structuredClone(before), revision: before.revision + 1 };
}

function observe(tracker: GameSoundTracker, view: RoomView, options: Partial<Parameters<GameSoundTracker['observe']>[0]> = {}) {
  return tracker.observe({ session: { view, playerId: 'a' }, enabled: true, online: true, visible: true, now: 0, ...options });
}

describe('game sound selection', () => {
  test.each([0, 2, 5] as const)('buying a level %i property makes one purchase cue, including retained bank buildings', level => {
    const before = room();
    before.game.deeds[3] = { ownerId: null, level };
    const after = next(before);
    after.game.deeds[3] = { ownerId: 'a', level };
    after.game.players[0].cash -= 500;
    expect(gameSound(before, after, 'a')).toBe('purchase');
    expect(gameSound(before, after, 'b')).toBeNull();
  });

  test.each([{ from: 0, to: 1, cue: 'build' }, { from: 4, to: 5, cue: 'hotel' }] as const)('building selects $cue instead of a cash payment', ({ from, to, cue }) => {
    const before = room();
    before.game.deeds[3] = { ownerId: 'a', level: from };
    const after = next(before);
    after.game.deeds[3] = { ownerId: 'a', level: to };
    after.game.players[0].cash -= 200;
    expect(gameSound(before, after, 'a')).toBe(cue);
  });

  test('ordinary cash changes are local; bankruptcy takes precedence over payment and ownership loss', () => {
    const before = room();
    const after = next(before);
    after.game.players[0].cash -= 25;
    after.game.players[1].cash += 25;
    expect(gameSound(before, after, 'a')).toBe('pay');
    expect(gameSound(before, after, 'b')).toBe('gain');
    before.game.deeds[3] = { ownerId: 'a', level: 5 };
    after.game.deeds[3] = { ownerId: null, level: 5 };
    after.game.players[0].cash = 0;
    after.game.players[0].status = 'bankrupt';
    expect(gameSound(before, after, 'a')).toBe('bankrupt');
  });

  test('jail entry sounds once, and failed jail rolls do not replay it', () => {
    const before = room();
    const after = next(before);
    after.game.players[0].jail = { failedRolls: 0 };
    expect(gameSound(before, after, 'a')).toBe('jail');
    const failed = next(after);
    failed.game.players[0].jail = { failedRolls: 1 };
    expect(gameSound(after, failed, 'a')).toBeNull();
  });

  test('turn notifications only announce a new local turn, not doubles, timers, or opponent actions', () => {
    const before = room();
    before.game.turn.playerId = 'b';
    const after = next(before);
    after.game.turn.playerId = 'a';
    expect(gameSound(before, after, 'a')).toBe('turn');
    expect(gameSound(before, after, 'b')).toBeNull();
    const sameTurn = next(after);
    sameTurn.turnTimer = { playerId: 'a', expiresAt: 30_000, durationMs: 30_000 };
    expect(gameSound(after, sameTurn, 'a')).toBeNull();
  });

  test('identical dice on consecutive confirmed rolls still produce distinct events', () => {
    const before = room();
    before.game.lastRoll = { playerId: 'a', dice: [1, 2] };
    before.game.log = [{ id: 1, text: 'Asha rolled 1 + 2.' }];
    const after = next(before);
    after.game.log.push({ id: 2, text: 'Asha rolled 1 + 2.' });
    expect(gameSound(before, after, 'a')).toBe('roll');
    expect(gameSound(before, after, 'b')).toBeNull();
    const heartbeat = next(after);
    expect(gameSound(after, heartbeat, 'a')).toBeNull();
  });

  test('game completion selects one ending cue and remains silent for an already bankrupt spectator', () => {
    const before = room();
    const finished: RoomView = { ...next(before), game: { ...before.game, status: 'finished', winnerId: 'a' } };
    expect(gameSound(before, finished, 'a')).toBe('win');
    expect(gameSound(before, finished, 'b')).toBe('lose');
    before.game.players[1].status = 'bankrupt';
    expect(gameSound(before, finished, 'b')).toBeNull();
    expect(gameSound(finished, { ...finished, revision: finished.revision + 1 }, 'a')).toBeNull();
  });

  test('room switches, lobby transitions, and rematches do not replay existing events', () => {
    const before = room();
    const after = next(before);
    after.game.players[0].cash += 200;
    expect(gameSound(before, { ...after, code: 'SOUND2' }, 'a')).toBeNull();
    expect(gameSound({ ...before, game: null }, after, 'a')).toBeNull();
    expect(gameSound({ ...before, game: { ...before.game, status: 'finished', winnerId: 'a' } }, after, 'a')).toBeNull();
  });
});

describe('sound limits', () => {
  test('initial, duplicate, and stale snapshots are silent and cannot move the baseline backward', () => {
    const tracker = new GameSoundTracker();
    const before = room();
    const after = next(before);
    after.game.players[0].cash += 20;
    expect(observe(tracker, before)).toBeNull();
    expect(observe(tracker, after)).toBe('gain');
    expect(observe(tracker, after, { now: 2000 })).toBeNull();
    expect(observe(tracker, before, { now: 4000 })).toBeNull();
    expect(observe(tracker, after, { now: 6000 })).toBeNull();
  });

  test('rapid cues are dropped without replay; the next fresh event can play after the cooldown', () => {
    const tracker = new GameSoundTracker();
    const before = room();
    observe(tracker, before);
    const first = next(before);
    first.game.players[0].cash += 20;
    expect(observe(tracker, first, { now: 100 })).toBe('gain');
    const rapid = next(first);
    rapid.game.players[0].cash += 20;
    expect(observe(tracker, rapid, { now: 400 })).toBeNull();
    expect(observe(tracker, rapid, { now: 1500 })).toBeNull();
    const fresh = next(rapid);
    fresh.game.players[0].cash += 20;
    expect(observe(tracker, fresh, { now: 1500 })).toBe('gain');
  });

  test('a game ending can replace an ordinary cue during the cooldown, but cannot repeat', () => {
    const tracker = new GameSoundTracker();
    const before = room();
    observe(tracker, before);
    const paid = next(before);
    paid.game.players[0].cash -= 20;
    expect(observe(tracker, paid, { now: 100 })).toBe('pay');
    const finished: RoomView = { ...next(paid), game: { ...paid.game, status: 'finished', winnerId: 'a' } };
    expect(observe(tracker, finished, { now: 200 })).toBe('win');
    expect(observe(tracker, finished, { now: 300 })).toBeNull();
  });

  test.each(['enabled', 'online', 'visible'] as const)('%s suppresses missed events and silently baselines the resumed snapshot', flag => {
    const tracker = new GameSoundTracker();
    const before = room();
    observe(tracker, before);
    const missed = next(before);
    missed.game.players[0].cash += 20;
    expect(observe(tracker, missed, { [flag]: false })).toBeNull();
    const caughtUp = next(missed);
    caughtUp.game.players[0].cash += 20;
    expect(observe(tracker, caughtUp)).toBeNull();
    const live = next(caughtUp);
    live.game.players[0].cash += 20;
    expect(observe(tracker, live, { now: 2000 })).toBe('gain');
  });

  test('visibility resets and changes of seat silently establish a new baseline', () => {
    const tracker = new GameSoundTracker();
    const before = room();
    observe(tracker, before);
    const after = next(before);
    after.game.players[0].cash += 20;
    tracker.reset();
    expect(observe(tracker, after)).toBeNull();
    const anotherSeat = next(after);
    anotherSeat.game.players[1].cash += 20;
    expect(observe(tracker, anotherSeat, { session: { view: anotherSeat, playerId: 'b' } })).toBeNull();
  });
});
