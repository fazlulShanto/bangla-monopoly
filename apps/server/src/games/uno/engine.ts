import { UNO_COLORS, type UnoAction, type UnoCard, type UnoColor, type UnoGameView } from '@deshi/game';
import { z } from 'zod';
import { RuleError } from '../../game';

const colorSchema = z.enum(UNO_COLORS);
const cardSchema = z.union([
  z.object({ id: z.string().min(1).max(40), color: colorSchema, value: z.enum(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2']) }).strict(),
  z.object({ id: z.string().min(1).max(40), color: z.literal('wild'), value: z.enum(['wild', 'wild4']) }).strict(),
]);
const gameDataSchema = z.object({
  players: z.array(z.object({ id: z.string(), hand: z.array(cardSchema).max(108), status: z.enum(['active', 'out']), uno: z.boolean() }).strict()).min(2).max(6),
  names: z.record(z.string(), z.string()),
  deck: z.array(cardSchema).max(108),
  discard: z.array(cardSchema).max(107),
  topCard: cardSchema,
  currentColor: colorSchema,
  direction: z.union([z.literal(1), z.literal(-1)]),
  seed: z.number().int().min(0).max(0xffffffff),
  log: z.array(z.object({ id: z.number().int().positive(), text: z.string() }).strict()).max(100),
  turnNumber: z.number().int().positive(),
  catchablePlayerId: z.string().nullable(),
});
export const unoGameSchema = z.discriminatedUnion('status', [
  gameDataSchema.extend({ status: z.literal('playing'), turnPlayerId: z.string(), drawnCardId: z.string().nullable() }).strict(),
  gameDataSchema.extend({ status: z.literal('finished'), winnerId: z.string() }).strict(),
]);
export type UnoGameState = z.infer<typeof unoGameSchema>;
type PlayingUnoGame = Extract<UnoGameState, { status: 'playing' }>;
type UnoPlayer = UnoGameState['players'][number];
type RandomState = Pick<UnoGameState, 'seed'>;

function random(game: RandomState): number {
  let value = game.seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  game.seed = value >>> 0;
  return game.seed / 0x100000000;
}

function shuffle(game: RandomState, cards: UnoCard[]): UnoCard[] {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random(game) * (index + 1));
    const card = cards[index];
    const replacement = cards[other];
    if (card && replacement) {
      cards[index] = replacement;
      cards[other] = card;
    }
  }
  return cards;
}

function createDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  const values = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'] satisfies Exclude<Extract<UnoCard, { color: UnoColor }>['value'], '0'>[];
  for (const color of UNO_COLORS) {
    cards.push({ id: `${color}-0`, color, value: '0' });
    for (const value of values) {
      for (let copy = 0; copy < 2; copy += 1) cards.push({ id: `${color}-${value}-${copy}`, color, value });
    }
  }
  for (let copy = 0; copy < 4; copy += 1) {
    cards.push({ id: `wild-${copy}`, color: 'wild', value: 'wild' });
    cards.push({ id: `wild4-${copy}`, color: 'wild', value: 'wild4' });
  }
  return cards;
}

function isNumberCard(card: UnoCard): card is Extract<UnoCard, { color: UnoColor }> {
  return card.color !== 'wild' && /^\d$/.test(card.value);
}

export function createUnoGame(input: { players: readonly { id: string; name: string }[]; seed: number }): UnoGameState {
  const first = input.players[0];
  if (!first || input.players.length < 2 || input.players.length > 6) throw new RuleError('UNO needs 2–6 players.');
  if (new Set(input.players.map(player => player.id)).size !== input.players.length) throw new RuleError('Each player needs a unique seat.');
  const rng = { seed: (input.seed >>> 0) || 1 };
  const deck = shuffle(rng, createDeck());
  const players = input.players.map(player => ({ id: player.id, hand: deck.splice(0, 7), status: 'active', uno: false } satisfies UnoPlayer));
  const openingIndex = deck.findIndex(isNumberCard);
  const topCard = deck.splice(openingIndex, 1)[0];
  if (!topCard || !isNumberCard(topCard)) throw new RuleError('The UNO deck has no opening number card.');
  const game: PlayingUnoGame = {
    status: 'playing', turnPlayerId: first.id, drawnCardId: null,
    players, names: Object.fromEntries(input.players.map(player => [player.id, player.name])),
    deck, discard: [], topCard, currentColor: topCard.color, direction: 1,
    seed: rng.seed, log: [], turnNumber: 1, catchablePlayerId: null,
  };
  log(game, `${first.name} goes first. Match ${topCard.color} or ${topCard.value}.`);
  return game;
}

function playerIn(game: UnoGameState, playerId: string): UnoPlayer {
  const player = game.players.find(candidate => candidate.id === playerId);
  if (!player) throw new RuleError('This player has no seat in the game.');
  return player;
}

function log(game: UnoGameState, text: string): void {
  game.log.push({ id: (game.log.at(-1)?.id ?? 0) + 1, text });
  game.log = game.log.slice(-100);
}

function nameOf(game: UnoGameState, playerId: string): string { return game.names[playerId] ?? 'Player'; }

function canPlay(game: UnoGameState, player: UnoPlayer, card: UnoCard): boolean {
  if (card.value === 'wild4') return !player.hand.some(candidate => candidate.color === game.currentColor);
  return card.color === 'wild' || card.color === game.currentColor || card.value === game.topCard.value;
}

function playableCards(game: UnoGameState, player: UnoPlayer): UnoCard[] {
  if (game.status !== 'playing' || game.turnPlayerId !== player.id || player.status !== 'active') return [];
  return player.hand.filter(card => (game.drawnCardId === null || card.id === game.drawnCardId) && canPlay(game, player, card));
}

function drawOne(game: UnoGameState): UnoCard | undefined {
  if (game.deck.length === 0 && game.discard.length > 0) {
    game.deck = shuffle(game, game.discard);
    game.discard = [];
    log(game, 'The discard pile was shuffled into a new draw pile.');
  }
  return game.deck.pop();
}

function drawCards(game: UnoGameState, player: UnoPlayer, count: number): number {
  let drawn = 0;
  for (let index = 0; index < count; index += 1) {
    const card = drawOne(game);
    if (!card) break;
    player.hand.push(card);
    drawn += 1;
  }
  if (player.hand.length !== 1) player.uno = false;
  return drawn;
}

function nextPlayer(game: PlayingUnoGame, steps = 1): UnoPlayer {
  let index = game.players.findIndex(player => player.id === game.turnPlayerId);
  let player = playerIn(game, game.turnPlayerId);
  for (let step = 0; step < steps; step += 1) {
    do {
      index = (index + game.direction + game.players.length) % game.players.length;
      const candidate = game.players[index];
      if (candidate) player = candidate;
    } while (player.status !== 'active');
  }
  return player;
}

function advance(game: PlayingUnoGame, steps = 1): void {
  game.turnPlayerId = nextPlayer(game, steps).id;
  game.drawnCardId = null;
  game.turnNumber += 1;
}

function finish(game: PlayingUnoGame, winnerId: string): UnoGameState {
  log(game, `${nameOf(game, winnerId)} wins!`);
  const { turnPlayerId: _turnPlayerId, drawnCardId: _drawnCardId, ...data } = game;
  return { ...data, status: 'finished', winnerId, catchablePlayerId: null };
}

export function applyUnoAction(state: UnoGameState, playerId: string, action: UnoAction): UnoGameState {
  if (state.status !== 'playing') throw new RuleError('This UNO game has finished.');
  const actor = playerIn(state, playerId);
  if (actor.status !== 'active') throw new RuleError('Only active players can play UNO.');
  if (action.type === 'callUno') {
    if (actor.hand.length !== 1 || actor.uno || state.catchablePlayerId !== playerId) throw new RuleError('You can call UNO while your last card is still unannounced.');
    const game = structuredClone(state);
    playerIn(game, playerId).uno = true;
    game.catchablePlayerId = null;
    log(game, `${nameOf(game, playerId)} calls UNO!`);
    return game;
  }
  if (action.type === 'catchUno') {
    if (state.catchablePlayerId !== action.playerId || action.playerId === playerId) throw new RuleError('That player cannot be caught for missing UNO.');
    const game = structuredClone(state);
    const target = playerIn(game, action.playerId);
    const count = drawCards(game, target, 2);
    game.catchablePlayerId = null;
    log(game, `${nameOf(game, playerId)} caught ${nameOf(game, target.id)} without UNO. ${nameOf(game, target.id)} draws ${count}.`);
    return game;
  }
  if (action.type === 'resign') {
    const game = structuredClone(state);
    const player = playerIn(game, playerId);
    player.status = 'out';
    player.uno = false;
    game.discard.push(...player.hand);
    player.hand = [];
    game.catchablePlayerId = null;
    log(game, `${nameOf(game, playerId)} left the game.`);
    const remaining = game.players.filter(candidate => candidate.status === 'active');
    const winner = remaining[0];
    if (remaining.length === 1 && winner) return finish(game, winner.id);
    if (game.turnPlayerId === playerId) advance(game);
    return game;
  }
  if (state.turnPlayerId !== playerId) throw new RuleError('Wait for your turn.');
  if (action.type === 'draw') {
    if (state.drawnCardId !== null) throw new RuleError('Play the card you drew or pass.');
    const game = structuredClone(state);
    const player = playerIn(game, playerId);
    game.catchablePlayerId = null;
    const drawn = drawOne(game);
    if (drawn) {
      player.hand.push(drawn);
      player.uno = false;
      log(game, `${nameOf(game, playerId)} draws a card.`);
      if (canPlay(game, player, drawn)) game.drawnCardId = drawn.id;
      else advance(game);
    } else {
      log(game, `${nameOf(game, playerId)} passes because the draw pile is empty.`);
      advance(game);
    }
    return game;
  }
  if (action.type === 'pass') {
    if (state.drawnCardId === null) throw new RuleError('Draw a card before passing.');
    const game = structuredClone(state);
    game.catchablePlayerId = null;
    log(game, `${nameOf(game, playerId)} keeps the drawn card.`);
    advance(game);
    return game;
  }
  if (action.type === 'play') {
    const card = playableCards(state, actor).find(candidate => candidate.id === action.cardId);
    if (!card) throw new RuleError('That card cannot be played now. Match the color or value; Wild +4 requires no matching color.');
    if (card.color === 'wild' && !action.color) throw new RuleError('Choose a color for the wild card.');
    if (card.color !== 'wild' && action.color !== undefined) throw new RuleError('Only a wild card changes the color.');
    const game = structuredClone(state);
    const player = playerIn(game, playerId);
    game.catchablePlayerId = null;
    player.hand = player.hand.filter(candidate => candidate.id !== card.id);
    game.discard.push(game.topCard);
    game.topCard = structuredClone(card);
    game.currentColor = card.color === 'wild' ? action.color ?? game.currentColor : card.color;
    player.uno = player.hand.length === 1 && action.sayUno === true;
    if (player.hand.length === 1 && !player.uno) game.catchablePlayerId = playerId;
    const label = card.value === 'draw2' ? '+2' : card.value === 'wild4' ? 'Wild +4' : card.value === 'wild' ? 'Wild' : card.value;
    log(game, `${nameOf(game, playerId)} plays ${card.color === 'wild' ? label : `${card.color} ${label}`}${card.color === 'wild' ? ` and chooses ${game.currentColor}` : ''}.${player.uno ? ' UNO!' : ''}`);
    let steps = 1;
    switch (card.value) {
      case 'reverse':
        game.direction = game.direction === 1 ? -1 : 1;
        if (game.players.filter(candidate => candidate.status === 'active').length === 2) steps = 2;
        break;
      case 'skip': steps = 2; break;
      case 'draw2':
      case 'wild4': {
        const target = nextPlayer(game);
        const count = drawCards(game, target, card.value === 'draw2' ? 2 : 4);
        log(game, `${nameOf(game, target.id)} draws ${count} and misses a turn.`);
        steps = 2;
        break;
      }
    }
    if (player.hand.length === 0) return finish(game, playerId);
    advance(game, steps);
    return game;
  }
  const _exhaustive: never = action;
  throw new RuleError(`Unknown UNO action: ${_exhaustive}`);
}

export function unoGameView(game: UnoGameState, playerId: string): UnoGameView {
  const player = game.players.find(candidate => candidate.id === playerId);
  const ownTurn = game.status === 'playing' && game.turnPlayerId === playerId && player?.status === 'active';
  const data = {
    players: game.players.map(({ id, hand, status, uno }) => ({ id, cardCount: hand.length, status, uno })),
    hand: player?.hand ?? [], topCard: game.topCard, currentColor: game.currentColor, direction: game.direction,
    drawCount: game.deck.length, playableCardIds: player ? playableCards(game, player).map(card => card.id) : [],
    canDraw: ownTurn && game.status === 'playing' && game.drawnCardId === null,
    canPass: ownTurn && game.status === 'playing' && game.drawnCardId !== null,
    canCallUno: game.status === 'playing' && game.catchablePlayerId === playerId && player?.hand.length === 1 && !player.uno,
    catchablePlayerId: game.catchablePlayerId, log: game.log, turnNumber: game.turnNumber,
  };
  return structuredClone(game.status === 'playing'
    ? { ...data, status: 'playing', turnPlayerId: game.turnPlayerId }
    : { ...data, status: 'finished', winnerId: game.winnerId });
}

export function chooseUnoBotAction(game: UnoGameState, playerId: string): UnoAction | undefined {
  const player = game.players.find(candidate => candidate.id === playerId);
  if (game.status !== 'playing' || !player || player.status !== 'active') return undefined;
  if (game.catchablePlayerId === playerId) return { type: 'callUno' };
  if (game.catchablePlayerId) return { type: 'catchUno', playerId: game.catchablePlayerId };
  if (game.turnPlayerId !== playerId) return undefined;
  const colors = UNO_COLORS.map(color => ({ color, count: player.hand.filter(card => card.color === color).length }));
  colors.sort((left, right) => right.count - left.count);
  const color = colors[0]?.color ?? 'red';
  const score = (card: UnoCard): number => {
    if (card.color === 'wild') return card.value === 'wild4' ? -2 : -1;
    return (colors.find(candidate => candidate.color === card.color)?.count ?? 0) * 10 + (['skip', 'reverse', 'draw2'].includes(card.value) ? 3 : 0);
  };
  const card = playableCards(game, player).sort((left, right) => score(right) - score(left))[0];
  if (card) return card.color === 'wild'
    ? { type: 'play', cardId: card.id, color, sayUno: true }
    : { type: 'play', cardId: card.id, sayUno: true };
  return { type: game.drawnCardId === null ? 'draw' : 'pass' };
}
