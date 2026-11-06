import Pusher from 'pusher';
import type { RoomPublisher } from './rooms';

export interface RealtimeGateway extends RoomPublisher {
  readonly key: string;
  readonly url?: string;
  authorize(socketId: string, channel: string): { auth: string };
  ping(): Promise<boolean>;
}

export function configuredRealtime(): RealtimeGateway {
  const appId = process.env.SOKETI_APP_ID;
  const key = process.env.SOKETI_APP_KEY;
  const secret = process.env.SOKETI_APP_SECRET;
  if (!appId || !key || !secret) throw new Error('SOKETI_APP_ID, SOKETI_APP_KEY and SOKETI_APP_SECRET are required.');
  let url: URL | undefined;
  if (process.env.SOKETI_PUBLIC_URL) {
    try { url = new URL(process.env.SOKETI_PUBLIC_URL); } catch { throw new Error('SOKETI_PUBLIC_URL must be an HTTP or HTTPS origin.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
      throw new Error('SOKETI_PUBLIC_URL must be an HTTP or HTTPS origin without credentials or a path.');
    }
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') throw new Error('SOKETI_PUBLIC_URL must use HTTPS in production.');
  }
  const port = Number(url ? (url.port || (url.protocol === 'https:' ? 443 : 80)) : (process.env.SOKETI_PORT ?? 6001));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SOKETI_PORT must be between 1 and 65535.');
  const pusher = new Pusher({ appId, key, secret, host: url?.hostname ?? process.env.SOKETI_HOST ?? '127.0.0.1', port: String(port), useTLS: url?.protocol === 'https:', timeout: 2000 });
  return {
    key,
    ...(url ? { url: url.origin } : {}),
    async publish(channels, message) { await pusher.trigger(channels, message.event, message.data); },
    authorize(socketId, channel) { return pusher.authorizeChannel(socketId, channel); },
    async ping() { try { return (await pusher.get({ path: '/channels' })).ok; } catch { return false; } },
  };
}
