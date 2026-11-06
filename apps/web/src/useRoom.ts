import { useEffect, useRef, useState } from 'react';
import Pusher from 'pusher-js';
import { GameConnectionError, readReply } from './response';
import { GAME_CONFIG, TOKENS } from '@deshi/game';
import type {
  ChatMessage, ChatReply, CommandReply, CreateRoom, EnterReply, Failure,
  JoinRoom, RealtimeConfig, RoomCommand, RoomView, SnapshotReply, TokenId,
} from '@deshi/game';

type Session = { playerId: string; view: RoomView; chat: ChatMessage[] };
type Connection = 'connecting' | 'online' | 'restoring' | 'offline';
type RoomError = { kind: 'action' | 'transport'; message: string };
type CreateInput = Omit<CreateRoom, 'requestId' | 'resumeToken'>;
type JoinInput = Omit<JoinRoom, 'requestId' | 'resumeToken'>;
type Entry = { kind: 'create'; input: CreateRoom } | { kind: 'join'; input: JoinRoom };
type Seat = { resumeToken: string; connectionId: string; channel: string };
type Controller = {
  create: (input: CreateInput) => Promise<boolean>;
  join: (input: JoinInput) => Promise<boolean>;
  command: (input: RoomCommand) => Promise<boolean>;
  sendChat: (text: string) => Promise<boolean>;
  reconnect: () => void;
};
const RESUME_KEY = 'deshi.resume';
const ENTRY_KEY = 'deshi.pending-entry';

function savedResume(): string | null {
  try { return sessionStorage.getItem(RESUME_KEY); } catch { return null; }
}

function saveResume(token: string) {
  try { sessionStorage.setItem(RESUME_KEY, token); }
  catch { throw new Error('Allow session storage in this browser to save your seat before joining.'); }
}

function clearSavedEntry() {
  try { sessionStorage.removeItem(ENTRY_KEY); } catch { /* The in-memory receipt can still be used. */ }
}

function clearSavedSeat() {
  clearSavedEntry();
  try { sessionStorage.removeItem(RESUME_KEY); } catch { /* The current seat is already cleared in memory. */ }
}

function isToken(value: unknown): value is TokenId {
  return TOKENS.some((token) => token.id === value);
}

function savedEntry(): Entry | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(ENTRY_KEY) ?? 'null');
    if (!value || typeof value !== 'object' || !('kind' in value) || !('input' in value)) return null;
    const input = value.input;
    if (!input || typeof input !== 'object' || !('name' in input) || typeof input.name !== 'string'
      || !('token' in input) || !isToken(input.token)
      || !('requestId' in input) || typeof input.requestId !== 'string'
      || !('resumeToken' in input) || typeof input.resumeToken !== 'string') return null;
    const common = { name: input.name, token: input.token, requestId: input.requestId, resumeToken: input.resumeToken };
    if (value.kind === 'join' && 'code' in input && typeof input.code === 'string') {
      return { kind: 'join', input: { ...common, code: input.code } };
    }
    if (value.kind === 'create' && 'kind' in input && (input.kind === 'friends' || input.kind === 'practice')) {
      if ('botCount' in input && typeof input.botCount !== 'number') return null;
      if ('startingCash' in input && (typeof input.startingCash !== 'number' || !Number.isInteger(input.startingCash)
        || input.startingCash < GAME_CONFIG.startingCash.min || input.startingCash > GAME_CONFIG.startingCash.max)) return null;
      return { kind: 'create', input: { ...common, kind: input.kind,
        ...('botCount' in input && typeof input.botCount === 'number' ? { botCount: input.botCount } : {}),
        ...('startingCash' in input && typeof input.startingCash === 'number' ? { startingCash: input.startingCash } : {}),
      } };
    }
  } catch { /* A damaged receipt is not a valid request to replay. */ }
  return null;
}

function saveEntry(entry: Entry) {
  try {
    sessionStorage.setItem(ENTRY_KEY, JSON.stringify(entry));
    saveResume(entry.input.resumeToken);
  } catch {
    clearSavedSeat();
    throw new Error('Allow session storage in this browser to save your seat before joining.');
  }
}

function newResumeToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function inviteAddress(code: string | null) {
  const url = new URL(window.location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  window.history.replaceState(null, '', url);
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Could not reach the game server. Try reconnecting.';
}

export function useRoom() {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<RoomError | null>(null);
  const controller = useRef<Controller | null>(null);

  useEffect(() => {
    let active = true;
    let pusher: Pusher | null = null;
    let configuring = false;
    let apiReachable = false;
    let socketConnected = false;
    let initialConnection = true;
    let subscribed = false;
    let seat: Seat | null = null;
    let current: Session | null = null;
    let entry = savedEntry();
    let resumeToken = entry?.input.resumeToken ?? savedResume();
    let restoring = !!resumeToken;
    let busy = false;
    let snapshotBusy = false;
    let snapshotQueued = false;
    let heartbeatQueued = false;
    const requests = new Set<AbortController>();

    function showError(message: string, kind: RoomError['kind'] = 'action') {
      setError({ kind, message });
    }

    function updateConnection() {
      if (!active) return;
      setConnection(socketConnected && apiReachable
        ? restoring || (seat && !subscribed) ? 'restoring' : 'online'
        : initialConnection ? 'connecting' : 'offline');
    }

    function headers(auth: Seat) {
      return { Authorization: `Bearer ${auth.resumeToken}`, 'X-Connection-Id': auth.connectionId };
    }

    async function request<T>(path: string, body?: object, auth?: Seat): Promise<T> {
      const abort = new AbortController();
      requests.add(abort);
      const timeout = window.setTimeout(() => abort.abort(), 12_000);
      try {
        const response = await fetch(path, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth ? headers(auth) : {}) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: abort.signal,
          cache: 'no-store',
        });
        if (!active) throw new Error('This connection was closed.');
        const reply = await readReply<T>(response);
        if (!active) throw new Error('This connection was closed.');
        apiReachable = true;
        updateConnection();
        return reply;
      } catch (cause) {
        if (active) { apiReachable = false; initialConnection = false; updateConnection(); }
        if (abort.signal.aborted) throw new GameConnectionError('The server did not answer. Your saved seat is safe. Reconnect and try again.');
        throw cause instanceof GameConnectionError ? cause : new GameConnectionError(undefined, { cause });
      } finally {
        requests.delete(abort);
        window.clearTimeout(timeout);
      }
    }

    function applySnapshot(view: RoomView, chat: ChatMessage[], playerId = current?.playerId) {
      if (!active || !playerId || (current && (current.view.code !== view.code || current.view.revision > view.revision))) return;
      current = { playerId, view, chat };
      setSession(current);
      inviteAddress(view.code);
    }

    function clearSeat(reason?: 'expired' | 'replaced' | 'left') {
      if (seat) pusher?.unsubscribe(seat.channel);
      seat = null;
      current = null;
      entry = null;
      resumeToken = null;
      restoring = false;
      subscribed = false;
      snapshotQueued = false;
      heartbeatQueued = false;
      clearSavedSeat();
      if (!active) return;
      setSession(null);
      if (reason === 'left') inviteAddress(null);
      if (reason === 'replaced') showError('Your seat was opened in another connection. Join a room to keep playing.');
      if (reason === 'expired') showError('This room has expired. Create a new room to play again.');
      updateConnection();
    }

    function failure(reply: Failure) {
      if (reply.code === 'INVALID_SESSION' || reply.code === 'SESSION_REPLACED') {
        clearSeat(reply.code === 'SESSION_REPLACED' ? 'replaced' : undefined);
      } else if (reply.view && current && reply.view.code === current.view.code && reply.view.revision >= current.view.revision) {
        current = { ...current, view: reply.view };
        setSession(current);
      }
      if (active) showError(reply.message);
    }

    async function refreshSnapshot(heartbeat = false) {
      snapshotQueued = true;
      heartbeatQueued ||= heartbeat;
      if (snapshotBusy || !seat || !active) return;
      snapshotBusy = true;
      try {
        while (snapshotQueued && seat && active) {
          snapshotQueued = false;
          const renewLease = heartbeatQueued;
          heartbeatQueued = false;
          const auth: Seat = seat;
          try {
            const reply = await request<SnapshotReply>(renewLease ? '/api/heartbeat' : '/api/session', renewLease ? {} : undefined, auth);
            if (!active || auth !== seat) continue;
            if (!reply.ok) { failure(reply); continue; }
            applySnapshot(reply.view, reply.chat, reply.playerId);
            if (subscribed) {
              restoring = false;
              setError((previous) => previous?.kind === 'transport' ? null : previous);
              updateConnection();
            }
          } catch (cause) {
            if (active && auth === seat) showError(messageOf(cause), 'transport');
          }
        }
      } finally { snapshotBusy = false; }
    }

    function subscribeSeat(auth: Seat) {
      if (!pusher || !active || auth !== seat) return;
      pusher.unsubscribe(auth.channel);
      subscribed = false;
      updateConnection();
      const channel = pusher.subscribe(auth.channel);
      channel.bind('pusher:subscription_succeeded', () => {
        if (!active || auth !== seat) return;
        subscribed = true;
        updateConnection();
        // Fetch after subscription to include any change made before the channel became ready.
        void refreshSnapshot(true);
      });
      channel.bind('pusher:subscription_error', () => {
        if (!active || auth !== seat) return;
        subscribed = false;
        updateConnection();
        showError('Could not connect to your private room. We will keep trying.', 'transport');
        void refreshSnapshot();
      });
      channel.bind('room:updated', () => {
        if (auth === seat) void refreshSnapshot();
      });
      channel.bind('room:closed', (event: unknown) => {
        if (!active || auth !== seat || !event || typeof event !== 'object' || !('reason' in event)) return;
        if (event.reason === 'expired' || event.reason === 'replaced' || event.reason === 'left') clearSeat(event.reason);
      });
    }

    function acceptEntry(reply: EnterReply) {
      if (!active) return false;
      if (!reply.ok) {
        failure(reply);
        // A definite input/rule rejection did not create a seat. Allow corrected input.
        if (entry && (reply.code === 'INVALID_INPUT' || reply.code === 'RULE')) clearSeat();
        return false;
      }
      if (seat) pusher?.unsubscribe(seat.channel);
      saveResume(reply.resumeToken);
      resumeToken = reply.resumeToken;
      entry = null;
      clearSavedEntry();
      seat = { resumeToken: reply.resumeToken, connectionId: reply.connectionId, channel: reply.channel };
      current = null;
      applySnapshot(reply.view, reply.chat, reply.playerId);
      setError(null);
      restoring = true;
      subscribeSeat(seat);
      return true;
    }

    async function enter(receipt: Entry) {
      const reply = await request<EnterReply>(receipt.kind === 'create' ? '/api/rooms' : '/api/rooms/join', receipt.input);
      return acceptEntry(reply);
    }

    async function recover() {
      if (!active || !socketConnected || busy) return;
      if (seat) { void refreshSnapshot(true); return; }
      if (!resumeToken) { restoring = false; updateConnection(); return; }
      busy = true;
      restoring = true;
      updateConnection();
      if (entry) setPending(entry.kind === 'join' ? 'join' : entry.input.kind === 'practice' ? 'practice' : 'create');
      try {
        if (entry) await enter(entry);
        else acceptEntry(await request<EnterReply>('/api/session/resume', { resumeToken }));
      } catch (cause) {
        if (active) showError(messageOf(cause), cause instanceof GameConnectionError ? 'transport' : 'action');
      } finally {
        busy = false;
        if (active) { setPending(null); updateConnection(); }
      }
    }

    async function configureRealtime() {
      if (!active || configuring || pusher) return;
      configuring = true;
      try {
        const config = await request<RealtimeConfig>('/api/realtime');
        if (!active) return;
        if (!config || typeof config.key !== 'string' || !config.key) throw new Error('The game server has no realtime connection configured.');
        const url = new URL(config.url ?? window.location.origin);
        const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
        pusher = new Pusher(config.key, {
          cluster: 'mt1',
          wsHost: url.hostname,
          wsPort: port,
          wssPort: port,
          forceTLS: url.protocol === 'https:',
          enabledTransports: ['ws', 'wss'],
          disableStats: true,
          channelAuthorization: {
            endpoint: '/api/pusher/auth', transport: 'ajax',
            headersProvider: () => seat ? headers(seat) : {},
          },
        });
        pusher.connection.bind('connected', () => {
          if (!active) return;
          socketConnected = true;
          initialConnection = false;
          updateConnection();
          if (seat && pusher?.channel(seat.channel)?.subscriptionPending !== true) subscribeSeat(seat);
          void recover();
        });
        const disconnected = () => {
          if (!active) return;
          socketConnected = false;
          subscribed = false;
          restoring = !!seat || !!resumeToken;
          initialConnection = false;
          updateConnection();
        };
        pusher.connection.bind('connecting', () => { if (socketConnected) disconnected(); });
        pusher.connection.bind('disconnected', disconnected);
        pusher.connection.bind('unavailable', disconnected);
        pusher.connection.bind('failed', disconnected);
        pusher.connection.bind('error', () => {
          if (active) showError('We cannot reach the live game connection. We will keep trying.', 'transport');
        });
      } catch (cause) {
        if (active) {
          apiReachable = false;
          initialConnection = false;
          showError(messageOf(cause), 'transport');
          updateConnection();
        }
      } finally { configuring = false; }
    }

    async function run(label: string, operation: () => Promise<boolean>) {
      if (busy) return false;
      if (!socketConnected || !apiReachable || restoring || (seat && !subscribed)) {
        showError('Wait for the game server to reconnect, then try again.', 'transport');
        return false;
      }
      busy = true;
      setPending(label);
      setError(null);
      try { return await operation(); }
      catch (cause) { if (active) showError(messageOf(cause), cause instanceof GameConnectionError ? 'transport' : 'action'); return false; }
      finally { busy = false; if (active) setPending(null); }
    }

    const controls: Controller = {
      create: (input) => run(input.kind === 'practice' ? 'practice' : 'create', async () => {
        if (seat || resumeToken) return false;
        const receipt: Entry = { kind: 'create', input: { ...input, requestId: crypto.randomUUID(), resumeToken: newResumeToken() } };
        saveEntry(receipt);
        entry = receipt;
        resumeToken = receipt.input.resumeToken;
        restoring = true;
        updateConnection();
        return enter(receipt);
      }),
      join: (input) => run('join', async () => {
        if (seat || resumeToken) return false;
        const receipt: Entry = { kind: 'join', input: { ...input, requestId: crypto.randomUUID(), resumeToken: newResumeToken() } };
        saveEntry(receipt);
        entry = receipt;
        resumeToken = receipt.input.resumeToken;
        restoring = true;
        updateConnection();
        return enter(receipt);
      }),
      command: (input) => run(input.type === 'play' ? input.action.type : input.type, async () => {
        if (!seat || !current) return false;
        const auth = seat;
        const reply = await request<CommandReply>('/api/commands', {
          requestId: crypto.randomUUID(), expectedRevision: current.view.revision, command: input,
        }, auth);
        if (!active || auth !== seat) return false;
        if (!reply.ok) { failure(reply); return false; }
        applySnapshot(reply.view, reply.chat);
        if (input.type === 'leave') clearSeat('left');
        return true;
      }),
      sendChat: (text) => run('chat', async () => {
        if (!seat) return false;
        const auth = seat;
        const reply = await request<ChatReply>('/api/chat', { requestId: crypto.randomUUID(), text }, auth);
        if (!active || auth !== seat) return false;
        if (!reply.ok) { failure(reply); return false; }
        applySnapshot(reply.view, reply.chat);
        return true;
      }),
      reconnect: () => {
        initialConnection = true;
        apiReachable = false;
        updateConnection();
        if (!pusher) { void configureRealtime(); return; }
        pusher.disconnect();
        pusher.connect();
        void request<RealtimeConfig>('/api/realtime').catch((cause: unknown) => { if (active) showError(messageOf(cause), 'transport'); });
      },
    };
    controller.current = controls;

    function disconnectSeat() {
      if (!seat) return;
      void fetch('/api/disconnect', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers(seat) }, body: '{}', keepalive: true }).catch(() => {});
    }

    const heartbeat = window.setInterval(() => {
      if (!pusher) { void configureRealtime(); return; }
      if (!socketConnected) return;
      if (seat) {
        if (!subscribed && pusher.channel(seat.channel)?.subscriptionPending !== true) subscribeSeat(seat);
        void refreshSnapshot(true);
      }
      else if (resumeToken) void recover();
      else void request<RealtimeConfig>('/api/realtime').catch((cause: unknown) => { if (active) showError(messageOf(cause), 'transport'); });
    }, 10_000);
    window.addEventListener('pagehide', disconnectSeat);
    void configureRealtime();
    return () => {
      active = false;
      if (controller.current === controls) controller.current = null;
      window.clearInterval(heartbeat);
      window.removeEventListener('pagehide', disconnectSeat);
      disconnectSeat();
      for (const abort of requests) abort.abort();
      pusher?.disconnect();
    };
  }, []);

  return {
    session, connection, pending, error: error?.message ?? null,
    create: (input: CreateInput) => controller.current?.create(input) ?? Promise.resolve(false),
    join: (input: JoinInput) => controller.current?.join(input) ?? Promise.resolve(false),
    command: (input: RoomCommand) => controller.current?.command(input) ?? Promise.resolve(false),
    sendChat: (text: string) => controller.current?.sendChat(text) ?? Promise.resolve(false),
    reconnect: () => controller.current?.reconnect(),
    clearError: () => setError(null),
  };
}
