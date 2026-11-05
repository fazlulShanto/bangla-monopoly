import Pusher from 'pusher';
import type { RoomPublisher } from './rooms';

export interface RealtimeGateway extends RoomPublisher {
  readonly key: string;
  authorize(socketId: string, channel: string): { auth: string };
  ping(): Promise<boolean>;
}

export function configuredRealtime(): RealtimeGateway {
  const appId = process.env.SOKETI_APP_ID;
  const key = process.env.SOKETI_APP_KEY;
  const secret = process.env.SOKETI_APP_SECRET;
  if (!appId || !key || !secret) throw new Error('SOKETI_APP_ID, SOKETI_APP_KEY and SOKETI_APP_SECRET are required.');
  const port = Number(process.env.SOKETI_PORT ?? 6001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SOKETI_PORT must be between 1 and 65535.');
  const pusher = new Pusher({ appId, key, secret, host: process.env.SOKETI_HOST ?? '127.0.0.1', port: String(port), useTLS: false, timeout: 2000 });
  return {
    key,
    async publish(channels, message) { await pusher.trigger(channels, message.event, message.data); },
    authorize(socketId, channel) { return pusher.authorizeChannel(socketId, channel); },
    async ping() { try { return (await pusher.get({ path: '/channels' })).ok; } catch { return false; } },
  };
}
