import { BOARD, type RoomView } from '@deshi/game';
import { diceSnapshot } from './dicePresentation';

export type GameSound = 'roll' | 'turn' | 'purchase' | 'build' | 'hotel' | 'gain' | 'pay' | 'jail' | 'bankrupt' | 'win' | 'lose';
type SoundSession = { view: RoomView; playerId: string };
type SoundUpdate = { session: SoundSession | null; enabled: boolean; online: boolean; visible: boolean; now: number };
const SOUND_COOLDOWN_MS = 1200;

export function gameSound(previous: RoomView, next: RoomView, playerId: string): GameSound | null {
  if (previous.code !== next.code || next.revision <= previous.revision) return null;
  const before = previous.game;
  const after = next.game;
  if (!before || before.status !== 'playing' || !after) return null;
  const was = before.players.find(player => player.id === playerId);
  const player = after.players.find(candidate => candidate.id === playerId);
  if (!was || was.status !== 'active' || !player) return null;

  if (after.status === 'finished') return after.winnerId === playerId ? 'win' : 'lose';
  if (player.status === 'bankrupt') return 'bankrupt';
  if (!was.jail && player.jail) return 'jail';

  let purchased = false;
  let built = false;
  for (const tile of BOARD) {
    const oldDeed = before.deeds[tile.id];
    const deed = after.deeds[tile.id];
    if (deed?.ownerId !== playerId) continue;
    if (oldDeed?.ownerId == null) purchased = true;
    if (oldDeed?.ownerId === playerId && deed.level > oldDeed.level) {
      if (deed.level === 5) return 'hotel';
      built = true;
    }
  }
  if (built) return 'build';
  if (purchased) return 'purchase';
  if (player.cash > was.cash) return 'gain';
  if (player.cash < was.cash) return 'pay';
  if (after.turn.playerId === playerId && before.turn.playerId !== playerId) return 'turn';
  const roll = diceSnapshot(next);
  if (after.lastRoll?.playerId === playerId && roll.event !== null && roll.event !== diceSnapshot(previous).event) return 'roll';
  return null;
}

export class GameSoundTracker {
  private previous: SoundSession | null = null;
  private lastPlayedAt = -Infinity;

  reset(): void { this.previous = null; }

  observe({ session, enabled, online, visible, now }: SoundUpdate): GameSound | null {
    if (!session || !enabled || !online || !visible) {
      this.reset();
      return null;
    }
    const before = this.previous;
    if (!before || before.view.code !== session.view.code || before.playerId !== session.playerId) {
      this.previous = session;
      this.lastPlayedAt = -Infinity;
      return null;
    }
    if (session.view.revision <= before.view.revision) return null;
    this.previous = session;
    const sound = gameSound(before.view, session.view, session.playerId);
    if (!sound) return null;
    const ending = sound === 'bankrupt' || sound === 'win' || sound === 'lose';
    if (!ending && now - this.lastPlayedAt < SOUND_COOLDOWN_MS) return null;
    this.lastPlayedAt = now;
    return sound;
  }
}
