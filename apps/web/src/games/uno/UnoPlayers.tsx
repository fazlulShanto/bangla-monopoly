import { Bot, Crown, Layers, LockKeyhole } from 'lucide-react';
import type { RoomView, UnoGameView } from '@deshi/game';
import { TokenAvatar } from '../../ui';

export default function UnoPlayers({ room, game, playerId }: {
  room: RoomView; game: UnoGameView; playerId: string;
}) {
  const turnPlayerId = game.status === 'playing' ? game.turnPlayerId : null;
  return <aside className="uno-players">
    <div className="uno-section-title"><h2>Players</h2><span>{game.players.filter((player) => player.status === 'active').length} / 6</span></div>
    <ul className="uno-player-list">{room.seats.map((seat) => {
      const player = game.players.find((item) => item.id === seat.id);
      const current = turnPlayerId === seat.id;
      return <li className={`uno-player${current ? ' is-current' : ''}${player?.status === 'out' ? ' is-out' : ''}`} key={seat.id}>
        <span className="uno-player-avatar"><TokenAvatar token={seat.token} />{current && <i />}</span>
        <div className="uno-player-info"><strong title={seat.name}>{seat.name}{seat.id === playerId && <small>you</small>}</strong><span>{player?.status === 'out' ? 'Left the round' : !seat.connected && seat.kind === 'human' ? 'Reconnecting…' : current ? 'Playing now' : seat.kind === 'bot' ? <><Bot size={12} />Bot</> : seat.id === room.hostId ? <><Crown size={12} />Host</> : 'At the table'}</span></div>
        <span className={`uno-player-cards${player?.uno ? ' is-uno' : ''}`} aria-label={`${player?.cardCount ?? 0} cards`}>{player?.uno ? 'UNO' : <><Layers size={13} />{player?.cardCount ?? 0}</>}</span>
      </li>;
    })}</ul>
    <p className="uno-private-note"><LockKeyhole size={13} />Only you can see your hand.</p>
    <div className="uno-sidebar-activity"><h2>Recent moves</h2><ol>{game.log.slice(-4).reverse().map((entry, index) => <li key={entry.id} className={index === 0 ? 'is-latest' : ''}><i /><p>{entry.text}</p></li>)}</ol></div>
  </aside>;
}
