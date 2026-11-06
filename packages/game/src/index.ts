import { GAME_CONFIG, type StreetValues } from './config';
export { GAME_CONFIG } from './config';

export type TokenId = 'rickshaw' | 'boat' | 'tiger' | 'tea' | 'kite' | 'fish';
export type Group = 'brown' | 'sky' | 'pink' | 'orange' | 'red' | 'yellow' | 'green' | 'blue';
export type Die = 1 | 2 | 3 | 4 | 5 | 6;
export type Tile = { id: number; name: string; shortName: string } & (
  | ({ kind: 'street'; group: Group; color: string } & StreetValues)
  | { kind: 'airport' | 'utility'; price: number }
  | { kind: 'tax'; amount: number }
  | { kind: 'go' | 'chance' | 'treasure' | 'jail' | 'vacation' | 'goToJail' }
);

export const GROUP_COLORS: Record<Group, string> = {
  brown: '#a97142', sky: '#72c9dc', pink: '#d77bb7', orange: '#f79a3b',
  red: '#ea6561', yellow: '#e8c744', green: '#42a886', blue: '#577ecd',
};

export const TOKENS: readonly { id: TokenId; name: string }[] = [
  { id: 'rickshaw', name: 'Rickshaw' }, { id: 'boat', name: 'Boat' },
  { id: 'tiger', name: 'Tiger' }, { id: 'tea', name: 'Tea cup' },
  { id: 'kite', name: 'Kite' }, { id: 'fish', name: 'Hilsa' },
];

export const STARTING_CASH = GAME_CONFIG.startingCash.default;
export const GO_SALARY = GAME_CONFIG.goSalary;
export const BAIL = GAME_CONFIG.bail;

function street(id: number, name: string, group: Group, values: StreetValues): Tile {
  return { id, name, shortName: name, kind: 'street', group, color: GROUP_COLORS[group], ...values };
}

export const BOARD: readonly Tile[] = [
  { id: 0, name: 'Go', shortName: 'Go', kind: 'go' },
  street(1, 'Dhaka', 'brown', GAME_CONFIG.properties.dhaka),
  { id: 2, name: 'Community Treasure', shortName: 'Treasure', kind: 'treasure' },
  street(3, 'Gazipur', 'brown', GAME_CONFIG.properties.gazipur),
  { id: 4, name: 'Income tax', shortName: 'Income tax', kind: 'tax', amount: GAME_CONFIG.taxes.income },
  { id: 5, name: 'Shah Amanat Airport', shortName: 'Shah Amanat', kind: 'airport', price: GAME_CONFIG.airportPrice },
  street(6, 'Rangpur', 'sky', GAME_CONFIG.properties.rangpur),
  { id: 7, name: 'Chance', shortName: 'Chance', kind: 'chance' },
  street(8, 'Dinajpur', 'sky', GAME_CONFIG.properties.dinajpur),
  street(9, 'Panchagarh', 'sky', GAME_CONFIG.properties.panchagarh),
  { id: 10, name: 'Jail / just visiting', shortName: 'Jail', kind: 'jail' },
  street(11, 'Rajshahi', 'pink', GAME_CONFIG.properties.rajshahi),
  { id: 12, name: 'Power grid', shortName: 'Power grid', kind: 'utility', price: GAME_CONFIG.utilityPrice },
  street(13, 'Natore', 'pink', GAME_CONFIG.properties.natore),
  street(14, 'Pabna', 'pink', GAME_CONFIG.properties.pabna),
  { id: 15, name: 'Osmani Airport', shortName: 'Osmani', kind: 'airport', price: GAME_CONFIG.airportPrice },
  street(16, 'Khulna', 'orange', GAME_CONFIG.properties.khulna),
  { id: 17, name: 'Community Treasure', shortName: 'Treasure', kind: 'treasure' },
  street(18, 'Jashore', 'orange', GAME_CONFIG.properties.jashore),
  street(19, 'Sundarbans', 'orange', GAME_CONFIG.properties.sundarbans),
  { id: 20, name: 'Saint Martin vacation', shortName: 'Saint Martin', kind: 'vacation' },
  street(21, 'Mymensingh', 'red', GAME_CONFIG.properties.mymensingh),
  { id: 22, name: 'Chance', shortName: 'Chance', kind: 'chance' },
  street(23, 'Moulvibazar', 'red', GAME_CONFIG.properties.moulvibazar),
  street(24, 'Sylhet', 'red', GAME_CONFIG.properties.sylhet),
  { id: 25, name: "Cox's Bazar Airport", shortName: "Cox's Airport", kind: 'airport', price: GAME_CONFIG.airportPrice },
  street(26, 'Cumilla', 'yellow', GAME_CONFIG.properties.cumilla),
  street(27, 'Brahmanbaria', 'yellow', GAME_CONFIG.properties.brahmanbaria),
  { id: 28, name: 'Water supply', shortName: 'Water supply', kind: 'utility', price: GAME_CONFIG.utilityPrice },
  street(29, 'Feni', 'yellow', GAME_CONFIG.properties.feni),
  { id: 30, name: 'Go to jail', shortName: 'Go to jail', kind: 'goToJail' },
  street(31, 'Saint Martin', 'green', GAME_CONFIG.properties.saintMartin),
  street(32, 'Bandarban', 'green', GAME_CONFIG.properties.bandarban),
  { id: 33, name: 'Community Treasure', shortName: 'Treasure', kind: 'treasure' },
  street(34, "Cox's Bazar", 'green', GAME_CONFIG.properties.coxsBazar),
  { id: 35, name: 'Shahjalal Airport', shortName: 'Shahjalal', kind: 'airport', price: GAME_CONFIG.airportPrice },
  { id: 36, name: 'Chance', shortName: 'Chance', kind: 'chance' },
  street(37, 'Chittagong', 'blue', GAME_CONFIG.properties.chittagong),
  { id: 38, name: 'Wealth tax', shortName: 'Wealth tax', kind: 'tax', amount: GAME_CONFIG.taxes.wealth },
  street(39, 'Sitakunda', 'blue', GAME_CONFIG.properties.sitakunda),
];

export type GameAction =
  | { type: 'roll' | 'buy' | 'decline' | 'payBail' | 'endTurn' | 'resign' }
  | { type: 'build'; tile: number };
export type TradeAssets = { cash: number; tiles: number[] };
export type TradeOffer = { id: number; fromPlayerId: string; toPlayerId: string; give: TradeAssets; receive: TradeAssets };
export type TradeAction =
  | { type: 'offer'; toPlayerId: string; give: TradeAssets; receive: TradeAssets; replacesTradeId?: number }
  | { type: 'accept' | 'decline' | 'cancel'; tradeId: number };
export type Turn = { playerId: string } & (
  | { phase: 'roll' } | { phase: 'purchase'; tile: number } | { phase: 'end' }
);
export type PlayerView = { id: string; cash: number; position: number; jail: { failedRolls: 0 | 1 | 2 } | null; status: 'active' | 'bankrupt' };
export type GameView = {
  players: PlayerView[];
  deeds: Partial<Record<number, { ownerId: string; level: 0 | 1 | 2 | 3 | 4 | 5 }>>;
  lastRoll: { playerId: string; dice: readonly [Die, Die] } | null;
  log: { id: number; text: string }[];
  legalActions: GameAction[];
  trades: TradeOffer[];
  turnNumber: number;
} & ({ status: 'playing'; turn: Turn } | { status: 'finished'; winnerId: string });
export type SeatView = { id: string; name: string; color: string; token: TokenId; kind: 'human' | 'bot'; connected: boolean; ready: boolean };
export type RoomView = { code: string; kind: 'friends' | 'practice'; revision: number; hostId: string; startingCash: number; seats: SeatView[]; game: GameView | null };
export type RoomCommand =
  | { type: 'ready'; ready: boolean }
  | { type: 'addBot' }
  | { type: 'removeBot'; playerId: string }
  | { type: 'setStartingCash'; startingCash: number }
  | { type: 'start' }
  | { type: 'leave' }
  | { type: 'play'; action: GameAction }
  | { type: 'trade'; action: TradeAction };
export type ChatMessage = { id: string; playerId: string; name: string; text: string; sentAt: number };
export type Failure = { ok: false; code: string; message: string; view?: RoomView };
export type CreateRoom = { kind: 'friends' | 'practice'; name: string; token: TokenId; botCount?: number; startingCash?: number; requestId: string; resumeToken: string };
export type JoinRoom = { code: string; name: string; token: TokenId; requestId: string; resumeToken: string };
export type EnterReply = Failure | { ok: true; playerId: string; resumeToken: string; connectionId: string; channel: string; view: RoomView; chat: ChatMessage[] };
export type SnapshotReply = Failure | { ok: true; playerId: string; view: RoomView; chat: ChatMessage[]; channel: string };
export type CommandReply = Failure | { ok: true; revision: number; view: RoomView; chat: ChatMessage[] };
export type ChatReply = Failure | { ok: true; view: RoomView; chat: ChatMessage[] };
export type RealtimeConfig = { key: string; url?: string };
