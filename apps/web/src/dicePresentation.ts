import type { Die, RoomView } from '@deshi/game';

export const DICE_LANDING_MS = 700;
type DicePair = readonly [Die, Die];
export type PawnPositions = Readonly<Record<string, number>>;
type RestingDice = { dice: DicePair; event: number | null; positions: PawnPositions };
export type DicePresentation =
  | (RestingDice & { phase: 'settled'; resultVisible: boolean })
  | (RestingDice & { phase: 'waiting' })
  | (RestingDice & { phase: 'landing'; event: number; destination: PawnPositions });

type DiceSnapshot = RestingDice & { hasRoll: boolean };
type DiceState = { presentation: DicePresentation; observedEvent: number | null; requestingRoll: boolean };
type DiceEvent =
  | { type: 'sync'; snapshot: DiceSnapshot; requestingRoll: boolean; reducedMotion: boolean }
  | { type: 'settle'; event: number };

export function diceSnapshot(room: RoomView | null): DiceSnapshot {
  const roll = room?.game?.lastRoll;
  const dice: DicePair = roll?.dice ?? [3, 5];
  const name = room?.seats.find((seat) => seat.id === roll?.playerId)?.name;
  const text = `${name} rolled ${dice[0]} + ${dice[1]}${dice[0] === dice[1] ? ' · doubles!' : '.'}`;
  const event = roll && name ? room?.game?.log.findLast((entry) => entry.text === text)?.id ?? null : null;
  return { dice, event, hasRoll: !!roll, positions: Object.fromEntries(room?.game?.players.map((player) => [player.id, player.position]) ?? []) };
}

export function initialDiceState(snapshot: DiceSnapshot, requestingRoll: boolean): DiceState {
  return {
    presentation: requestingRoll ? { ...snapshot, phase: 'waiting' } : { ...snapshot, phase: 'settled', resultVisible: snapshot.hasRoll },
    observedEvent: snapshot.event,
    requestingRoll,
  };
}

function samePositions(left: PawnPositions, right: PawnPositions) {
  return Object.keys(left).length === Object.keys(right).length && Object.entries(left).every(([id, position]) => right[id] === position);
}

export function diceReducer(state: DiceState, action: DiceEvent): DiceState {
  const current = state.presentation;
  if (action.type === 'settle') {
    if (current.phase !== 'landing' || current.event !== action.event) return state;
    return { ...state, presentation: { phase: 'settled', event: current.event, dice: current.dice, positions: current.destination, resultVisible: true } };
  }
  const { snapshot, requestingRoll, reducedMotion } = action;
  const newRoll = snapshot.event !== null && snapshot.event !== state.observedEvent;
  let presentation = current;
  if (newRoll && snapshot.event !== null) {
    presentation = reducedMotion
      ? { ...snapshot, phase: 'settled', resultVisible: true }
      : { phase: 'landing', event: snapshot.event, dice: snapshot.dice, positions: current.positions, destination: snapshot.positions };
  } else if (current.phase === 'landing') {
    if (reducedMotion) presentation = { ...snapshot, phase: 'settled', resultVisible: true };
    else if (!samePositions(current.destination, snapshot.positions)) presentation = { ...current, destination: snapshot.positions };
  } else if (requestingRoll && !state.requestingRoll) {
    presentation = { phase: 'waiting', event: current.event, dice: current.dice, positions: current.positions };
  } else if (current.phase === 'waiting') {
    if (!requestingRoll) presentation = { ...snapshot, phase: 'settled', resultVisible: false };
  } else {
    const changedDice = current.dice[0] !== snapshot.dice[0] || current.dice[1] !== snapshot.dice[1];
    if (changedDice || !samePositions(current.positions, snapshot.positions)) {
      presentation = { ...current, dice: snapshot.dice, positions: snapshot.positions, resultVisible: changedDice ? snapshot.hasRoll : current.resultVisible };
    }
  }
  if (presentation === current && requestingRoll === state.requestingRoll) return state;
  return { presentation, requestingRoll, observedEvent: newRoll ? snapshot.event : state.observedEvent };
}
