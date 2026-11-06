import { createHash, randomInt, randomUUID } from 'node:crypto';
import type { CommandReply, CreateRoom, EnterReply, Failure, JoinRoom, RoomCommand, RoomView, SnapshotReply, TokenId } from '@deshi/game';
import { STARTING_CASH, TOKENS } from '@deshi/game';
import { z } from 'zod';
import { applyAction, applyTradeAction, chooseBotAction, chooseBotTradeAction, createGame, gameView, RuleError, type GameState } from './game';
import { roomCommandSchema, type PrivateSeat, type RoomDocument } from './schema';
import { StorageConflict, type RoomStore } from './store';
import { applyUnoAction, chooseUnoBotAction, createUnoGame, unoGameView } from './uno';

export type Credentials = { resumeToken: string; connectionId: string };
export type RoomEvent = { event: 'room:updated'; data: { revision: number } } | { event: 'room:closed'; data: { reason: 'expired' | 'replaced' | 'left' } };
export interface RoomPublisher { publish(channels: string[], message: RoomEvent): Promise<void> }
type Session = { room: RoomDocument; seat: PrivateSeat };
type Lease = { code: string; connectionId: string; expires: number };
const COLORS = ['#de714a', '#458e9a', '#8c75b7', '#5a966d', '#c29336', '#c5648b'];
const BOT_NAMES = ['Shapla', 'Bengal Bot', 'Meghna', 'Padma', 'Jamuna'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const channel = (seat: PrivateSeat) => `private-seat-${seat.id}-${seat.connectionId}`;
const roomCode = () => Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

class SessionError extends Error {
  constructor(readonly code: 'INVALID_SESSION' | 'SESSION_REPLACED') {
    super(code === 'INVALID_SESSION' ? 'This saved seat is no longer available.' : 'This seat was opened in another connection.');
  }
}

export class RoomService {
  private readonly rooms = new Map<string, RoomDocument>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly leases = new Map<string, Lease>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly botFailures = new Map<string, number>();
  private readonly leaseTimer: ReturnType<typeof setInterval>;
  private closing = false;

  constructor(readonly store: RoomStore, private readonly publisher: RoomPublisher, private readonly botDelay = 900, private readonly leaseDuration = 35_000) {
    this.leaseTimer = setInterval(() => { void this.expireLeases(); }, Math.min(1000, leaseDuration));
    this.leaseTimer.unref();
  }

  private failure(error: unknown, session?: Session): Failure {
    const view = session ? this.view(session.room, session.seat.id) : undefined;
    if (error instanceof SessionError) return { ok: false, code: error.code, message: error.message };
    if (error instanceof RuleError) return { ok: false, code: 'RULE', message: error.message, ...(view ? { view } : {}) };
    if (error instanceof StorageConflict) return { ok: false, code: 'CONFLICT', message: error.message, ...(view ? { view } : {}) };
    console.error(JSON.stringify({ event: 'room_operation_failed', error: error instanceof Error ? error.name : 'UnknownError', code: session?.room._id }));
    return { ok: false, code: 'STORAGE_UNAVAILABLE', message: 'The game could not be saved. Your last saved state is safe. Try again.', ...(view ? { view } : {}) };
  }

  private async queued<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(key) ?? Promise.resolve()).then(operation);
    const settled = result.then(() => undefined, () => undefined);
    this.queues.set(key, settled);
    try { return await result; }
    finally { if (this.queues.get(key) === settled) this.queues.delete(key); }
  }

  private async room(code: string, reload = false): Promise<RoomDocument> {
    const cached = this.rooms.get(code);
    if (cached && !reload) return cached;
    const saved = await this.store.get(code);
    if (!saved || saved.seats.length === 0) throw new RuleError('That room does not exist. Check the invite code.');
    this.rooms.set(code, saved);
    return saved;
  }

  private active(seat: PrivateSeat): boolean {
    const lease = this.leases.get(seat.id);
    return !seat.left && (seat.kind === 'bot' || (lease?.connectionId === seat.connectionId && lease.expires > Date.now()));
  }

  private async touch(room: RoomDocument, seat: PrivateSeat): Promise<void> {
    const wasActive = this.active(seat);
    if (!seat.connectionId) throw new SessionError('SESSION_REPLACED');
    this.leases.set(seat.id, { code: room._id, connectionId: seat.connectionId, expires: Date.now() + this.leaseDuration });
    if (!wasActive) await this.broadcast(room);
    this.schedule(room);
  }

  private async withSeat<T>(credentials: Credentials, operation: (session: Session) => Promise<T>): Promise<T | Failure> {
    let session: Session | undefined;
    try {
      if (!/^[A-Za-z0-9_-]{43}$/.test(credentials.resumeToken)) throw new SessionError('INVALID_SESSION');
      const hash = hashToken(credentials.resumeToken);
      const found = await this.store.findSession(hash);
      if (!found) throw new SessionError('INVALID_SESSION');
      return await this.queued(found._id, async () => {
        const room = await this.room(found._id);
        const seat = room.seats.find(candidate => candidate.resumeHash === hash && !candidate.left);
        if (!seat) throw new SessionError('INVALID_SESSION');
        if (!credentials.connectionId || seat.connectionId !== credentials.connectionId) throw new SessionError('SESSION_REPLACED');
        session = { room, seat };
        return operation(session);
      });
    } catch (error) {
      if (session) session = { ...session, room: this.rooms.get(session.room._id) ?? session.room };
      return this.failure(error, session);
    }
  }

  private newSeat(room: RoomDocument, input: { name: string; token: TokenId; kind: 'human' | 'bot'; resumeHash: string | null; ready: boolean; entryRequestId?: string; entryKind?: 'create' | 'join' }): PrivateSeat {
    if (room.seats.length >= 6) throw new RuleError('This room already has six players.');
    if (room.seats.some(seat => seat.token === input.token)) throw new RuleError('That token is taken. Choose another token.');
    const color = COLORS.find(candidate => !room.seats.some(seat => seat.color === candidate)) ?? '#de714a';
    return { id: randomUUID(), name: input.name, token: input.token, kind: input.kind, ready: input.ready, color, resumeHash: input.resumeHash, left: false, connectionId: input.kind === 'human' ? randomUUID() : null, entryRequestId: input.entryRequestId ?? null, entryKind: input.entryKind ?? null };
  }

  private addBot(room: RoomDocument): void {
    const token = TOKENS.find(candidate => !room.seats.some(seat => seat.token === candidate.id));
    if (!token) throw new RuleError('This room already has six players.');
    const name = BOT_NAMES.find(candidate => !room.seats.some(seat => seat.name === candidate)) ?? 'Bot';
    room.seats.push(this.newSeat(room, { name, token: token.id, kind: 'bot', resumeHash: null, ready: true }));
  }

  private async entered(room: RoomDocument, seat: PrivateSeat, resumeToken: string): Promise<EnterReply> {
    if (!seat.connectionId) throw new SessionError('SESSION_REPLACED');
    await this.touch(room, seat);
    await this.broadcast(room);
    return { ok: true, playerId: seat.id, resumeToken, connectionId: seat.connectionId, channel: channel(seat), view: this.view(room, seat.id) };
  }

  private async recoverEntry(input: CreateRoom | JoinRoom, kind: 'create' | 'join'): Promise<EnterReply | null> {
    const found = await this.store.findSession(hashToken(input.resumeToken));
    if (!found) return null;
    return this.queued(found._id, async () => {
      const room = await this.room(found._id, true);
      const seat = room.seats.find(candidate => candidate.resumeHash === hashToken(input.resumeToken) && !candidate.left);
      if (!seat || seat.entryRequestId !== input.requestId || seat.entryKind !== kind || ('code' in input && room._id !== input.code)) throw new RuleError('This entry credential already belongs to another request.');
      if (input.gameType !== undefined && input.gameType !== room.gameType) throw new RuleError('That invite code belongs to a different game.');
      return this.entered(room, seat, input.resumeToken);
    });
  }

  async create(input: CreateRoom): Promise<EnterReply> {
    try {
      return await this.queued(`entry:${hashToken(input.resumeToken)}`, async () => {
        const recovered = await this.recoverEntry(input, 'create');
        if (recovered) return recovered;
        const now = Date.now();
        const room: RoomDocument = { _id: roomCode(), kind: input.kind, gameType: input.gameType ?? 'tycoon', revision: 0, hostId: '', startingCash: input.startingCash ?? STARTING_CASH, seats: [], game: null, unoGame: null, requests: [], createdAt: now, updatedAt: now, writeId: '' };
        const host = this.newSeat(room, { ...input, kind: 'human', resumeHash: hashToken(input.resumeToken), ready: true, entryRequestId: input.requestId, entryKind: 'create' });
        room.seats.push(host);
        room.hostId = host.id;
        if (input.kind === 'practice') {
          for (let index = 0; index < (input.botCount ?? 3); index += 1) this.addBot(room);
          this.startGame(room);
        }
        const saved = await this.commit(room, null);
        return this.entered(saved, host, input.resumeToken);
      });
    } catch (error) { return this.failure(error); }
  }

  async join(input: JoinRoom): Promise<EnterReply> {
    try {
      return await this.queued(`entry:${hashToken(input.resumeToken)}`, async () => {
        const recovered = await this.recoverEntry(input, 'join');
        if (recovered) return recovered;
        return this.queued(input.code, async () => {
          const current = await this.room(input.code);
          if (input.gameType !== undefined && input.gameType !== current.gameType) throw new RuleError('That invite code belongs to a different game.');
          if (current.kind !== 'friends') throw new RuleError('Practice games are private. Create a friends room to invite someone.');
          if (current.game || current.unoGame) throw new RuleError('This game has already started. You can only rejoin with your saved seat.');
          const token = current.seats.some(seat => seat.token === input.token)
            ? TOKENS.find(candidate => !current.seats.some(seat => seat.token === candidate.id))?.id
            : input.token;
          if (!token) throw new RuleError('This room already has six players.');
          const next = structuredClone(current);
          const seat = this.newSeat(next, { ...input, token, kind: 'human', resumeHash: hashToken(input.resumeToken), ready: false, entryRequestId: input.requestId, entryKind: 'join' });
          next.seats.push(seat);
          if (!next.seats.some(candidate => candidate.id === next.hostId && candidate.kind === 'human')) next.hostId = seat.id;
          const saved = await this.commit(next, current.revision);
          return this.entered(saved, seat, input.resumeToken);
        });
      });
    } catch (error) { return this.failure(error); }
  }

  async resume(resumeToken: string): Promise<EnterReply> {
    try {
      return await this.queued(`entry:${hashToken(resumeToken)}`, async () => {
        const hash = hashToken(resumeToken);
        const found = await this.store.findSession(hash);
        if (!found) throw new SessionError('INVALID_SESSION');
        return this.queued(found._id, async () => {
          const current = await this.room(found._id);
          const seat = current.seats.find(candidate => candidate.resumeHash === hash && !candidate.left);
          if (!seat) throw new SessionError('INVALID_SESSION');
          const oldChannel = seat.connectionId ? channel(seat) : null;
          const next = structuredClone(current);
          const replacement = next.seats.find(candidate => candidate.id === seat.id);
          if (!replacement) throw new SessionError('INVALID_SESSION');
          replacement.connectionId = randomUUID();
          const saved = await this.commit(next, current.revision);
          this.leases.delete(seat.id);
          if (oldChannel) await this.publish([oldChannel], { event: 'room:closed', data: { reason: 'replaced' } });
          return this.entered(saved, replacement, resumeToken);
        });
      });
    } catch (error) { return this.failure(error); }
  }

  async snapshot(credentials: Credentials, heartbeat = false): Promise<SnapshotReply> {
    return this.withSeat(credentials, async ({ room, seat }) => {
      if (heartbeat) await this.touch(room, seat);
      return { ok: true, playerId: seat.id, view: this.view(room, seat.id), channel: channel(seat) };
    });
  }

  async authorize(credentials: Credentials): Promise<Failure | { ok: true; channel: string }> {
    return this.withSeat(credentials, async ({ seat }) => ({ ok: true, channel: channel(seat) }));
  }

  async command(credentials: Credentials, input: z.infer<typeof roomCommandSchema>): Promise<CommandReply> {
    return this.withSeat(credentials, async ({ room: current, seat }) => {
      const previous = current.requests.find(request => request.playerId === seat.id && request.requestId === input.requestId && request.kind === 'command');
      if (previous) return { ok: true, revision: previous.revision, view: this.view(current, seat.id) };
      if (current.revision !== input.expectedRevision) return { ok: false, code: 'STALE_REVISION', message: 'The room changed. Your game has been refreshed. Try that action again.', view: this.view(current, seat.id) };
      const next = structuredClone(current);
      const actor = next.seats.find(candidate => candidate.id === seat.id);
      if (!actor) throw new SessionError('INVALID_SESSION');
      this.applyCommand(next, actor, input.command);
      next.requests.push({ playerId: actor.id, requestId: input.requestId, revision: current.revision + 1, kind: 'command' });
      next.requests = next.requests.slice(-512);
      const saved = await this.commit(next, current.revision);
      if (input.command.type === 'leave') {
        this.leases.delete(actor.id);
        await this.publish([channel(seat)], { event: 'room:closed', data: { reason: 'left' } });
      }
      await this.broadcast(saved);
      this.schedule(saved);
      return { ok: true, revision: saved.revision, view: this.view(saved, seat.id) };
    });
  }

  private applyCommand(room: RoomDocument, actor: PrivateSeat, command: RoomCommand): void {
    if (command.type === 'leave') {
      if (room.game || room.unoGame) {
        if (room.game?.status === 'playing' && room.game.players.find(player => player.id === actor.id)?.status === 'active') room.game = applyAction(room.game, actor.id, { type: 'resign' });
        if (room.unoGame?.status === 'playing' && room.unoGame.players.find(player => player.id === actor.id)?.status === 'active') room.unoGame = applyUnoAction(room.unoGame, actor.id, { type: 'resign' });
        actor.left = true;
        actor.resumeHash = null;
      } else room.seats = room.seats.filter(seat => seat.id !== actor.id);
      if (room.hostId === actor.id) room.hostId = room.seats.find(seat => seat.kind === 'human' && !seat.left)?.id ?? room.seats[0]?.id ?? '';
      return;
    }
    if (command.type === 'play') {
      if (room.gameType !== 'tycoon') throw new RuleError('This action is only available in Deshi Tycoon.');
      if (!room.game) throw new RuleError('The host has not started the game yet.');
      room.game = applyAction(room.game, actor.id, command.action);
      return;
    }
    if (command.type === 'trade') {
      if (room.gameType !== 'tycoon') throw new RuleError('Trading is only available in Deshi Tycoon.');
      if (!room.game) throw new RuleError('The host has not started the game yet.');
      room.game = applyTradeAction(room.game, actor.id, command.action);
      return;
    }
    if (command.type === 'uno') {
      if (room.gameType !== 'uno') throw new RuleError('This action is only available in UNO.');
      if (!room.unoGame) throw new RuleError('The host has not started the game yet.');
      room.unoGame = applyUnoAction(room.unoGame, actor.id, command.action);
      return;
    }
    if (command.type === 'rematch') {
      if (actor.id !== room.hostId) throw new RuleError('Only the host can manage this room.');
      if (room.gameType !== 'uno' || room.unoGame?.status !== 'finished') throw new RuleError('Finish the UNO game before starting a rematch.');
      room.unoGame = null;
      room.seats = room.seats.filter(seat => !seat.left);
      for (const seat of room.seats) seat.ready = seat.kind === 'bot' || seat.id === room.hostId;
      return;
    }
    if (room.game || room.unoGame) throw new RuleError('The lobby is closed because the game has started.');
    if (command.type === 'ready') { actor.ready = command.ready; return; }
    if (actor.id !== room.hostId) throw new RuleError('Only the host can manage this room.');
    switch (command.type) {
      case 'setStartingCash':
        if (room.gameType !== 'tycoon') throw new RuleError('Starting cash is only available in Deshi Tycoon.');
        room.startingCash = command.startingCash;
        break;
      case 'addBot': this.addBot(room); break;
      case 'removeBot': {
        const target = room.seats.find(seat => seat.id === command.playerId && seat.kind === 'bot');
        if (!target) throw new RuleError('That bot is not in this room.');
        room.seats = room.seats.filter(seat => seat.id !== target.id);
        break;
      }
      case 'start':
        if (room.seats.length < 2) throw new RuleError('Invite a friend or add a bot first.');
        if (room.seats.some(seat => seat.kind === 'human' && (!seat.ready || !this.active(seat)))) throw new RuleError('Every human player must be connected and ready.');
        this.startGame(room);
        break;
    }
  }

  private startGame(room: RoomDocument): void {
    const seed = randomInt(1, 0x100000000);
    if (room.gameType === 'uno') room.unoGame = createUnoGame({ players: room.seats, seed });
    else room.game = createGame({ players: room.seats, seed, startingCash: room.startingCash });
  }

  async disconnect(credentials: Credentials): Promise<SnapshotReply> {
    return this.withSeat(credentials, async ({ room, seat }) => {
      this.leases.delete(seat.id);
      await this.broadcast(room);
      this.schedule(room);
      return { ok: true, playerId: seat.id, view: this.view(room, seat.id), channel: channel(seat) };
    });
  }

  private async commit(next: RoomDocument, previousRevision: number | null): Promise<RoomDocument> {
    next.revision = (previousRevision ?? 0) + 1;
    next.updatedAt = Date.now();
    next.writeId = randomUUID();
    try { await this.store.save(next, previousRevision); }
    catch (error) {
      this.rooms.delete(next._id);
      const saved = await this.store.get(next._id);
      if (saved) this.rooms.set(saved._id, saved);
      if (saved?.writeId === next.writeId) return saved;
      throw error;
    }
    this.rooms.set(next._id, next);
    return next;
  }

  private view(room: RoomDocument, playerId: string): RoomView {
    return { code: room._id, kind: room.kind, gameType: room.gameType, revision: room.revision, hostId: room.hostId, startingCash: room.startingCash,
      seats: room.seats.map(seat => ({ id: seat.id, name: seat.name, color: seat.color, token: seat.token, kind: seat.kind, ready: seat.ready, connected: this.active(seat) })),
      game: room.game ? gameView(room.game, playerId) : null,
      unoGame: room.unoGame ? unoGameView(room.unoGame, playerId) : null };
  }

  private async publish(channels: string[], message: RoomEvent): Promise<void> {
    if (!channels.length) return;
    try { await this.publisher.publish(channels, message); }
    catch (error) { console.error(JSON.stringify({ event: 'realtime_publish_failed', error: error instanceof Error ? error.name : 'UnknownError' })); }
  }

  private async broadcast(room: RoomDocument): Promise<void> {
    await this.publish(room.seats.filter(seat => seat.kind === 'human' && !seat.left && seat.connectionId).map(channel), { event: 'room:updated', data: { revision: room.revision } });
  }

  private schedule(room: RoomDocument): void {
    const previous = this.timers.get(room._id);
    if (previous) clearTimeout(previous);
    this.timers.delete(room._id);
    if (this.closing || !room.seats.some(seat => seat.kind === 'human' && this.active(seat))) return;
    if (room.unoGame?.status === 'playing') {
      const actor = room.seats.find(seat => room.unoGame?.status === 'playing' && seat.id === room.unoGame.turnPlayerId);
      if (actor?.kind === 'bot') this.setBotTimer(room._id, this.botDelay);
      return;
    }
    if (room.game?.status !== 'playing') return;
    const actor = room.seats.find(seat => room.game?.status === 'playing' && seat.id === room.game.turn.playerId);
    const hasBotTrade = room.game.trades.some(trade => room.seats.some(seat => seat.id === trade.toPlayerId && seat.kind === 'bot'));
    if (actor?.kind !== 'bot' && !hasBotTrade) return;
    this.setBotTimer(room._id, this.botDelay);
  }

  private setBotTimer(code: string, delay: number, reload = false): void {
    if (this.closing) return;
    const timer = setTimeout(() => { this.timers.delete(code); void this.botTurn(code, reload); }, delay);
    this.timers.set(code, timer);
    timer.unref();
  }

  private async botTurn(code: string, reload: boolean): Promise<void> {
    try {
      await this.queued(code, async () => {
        const current = await this.room(code, reload);
        if (this.closing || !current.seats.some(seat => seat.kind === 'human' && this.active(seat))) return;
        if (current.unoGame?.status === 'playing') {
          const actor = current.seats.find(seat => current.unoGame?.status === 'playing' && seat.id === current.unoGame.turnPlayerId && seat.kind === 'bot');
          if (!actor) return;
          const action = chooseUnoBotAction(current.unoGame, actor.id);
          if (!action) return;
          const next = structuredClone(current);
          next.unoGame = applyUnoAction(current.unoGame, actor.id, action);
          const saved = await this.commit(next, current.revision);
          this.botFailures.delete(code);
          await this.broadcast(saved);
          this.schedule(saved);
          return;
        }
        if (current.game?.status !== 'playing') return;
        let game: GameState = current.game;
        const trade = current.game.trades.find(offer => current.seats.some(seat => seat.id === offer.toPlayerId && seat.kind === 'bot'));
        if (trade) {
          const action = chooseBotTradeAction(current.game, trade.toPlayerId);
          if (action) game = applyTradeAction(game, trade.toPlayerId, action);
        }
        const actor = current.seats.find(seat => game.status === 'playing' && seat.id === game.turn.playerId && seat.kind === 'bot');
        if (actor) {
          const action = chooseBotAction(game, actor.id);
          if (action) game = applyAction(game, actor.id, action);
        }
        if (game === current.game) return;
        const next = structuredClone(current);
        next.game = game;
        const saved = await this.commit(next, current.revision);
        this.botFailures.delete(code);
        await this.broadcast(saved);
        this.schedule(saved);
      });
    } catch (error) {
      console.error(JSON.stringify({ event: 'bot_transition_failed', code, error: error instanceof Error ? error.name : 'UnknownError' }));
      this.rooms.delete(code);
      const failures = (this.botFailures.get(code) ?? 0) + 1;
      this.botFailures.set(code, failures);
      if ([...this.leases.values()].some(lease => lease.code === code && lease.expires > Date.now())) this.setBotTimer(code, Math.min(4000, 250 * 2 ** Math.min(failures - 1, 4)), true);
    }
  }

  private async expireLeases(): Promise<void> {
    const codes = new Set<string>();
    for (const [playerId, lease] of this.leases) if (lease.expires <= Date.now()) { this.leases.delete(playerId); codes.add(lease.code); }
    for (const code of codes) {
      try { await this.queued(code, async () => { const room = await this.room(code); await this.broadcast(room); this.schedule(room); }); }
      catch (error) { console.error(JSON.stringify({ event: 'presence_refresh_failed', code, error: error instanceof Error ? error.name : 'UnknownError' })); }
    }
  }

  async close(): Promise<void> {
    this.closing = true;
    clearInterval(this.leaseTimer);
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.all(this.queues.values());
  }
}
