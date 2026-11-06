import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import type { TurnTimer } from '@deshi/game';
import './turn-countdown.css';

type CountdownProps = { timer: TurnTimer; serverTime: number };

export function turnSecondsRemaining({ timer, serverTime, elapsedMs }: CountdownProps & { elapsedMs: number }) {
  const remainingMs = Math.min(timer.durationMs, timer.expiresAt - serverTime) - elapsedMs;
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function RunningCountdown({ timer, serverTime }: CountdownProps) {
  const [receivedAt] = useState(() => performance.now());
  const [seconds, setSeconds] = useState(() => turnSecondsRemaining({ timer, serverTime, elapsedMs: 0 }));

  useEffect(() => {
    if (timer.expiresAt <= serverTime) return;
    const update = () => {
      const remaining = turnSecondsRemaining({ timer, serverTime, elapsedMs: performance.now() - receivedAt });
      setSeconds(remaining);
      if (remaining === 0) window.clearInterval(interval);
    };
    const interval = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
    };
  }, [timer, serverTime, receivedAt]);

  return <span className={`turn-countdown${seconds <= 5 ? ' is-urgent' : ''}`} role="timer" aria-live="off"
    aria-label={seconds === 0 ? 'Turn time expired. Waiting for server.' : `Turn time remaining: ${seconds} ${seconds === 1 ? 'second' : 'seconds'}.`}
    title="The server finishes the turn when time runs out.">
    <Timer size={14} aria-hidden="true" />
    <span className="turn-countdown-value">{seconds}s</span>
    {seconds === 0 && <span>Waiting for server</span>}
  </span>;
}

export default function TurnCountdown({ timer, serverTime }: CountdownProps) {
  return <RunningCountdown key={`${timer.playerId}:${timer.expiresAt}:${timer.durationMs}:${serverTime}`} timer={timer} serverTime={serverTime} />;
}
