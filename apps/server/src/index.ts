import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Failure } from '@deshi/game';
import { z } from 'zod';
import { RoomService, type Credentials } from './rooms';
import { createSchema, joinSchema, resumeSchema, roomCommandSchema } from './schema';
import { configuredRealtime, type RealtimeGateway } from './realtime';
import { MemoryRoomStore, MongoRoomStore, type RoomStore } from './store';

const DEFAULT_DIST = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.avif': 'image/avif', '.txt': 'text/plain; charset=utf-8',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
const authFormSchema = z.object({ socket_id: z.string().max(100).regex(/^\d+\.\d+$/), channel_name: z.string().min(1).max(200) }).strict();
const emptySchema = z.object({}).strict();
class InputError extends Error {}
const invalidInput = (message: string): Failure => ({ ok: false, code: 'INVALID_INPUT', message });
function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { ...SECURITY_HEADERS, 'Cache-Control': 'no-store' } });
}
function reply<T extends { ok: boolean; code?: string }>(value: T): Response {
  const status = value.ok ? 200 : value.code === 'INVALID_SESSION' ? 401 : value.code === 'SESSION_REPLACED' || value.code === 'STALE_REVISION' || value.code === 'CONFLICT' ? 409 : value.code === 'STORAGE_UNAVAILABLE' ? 503 : value.code === 'RATE_LIMIT' ? 429 : 400;
  return json(value, status);
}
function credentials(request: Request): Credentials {
  const bearer = request.headers.get('authorization');
  return { resumeToken: bearer?.startsWith('Bearer ') ? bearer.slice(7) : '', connectionId: request.headers.get('x-connection-id') ?? '' };
}
async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new InputError('Send a JSON request.');
  let raw: unknown;
  try { raw = await request.json(); } catch { throw new InputError('Send valid JSON.'); }
  const result = schema.safeParse(raw);
  if (!result.success) throw new InputError(result.error.issues[0]?.message ?? 'Check the request and try again.');
  return result.data;
}
function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const sameOrigin = source.host === request.headers.get('host');
    const development = process.env.NODE_ENV !== 'production' && ['http://localhost:5173', 'http://127.0.0.1:5173'].includes(source.origin);
    return sameOrigin || development || source.origin === process.env.WEB_ORIGIN;
  } catch { return false; }
}

export async function createApp(options: { store: RoomStore; realtime?: RealtimeGateway; port?: number; host?: string; webDist?: string; botDelay?: number }) {
  const dist = resolve(options.webDist ?? DEFAULT_DIST);
  const realtime = options.realtime ?? configuredRealtime();
  const rooms = new RoomService(options.store, realtime, options.botDelay);
  const rates = new Map<string, { count: number; start: number }>();
  function consume(request: Request, address: string, lane: 'entry' | 'command'): boolean {
    const key = `${lane}:${lane === 'entry' ? address : createHash('sha256').update(request.headers.get('authorization') ?? address).digest('hex')}`;
    const now = Date.now();
    const duration = 60_000;
    const limit = lane === 'entry' ? 120 : 240;
    let rate = rates.get(key);
    if (!rate || now - rate.start >= duration) { rate = { count: 0, start: now }; rates.set(key, rate); }
    rate.count += 1;
    if (rates.size > 10_000) for (const [rateKey, value] of rates) if (now - value.start >= 60_000) rates.delete(rateKey);
    return rate.count <= limit;
  }
  const server = Bun.serve({
    port: options.port ?? 3001, hostname: options.host ?? '0.0.0.0', maxRequestBodySize: 16_384,
    async fetch(request, currentServer) {
      try {
        const url = new URL(request.url);
        if (url.pathname === '/api/health' && request.method === 'GET') {
          const [storage, live] = await Promise.all([options.store.ping(), realtime.ping()]);
          return json({ status: storage && live ? 'ok' : 'degraded', storage: options.store.mode, persistent: options.store.mode === 'mongo', realtime: live ? 'ok' : 'unavailable' }, storage && live ? 200 : 503);
        }
        if (url.pathname.startsWith('/api/')) {
          if (!allowedOrigin(request)) return json({ ok: false, code: 'FORBIDDEN', message: 'This origin is not allowed.' } satisfies Failure, 403);
          if (url.pathname === '/api/realtime' && request.method === 'GET') return json({ key: realtime.key, ...(realtime.url ? { url: realtime.url } : {}) });
          if (url.pathname === '/api/session' && request.method === 'GET') return reply(await rooms.snapshot(credentials(request)));
          if (request.method !== 'POST') return json({ ok: false, code: 'NOT_FOUND', message: 'Endpoint not found.' } satisfies Failure, 404);
          const length = Number(request.headers.get('content-length') ?? 0);
          if (length > 16_384) return json(invalidInput('The request is too large.'), 413);
          const lane = url.pathname === '/api/rooms' || url.pathname === '/api/rooms/join' || url.pathname === '/api/session/resume' ? 'entry' : 'command';
          if (!consume(request, currentServer.requestIP(request)?.address ?? 'unknown', lane)) return reply({ ok: false, code: 'RATE_LIMIT', message: 'A little too fast. Try again in a moment.' } satisfies Failure);
          switch (url.pathname) {
            case '/api/rooms': return reply(await rooms.create(await body(request, createSchema)));
            case '/api/rooms/join': return reply(await rooms.join(await body(request, joinSchema)));
            case '/api/session/resume': return reply(await rooms.resume((await body(request, resumeSchema)).resumeToken));
            case '/api/commands': return reply(await rooms.command(credentials(request), await body(request, roomCommandSchema)));
            case '/api/heartbeat': await body(request, emptySchema); return reply(await rooms.snapshot(credentials(request), true));
            case '/api/disconnect': await body(request, emptySchema); return reply(await rooms.disconnect(credentials(request)));
            case '/api/pusher/auth': {
              if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return json(invalidInput('Send a Pusher authorization form.'), 400);
              const parsed = authFormSchema.safeParse(Object.fromEntries(new URLSearchParams(await request.text())));
              if (!parsed.success) return json(invalidInput('Invalid Pusher authorization form.'), 400);
              const session = await rooms.authorize(credentials(request));
              if (!session.ok || session.channel !== parsed.data.channel_name) return json({ ok: false, code: 'FORBIDDEN', message: 'This channel is not available to this connection.' } satisfies Failure, 403);
              return json(realtime.authorize(parsed.data.socket_id, session.channel));
            }
            default: return json({ ok: false, code: 'NOT_FOUND', message: 'Endpoint not found.' } satisfies Failure, 404);
          }
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { ...SECURITY_HEADERS, Allow: 'GET, HEAD' } });
        let pathname: string;
        try { pathname = decodeURIComponent(url.pathname); } catch { return new Response('Invalid URL', { status: 400, headers: SECURITY_HEADERS }); }
        if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').some(segment => segment.startsWith('.'))) return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
        let file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
        if (!file.startsWith(`${dist}${sep}`)) return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
        try { if (!(await stat(file)).isFile()) throw new Error('Not a file'); }
        catch {
          if (extname(pathname) || !request.headers.get('accept')?.includes('text/html')) return new Response('Not found', { status: 404, headers: SECURITY_HEADERS });
          file = resolve(dist, 'index.html');
        }
        let content: Buffer;
        try { content = await readFile(file); } catch { return new Response('Build the web app with bun run build.', { status: 404, headers: SECURITY_HEADERS }); }
        const extension = extname(file);
        return new Response(request.method === 'HEAD' ? null : new Uint8Array(content), { headers: { ...SECURITY_HEADERS, 'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream', 'Content-Length': String(content.length), 'Cache-Control': extension === '.html' ? 'no-cache' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' } });
      } catch (error) {
        if (error instanceof InputError) return reply(invalidInput(error.message));
        console.error(JSON.stringify({ event: 'http_request_failed', error: error instanceof Error ? error.name : 'UnknownError' }));
        return json({ ok: false, code: 'STORAGE_UNAVAILABLE', message: 'The request could not be completed. Try again.' } satisfies Failure, 503);
      }
    },
  });
  let closed = false;
  return { port: server.port, rooms, async close(): Promise<void> { if (closed) return; closed = true; await server.stop(); await rooms.close(); await options.store.close(); } };
}

export async function configuredStore(): Promise<RoomStore> {
  const uri = process.env.MONGO_URI;
  if (uri) return MongoRoomStore.connect(uri, process.env.MONGO_DB ?? 'deshi_tycoon');
  if (process.env.ALLOW_MEMORY_STORAGE === 'true' && process.env.NODE_ENV !== 'production') return new MemoryRoomStore();
  throw new Error('MONGO_URI is required. Set ALLOW_MEMORY_STORAGE=true only for temporary local development.');
}

if (import.meta.main) {
  try {
    const port = Number(process.env.PORT ?? 3001);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
    const store = await configuredStore();
    const app = await createApp({ store, port });
    process.stdout.write(`${JSON.stringify({ event: 'server_ready', port: app.port, storage: store.mode })}\n`);
    const stop = () => { void app.close().then(() => process.exit(0)); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch (error) {
    console.error(JSON.stringify({ event: 'server_start_failed', error: error instanceof Error ? error.name : 'UnknownError', message: 'Check database connectivity and server configuration.' }));
    process.exitCode = 1;
  }
}
