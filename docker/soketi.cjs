const { writeFileSync } = require('node:fs');

try {
  const required = ['REDIS_URI', 'SOKETI_APP_ID', 'SOKETI_APP_KEY', 'SOKETI_APP_SECRET'];
  for (const key of required) if (!process.env[key]) throw new Error(`${key} is required`);
  const uri = new URL(process.env.REDIS_URI);
  if (!['redis:', 'rediss:'].includes(uri.protocol)) throw new Error('REDIS_URI must use redis or rediss');
  const database = uri.pathname.slice(1);
  if (database && !/^\d+$/.test(database)) throw new Error('Redis database must be an integer');
  const redis = {
    host: uri.hostname,
    port: Number(uri.port || 6379),
    username: uri.username ? decodeURIComponent(uri.username) : undefined,
    password: uri.password ? decodeURIComponent(uri.password) : undefined,
    db: Number(database || 0),
    ...(uri.protocol === 'rediss:' ? { tls: { servername: uri.hostname } } : {}),
    maxRetriesPerRequest: 3,
    connectTimeout: 10000,
  };
  const config = {
    debug: false,
    'adapter.driver': 'redis',
    'adapter.redis.prefix': 'deshi-tycoon',
    'adapter.redis.redisPubOptions': redis,
    'adapter.redis.redisSubOptions': redis,
    'appManager.array.apps.0.id': process.env.SOKETI_APP_ID,
    'appManager.array.apps.0.key': process.env.SOKETI_APP_KEY,
    'appManager.array.apps.0.secret': process.env.SOKETI_APP_SECRET,
    'appManager.array.apps.0.enableClientMessages': false,
    'eventLimits.maxPayloadInKb': 32,
    'httpApi.requestLimitInMb': 1,
  };
  const configPath = '/tmp/deshi-soketi.json';
  writeFileSync(configPath, JSON.stringify(config), { mode: 0o600 });
  process.argv = [process.execPath, '/app/bin/server.js', 'start', '--config', configPath];
  require('/app/bin/server.js');
} catch {
  process.stderr.write('Soketi configuration failed. Check REDIS_URI and the Soketi app credentials.\n');
  process.exitCode = 1;
}
