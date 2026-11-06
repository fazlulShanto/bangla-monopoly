import { Bot, Layers } from 'lucide-react';
import type { RoomView, UnoGameView } from '@deshi/game';
import { TokenAvatar } from '../../ui';
import { UnoCardBack } from './UnoCards';

const seatPositions: Record<number, string[]> = {
  1: ['north'],
  2: ['northwest', 'northeast'],
  3: ['west', 'north', 'east'],
  4: ['west', 'northwest', 'northeast', 'east'],
  5: ['west', 'northwest', 'north', 'northeast', 'east'],
};

export default function UnoPlayers({ room, game, playerId }: {
  room: RoomView; game: UnoGameView; playerId: string;
}) {
  const myIndex = room.seats.findIndex((seat) => seat.id === playerId);
  const opponents = [...room.seats.slice(myIndex + 1), ...room.seats.slice(0, Math.max(0, myIndex))];
  const positions = seatPositions[opponents.length] ?? [];
  return <ul className="uno-table-seats" aria-label="Opponents, in clockwise order">
    {opponents.map((seat, index) => {
      const player = game.players.find((item) => item.id === seat.id);
      const current = game.status === 'playing' && game.turnPlayerId === seat.id;
      const count = player?.cardCount ?? 0;
      const out = player?.status === 'out';
      return <li key={seat.id} data-seat={positions[index]} data-player-id={seat.id} className={`uno-table-player${current ? ' is-current' : ''}${out ? ' is-out' : ''}`} aria-current={current ? 'true' : undefined}>
        <div className="uno-opponent-hand" aria-hidden="true">
          {Array.from({ length: Math.min(count, 7) }, (_, cardIndex) => <span className="uno-hidden-card" key={cardIndex}><UnoCardBack /></span>)}
        </div>
        <div className="uno-opponent-label">
          <span className="uno-player-avatar"><TokenAvatar token={seat.token} /></span>
          <div className="uno-player-info"><strong title={seat.name}>{seat.name}</strong><span>{out ? 'Left the round' : !seat.connected && seat.kind === 'human' ? 'Reconnecting…' : current ? 'Playing now' : seat.kind === 'bot' ? <><Bot size={12} />Bot</> : 'At the table'}</span></div>
          <span className={`uno-player-cards${player?.uno ? ' is-uno' : ''}`} aria-label={`${count} cards`}>{player?.uno ? 'UNO!' : <><Layers size={13} />{count}</>}</span>
        </div>
      </li>;
    })}
  </ul>;
}
