import { BAIL, BOARD, GAME_CONFIG, GO_POSITION, GO_SALARY, STARTING_CASH, type Die, type GameAction, type GameView, type PlayerView, type Tile, type TradeAction, type TradeAssets, type TradeOffer, type Turn } from '@deshi/game';

type GameData = Pick<GameView, 'players' | 'deeds' | 'lastRoll' | 'log' | 'tradeLog' | 'turnNumber' | 'trades'> & {
  nextTradeId: number;
  names: Record<string, string>;
  seed: number;
  doubles: number;
  chanceDeck: number[];
  treasureDeck: number[];
  chanceIndex: number;
  treasureIndex: number;
};
export type GameState = GameData & ({ status: 'playing'; turn: Turn } | { status: 'finished'; winnerId: string });
type PlayingGame = GameState & { status: 'playing' };
type Street = Extract<Tile, { kind: 'street' }>;
type Card = { text: string } & ({ kind: 'cash'; amount: number } | { kind: 'move'; tile: number } | { kind: 'back'; spaces: number } | { kind: 'jail' } | { kind: 'birthday'; amount: number });

export class RuleError extends Error {
  constructor(message: string) { super(message); this.name = 'RuleError'; }
}

const CHANCE: readonly Card[] = [
  { text: 'Pohela Boishakh bonus. Collect ৳150.', kind: 'cash', amount: 150 },
  { text: 'Take the Padma Express to Go. Collect ৳200.', kind: 'move', tile: GO_POSITION },
  { text: 'Visit Saint Martin.', kind: 'move', tile: 31 },
  { text: 'Rickshaw repairs. Pay ৳50.', kind: 'cash', amount: -50 },
  { text: 'Your export business pays a dividend. Collect ৳100.', kind: 'cash', amount: 100 },
  { text: 'Go directly to jail. Do not collect a Go salary.', kind: 'jail' },
  { text: 'Visit Sitakunda.', kind: 'move', tile: 39 },
  { text: 'Traffic detour. Move back 3 spaces.', kind: 'back', spaces: 3 },
  { text: 'A flight from Shahjalal awaits.', kind: 'move', tile: 35 },
  { text: 'Pay a speeding fine of ৳25.', kind: 'cash', amount: -25 },
  { text: 'Your startup wins a grant. Collect ৳200.', kind: 'cash', amount: 200 },
  { text: 'Trip to Sylhet.', kind: 'move', tile: 24 },
  { text: 'Your handloom business earns ৳50.', kind: 'cash', amount: 50 },
  { text: 'Pay ৳100 for a family celebration.', kind: 'cash', amount: -100 },
  { text: 'Travel to Shah Amanat Airport.', kind: 'move', tile: 5 },
  { text: 'A cricket prediction pays off. Collect ৳75.', kind: 'cash', amount: 75 },
];
const TREASURE: readonly Card[] = [
  { text: 'Eid gift. Collect ৳200.', kind: 'cash', amount: 200 },
  { text: 'School fees. Pay ৳50.', kind: 'cash', amount: -50 },
  { text: 'Community savings mature. Collect ৳100.', kind: 'cash', amount: 100 },
  { text: 'Go home via Go. Collect ৳200.', kind: 'move', tile: GO_POSITION },
  { text: 'Medical bill. Pay ৳100.', kind: 'cash', amount: -100 },
  { text: 'Birthday! Each other player gives you ৳10.', kind: 'birthday', amount: 10 },
  { text: 'Tax refund. Collect ৳20.', kind: 'cash', amount: 20 },
  { text: 'Go directly to jail. Do not collect a Go salary.', kind: 'jail' },
  { text: 'Your rooftop garden wins ৳50.', kind: 'cash', amount: 50 },
  { text: 'A remittance arrives. Collect ৳150.', kind: 'cash', amount: 150 },
  { text: 'Help repair the neighborhood road. Pay ৳40.', kind: 'cash', amount: -40 },
  { text: 'Your book royalties arrive. Collect ৳25.', kind: 'cash', amount: 25 },
  { text: 'Insurance premium. Pay ৳50.', kind: 'cash', amount: -50 },
  { text: 'Festival stall profit. Collect ৳100.', kind: 'cash', amount: 100 },
  { text: 'A forgotten deposit is returned. Collect ৳30.', kind: 'cash', amount: 30 },
  { text: 'Scholarship award. Collect ৳100.', kind: 'cash', amount: 100 },
];

function random(game: GameState): number {
  let value = game.seed | 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  game.seed = value >>> 0;
  return game.seed / 0x100000000;
}

function shuffled(game: GameState, count: number): number[] {
  const deck = Array.from({ length: count }, (_, index) => index);
  for (let index = count - 1; index > 0; index -= 1) {
    const other = Math.floor(random(game) * (index + 1));
    const value = deck[index];
    const replacement = deck[other];
    if (value !== undefined && replacement !== undefined) {
      deck[index] = replacement;
      deck[other] = value;
    }
  }
  return deck;
}

export function createGame(input: { players: readonly { id: string; name: string }[]; seed: number; startingCash?: number }): GameState {
  const first = input.players[0];
  if (!first || input.players.length < 2 || input.players.length > 6) throw new RuleError('A game needs 2–6 players.');
  if (new Set(input.players.map(player => player.id)).size !== input.players.length) throw new RuleError('Each player needs a unique seat.');
  const game: GameState = {
    status: 'playing', turn: { playerId: first.id, phase: 'roll' },
    players: input.players.map(player => ({ id: player.id, cash: input.startingCash ?? STARTING_CASH, position: GO_POSITION, jail: null, status: 'active' })),
    names: Object.fromEntries(input.players.map(player => [player.id, player.name])),
    deeds: {}, lastRoll: null, log: [], tradeLog: [], turnNumber: 1, trades: [], nextTradeId: 1, seed: (input.seed >>> 0) || 1, doubles: 0,
    chanceDeck: [], treasureDeck: [], chanceIndex: 0, treasureIndex: 0,
  };
  game.chanceDeck = shuffled(game, CHANCE.length);
  game.treasureDeck = shuffled(game, TREASURE.length);
  log(game, `The journey begins! ${first.name} goes first.`);
  return game;
}

function playerIn(game: GameState, playerId: string): PlayerView {
  const player = game.players.find(candidate => candidate.id === playerId);
  if (!player) throw new RuleError('This player has no seat in the game.');
  return player;
}

function nameOf(game: GameState, player: PlayerView): string { return game.names[player.id] ?? 'Player'; }
function log(game: GameState, text: string, kind: 'game' | 'trade' = 'game'): void {
  const entry = { id: (game.log.at(-1)?.id ?? 0) + 1, text };
  game.log.push(entry);
  game.log = game.log.slice(-100);
  if (kind === 'trade') game.tradeLog = [...game.tradeLog, entry].slice(-100);
}

function groupTiles(street: Street): Street[] {
  return BOARD.filter((tile): tile is Street => tile.kind === 'street' && tile.group === street.group);
}

function ownsGroup(game: GameState, playerId: string, street: Street): boolean {
  return groupTiles(street).every(tile => game.deeds[tile.id]?.ownerId === playerId);
}

function tradeAssetsProblem(game: GameState, player: PlayerView, assets: TradeAssets): string | undefined {
  if (!Number.isSafeInteger(assets.cash) || assets.cash < 0) return 'Trade cash must be a nonnegative whole amount.';
  if (assets.cash > player.cash) return `${nameOf(game, player)} does not have enough cash for this trade.`;
  if (assets.tiles.length > 28 || new Set(assets.tiles).size !== assets.tiles.length) return 'Choose each property only once.';
  for (const tileId of assets.tiles) {
    const tile = BOARD[tileId];
    if (!Number.isSafeInteger(tileId) || !tile || !('price' in tile)) return 'Only properties can be traded.';
    if (game.deeds[tileId]?.ownerId !== player.id) return `${nameOf(game, player)} no longer owns ${tile.name}.`;
    if (tile.kind === 'street' && groupTiles(tile).some(member => (game.deeds[member.id]?.level ?? 0) > 0)) {
      return 'A color group with houses or hotels cannot be traded.';
    }
  }
  return undefined;
}

function tradeProblem(game: GameState, trade: TradeOffer): string | undefined {
  if (game.status !== 'playing') return 'Trading is only available while the game is playing.';
  const from = game.players.find(player => player.id === trade.fromPlayerId);
  const to = game.players.find(player => player.id === trade.toPlayerId);
  if (!from || !to || from.status !== 'active' || to.status !== 'active') return 'Both traders must be active players.';
  if (from.id === to.id) return 'Choose another player to trade with.';
  const assetsProblem = tradeAssetsProblem(game, from, trade.give) ?? tradeAssetsProblem(game, to, trade.receive);
  if (assetsProblem) return assetsProblem;
  if (trade.give.tiles.length === 0 && trade.receive.tiles.length === 0 && trade.give.cash === trade.receive.cash) return 'Add cash or a property to change hands.';
  const fromCash = from.cash - trade.give.cash + trade.receive.cash;
  const toCash = to.cash - trade.receive.cash + trade.give.cash;
  if (!Number.isSafeInteger(fromCash) || !Number.isSafeInteger(toCash)) return 'This trade exceeds the cash limit.';
  return undefined;
}

function invalidateTrades(game: GameState): void {
  game.trades = game.trades.filter(trade => {
    if (game.status === 'playing' && !tradeProblem(game, trade)) return true;
    log(game, game.status === 'finished'
      ? `Trade #${trade.id} expired because the game finished.`
      : `Trade #${trade.id} expired because its players or assets changed.`, 'trade');
    return false;
  });
}

function describeAssets(assets: TradeAssets): string {
  return [assets.cash > 0 ? `৳${assets.cash}` : '', ...assets.tiles.map(id => BOARD[id]?.name ?? 'property')].filter(Boolean).join(' and ') || 'nothing';
}

export function applyTradeAction(state: GameState, playerId: string, action: TradeAction): GameState {
  if (state.status !== 'playing') throw new RuleError('Trading is only available while the game is playing.');
  const actor = playerIn(state, playerId);
  if (actor.status !== 'active') throw new RuleError('Only active players can trade.');
  if (action.type === 'offer') {
    const replacement = action.replacesTradeId === undefined ? undefined : state.trades.find(trade => trade.id === action.replacesTradeId);
    if (action.replacesTradeId !== undefined && (!replacement || replacement.toPlayerId !== playerId || replacement.fromPlayerId !== action.toPlayerId)) {
      throw new RuleError('Only the recipient can negotiate an offer back to its sender.');
    }
    const offer: TradeOffer = { id: state.nextTradeId, fromPlayerId: playerId, toPlayerId: action.toPlayerId, give: action.give, receive: action.receive };
    const problem = tradeProblem(state, offer);
    if (problem) throw new RuleError(problem);
    if (!Number.isSafeInteger(state.nextTradeId) || state.nextTradeId < 1 || state.nextTradeId >= Number.MAX_SAFE_INTEGER) throw new RuleError('This game has reached its trade limit.');
    if (state.trades.some(trade => trade.id !== replacement?.id &&
      ((trade.fromPlayerId === playerId && trade.toPlayerId === action.toPlayerId) || (trade.toPlayerId === playerId && trade.fromPlayerId === action.toPlayerId)))) {
      throw new RuleError('There is already a pending offer between these players. Negotiate or cancel it first.');
    }
    if (!replacement && state.trades.length >= 15) throw new RuleError('There are too many pending trades. Resolve an existing offer first.');
    const game = structuredClone(state);
    game.trades = game.trades.filter(trade => trade.id !== replacement?.id);
    game.trades.push(structuredClone(offer));
    game.nextTradeId += 1;
    log(game, `${nameOf(game, actor)} ${replacement ? 'countered' : 'offered'} trade #${offer.id} to ${game.names[action.toPlayerId] ?? 'Player'}: ${describeAssets(offer.give)} for ${describeAssets(offer.receive)}.`, 'trade');
    return game;
  }
  const trade = state.trades.find(candidate => candidate.id === action.tradeId);
  if (!trade) throw new RuleError('This trade is no longer pending.');
  if (action.type === 'cancel' ? trade.fromPlayerId !== playerId : trade.toPlayerId !== playerId) {
    throw new RuleError(action.type === 'cancel' ? 'Only the sender can cancel this offer.' : 'Only the recipient can accept or decline this offer.');
  }
  if (action.type === 'accept') {
    const problem = tradeProblem(state, trade);
    if (problem) throw new RuleError(problem);
  }
  const game = structuredClone(state);
  game.trades = game.trades.filter(candidate => candidate.id !== trade.id);
  switch (action.type) {
    case 'accept': {
      const from = playerIn(game, trade.fromPlayerId);
      const to = playerIn(game, trade.toPlayerId);
      from.cash = from.cash - trade.give.cash + trade.receive.cash;
      to.cash = to.cash - trade.receive.cash + trade.give.cash;
      for (const id of trade.give.tiles) game.deeds[id] = { ownerId: to.id, level: 0 };
      for (const id of trade.receive.tiles) game.deeds[id] = { ownerId: from.id, level: 0 };
      log(game, `${nameOf(game, actor)} accepted trade #${trade.id} with ${nameOf(game, from)}: ${describeAssets(trade.give)} for ${describeAssets(trade.receive)}.`, 'trade');
      invalidateTrades(game);
      break;
    }
    case 'decline': log(game, `${nameOf(game, actor)} declined trade #${trade.id}.`, 'trade'); break;
    case 'cancel': log(game, `${nameOf(game, actor)} canceled trade #${trade.id}.`, 'trade'); break;
  }
  return game;
}

export function chooseBotTradeAction(game: GameState, playerId: string): TradeAction | undefined {
  const trade = game.trades.find(candidate => candidate.toPlayerId === playerId);
  if (game.status !== 'playing' || !trade) return undefined;
  const propertyValue = (assets: TradeAssets): number => assets.tiles.reduce((sum, id) => {
    const tile = BOARD[id];
    return sum + (tile && 'price' in tile ? tile.price : 0);
  }, 0);
  const fair = trade.give.cash - trade.receive.cash >= propertyValue(trade.receive) - propertyValue(trade.give);
  return { type: !tradeProblem(game, trade) && fair ? 'accept' : 'decline', tradeId: trade.id };
}

function canBuild(game: PlayingGame, player: PlayerView, tile: Street): boolean {
  const deed = game.deeds[tile.id];
  return game.turn.phase !== 'purchase' && deed?.ownerId === player.id && deed.level < 5 &&
    player.cash >= tile.buildCost && ownsGroup(game, player.id, tile) &&
    groupTiles(tile).every(member => (game.deeds[member.id]?.level ?? 0) >= deed.level);
}

export function legalActions(game: GameState, playerId: string): GameAction[] {
  const player = game.players.find(candidate => candidate.id === playerId);
  if (game.status === 'finished' || !player || player.status === 'bankrupt') return [];
  const actions: GameAction[] = [];
  if (game.turn.playerId === playerId) {
    switch (game.turn.phase) {
      case 'roll':
        actions.push({ type: 'roll' });
        if (player.jail && player.cash >= BAIL) actions.push({ type: 'payBail' });
        break;
      case 'purchase': {
        const tile = BOARD[game.turn.tile];
        if (tile && 'price' in tile && player.cash >= tile.price) actions.push({ type: 'buy' });
        actions.push({ type: 'decline' });
        break;
      }
      case 'end': actions.push({ type: 'endTurn' }); break;
    }
    for (const tile of BOARD) if (tile.kind === 'street' && canBuild(game, player, tile)) actions.push({ type: 'build', tile: tile.id });
  }
  actions.push({ type: 'resign' });
  return actions;
}

export function gameView(game: GameState, playerId: string): GameView {
  const shared = { players: game.players, deeds: game.deeds, lastRoll: game.lastRoll, log: game.log, tradeLog: game.tradeLog, turnNumber: game.turnNumber, trades: game.trades, legalActions: legalActions(game, playerId) };
  return game.status === 'playing' ? { ...shared, status: 'playing', turn: game.turn } : { ...shared, status: 'finished', winnerId: game.winnerId };
}

function nextTurn(game: PlayingGame): void {
  const currentIndex = game.players.findIndex(player => player.id === game.turn.playerId);
  for (let step = 1; step <= game.players.length; step += 1) {
    const next = game.players[(currentIndex + step) % game.players.length];
    if (next?.status === 'active') {
      game.turn = { playerId: next.id, phase: 'roll' };
      game.turnNumber += 1;
      game.doubles = 0;
      return;
    }
  }
}

function bankrupt(game: PlayingGame, player: PlayerView, creditor?: PlayerView): void {
  if (creditor) creditor.cash += player.cash;
  player.cash = 0;
  player.status = 'bankrupt';
  player.jail = null;
  for (const tile of BOARD) {
    const deed = game.deeds[tile.id];
    if (deed?.ownerId !== player.id) continue;
    if (creditor) deed.ownerId = creditor.id;
    else delete game.deeds[tile.id];
  }
  log(game, `${nameOf(game, player)} is bankrupt.${creditor ? ` Their assets go to ${nameOf(game, creditor)}.` : ' Their properties return to the bank.'}`);
  const survivors = game.players.filter(candidate => candidate.status === 'active');
  const winner = survivors[0];
  if (survivors.length === 1 && winner) {
    const finished: GameState = { ...game, status: 'finished', winnerId: winner.id };
    Object.assign(game, finished);
    Reflect.deleteProperty(game, 'turn');
    log(game, `${nameOf(game, winner)} wins Deshi Tycoon!`);
  } else if (game.turn.playerId === player.id) nextTurn(game);
}

function pay(game: PlayingGame, player: PlayerView, amount: number, reason: string, creditor?: PlayerView): void {
  if (player.cash < amount) {
    log(game, `${nameOf(game, player)} cannot pay ৳${amount} ${reason}.`);
    bankrupt(game, player, creditor);
    return;
  }
  player.cash -= amount;
  if (creditor) creditor.cash += amount;
  log(game, `${nameOf(game, player)} paid ৳${amount} ${reason}.`);
}

function sendToJail(game: PlayingGame, player: PlayerView): void {
  player.position = 10;
  player.jail = { failedRolls: 0 };
  game.doubles = 0;
  game.turn = { playerId: player.id, phase: 'end' };
  log(game, `${nameOf(game, player)} went to jail.`);
}

function move(game: PlayingGame, player: PlayerView, spaces: number): void {
  const destination = player.position + spaces;
  const distanceToGo = (GO_POSITION - player.position + BOARD.length - 1) % BOARD.length + 1;
  if (spaces >= distanceToGo) {
    player.cash += GO_SALARY;
    log(game, `${nameOf(game, player)} passed Go and collected ৳${GO_SALARY}.`);
  }
  player.position = ((destination % BOARD.length) + BOARD.length) % BOARD.length;
}

export function rentFor(game: GameState, tileId: number, diceTotal: number): number {
  const tile = BOARD[tileId];
  const deed = game.deeds[tileId];
  if (!tile || !deed) return 0;
  if (tile.kind === 'street') return tile.rent[deed.level] * (deed.level === 0 && ownsGroup(game, deed.ownerId, tile) ? 2 : 1);
  if (tile.kind === 'airport') {
    const count = BOARD.filter(other => other.kind === 'airport' && game.deeds[other.id]?.ownerId === deed.ownerId).length;
    return GAME_CONFIG.airportRent[count - 1];
  }
  if (tile.kind === 'utility') {
    const count = BOARD.filter(other => other.kind === 'utility' && game.deeds[other.id]?.ownerId === deed.ownerId).length;
    return diceTotal * (count === 2 ? 10 : 4);
  }
  return 0;
}

function drawCard(game: PlayingGame, player: PlayerView, kind: 'chance' | 'treasure', diceTotal: number): void {
  const deck = kind === 'chance' ? game.chanceDeck : game.treasureDeck;
  const index = kind === 'chance' ? game.chanceIndex++ : game.treasureIndex++;
  const cardId = deck[index % deck.length];
  const card = cardId === undefined ? undefined : (kind === 'chance' ? CHANCE : TREASURE)[cardId];
  if (!card) throw new RuleError('The card deck is unavailable.');
  log(game, `${kind === 'chance' ? 'Chance' : 'Treasure'}: ${card.text}`);
  switch (card.kind) {
    case 'cash':
      if (card.amount >= 0) player.cash += card.amount;
      else pay(game, player, -card.amount, 'to the bank');
      break;
    case 'move': {
      const spaces = (card.tile - player.position + BOARD.length) % BOARD.length;
      move(game, player, spaces);
      land(game, player, diceTotal);
      break;
    }
    case 'back': move(game, player, -card.spaces); land(game, player, diceTotal); break;
    case 'jail': sendToJail(game, player); break;
    case 'birthday':
      for (const other of game.players) {
        if (game.status !== 'playing') break;
        if (other.id !== player.id && other.status === 'active') pay(game, other, card.amount, `to ${nameOf(game, player)} for their birthday`, player);
      }
      break;
  }
}

function land(game: PlayingGame, player: PlayerView, diceTotal: number): void {
  const tile = BOARD[player.position];
  if (!tile) throw new RuleError('This board position does not exist.');
  log(game, `${nameOf(game, player)} arrived at ${tile.name}.`);
  game.turn = { playerId: player.id, phase: 'end' };
  switch (tile.kind) {
    case 'street': case 'airport': case 'utility': {
      const deed = game.deeds[tile.id];
      if (!deed) game.turn = { playerId: player.id, phase: 'purchase', tile: tile.id };
      else if (deed.ownerId !== player.id) {
        const owner = playerIn(game, deed.ownerId);
        pay(game, player, rentFor(game, tile.id, diceTotal), `rent to ${nameOf(game, owner)}`, owner);
      }
      break;
    }
    case 'tax': pay(game, player, tile.amount, `in ${tile.name}`); break;
    case 'chance': case 'treasure': drawCard(game, player, tile.kind, diceTotal); break;
    case 'goToJail': sendToJail(game, player); break;
    case 'vacation': log(game, `${nameOf(game, player)} is enjoying a free island break.`); break;
    case 'go': case 'jail': break;
  }
}

const DICE: readonly Die[] = [1, 2, 3, 4, 5, 6];
function die(game: GameState): Die { return DICE[Math.floor(random(game) * 6)] ?? 1; }

function roll(game: PlayingGame, player: PlayerView): void {
  const dice: readonly [Die, Die] = [die(game), die(game)];
  const total = dice[0] + dice[1];
  const isDouble = dice[0] === dice[1];
  game.lastRoll = { playerId: player.id, dice };
  log(game, `${nameOf(game, player)} rolled ${dice[0]} + ${dice[1]}${isDouble ? ' · doubles!' : '.'}`);
  if (player.jail) {
    game.doubles = 0;
    if (isDouble) {
      player.jail = null;
      log(game, `${nameOf(game, player)} rolled doubles and left jail.`);
    } else if (player.jail.failedRolls === 2) {
      pay(game, player, BAIL, 'in mandatory bail after three failed rolls');
      if (player.status === 'bankrupt') return;
      player.jail = null;
    } else {
      player.jail.failedRolls = player.jail.failedRolls === 0 ? 1 : 2;
      game.turn = { playerId: player.id, phase: 'end' };
      log(game, `${nameOf(game, player)} remains in jail.`);
      return;
    }
  } else {
    game.doubles = isDouble ? game.doubles + 1 : 0;
    if (game.doubles === 3) { sendToJail(game, player); return; }
  }
  move(game, player, total);
  land(game, player, total);
}

export function applyAction(state: GameState, playerId: string, action: GameAction): GameState {
  const allowed = legalActions(state, playerId).some(candidate => candidate.type === action.type &&
    (candidate.type !== 'build' || (action.type === 'build' && candidate.tile === action.tile)));
  if (!allowed || state.status !== 'playing') throw new RuleError('That action is not available now.');
  const game = structuredClone(state);
  const player = playerIn(game, playerId);
  switch (action.type) {
    case 'roll': roll(game, player); break;
    case 'buy': {
      if (game.turn.phase !== 'purchase') throw new RuleError('There is no property to buy.');
      const tile = BOARD[game.turn.tile];
      if (!tile || !('price' in tile)) throw new RuleError('This property is not for sale.');
      player.cash -= tile.price;
      game.deeds[tile.id] = { ownerId: player.id, level: 0 };
      game.turn = { playerId, phase: 'end' };
      log(game, `${nameOf(game, player)} bought ${tile.name} for ৳${tile.price}.`);
      break;
    }
    case 'decline':
      game.turn = { playerId, phase: 'end' };
      log(game, `${nameOf(game, player)} left the property with the bank.`);
      break;
    case 'payBail':
      pay(game, player, BAIL, 'in bail');
      player.jail = null;
      break;
    case 'endTurn':
      if (game.doubles > 0 && player.jail === null) game.turn = { playerId, phase: 'roll' };
      else nextTurn(game);
      break;
    case 'resign':
      log(game, `${nameOf(game, player)} left the game.`);
      bankrupt(game, player);
      break;
    case 'build': {
      const tile = BOARD[action.tile];
      const deed = game.deeds[action.tile];
      if (tile?.kind !== 'street' || !deed) throw new RuleError('This city cannot be developed.');
      const nextLevel = nextBuildingLevel(deed.level);
      deed.level = nextLevel;
      player.cash -= tile.buildCost;
      log(game, `${nameOf(game, player)} built ${nextLevel === 5 ? 'a hotel' : `house ${nextLevel}`} in ${tile.name} for ৳${tile.buildCost}.`);
      break;
    }
  }
  invalidateTrades(game);
  return game;
}

function nextBuildingLevel(level: 0 | 1 | 2 | 3 | 4 | 5): 1 | 2 | 3 | 4 | 5 {
  switch (level) { case 0: return 1; case 1: return 2; case 2: return 3; case 3: return 4; case 4: return 5; case 5: throw new RuleError('This city already has a hotel.'); }
}

export function chooseBotAction(game: GameState, playerId: string): GameAction | undefined {
  const actions = legalActions(game, playerId);
  const player = game.players.find(candidate => candidate.id === playerId);
  if (!player) return undefined;
  const purchase = actions.find(action => action.type === 'buy');
  if (purchase) return purchase;
  const build = actions.find(action => {
    const tile = action.type === 'build' ? BOARD[action.tile] : undefined;
    return tile?.kind === 'street' && player.cash - tile.buildCost >= 200;
  });
  if (build) return build;
  return actions.find(action => action.type === 'payBail' && player.cash >= 200) ??
    actions.find(action => action.type === 'roll') ?? actions.find(action => action.type === 'decline') ??
    actions.find(action => action.type === 'endTurn');
}
