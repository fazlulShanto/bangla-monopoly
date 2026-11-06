export const UNO_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type UnoColor = (typeof UNO_COLORS)[number];
export type UnoNumber = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type UnoCard =
  | { id: string; color: UnoColor; value: UnoNumber | 'skip' | 'reverse' | 'draw2' }
  | { id: string; color: 'wild'; value: 'wild' | 'wild4' };
export type UnoAction =
  | { type: 'play'; cardId: string; color?: UnoColor; sayUno?: boolean }
  | { type: 'draw' }
  | { type: 'pass' }
  | { type: 'callUno' }
  | { type: 'resign' }
  | { type: 'catchUno'; playerId: string };
export type UnoGameView = {
  players: { id: string; cardCount: number; status: 'active' | 'out'; uno: boolean }[];
  hand: UnoCard[];
  topCard: UnoCard;
  lastPlay: { id: number; playerId: string } | null;
  currentColor: UnoColor;
  direction: 1 | -1;
  drawCount: number;
  playableCardIds: string[];
  canDraw: boolean;
  canPass: boolean;
  canCallUno: boolean;
  catchablePlayerId: string | null;
  log: { id: number; text: string }[];
  turnNumber: number;
} & ({ status: 'playing'; turnPlayerId: string } | { status: 'finished'; winnerId: string });
