import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from './index';
import { MemoryRoomStore } from './store';
import { GAME_CONFIG, type EnterReply, type Failure } from '@deshi/game';

test('HTTP validates private channel ownership, errors, safe configuration, and health', async () => {
  const app = await createApp({ store: new MemoryRoomStore(), port: 0, host: '127.0.0.1', realtime: {
    key: 'test-public-key', async publish() {}, authorize(socketId, channel) { return { auth: `${socketId}:${channel}` }; }, async ping() { return true; },
  } });
  const url = `http://127.0.0.1:${app.port}`;
  try {
    const config = await fetch(`${url}/api/realtime`).then(response => response.json());
    expect(config).toEqual({ key: 'test-public-key' });
    const created: EnterReply = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'friends', name: 'Asha', token: 'rickshaw', requestId: randomUUID(), resumeToken: randomBytes(32).toString('base64url') }) }).then(response => response.json());
    if (!created.ok) throw new Error(created.message);
    const headers = { Authorization: `Bearer ${created.resumeToken}`, 'X-Connection-Id': created.connectionId, 'Content-Type': 'application/x-www-form-urlencoded' };
    const allowed = await fetch(`${url}/api/pusher/auth`, { method: 'POST', headers, body: new URLSearchParams({ socket_id: '123.456', channel_name: created.channel }) });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ auth: `123.456:${created.channel}` });
    const forbidden = await fetch(`${url}/api/pusher/auth`, { method: 'POST', headers, body: new URLSearchParams({ socket_id: '123.456', channel_name: `${created.channel}-other` }) });
    expect(forbidden.status).toBe(403);
    const unauthenticated = await fetch(`${url}/api/session`);
    expect(unauthenticated.status).toBe(401);
    const invalid: Failure = await unauthenticated.json();
    expect(invalid.code).toBe('INVALID_SESSION');
    const malformed = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect(malformed.status).toBe(400);
    const tooLarge = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'x'.repeat(17_000) }) });
    expect(tooLarge.status).toBe(413);
    const wrongOrigin = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { Origin: 'https://other.example', 'Content-Type': 'application/json' }, body: '{}' });
    expect(wrongOrigin.status).toBe(403);
    const health = await fetch(`${url}/api/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok', storage: 'memory', persistent: false, realtime: 'ok' });
  } finally { await app.close(); }
});

test('HTTP validates starting cash for room creation and host changes', async () => {
  const app = await createApp({ store: new MemoryRoomStore(), port: 0, host: '127.0.0.1', realtime: {
    key: 'test-public-key', async publish() {}, authorize() { return { auth: 'test' }; }, async ping() { return true; },
  } });
  const url = `http://127.0.0.1:${app.port}`;
  const input = { kind: 'friends', name: 'Asha', token: 'rickshaw', requestId: randomUUID(), resumeToken: randomBytes(32).toString('base64url') };
  const invalid = [GAME_CONFIG.startingCash.min - 1, GAME_CONFIG.startingCash.max + 1, 1500.5, '3000', null];
  try {
    for (const startingCash of invalid) {
      const response = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, startingCash }) });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    }
    const created: EnterReply = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, startingCash: GAME_CONFIG.startingCash.min }) }).then(response => response.json());
    if (!created.ok) throw new Error(created.message);
    expect(created.view.startingCash).toBe(GAME_CONFIG.startingCash.min);
    const headers = { Authorization: `Bearer ${created.resumeToken}`, 'X-Connection-Id': created.connectionId, 'Content-Type': 'application/json' };
    for (const startingCash of invalid) {
      const response = await fetch(`${url}/api/commands`, { method: 'POST', headers, body: JSON.stringify({ requestId: randomUUID(), expectedRevision: created.view.revision, command: { type: 'setStartingCash', startingCash } }) });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ ok: false, code: 'INVALID_INPUT' });
    }
    const response = await fetch(`${url}/api/commands`, { method: 'POST', headers, body: JSON.stringify({ requestId: randomUUID(), expectedRevision: created.view.revision, command: { type: 'setStartingCash', startingCash: GAME_CONFIG.startingCash.max } }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, view: { startingCash: GAME_CONFIG.startingCash.max } });
  } finally { await app.close(); }
});
