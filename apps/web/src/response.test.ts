import { describe, expect, test } from 'bun:test';
import type { Failure } from '@deshi/game';
import { GameConnectionError, readReply } from './response';

describe('game HTTP replies', () => {
  test.each([
    ['empty gateway reply', () => new Response(null, { status: 502 })],
    ['truncated successful reply', () => new Response('{', { status: 200 })],
    ['HTML gateway reply', () => new Response('<html>Bad Gateway</html>', { status: 502 })],
    ['failed network response', () => Response.error()],
  ])('%s explains recovery without a raw JSON error', async (_name, response) => {
    const reply = readReply(response());
    await expect(reply).rejects.toBeInstanceOf(GameConnectionError);
    await expect(reply).rejects.toThrow('Could not reach the game server. Your saved seat is safe. We will keep trying.');
  });

  test.each([
    [401, 'INVALID_SESSION'],
    [409, 'RULE'],
    [500, 'INTERNAL'],
  ])('preserves a valid %i failure for the room controller', async (status, code) => {
    const failure: Failure = { ok: false, code, message: 'The server explains this rejection.' };
    expect(await readReply<Failure>(Response.json(failure, { status }))).toEqual(failure);
  });

  test('returns a successful reply unchanged', async () => {
    const reply = { ok: true, playerId: 'player-one', chat: [] };
    expect(await readReply(Response.json(reply))).toEqual(reply);
  });
});
