import { describe, expect, test } from 'bun:test';
import { BOARD, GAME_CONFIG, GO_POSITION, GO_SALARY, STARTING_CASH, type Die } from '@deshi/game';
import { applyAction, chooseBotAction, createGame, gameView, legalActions, rentFor, RuleError, type GameState } from './game';

const PLAYERS = [{ id: 'a', name: 'Asha' }, { id: 'b', name: 'Bashir' }, { id: 'c', name: 'Chitra' }];
function game(count = 2): GameState { return createGame({ players: PLAYERS.slice(0, count), seed: 918273 }); }
function player(state: GameState, id = 'a') {
  const found = state.players.find(candidate => candidate.id === id);
  if (!found) throw new Error('Missing fixture player');
  return found;
}
function seedFor(first: Die, second: Die): number {
  for (let seed = 1; seed < 1_000_000; seed += 1) {
    let value = seed;
    const values: number[] = [];
    for (let roll = 0; roll < 2; roll += 1) {
      value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
      values.push(Math.floor((value >>> 0) / 0x100000000 * 6) + 1);
    }
    if (values[0] === first && values[1] === second) return seed;
  }
  throw new Error('No fixture seed');
}
function roll(state: GameState, first: Die, second: Die): GameState {
  if (state.status !== 'playing') throw new Error('Fixture game finished');
  state.seed = seedFor(first, second);
  return applyAction(state, state.turn.playerId, { type: 'roll' });
}

describe('Bangladesh rules', () => {
  test('board has 40 ordered spaces and eight complete groups', () => {
    expect(BOARD.map(tile => tile.id)).toEqual(Array.from({ length: 40 }, (_, index) => index));
    expect(BOARD.filter(tile => tile.kind === 'street')).toHaveLength(22);
    expect(BOARD[39]?.name).toBe('Sitakunda');
    expect(BOARD[0]).toMatchObject({ kind: 'vacation', name: 'Kuakata Sea Beach' });
    expect(BOARD[20]).toMatchObject({ kind: 'go', name: 'Go' });
    expect(BOARD[31]).toMatchObject({ kind: 'street', name: 'Saint Martin' });
    expect(new Set(BOARD.flatMap(tile => tile.kind === 'street' ? [tile.group] : [])).size).toBe(8);
  });
  test('seeded dice/cards are reproducible and input snapshots stay unchanged', () => {
    const before = game();
    const saved = structuredClone(before);
    expect(applyAction(before, 'a', { type: 'roll' })).toEqual(applyAction(saved, 'a', { type: 'roll' }));
    expect(before).toEqual(saved);
    expect(before.players.every(candidate => candidate.cash === STARTING_CASH)).toBe(true);
    expect(before.players.every(candidate => candidate.position === GO_POSITION)).toBe(true);
  });
  test('salary follows Go, and Kuakata is a free stop', () => {
    const landingOnGo = game();
    player(landingOnGo).position = 18;
    const landed = roll(landingOnGo, 1, 1);
    expect(player(landed).position).toBe(GO_POSITION);
    expect(player(landed).cash).toBe(STARTING_CASH + GO_SALARY);

    const passingGo = game();
    player(passingGo).position = 18;
    const passed = roll(passingGo, 1, 2);
    expect(player(passed).position).toBe(21);
    expect(player(passed).cash).toBe(STARTING_CASH + GO_SALARY);

    const leavingGo = roll(game(), 1, 2);
    expect(player(leavingGo).cash).toBe(STARTING_CASH);

    const visitingKuakata = game();
    player(visitingKuakata).position = 38;
    const vacation = roll(visitingKuakata, 1, 1);
    expect(player(vacation).position).toBe(0);
    expect(player(vacation).cash).toBe(STARTING_CASH);
    expect(vacation.log.some(entry => entry.text.includes('arrived at Kuakata Sea Beach'))).toBe(true);
  });
  test('buying pays the bank and grants the landed deed', () => {
    const state = game();
    player(state).position = 39;
    const landed = roll(state, 1, 3);
    expect(player(landed).cash).toBe(STARTING_CASH);
    expect(landed.status === 'playing' && landed.turn).toEqual({ playerId: 'a', phase: 'purchase', tile: 3 });
    const bought = applyAction(landed, 'a', { type: 'buy' });
    expect(bought.deeds[3]).toEqual({ ownerId: 'a', level: 0 });
    expect(player(bought).cash).toBe(STARTING_CASH - GAME_CONFIG.properties.gazipur.price);
  });
  test('declining leaves the deed at the bank; invalid actors cannot move', () => {
    const state = game();
    player(state).position = 39;
    const landed = roll(state, 1, 3);
    expect(() => applyAction(landed, 'b', { type: 'buy' })).toThrow(RuleError);
    expect(() => applyAction(landed, 'a', { type: 'roll' })).toThrow(RuleError);
    const declined = applyAction(landed, 'a', { type: 'decline' });
    expect(declined.deeds[3]).toBeUndefined();
    expect(declined.status === 'playing' && declined.turn.phase).toBe('end');
  });
  test('rent transfers cash and an unimproved complete group doubles rent', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'b', level: 0 };
    state.deeds[3] = { ownerId: 'b', level: 0 };
    player(state).position = 38;
    const landed = roll(state, 1, 2);
    const rent = GAME_CONFIG.properties.dhaka.rent[0] * 2;
    expect(player(landed).cash).toBe(STARTING_CASH - rent);
    expect(player(landed, 'b').cash).toBe(STARTING_CASH + rent);
    expect(rentFor(state, 3, 7)).toBe(GAME_CONFIG.properties.gazipur.rent[0] * 2);
  });
  test('airport rent transfers the configured amount for the owner’s airport count', () => {
    const airports = [5, 15, 25, 35];
    GAME_CONFIG.airportRent.forEach((rent, index) => {
      const state = game(3);
      airports.forEach((id, airportIndex) => {
        state.deeds[id] = { ownerId: airportIndex <= index ? 'b' : 'c', level: 0 };
      });
      player(state).position = 2;
      const landed = roll(state, 1, 2);
      expect(player(landed).cash).toBe(STARTING_CASH - rent);
      expect(player(landed, 'b').cash).toBe(STARTING_CASH + rent);
      expect(player(landed, 'c').cash).toBe(STARTING_CASH);
    });
  });
  test('utility rent follows ownership count and dice', () => {
    const state = game();
    state.deeds[12] = { ownerId: 'b', level: 0 };
    expect(rentFor(state, 12, 9)).toBe(36);
    state.deeds[28] = { ownerId: 'b', level: 0 };
    expect(rentFor(state, 12, 9)).toBe(90);
  });
  test('building requires a complete group and even levels through hotels', () => {
    let state = game();
    player(state).cash = 10_000;
    state.deeds[1] = { ownerId: 'a', level: 0 };
    expect(() => applyAction(state, 'a', { type: 'build', tile: 1 })).toThrow(RuleError);
    state.deeds[3] = { ownerId: 'a', level: 0 };
    for (let level = 1; level <= 5; level += 1) {
      state = applyAction(state, 'a', { type: 'build', tile: 1 });
      expect(() => applyAction(state, 'a', { type: 'build', tile: 1 })).toThrow(RuleError);
      state = applyAction(state, 'a', { type: 'build', tile: 3 });
    }
    expect(state.deeds[1]?.level).toBe(5);
    expect(state.deeds[3]?.level).toBe(5);
    expect(player(state).cash).toBe(10_000 - 5 * (GAME_CONFIG.properties.dhaka.buildCost + GAME_CONFIG.properties.gazipur.buildCost));
    expect(rentFor(state, 3, 7)).toBe(GAME_CONFIG.properties.gazipur.rent[5]);
    expect(legalActions(state, 'a').some(action => action.type === 'build')).toBe(false);
  });
  test('a player cannot build with insufficient cash', () => {
    const state = game();
    state.deeds[1] = { ownerId: 'a', level: 0 };
    state.deeds[3] = { ownerId: 'a', level: 0 };
    player(state).cash = 49;
    expect(() => applyAction(state, 'a', { type: 'build', tile: 1 })).toThrow(RuleError);
  });
  test('doubles grant another roll and triple doubles send the player to jail', () => {
    let state = game();
    for (let count = 1; count <= 3; count += 1) {
      player(state).position = 12;
      state = roll(state, 4, 4);
      if (count < 3) {
        state = applyAction(state, 'a', { type: 'endTurn' });
        expect(state.status === 'playing' && state.turn).toEqual({ playerId: 'a', phase: 'roll' });
      }
    }
    expect(player(state).position).toBe(10);
    expect(player(state).jail).toEqual({ failedRolls: 0 });
    state = applyAction(state, 'a', { type: 'endTurn' });
    expect(state.status === 'playing' && state.turn.playerId).toBe('b');
  });
  test('going to jail does not collect salary and bail unlocks a roll', () => {
    let state = game();
    player(state).position = 22;
    state = roll(state, 3, 5);
    expect(player(state).position).toBe(10);
    expect(player(state).cash).toBe(1500);
    if (state.status !== 'playing') throw new Error('Unexpected fixture winner');
    state.turn = { playerId: 'a', phase: 'roll' };
    state = applyAction(state, 'a', { type: 'payBail' });
    expect(player(state).cash).toBe(1450);
    expect(player(state).jail).toBeNull();
    expect(state.status === 'playing' && state.turn.phase).toBe('roll');
  });
  test('a double releases a prisoner without an extra roll', () => {
    let state = game();
    player(state).position = 10;
    player(state).jail = { failedRolls: 1 };
    state = roll(state, 5, 5);
    expect(player(state).jail).toBeNull();
    expect(player(state).cash).toBe(1500 + GO_SALARY);
    state = applyAction(state, 'a', { type: 'endTurn' });
    expect(state.status === 'playing' && state.turn.playerId).toBe('b');
  });
  test('the third failed jail roll charges bail and can cause bankruptcy', () => {
    const state = game();
    player(state).position = 10;
    player(state).jail = { failedRolls: 2 };
    player(state).cash = 49;
    const after = roll(state, 1, 2);
    expect(player(after).status).toBe('bankrupt');
    expect(after.status === 'finished' && after.winnerId).toBe('b');
    expect(player(after).position).toBe(10);
  });
  test('two failed jail rolls keep the player in jail', () => {
    let state = game();
    player(state).jail = { failedRolls: 0 };
    player(state).position = 10;
    state = roll(state, 1, 2);
    expect(player(state).jail).toEqual({ failedRolls: 1 });
    if (state.status !== 'playing') throw new Error('Unexpected fixture winner');
    state.turn = { playerId: 'a', phase: 'roll' };
    state = roll(state, 1, 2);
    expect(player(state).jail).toEqual({ failedRolls: 2 });
    expect(player(state).position).toBe(10);
  });
  test('chance advances to Go with salary and treasure pays its award', () => {
    const chance = game();
    chance.chanceDeck = [1, ...chance.chanceDeck.filter(card => card !== 1)];
    player(chance).position = 1;
    const advanced = roll(chance, 2, 4);
    expect(player(advanced).position).toBe(GO_POSITION);
    expect(player(advanced).cash).toBe(1700);
    expect(advanced.chanceIndex).toBe(1);
    const treasure = game();
    treasure.treasureDeck = [0, ...treasure.treasureDeck.filter(card => card !== 0)];
    player(treasure).position = 38;
    const awarded = roll(treasure, 1, 3);
    expect(player(awarded).cash).toBe(1700);
  });
  test('cards advance to the new Go position and do not pay for moving backwards', () => {
    const chance = game();
    chance.chanceDeck = [1, ...chance.chanceDeck.filter(card => card !== 1)];
    player(chance).position = 32;
    const chanceToGo = roll(chance, 1, 3);
    expect(player(chanceToGo).position).toBe(GO_POSITION);
    expect(player(chanceToGo).cash).toBe(STARTING_CASH + GO_SALARY);

    const treasure = game();
    treasure.treasureDeck = [3, ...treasure.treasureDeck.filter(card => card !== 3)];
    player(treasure).position = 38;
    const treasureToGo = roll(treasure, 1, 3);
    expect(player(treasureToGo).position).toBe(GO_POSITION);
    expect(player(treasureToGo).cash).toBe(STARTING_CASH + GO_SALARY);

    const detour = game();
    detour.chanceDeck = [7, ...detour.chanceDeck.filter(card => card !== 7)];
    const movedBack = roll(detour, 1, 1);
    expect(player(movedBack).position).toBe(19);
    expect(player(movedBack).cash).toBe(STARTING_CASH);
  });
  test.each([0, 2, 5] as const)('unpayable rent frees properties at level %i for purchase with their buildings', level => {
    const state = game(3);
    player(state).cash = 10;
    player(state).position = 22;
    state.deeds[25] = { ownerId: 'b', level: 0 };
    state.deeds[3] = { ownerId: 'a', level };
    state.deeds[5] = { ownerId: 'a', level: 0 };
    state.deeds[12] = { ownerId: 'a', level: 0 };
    const after = roll(state, 1, 2);
    expect(player(after).cash).toBe(0);
    expect(player(after).status).toBe('bankrupt');
    expect(player(after, 'b').cash).toBe(1510);
    expect(after.deeds).toEqual({
      3: { ownerId: null, level },
      5: { ownerId: null, level: 0 },
      12: { ownerId: null, level: 0 },
      25: { ownerId: 'b', level: 0 },
    });
    expect(rentFor(after, 3, 4)).toBe(0);
    expect(rentFor(after, 5, 4)).toBe(0);
    expect(rentFor(after, 12, 4)).toBe(0);
    expect(after.log.at(-1)?.text).toBe('Asha is bankrupt. Their properties return to the bank with buildings intact.');
    expect(after.status === 'playing' && after.turn.playerId).toBe('b');

    player(after, 'b').position = 39;
    const landed = roll(after, 1, 3);
    expect(landed.status === 'playing' && landed.turn).toEqual({ playerId: 'b', phase: 'purchase', tile: 3 });
    expect(player(landed, 'b').cash).toBe(1510);
    const bought = applyAction(landed, 'b', { type: 'buy' });
    const price = GAME_CONFIG.properties.gazipur.price + level * GAME_CONFIG.properties.gazipur.buildCost;
    expect(bought.deeds[3]).toEqual({ ownerId: 'b', level });
    expect(player(bought, 'b').cash).toBe(1510 - price);
    expect(bought.log.at(-1)?.text).toBe(`Bashir bought Gazipur for ৳${price}.`);
    expect(rentFor(bought, 3, 4)).toBe(GAME_CONFIG.properties.gazipur.rent[level]);
  });
  test('buying an unowned upgraded property requires its full price and declining preserves its buildings', () => {
    const state = game(3);
    const price = GAME_CONFIG.properties.gazipur.price + 2 * GAME_CONFIG.properties.gazipur.buildCost;
    state.deeds[3] = { ownerId: null, level: 2 };
    player(state).position = 39;
    player(state).cash = price - 1;
    const landed = roll(state, 1, 3);
    expect(legalActions(landed, 'a')).not.toContainEqual({ type: 'buy' });
    expect(chooseBotAction(landed, 'a')).toEqual({ type: 'decline' });
    expect(() => applyAction(landed, 'a', { type: 'buy' })).toThrow(RuleError);
    const declined = applyAction(landed, 'a', { type: 'decline' });
    expect(declined.deeds[3]).toEqual({ ownerId: null, level: 2 });
    expect(player(declined).cash).toBe(price - 1);

    player(landed).cash = price;
    expect(chooseBotAction(landed, 'a')).toEqual({ type: 'buy' });
    const bought = applyAction(landed, 'a', { type: 'buy' });
    expect(player(bought).cash).toBe(0);
    expect(player(bought).status).toBe('active');
    expect(bought.deeds[3]).toEqual({ ownerId: 'a', level: 2 });
  });
  test('birthday debt frees the debtor’s buildings without changing the current player', () => {
    const state = game(3);
    state.treasureDeck = [5, ...state.treasureDeck.filter(card => card !== 5)];
    player(state).position = 38;
    player(state, 'b').cash = 5;
    state.deeds[3] = { ownerId: 'b', level: 5 };
    const after = roll(state, 1, 3);
    expect(player(after, 'b').status).toBe('bankrupt');
    expect(player(after, 'b').cash).toBe(0);
    expect(player(after).cash).toBe(STARTING_CASH + 15);
    expect(after.deeds[3]).toEqual({ ownerId: null, level: 5 });
    expect(after.status === 'playing' && after.turn).toEqual({ playerId: 'a', phase: 'end' });
  });
  test('bank debt returns deeds and the last solvent player wins', () => {
    const state = game();
    player(state).cash = 10;
    player(state).position = 1;
    state.deeds[3] = { ownerId: 'a', level: 5 };
    const after = roll(state, 1, 2);
    expect(after.status === 'finished' && after.winnerId).toBe('b');
    expect(after.deeds[3]).toEqual({ ownerId: null, level: 5 });
    expect(gameView(after, 'b').legalActions).toEqual([]);
  });
  test('an out-of-turn player can resign and cannot act afterward', () => {
    const after = applyAction(game(), 'b', { type: 'resign' });
    expect(after.status === 'finished' && after.winnerId).toBe('a');
    expect(() => applyAction(after, 'a', { type: 'roll' })).toThrow(RuleError);
  });
  test('four bots finish a complete seeded game through the same legal actions', () => {
    let state = createGame({ players: [...PLAYERS, { id: 'd', name: 'Dipa' }], seed: 5 });
    let moves = 0;
    while (state.status === 'playing' && moves < 20_000) {
      const actor = state.turn.playerId;
      const action = chooseBotAction(state, actor);
      if (!action) throw new Error('Bot has no legal action');
      expect(action.type).not.toBe('resign');
      state = applyAction(state, actor, action);
      expect(state.players.every(candidate => candidate.cash >= 0 && candidate.position >= 0 && candidate.position < 40)).toBe(true);
      moves += 1;
    }
    expect(state.status).toBe('finished');
    expect(state.players.filter(candidate => candidate.status === 'active')).toHaveLength(1);
  });
});
