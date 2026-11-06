import { describe, expect, test } from 'bun:test';
import { turnSecondsRemaining } from './TurnCountdown';

describe('turn countdown', () => {
  const timer = { playerId: 'player', expiresAt: 1_730_000_030_000, durationMs: 30_000 };

  test('uses the server timestamp and elapsed time, independent of the client clock', () => {
    expect(turnSecondsRemaining({ timer, serverTime: timer.expiresAt - 30_000, elapsedMs: 12_400 })).toBe(18);
    expect(turnSecondsRemaining({ timer, serverTime: timer.expiresAt - 9_000, elapsedMs: 0 })).toBe(9);
  });

  test('catches up after a delayed tick and stays at zero after expiry', () => {
    expect(turnSecondsRemaining({ timer, serverTime: timer.expiresAt - 30_000, elapsedMs: 29_001 })).toBe(1);
    expect(turnSecondsRemaining({ timer, serverTime: timer.expiresAt - 30_000, elapsedMs: 30_000 })).toBe(0);
    expect(turnSecondsRemaining({ timer, serverTime: timer.expiresAt - 30_000, elapsedMs: 42_000 })).toBe(0);
    expect(turnSecondsRemaining({ timer, serverTime: timer.expiresAt + 5_000, elapsedMs: 0 })).toBe(0);
  });

  test('never displays more than the authoritative turn duration', () => {
    expect(turnSecondsRemaining({ timer, serverTime: timer.expiresAt - 45_000, elapsedMs: 0 })).toBe(30);
  });
});
