import { describe, expect, test } from 'bun:test';
import { UNO_COLORS, type UnoCard } from '@deshi/game';
import { RuleError } from '../../game';
import { applyUnoAction, chooseUnoBotAction, createUnoGame, unoGameSchema, unoGameView, type UnoGameState } from './engine';

const PLAYERS = [
  { id: 'a', name: 'Asha' }, { id: 'b', name: 'Bashir' }, { id: 'c', name: 'Chitra' },
  { id: 'd', name: 'Dipa' }, { id: 'e', name: 'Emon' }, { id: 'f', name: 'Fariha' },
];
type Playing = Extract<UnoGameState, { status: 'playing' }>;

function game(count = 3, seed = 12345): Playing {
  const state = createUnoGame({ players: PLAYERS.slice(0, count), seed });
  if (state.status !== 'playing') throw new Error('New game must be playing');
  return state;
}

function cards(state: UnoGameState): UnoCard[] {
  return [state.topCard, ...state.deck, ...state.discard, ...state.players.flatMap(player => player.hand)];
}

function player(state: UnoGameState, id = 'a') {
  const found = state.players.find(candidate => candidate.id === id);
  if (!found) throw new Error('Missing fixture player');
  return found;
}

function rig(input: { hands: string[][]; top?: string; draw?: string[] }): Playing {
  const state = game(input.hands.length);
  const pool = cards(state);
  const take = (id: string): UnoCard => {
    const index = pool.findIndex(card => card.id === id);
    const card = index < 0 ? undefined : pool.splice(index, 1)[0];
    if (!card) throw new Error(`Missing fixture card ${id}`);
    return card;
  };
  state.topCard = take(input.top ?? 'red-5-0');
  state.currentColor = state.topCard.color === 'wild' ? 'red' : state.topCard.color;
  state.players.forEach((candidate, index) => { candidate.hand = (input.hands[index] ?? []).map(take); });
  const nextDraws = (input.draw ?? []).map(take);
  state.deck = [...pool, ...nextDraws.reverse()];
  return state;
}

function assertDeck(state: UnoGameState): void {
  const deck = cards(state);
  expect(deck).toHaveLength(108);
  expect(new Set(deck.map(card => card.id)).size).toBe(108);
  expect(state.discard.some(card => card.id === state.topCard.id)).toBe(false);
  expect(unoGameSchema.safeParse(state).success).toBe(true);
}

describe('UNO deck and private views', () => {
  test('deals seven from the standard 108-card deck for two through six players', () => {
    for (let count = 2; count <= 6; count += 1) {
      const state = game(count);
      assertDeck(state);
      expect(state.players.every(candidate => candidate.hand.length === 7)).toBe(true);
      expect(state.deck).toHaveLength(107 - count * 7);
      expect(state.topCard.value).toMatch(/^\d$/);
      const deck = cards(state);
      for (const color of UNO_COLORS) {
        expect(deck.filter(card => card.color === color)).toHaveLength(25);
        expect(deck.filter(card => card.color === color && card.value === '0')).toHaveLength(1);
        for (const value of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2']) {
          expect(deck.filter(card => card.color === color && card.value === value)).toHaveLength(2);
        }
      }
      expect(deck.filter(card => card.value === 'wild')).toHaveLength(4);
      expect(deck.filter(card => card.value === 'wild4')).toHaveLength(4);
    }
  });

  test('seeded games are repeatable and reject invalid player counts or duplicate seats', () => {
    expect(game(6, 8181)).toEqual(game(6, 8181));
    expect(game(6, 0)).toEqual(game(6, 1));
    expect(() => createUnoGame({ players: PLAYERS.slice(0, 1), seed: 1 })).toThrow(RuleError);
    expect(() => createUnoGame({ players: [...PLAYERS, { id: 'g', name: 'G' }], seed: 1 })).toThrow(RuleError);
    expect(() => createUnoGame({ players: [PLAYERS[0], PLAYERS[0]], seed: 1 })).toThrow(RuleError);
  });

  test('views reveal only the viewer hand and do not expose stored decks or random seed', () => {
    const state = game();
    const view = unoGameView(state, 'a');
    expect(view.hand).toEqual(player(state).hand);
    expect(view.players.map(candidate => candidate.cardCount)).toEqual([7, 7, 7]);
    expect(Object.keys(view)).not.toContain('deck');
    expect(Object.keys(view)).not.toContain('discard');
    expect(Object.keys(view)).not.toContain('seed');
    expect(Object.keys(view)).not.toContain('drawnCardId');
    const serialized = JSON.stringify(view);
    for (const card of player(state, 'b').hand) expect(serialized).not.toContain(card.id);
    view.hand.splice(0);
    view.players[0].cardCount = 99;
    expect(player(state).hand).toHaveLength(7);
    expect(unoGameView(state, 'spectator').hand).toEqual([]);
  });

  test('stored state rejects unexpected nested fields and incoherent wild cards', () => {
    const state = game();
    expect(unoGameSchema.safeParse({ ...state, deck: [{ ...state.topCard, secret: 'hidden' }] }).success).toBe(false);
    expect(unoGameSchema.safeParse({ ...state, topCard: { id: 'bad', color: 'red', value: 'wild4' } }).success).toBe(false);
  });
});

describe('UNO turn rules', () => {
  test('matches color or value, blocks other players, and never mutates input snapshots', () => {
    const state = rig({ hands: [['red-1-0', 'blue-5-0', 'green-3-0'], ['yellow-2-0', 'blue-3-0']] });
    expect(unoGameView(state, 'a').playableCardIds.sort()).toEqual(['blue-5-0', 'red-1-0']);
    const saved = structuredClone(state);
    expect(() => applyUnoAction(state, 'a', { type: 'play', cardId: 'green-3-0' })).toThrow(RuleError);
    expect(() => applyUnoAction(state, 'b', { type: 'draw' })).toThrow(RuleError);
    expect(() => applyUnoAction(state, 'outsider', { type: 'draw' })).toThrow(RuleError);
    expect(() => applyUnoAction(state, 'a', { type: 'pass' })).toThrow(RuleError);
    expect(() => applyUnoAction(state, 'a', { type: 'play', cardId: 'red-1-0', color: 'blue' })).toThrow(RuleError);
    const played = applyUnoAction(state, 'a', { type: 'play', cardId: 'red-1-0' });
    expect(state).toEqual(saved);
    expect(played.status === 'playing' && played.turnPlayerId).toBe('b');
    expect(played.topCard.id).toBe('red-1-0');
    assertDeck(played);
  });

  test('skip and reverse follow the active seats; reverse skips in two-player games', () => {
    const hands = [['red-skip-0', 'red-reverse-0', 'green-8-0'], ['yellow-2-0', 'blue-3-0'], ['green-2-0', 'blue-4-0']];
    const skipped = applyUnoAction(rig({ hands }), 'a', { type: 'play', cardId: 'red-skip-0' });
    expect(skipped.status === 'playing' && skipped.turnPlayerId).toBe('c');
    const reversed = applyUnoAction(rig({ hands }), 'a', { type: 'play', cardId: 'red-reverse-0' });
    expect(reversed.direction).toBe(-1);
    expect(reversed.status === 'playing' && reversed.turnPlayerId).toBe('c');
    const two = applyUnoAction(rig({ hands: hands.slice(0, 2) }), 'a', { type: 'play', cardId: 'red-reverse-0' });
    expect(two.status === 'playing' && two.turnPlayerId).toBe('a');
    expect(two.turnNumber).toBe(2);
  });

  test('draw two applies immediately and skips the victim without stacking', () => {
    const state = rig({ hands: [['red-draw2-0', 'green-8-0'], ['blue-draw2-0', 'blue-3-0'], ['green-2-0', 'blue-4-0']] });
    const played = applyUnoAction(state, 'a', { type: 'play', cardId: 'red-draw2-0', sayUno: true });
    expect(player(played, 'b').hand).toHaveLength(4);
    expect(played.status === 'playing' && played.turnPlayerId).toBe('c');
    expect(() => applyUnoAction(played, 'b', { type: 'play', cardId: 'blue-draw2-0' })).toThrow(RuleError);
    assertDeck(played);
  });

  test('wild requires a chosen color; wild four requires no matching color and skips with four cards', () => {
    const illegal = rig({ hands: [['wild4-0', 'red-1-0'], ['green-2-0', 'blue-4-0']] });
    expect(unoGameView(illegal, 'a').playableCardIds).not.toContain('wild4-0');
    expect(() => applyUnoAction(illegal, 'a', { type: 'play', cardId: 'wild4-0', color: 'blue' })).toThrow(RuleError);
    const allowed = rig({ hands: [['wild4-0', 'blue-5-0'], ['green-2-0', 'blue-4-0'], ['green-1-0', 'yellow-1-0']] });
    expect(() => applyUnoAction(allowed, 'a', { type: 'play', cardId: 'wild4-0' })).toThrow(RuleError);
    const played = applyUnoAction(allowed, 'a', { type: 'play', cardId: 'wild4-0', color: 'blue', sayUno: true });
    expect(played.currentColor).toBe('blue');
    expect(player(played, 'b').hand).toHaveLength(6);
    expect(played.status === 'playing' && played.turnPlayerId).toBe('c');
    assertDeck(played);
    const wild = applyUnoAction(rig({ hands: [['wild-0', 'red-1-0'], ['green-2-0', 'blue-4-0']] }), 'a', { type: 'play', cardId: 'wild-0', color: 'green' });
    expect(wild.currentColor).toBe('green');
  });

  test('a voluntary draw permits only the drawn card, or a pass', () => {
    const state = rig({ hands: [['red-8-0', 'blue-9-0'], ['green-2-0', 'blue-4-0']], draw: ['green-5-0'] });
    const drawn = applyUnoAction(state, 'a', { type: 'draw' });
    expect(drawn.status === 'playing' && drawn.turnPlayerId).toBe('a');
    const view = unoGameView(drawn, 'a');
    expect(view.playableCardIds).toEqual(['green-5-0']);
    expect(view.canDraw).toBe(false);
    expect(view.canPass).toBe(true);
    expect(() => applyUnoAction(drawn, 'a', { type: 'play', cardId: 'red-8-0' })).toThrow(RuleError);
    expect(() => applyUnoAction(drawn, 'a', { type: 'draw' })).toThrow(RuleError);
    const passed = applyUnoAction(drawn, 'a', { type: 'pass' });
    expect(passed.status === 'playing' && passed.turnPlayerId).toBe('b');
    expect(player(passed).hand).toHaveLength(3);
    const played = applyUnoAction(drawn, 'a', { type: 'play', cardId: 'green-5-0' });
    expect(played.currentColor).toBe('green');
    expect(player(played).hand).toHaveLength(2);
    assertDeck(played);
  });

  test('an unplayable drawn card advances automatically, including a forbidden drawn wild four', () => {
    for (const draw of ['green-9-0', 'wild4-0']) {
      const state = rig({ hands: [['red-8-0', 'blue-9-0'], ['green-2-0', 'blue-4-0']], draw: [draw] });
      const drawn = applyUnoAction(state, 'a', { type: 'draw' });
      expect(drawn.status === 'playing' && drawn.turnPlayerId).toBe('b');
      expect(unoGameView(drawn, 'a').canPass).toBe(false);
      assertDeck(drawn);
    }
  });
});

describe('UNO declaration, leaving, and finish', () => {
  test('declaring with the penultimate card prevents a catch', () => {
    const state = rig({ hands: [['red-8-0', 'blue-9-0'], ['green-2-0', 'blue-4-0']] });
    const played = applyUnoAction(state, 'a', { type: 'play', cardId: 'red-8-0', sayUno: true });
    expect(player(played).uno).toBe(true);
    expect(played.catchablePlayerId).toBeNull();
    expect(() => applyUnoAction(played, 'b', { type: 'catchUno', playerId: 'a' })).toThrow(RuleError);
  });

  test('a missed UNO can be caught for two cards before the next turn action', () => {
    const state = rig({ hands: [['red-8-0', 'blue-9-0'], ['green-2-0', 'blue-4-0']], draw: ['yellow-9-0'] });
    const missed = applyUnoAction(state, 'a', { type: 'play', cardId: 'red-8-0' });
    expect(missed.catchablePlayerId).toBe('a');
    expect(unoGameView(missed, 'a').canCallUno).toBe(true);
    expect(() => applyUnoAction(missed, 'a', { type: 'catchUno', playerId: 'a' })).toThrow(RuleError);
    const caught = applyUnoAction(missed, 'b', { type: 'catchUno', playerId: 'a' });
    expect(player(caught).hand).toHaveLength(3);
    expect(caught.catchablePlayerId).toBeNull();
    expect(caught.turnNumber).toBe(missed.turnNumber);
    expect(() => applyUnoAction(caught, 'b', { type: 'catchUno', playerId: 'a' })).toThrow(RuleError);
    const called = applyUnoAction(missed, 'a', { type: 'callUno' });
    expect(player(called).uno).toBe(true);
    expect(called.catchablePlayerId).toBeNull();
    const tooLate = applyUnoAction(missed, 'b', { type: 'draw' });
    expect(tooLate.catchablePlayerId).toBeNull();
    expect(() => applyUnoAction(tooLate, 'b', { type: 'catchUno', playerId: 'a' })).toThrow(RuleError);
    assertDeck(caught);
  });

  test('invalid actions leave the missed-UNO catch window open', () => {
    const state = rig({ hands: [['red-8-0', 'blue-9-0'], ['green-2-0', 'blue-4-0']] });
    const missed = applyUnoAction(state, 'a', { type: 'play', cardId: 'red-8-0' });
    expect(() => applyUnoAction(missed, 'b', { type: 'pass' })).toThrow(RuleError);
    expect(() => applyUnoAction(missed, 'a', { type: 'draw' })).toThrow(RuleError);
    expect(missed.catchablePlayerId).toBe('a');
  });

  test('resigned hands return to the discard pile, turns skip them, and the last player wins', () => {
    const state = rig({ hands: [['red-8-0', 'blue-9-0'], ['green-2-0', 'blue-4-0'], ['green-1-0', 'yellow-1-0']] });
    const left = applyUnoAction(state, 'b', { type: 'resign' });
    expect(player(left, 'b')).toMatchObject({ status: 'out', hand: [] });
    expect(left.status === 'playing' && left.turnPlayerId).toBe('a');
    const played = applyUnoAction(left, 'a', { type: 'play', cardId: 'red-8-0', sayUno: true });
    expect(played.status === 'playing' && played.turnPlayerId).toBe('c');
    expect(() => applyUnoAction(played, 'b', { type: 'resign' })).toThrow(RuleError);
    const finished = applyUnoAction(played, 'c', { type: 'resign' });
    expect(finished).toMatchObject({ status: 'finished', winnerId: 'a' });
    expect(unoGameView(finished, 'a').canDraw).toBe(false);
    expect(unoGameView(finished, 'a').canCallUno).toBe(false);
    expect(() => applyUnoAction(finished, 'a', { type: 'draw' })).toThrow(RuleError);
    assertDeck(finished);
    const currentLeft = applyUnoAction(state, 'a', { type: 'resign' });
    expect(currentLeft.status === 'playing' && currentLeft.turnPlayerId).toBe('b');
  });

  test('playing the last card wins after its draw penalty is applied', () => {
    const state = rig({ hands: [['red-draw2-0'], ['green-2-0', 'blue-4-0']] });
    const finished = applyUnoAction(state, 'a', { type: 'play', cardId: 'red-draw2-0' });
    expect(finished).toMatchObject({ status: 'finished', winnerId: 'a' });
    expect(player(finished).hand).toHaveLength(0);
    expect(player(finished, 'b').hand).toHaveLength(4);
    expect(Object.keys(finished)).not.toContain('turnPlayerId');
    expect(Object.keys(finished)).not.toContain('drawnCardId');
    assertDeck(finished);
  });

  test('recycles past discards without drawing the top card or losing any cards', () => {
    const state = rig({ hands: [['green-8-0', 'blue-9-0'], ['green-2-0', 'blue-4-0']] });
    state.discard = state.deck;
    state.deck = [];
    const beforeTop = state.topCard;
    const drawn = applyUnoAction(state, 'a', { type: 'draw' });
    expect(drawn.topCard).toEqual(beforeTop);
    expect(drawn.discard).toEqual([]);
    expect(player(drawn).hand.some(card => card.id === beforeTop.id)).toBe(false);
    expect(drawn.log.some(entry => entry.text.includes('shuffled'))).toBe(true);
    assertDeck(drawn);
  });
});

describe('UNO bots', () => {
  test('bots catch missed UNO and return no action for an ordinary off-turn player', () => {
    const state = rig({ hands: [['red-8-0', 'blue-9-0'], ['green-2-0', 'blue-4-0']] });
    expect(chooseUnoBotAction(state, 'b')).toBeUndefined();
    const missed = applyUnoAction(state, 'a', { type: 'play', cardId: 'red-8-0' });
    expect(chooseUnoBotAction(missed, 'b')).toEqual({ type: 'catchUno', playerId: 'a' });
    expect(chooseUnoBotAction(missed, 'a')).toEqual({ type: 'callUno' });
  });

  test('complete deterministic matches with two through six players and conserve the deck', () => {
    for (let count = 2; count <= 6; count += 1) {
      for (let seed = 1; seed <= 20; seed += 1) {
        let state: UnoGameState = game(count, seed * 827);
        let actions = 0;
        while (state.status === 'playing' && actions < 3000) {
          const action = chooseUnoBotAction(state, state.turnPlayerId);
          if (!action) throw new Error('Bot has no action on its turn');
          const previous = state;
          state = applyUnoAction(state, state.turnPlayerId, action);
          expect(previous).not.toBe(state);
          actions += 1;
        }
        expect(state.status).toBe('finished');
        if (state.status === 'finished') {
          expect(player(state, state.winnerId).hand).toHaveLength(0);
          expect(chooseUnoBotAction(state, state.winnerId)).toBeUndefined();
        }
        assertDeck(state);
      }
    }
  });
});
