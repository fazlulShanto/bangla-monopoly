import { useEffect, useRef } from 'react';
import { GameAudio } from './gameAudio';
import { GameSoundTracker } from './gameSound';
import type { useRoom } from './useRoom';

type RoomClient = ReturnType<typeof useRoom>;

export function useGameSounds({ session, connection, enabled }: Pick<RoomClient, 'session' | 'connection'> & { enabled: boolean }): () => void {
  const audio = useRef<GameAudio | null>(null);
  const tracker = useRef<GameSoundTracker | null>(null);
  audio.current ??= new GameAudio();
  tracker.current ??= new GameSoundTracker();

  useEffect(() => {
    const player = audio.current;
    const events = tracker.current;
    if (!player || !events) return;
    const unlock = () => {
      if (document.visibilityState === 'visible') player.unlock();
    };
    const visibilityChanged = () => { events.reset(); player.stop(); };
    document.addEventListener('visibilitychange', visibilityChanged);
    if (enabled) {
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);
    }
    return () => {
      document.removeEventListener('visibilitychange', visibilityChanged);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      player.stop();
    };
  }, [enabled]);

  useEffect(() => {
    const visible = document.visibilityState === 'visible';
    const online = connection === 'online';
    const sound = tracker.current?.observe({ session, enabled, online, visible, now: performance.now() });
    if (!enabled || !online || !visible || !session) audio.current?.stop();
    else if (sound) audio.current?.play(sound);
  }, [session, connection, enabled]);

  useEffect(() => () => { audio.current?.close(); tracker.current?.reset(); }, []);
  return () => { audio.current?.unlock(); };
}
