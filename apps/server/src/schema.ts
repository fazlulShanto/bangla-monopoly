import { z } from 'zod';
import { GAME_CONFIG, LEGACY_TOKEN_IDS, STARTING_CASH, TOKEN_IDS, resolveTokenId } from '@deshi/game';
import type { GameState } from './game';
import { unoGameSchema } from './games/uno/engine';

const token = z.enum([...TOKEN_IDS, ...LEGACY_TOKEN_IDS]).transform(resolveTokenId);
const resumeToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const requestId = z.string().min(8).max(100).regex(/^[\w-]+$/);
const name = z.string().trim().min(1).max(24).regex(/^[^\p{Cc}\p{Cf}<>]+$/u, 'Use a name without control characters or angle brackets.');
const code = z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/);
const startingCashSchema = z.number().int('Use a whole amount of taka.')
  .min(GAME_CONFIG.startingCash.min, `Starting cash must be at least ৳${GAME_CONFIG.startingCash.min}.`)
  .max(GAME_CONFIG.startingCash.max, `Starting cash cannot exceed ৳${GAME_CONFIG.startingCash.max}.`);
const basicAction = z.object({ type: z.enum(['roll', 'buy', 'decline', 'payBail', 'endTurn', 'resign']) }).strict();
export const actionSchema = z.union([basicAction, z.object({ type: z.literal('build'), tile: z.number().int().min(0).max(39) }).strict()]);
const tradeId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const tradeAssetsSchema = z.object({
  cash: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  tiles: z.array(z.number().int().min(0).max(39)).max(28),
}).strict();
export const tradeActionSchema = z.union([
  z.object({ type: z.literal('offer'), toPlayerId: z.string().uuid(), give: tradeAssetsSchema, receive: tradeAssetsSchema, replacesTradeId: tradeId.optional() }).strict(),
  z.object({ type: z.enum(['accept', 'decline', 'cancel']), tradeId }).strict(),
]);
const unoColorSchema = z.enum(['red', 'yellow', 'green', 'blue']);
export const unoActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('play'), cardId: z.string().min(1).max(100), color: unoColorSchema.optional(), sayUno: z.boolean().optional() }).strict(),
  z.object({ type: z.literal('draw') }).strict(),
  z.object({ type: z.literal('pass') }).strict(),
  z.object({ type: z.literal('callUno') }).strict(),
  z.object({ type: z.literal('catchUno'), playerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('resign') }).strict(),
]);
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('addBot') }).strict(),
  z.object({ type: z.literal('removeBot'), playerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('setStartingCash'), startingCash: startingCashSchema }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('rematch') }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
  z.object({ type: z.literal('play'), action: actionSchema }).strict(),
  z.object({ type: z.literal('trade'), action: tradeActionSchema }).strict(),
  z.object({ type: z.literal('uno'), action: unoActionSchema }).strict(),
]);
export const createSchema = z.object({ kind: z.enum(['friends', 'practice']), gameType: z.enum(['tycoon', 'uno']).default('tycoon'), name, token, botCount: z.number().int().min(1).max(5).optional(), startingCash: startingCashSchema.optional(), requestId, resumeToken }).strict();
export const joinSchema = z.object({ code, gameType: z.enum(['tycoon', 'uno']).optional(), name, token, requestId, resumeToken }).strict();
export const resumeSchema = z.object({ resumeToken }).strict();
export const roomCommandSchema = z.object({ requestId, expectedRevision: z.number().int().nonnegative(), command: commandSchema }).strict();

const playerSchema = z.object({
  id: z.string(), cash: z.number().int().nonnegative(), position: z.number().int().min(0).max(39),
  jail: z.object({ failedRolls: z.union([z.literal(0), z.literal(1), z.literal(2)]) }).nullable(),
  status: z.enum(['active', 'bankrupt']),
});
const level = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const die = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]);
const turnSchema = z.discriminatedUnion('phase', [
  z.object({ playerId: z.string(), phase: z.literal('roll') }),
  z.object({ playerId: z.string(), phase: z.literal('purchase'), tile: z.number().int().min(0).max(39) }),
  z.object({ playerId: z.string(), phase: z.literal('end') }),
]);
const activityEntrySchema = z.object({ id: z.number().int(), text: z.string() });

function isLegacyTradeEvent(text: string, names: string[]): boolean {
  if (/^Trade #\d+ expired because its players or assets changed\.$/.test(text)) return true;
  return names.some((name) => {
    const prefix = `${name} `;
    if (!text.startsWith(prefix)) return false;
    return /^(?:(?:offered|countered) trade #\d+ to .+: .+ for .+|accepted trade #\d+ with .+: .+ for .+|(?:declined|canceled) trade #\d+)\.$/.test(text.slice(prefix.length));
  });
}

const gameDataSchema = z.object({
  players: z.array(playerSchema).min(2).max(6),
  deeds: z.record(z.string(), z.object({ ownerId: z.string(), level }).optional()),
  lastRoll: z.object({ playerId: z.string(), dice: z.tuple([die, die]) }).nullable(),
  log: z.array(activityEntrySchema), tradeLog: z.array(activityEntrySchema).max(100).optional(), turnNumber: z.number().int().positive(),
  trades: z.array(z.object({ id: tradeId, fromPlayerId: z.string(), toPlayerId: z.string(), give: tradeAssetsSchema, receive: tradeAssetsSchema })).max(15).default([]),
  nextTradeId: tradeId.default(1),
  names: z.record(z.string(), z.string()), seed: z.number().int().nonnegative(), doubles: z.number().int().min(0).max(3),
  chanceDeck: z.array(z.number().int().min(0).max(15)).length(16), treasureDeck: z.array(z.number().int().min(0).max(15)).length(16),
  chanceIndex: z.number().int().nonnegative(), treasureIndex: z.number().int().nonnegative(),
}).transform((game) => ({
  ...game,
  tradeLog: game.tradeLog ?? game.log.filter((entry) => isLegacyTradeEvent(entry.text, Object.values(game.names))).slice(-100),
}));
export const gameSchema: z.ZodType<GameState> = z.intersection(gameDataSchema, z.discriminatedUnion('status', [
  z.object({ status: z.literal('playing'), turn: turnSchema }),
  z.object({ status: z.literal('finished'), winnerId: z.string() }),
]));

export const roomSchema = z.object({
  _id: code, kind: z.enum(['friends', 'practice']), gameType: z.enum(['tycoon', 'uno']).default('tycoon'), revision: z.number().int().nonnegative(), hostId: z.string(),
  startingCash: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(STARTING_CASH),
  seats: z.array(z.object({
    id: z.string().uuid(), name, color: z.string(), token, kind: z.enum(['human', 'bot']), ready: z.boolean(),
    resumeHash: z.string().nullable(), left: z.boolean(), connectionId: z.string().nullable().default(null),
    entryRequestId: z.string().nullable().default(null), entryKind: z.enum(['create', 'join']).nullable().default(null),
  })).max(6),
  game: gameSchema.nullable(),
  unoGame: unoGameSchema.nullable().default(null),
  // Keep legacy room data intact when an existing room is saved.
  chat: z.unknown().optional(),
  requests: z.array(z.object({ playerId: z.string(), requestId: z.string(), revision: z.number().int(), kind: z.enum(['command', 'chat']) })),
  createdAt: z.number(), updatedAt: z.number(), writeId: z.string().default(''),
}).superRefine((room, context) => {
  if ((room.gameType === 'uno' && room.game !== null) || (room.gameType === 'tycoon' && room.unoGame !== null)) {
    context.addIssue({ code: 'custom', message: 'The saved game does not match its room type.' });
  }
});
export type RoomDocument = z.infer<typeof roomSchema>;
export type PrivateSeat = RoomDocument['seats'][number];
