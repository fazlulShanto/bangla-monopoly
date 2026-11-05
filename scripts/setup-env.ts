import { randomBytes } from 'node:crypto';
import { readFile, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const path = resolve(import.meta.dir, '../.env');
let existing = '';
try { existing = await readFile(path, 'utf8'); } catch (error) {
  if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
}
const defaults: Record<string, string> = {
  SOKETI_APP_ID: 'deshi-tycoon',
  SOKETI_APP_KEY: randomBytes(16).toString('hex'),
  SOKETI_APP_SECRET: randomBytes(32).toString('hex'),
};
const missing = Object.entries(defaults).filter(([key]) => !new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`, 'm').test(existing));
if (missing.length) await appendFile(path, `${existing.endsWith('\n') || existing.length === 0 ? '' : '\n'}${missing.map(([key, value]) => `${key}=${value}`).join('\n')}\n`, { mode: 0o600 });
process.stdout.write(missing.length ? `Added ${missing.map(([key]) => key).join(', ')} to .env. Values are private.\n` : 'Soketi app credentials are already configured.\n');
