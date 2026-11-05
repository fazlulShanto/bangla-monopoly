import { z } from 'zod';
import { GAME_CONFIG, STARTING_CASH } from '@deshi/game';
import type { GameState } from './game';

const token = z.enum(['rickshaw', 'boat', 'tiger', 'tea', 'kite', 'fish']);
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
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('addBot') }).strict(),
  z.object({ type: z.literal('removeBot'), playerId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('setStartingCash'), startingCash: startingCashSchema }).strict(),
  z.object({ type: z.literal('start') }).strict(),
  z.object({ type: z.literal('leave') }).strict(),
  z.object({ type: z.literal('play'), action: actionSchema }).strict(),
  z.object({ type: z.literal('trade'), action: tradeActionSchema }).strict(),
]);
export const createSchema = z.object({ kind: z.enum(['friends', 'practice']), name, token, botCount: z.number().int().min(1).max(5).optional(), startingCash: startingCashSchema.optional(), requestId, resumeToken }).strict();
export const joinSchema = z.object({ code, name, token, requestId, resumeToken }).strict();
export const resumeSchema = z.object({ resumeToken }).strict();
export const roomCommandSchema = z.object({ requestId, expectedRevision: z.number().int().nonnegative(), command: commandSchema }).strict();
export const chatSchema = z.object({ requestId, text: z.string().trim().min(1).max(280).regex(/^[^\p{Cc}]+$/u) }).strict();

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
const gameDataSchema = z.object({
  players: z.array(playerSchema).min(2).max(6),
  deeds: z.record(z.string(), z.object({ ownerId: z.string(), level }).optional()),
  lastRoll: z.object({ playerId: z.string(), dice: z.tuple([die, die]) }).nullable(),
  log: z.array(z.object({ id: z.number().int(), text: z.string() })), turnNumber: z.number().int().positive(),
  trades: z.array(z.object({ id: tradeId, fromPlayerId: z.string(), toPlayerId: z.string(), give: tradeAssetsSchema, receive: tradeAssetsSchema })).max(15).default([]),
  nextTradeId: tradeId.default(1),
  names: z.record(z.string(), z.string()), seed: z.number().int().nonnegative(), doubles: z.number().int().min(0).max(3),
  chanceDeck: z.array(z.number().int().min(0).max(15)).length(16), treasureDeck: z.array(z.number().int().min(0).max(15)).length(16),
  chanceIndex: z.number().int().nonnegative(), treasureIndex: z.number().int().nonnegative(),
});
export const gameSchema: z.ZodType<GameState> = z.intersection(gameDataSchema, z.discriminatedUnion('status', [
  z.object({ status: z.literal('playing'), turn: turnSchema }),
  z.object({ status: z.literal('finished'), winnerId: z.string() }),
]));

export const roomSchema = z.object({
  _id: code, kind: z.enum(['friends', 'practice']), revision: z.number().int().nonnegative(), hostId: z.string(),
  startingCash: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(STARTING_CASH),
  seats: z.array(z.object({
    id: z.string().uuid(), name, color: z.string(), token, kind: z.enum(['human', 'bot']), ready: z.boolean(),
    resumeHash: z.string().nullable(), left: z.boolean(), connectionId: z.string().nullable().default(null),
    entryRequestId: z.string().nullable().default(null), entryKind: z.enum(['create', 'join']).nullable().default(null),
  })).max(6),
  game: gameSchema.nullable(),
  chat: z.array(z.object({ id: z.string(), playerId: z.string(), name: z.string(), text: z.string(), sentAt: z.number() })),
  requests: z.array(z.object({ playerId: z.string(), requestId: z.string(), revision: z.number().int(), kind: z.enum(['command', 'chat']) })),
  createdAt: z.number(), updatedAt: z.number(), writeId: z.string().default(''),
});
export type RoomDocument = z.infer<typeof roomSchema>;
export type PrivateSeat = RoomDocument['seats'][number];
