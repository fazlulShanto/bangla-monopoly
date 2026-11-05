import assert from 'node:assert/strict';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Pusher from 'pusher-js';
import { z } from 'zod';
import type { ChatMessage, ChatReply, CommandReply, EnterReply, Failure, RoomCommand, RoomView, SnapshotReply } from '@deshi/game';

export type Running = { url: string; stop(): Promise<void> };
export type StartServer = () => Promise<Running>;
type Entered = Extract<EnterReply, { ok: true }>;
type Peer = { entry: Entered; view: RoomView; chat: ChatMessage[]; pusher: Pusher; hintCount: number; replaced: boolean };
const authResponseSchema = z.object({ auth: z.string() });
const configSchema = z.object({ key: z.string().min(1) });
const hintSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
const closedSchema = z.object({ reason: z.enum(['expired', 'replaced', 'left']) }).strict();
const token = () => randomBytes(32).toString('base64url');
function entered(value: EnterReply): Entered { assert(value.ok, value.ok ? '' : value.message); return value; }
function successful<T extends { ok: true }>(value: T | Failure): T { assert(value.ok, value.ok ? '' : value.message); return value; }
export async function waitUntil(check: () => boolean | Promise<boolean>, label: string, timeout = 10_000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await check()) return; await Bun.sleep(20); }
  throw new Error(`Timed out waiting for ${label}`);
}

export async function runRealtimeSmoke(startServer: StartServer): Promise<{ code: string; checks: string[] }> {
  let server = await startServer();
  const peers: Peer[] = [];
  const headers = (entry: Entered) => ({ Authorization: `Bearer ${entry.resumeToken}`, 'X-Connection-Id': entry.connectionId });
  async function post<T>(path: string, value: unknown, entry?: Entered): Promise<T> {
    const response = await fetch(`${server.url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(entry ? headers(entry) : {}) }, body: JSON.stringify(value), signal: AbortSignal.timeout(10_000) });
    return response.json();
  }
  async function refresh(peer: Peer): Promise<void> {
    const response = await fetch(`${server.url}/api/session`, { headers: headers(peer.entry), signal: AbortSignal.timeout(10_000) });
    const snapshot: SnapshotReply = await response.json();
    if (snapshot.ok && snapshot.view.revision >= peer.view.revision) { peer.view = snapshot.view; peer.chat = snapshot.chat; }
  }
  async function connect(entry: Entered): Promise<Peer> {
    const config = configSchema.parse(await fetch(`${server.url}/api/realtime`).then(response => response.json()));
    const pusher = new Pusher(config.key, {
      wsHost: process.env.SMOKE_WS_HOST ?? process.env.SOKETI_HOST ?? '127.0.0.1', wsPort: Number(process.env.SMOKE_WS_PORT ?? process.env.SOKETI_PORT ?? 6001), forceTLS: false,
      enabledTransports: ['ws'], disableStats: true, cluster: 'mt1',
      channelAuthorization: { endpoint: '/api/pusher/auth', transport: 'ajax', customHandler: (params, callback) => {
        void fetch(`${server.url}/api/pusher/auth`, { method: 'POST', headers: { ...headers(entry), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ socket_id: params.socketId, channel_name: params.channelName }) })
          .then(async response => { if (!response.ok) throw new Error('Private channel authorization failed'); callback(null, authResponseSchema.parse(await response.json())); })
          .catch(() => callback(new Error('Private channel authorization failed'), null));
      } },
    });
    const peer: Peer = { entry, view: entry.view, chat: entry.chat, pusher, hintCount: 0, replaced: false };
    peers.push(peer);
    const channel = pusher.subscribe(entry.channel);
    let subscribed = false;
    let subscriptionFailed = false;
    channel.bind('pusher:subscription_succeeded', () => { subscribed = true; });
    channel.bind('pusher:subscription_error', () => { subscriptionFailed = true; });
    channel.bind('room:updated', (raw: unknown) => { hintSchema.parse(raw); peer.hintCount += 1; void refresh(peer).catch(() => undefined); });
    channel.bind('room:closed', (raw: unknown) => { const message = closedSchema.parse(raw); peer.replaced = message.reason === 'replaced'; });
    await waitUntil(() => { if (subscriptionFailed) throw new Error('Private channel subscription failed'); return subscribed; }, 'private Pusher subscription');
    await refresh(peer);
    return peer;
  }
  async function command(peer: Peer, value: RoomCommand, requestId = randomUUID()): Promise<CommandReply> {
    const result = await post<CommandReply>('/api/commands', { requestId, expectedRevision: peer.view.revision, command: value }, peer.entry);
    if (result.ok) { peer.view = result.view; peer.chat = result.chat; } else if (result.view) peer.view = result.view;
    return result;
  }
  try {
    const createRequest = { kind: 'friends', name: 'Asha', token: 'rickshaw', startingCash: 3000, requestId: randomUUID(), resumeToken: token() };
    const created = entered(await post<EnterReply>('/api/rooms', createRequest));
    const retriedCreate = entered(await post<EnterReply>('/api/rooms', createRequest));
    assert.equal(retriedCreate.playerId, created.playerId, 'Entry request retries recover the same seat');
    const host = await connect(created);
    const joinRequest = { code: created.view.code, name: 'Bashir', token: 'boat', requestId: randomUUID(), resumeToken: token() };
    const joined = entered(await post<EnterReply>('/api/rooms/join', joinRequest));
    const friend = await connect(joined);
    await waitUntil(() => host.view.seats.length === 2, 'joined friend hint and authenticated snapshot');
    assert.equal(friend.view.startingCash, 3000, 'A joining friend sees the selected starting cash');
    assert(!(await command(friend, { type: 'setStartingCash', startingCash: 5000 })).ok, 'Only the host changes starting cash');
    successful(await command(host, { type: 'setStartingCash', startingCash: 2500 }));
    await waitUntil(() => friend.view.startingCash === 2500, 'starting cash hint and authenticated snapshot');
    assert(!(await command(friend, { type: 'start' })).ok, 'Only the host starts a room');
    assert(!(await command(host, { type: 'start' })).ok, 'Unready humans block start');
    successful(await command(friend, { type: 'ready', ready: true }));
    await waitUntil(() => host.view.seats.every(seat => seat.ready), 'ready hint');
    successful(await command(host, { type: 'start' }));
    await waitUntil(() => friend.view.game?.status === 'playing', 'game start hint');
    assert.deepEqual(friend.view.game?.players.map(player => player.cash), [2500, 2500], 'Every player receives the configured starting cash');
    assert(!(await command(friend, { type: 'play', action: { type: 'roll' } })).ok, 'Bearer credentials bind the actor');
    const rollRequest = { requestId: randomUUID(), expectedRevision: host.view.revision, command: { type: 'play', action: { type: 'roll' } } };
    const rolled = successful(await post<CommandReply>('/api/commands', rollRequest, host.entry));
    host.view = rolled.view;
    const duplicate = successful(await post<CommandReply>('/api/commands', rollRequest, host.entry));
    assert.equal(duplicate.revision, rolled.revision, 'Command receipts deduplicate retries');
    assert.deepEqual(duplicate.view.game, rolled.view.game);
    await waitUntil(() => friend.view.revision >= rolled.view.revision, 'dice state hint');
    assert.deepEqual(friend.view.game?.players, host.view.game?.players, 'Players share authoritative money and positions');
    const stale = await post<CommandReply>('/api/commands', { ...rollRequest, requestId: randomUUID(), expectedRevision: 0 }, host.entry);
    assert(!stale.ok && stale.code === 'STALE_REVISION' && stale.view, 'Stale commands include the current view');
    const cashBeforeTrade = structuredClone(host.view.game?.players);
    successful(await command(friend, { type: 'trade', action: { type: 'offer', toPlayerId: created.playerId, give: { cash: 25, tiles: [] }, receive: { cash: 0, tiles: [] } } }));
    await waitUntil(() => host.view.game?.trades.length === 1, 'out-of-turn trade offer hint');
    assert.deepEqual(host.view.game?.players, cashBeforeTrade, 'Offers do not move cash before acceptance');
    const offered = host.view.game?.trades[0];
    assert(offered, 'The recipient receives the pending offer');
    const acceptRequest = { requestId: randomUUID(), expectedRevision: host.view.revision, command: { type: 'trade', action: { type: 'accept', tradeId: offered.id } } };
    const accepted = successful(await post<CommandReply>('/api/commands', acceptRequest, host.entry));
    host.view = accepted.view;
    await waitUntil(() => friend.view.revision >= accepted.revision, 'accepted trade hint');
    assert.deepEqual(friend.view.game?.players, host.view.game?.players, 'Accepted trade balances agree across clients');
    assert.equal(host.view.game?.players.find(player => player.id === created.playerId)?.cash, (cashBeforeTrade?.find(player => player.id === created.playerId)?.cash ?? 0) + 25);
    assert.equal(host.view.game?.players.find(player => player.id === joined.playerId)?.cash, (cashBeforeTrade?.find(player => player.id === joined.playerId)?.cash ?? 0) - 25);
    assert.equal(host.view.game?.trades.length, 0, 'Acceptance removes the pending trade');
    successful(await command(friend, { type: 'trade', action: { type: 'offer', toPlayerId: created.playerId, give: { cash: 10, tiles: [] }, receive: { cash: 0, tiles: [] } } }));
    await waitUntil(() => host.view.game?.trades.length === 1, 'pending trade saved before restart');
    const chatRequest = { requestId: randomUUID(), text: 'Shubho khela!' };
    successful(await post<ChatReply>('/api/chat', chatRequest, friend.entry));
    successful(await post<ChatReply>('/api/chat', chatRequest, friend.entry));
    await waitUntil(() => host.chat.filter(message => message.text === chatRequest.text).length === 1, 'chat hint and snapshot');
    const forbidden = await fetch(`${server.url}/api/pusher/auth`, { method: 'POST', headers: { ...headers(host.entry), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ socket_id: host.pusher.connection.socket_id ?? '1.1', channel_name: friend.entry.channel }) });
    assert.equal(forbidden.status, 403, 'A seat cannot subscribe to another private channel');
    const afterRoll = structuredClone(host.view.game);
    for (const peer of peers) peer.pusher.disconnect();
    await server.stop();
    server = await startServer();
    const durableEntryRetry = entered(await post<EnterReply>('/api/rooms/join', joinRequest));
    assert.equal(durableEntryRetry.playerId, joined.playerId, 'Pre-saved entry receipts recover after a process restart');
    const hostResumed = entered(await post<EnterReply>('/api/session/resume', { resumeToken: created.resumeToken }));
    assert.equal(hostResumed.playerId, created.playerId);
    assert.equal(hostResumed.view.seats.find(seat => seat.id === joined.playerId)?.connected, true, 'Recovered entry restores presence');
    const friendResumed = entered(await post<EnterReply>('/api/session/resume', { resumeToken: joined.resumeToken }));
    const hostAgain = await connect(hostResumed);
    const friendAgain = await connect(friendResumed);
    assert.equal(hostAgain.view.startingCash, 2500, 'Mongo preserves starting cash through a process restart');
    assert.deepEqual(hostAgain.view.game?.players, afterRoll?.players, 'Mongo preserves positions and cash through process restart');
    assert.deepEqual(hostAgain.view.game?.lastRoll, afterRoll?.lastRoll);
    assert.deepEqual(hostAgain.view.game?.trades, afterRoll?.trades, 'Mongo preserves pending trades through process restart');
    const acceptedRetry = successful(await post<CommandReply>('/api/commands', acceptRequest, hostAgain.entry));
    assert.equal(acceptedRetry.revision, accepted.revision, 'Accepted trades deduplicate across restart');
    assert.deepEqual(acceptedRetry.view.game?.players, afterRoll?.players, 'Retrying an accepted trade never transfers cash twice');
    assert.equal(hostAgain.chat.filter(message => message.text === chatRequest.text).length, 1, 'Mongo preserves deduplicated chat');
    const restartDuplicate = successful(await post<CommandReply>('/api/commands', rollRequest, hostAgain.entry));
    assert.equal(restartDuplicate.revision, rolled.revision, 'Durable command receipts survive restart');
    const replacementEntry = entered(await post<EnterReply>('/api/session/resume', { resumeToken: joined.resumeToken }));
    const replacement = await connect(replacementEntry);
    await waitUntil(() => friendAgain.replaced, 'old generation closure');
    const replaced = await post<CommandReply>('/api/commands', { requestId: randomUUID(), expectedRevision: replacement.view.revision, command: { type: 'leave' } }, friendAgain.entry);
    assert(!replaced.ok && replaced.code === 'SESSION_REPLACED', 'Replaced connections cannot issue commands');
    successful(await command(replacement, { type: 'leave' }));
    await waitUntil(() => hostAgain.view.game?.status === 'finished', 'forfeit winner hint');
    const revoked = await post<EnterReply>('/api/session/resume', { resumeToken: joined.resumeToken });
    assert(!revoked.ok && revoked.code === 'INVALID_SESSION', 'Leave revokes the resume credential');
    assert(host.hintCount > 0 && friend.hintCount > 0 && hostAgain.hintCount > 0, 'Soketi delivered real private revision hints');
    assert((await fetch(`${server.url}/api/health`)).ok, 'Mongo and Soketi health are ready');
    return { code: created.view.code, checks: ['real Pusher private subscriptions', 'revision-only hints', 'HTTP actor binding', 'channel authorization', 'host/ready gates', 'shared money and dice', 'out-of-turn trade offers', 'atomic accepted trade balances', 'pending trade persistence', 'accepted trade replay protection', 'stale refresh', 'durable entry and command receipts', 'chat', 'Mongo process restart', 'resume generation replacement', 'forfeit/winner', 'credential revocation', 'Mongo and Soketi health'] };
  } finally { for (const peer of peers) peer.pusher.disconnect(); await server.stop(); }
}

export function mongoProcessFactory(): { start: StartServer; database: string } {
  assert(process.env.MONGO_URI, 'Set MONGO_URI before running the real Soketi/Mongo restart test');
  const database = `deshi_tycoon_smoke_${Date.now()}_${randomBytes(4).toString('hex')}`;
  const project = fileURLToPath(new URL('..', import.meta.url));
  const start: StartServer = async () => {
    const port = randomInt(31_000, 49_000);
    const child = Bun.spawn([process.execPath, resolve(project, 'apps/server/src/index.ts')], { cwd: project, env: { ...process.env, MONGO_DB: database, PORT: String(port), NODE_ENV: 'test' }, stdout: 'ignore', stderr: 'ignore' });
    const url = `http://127.0.0.1:${port}`;
    try {
      await waitUntil(async () => { if (child.exitCode !== null) throw new Error('Backend exited before readiness'); try { return (await fetch(`${url}/api/health`)).ok; } catch { return false; } }, 'Mongo-backed HTTP server and Soketi readiness', 20_000);
    } catch (error) { child.kill(); await child.exited; throw error; }
    let stopped = false;
    return { url, async stop() { if (stopped) return; stopped = true; child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 5000); try { await child.exited; } finally { clearTimeout(timer); } } };
  };
  return { start, database };
}

if (import.meta.main) {
  try {
    const mongo = mongoProcessFactory();
    const result = await runRealtimeSmoke(mongo.start);
    process.stdout.write(`${JSON.stringify({ ok: true, storage: 'mongo', database: mongo.database, ...result })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, message: error instanceof Error ? error.message : 'Realtime smoke failed' })}\n`);
    process.exitCode = 1;
  }
}
