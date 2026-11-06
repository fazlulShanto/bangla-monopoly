import { describe, expect, test } from 'bun:test';
import { isTycoonPage, isUnoPage } from './navigation';

describe('game navigation', () => {
  test('opens the game catalogue at the home address', () => {
    expect(isTycoonPage(new URL('https://example.test/'))).toBe(false);
  });

  test('opens Deshi Tycoon from its own address or an existing invite', () => {
    expect(isTycoonPage(new URL('https://example.test/games/deshi-tycoon'))).toBe(true);
    expect(isTycoonPage(new URL('https://example.test/games/deshi-tycoon/'))).toBe(true);
    expect(isTycoonPage(new URL('https://example.test/games/deshi-tycoon?room=ABC123'))).toBe(true);
    expect(isTycoonPage(new URL('https://example.test/?room=ABC123'))).toBe(true);
  });

  test('does not treat another game’s invite as a Deshi Tycoon invite', () => {
    expect(isTycoonPage(new URL('https://example.test/games/another-game?room=ABC123'))).toBe(false);
  });

  test('opens UNO from its own address and keeps invites separate', () => {
    expect(isUnoPage(new URL('https://example.test/games/uno'))).toBe(true);
    expect(isUnoPage(new URL('https://example.test/games/uno/?room=ABCDEF'))).toBe(true);
    expect(isTycoonPage(new URL('https://example.test/games/uno?room=ABCDEF'))).toBe(false);
    expect(isUnoPage(new URL('https://example.test/?room=ABCDEF'))).toBe(false);
    expect(isUnoPage(new URL('https://example.test/games/deshi-tycoon'))).toBe(false);
  });
});
