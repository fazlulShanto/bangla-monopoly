import { expect, test } from 'bun:test';
import { configuredRealtime } from './realtime';

test('an external Soketi origin receives server API requests and is returned as public configuration', async () => {
  const calls: Array<{ method: string; path: string }> = [];
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    fetch(request) {
      calls.push({ method: request.method, path: new URL(request.url).pathname });
      return Response.json({});
    },
  });
  const names = ['SOKETI_APP_ID', 'SOKETI_APP_KEY', 'SOKETI_APP_SECRET', 'SOKETI_PUBLIC_URL', 'NODE_ENV'] as const;
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    Object.assign(process.env, {
      SOKETI_APP_ID: 'test-app', SOKETI_APP_KEY: 'test-key', SOKETI_APP_SECRET: 'test-secret',
      SOKETI_PUBLIC_URL: `http://127.0.0.1:${server.port}`, NODE_ENV: 'test',
    });
    const realtime = configuredRealtime();
    expect(realtime.url).toBe(`http://127.0.0.1:${server.port}`);
    expect(await realtime.ping()).toBe(true);
    await realtime.publish(['private-test'], { event: 'room:updated', data: { revision: 1 } });
    expect(calls).toEqual([
      { method: 'GET', path: '/apps/test-app/channels' },
      { method: 'POST', path: '/apps/test-app/events' },
    ]);

    process.env.SOKETI_PUBLIC_URL = 'https://user:password@example.com';
    expect(() => configuredRealtime()).toThrow('without credentials or a path');
    process.env.SOKETI_PUBLIC_URL = 'http://example.com';
    process.env.NODE_ENV = 'production';
    expect(() => configuredRealtime()).toThrow('must use HTTPS in production');
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    server.stop();
  }
});
