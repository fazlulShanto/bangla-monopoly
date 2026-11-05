import { Bot, Check, Crown, DoorOpen, Plus, UserRound, UsersRound, X } from 'lucide-react';
import { STARTING_CASH, type RoomView } from '@deshi/game';
import { money, TokenIcon } from './ui';

export default function Players({ room, playerId, disabled, onRemoveBot }: {
  room: RoomView | null; playerId: string | null; disabled: boolean; onRemoveBot: (id: string) => void;
}) {
  const seats = room?.seats ?? [];
  const isHost = room?.hostId === playerId;
  const activeTurn = room?.game?.status === 'playing' ? room.game.turn.playerId : null;
  return <aside className="players-panel" aria-label="Room players"><div className="panel-label"><h2>Players</h2><span className="seat-count"><UsersRound size={13} />{seats.length}<span>/ 6</span></span></div>
    {!room && <div className="empty-table"><div className="empty-table-art" aria-hidden="true"><span><UserRound size={18} /></span><span><UsersRound size={31} /></span><span><Plus size={17} /></span></div><h3>Bring your people.</h3><p>Good company.<br />Questionable deals.</p></div>}
    <div className="players-list">{seats.map((seat) => {
      const player = room?.game?.players.find((item) => item.id === seat.id);
      const isCurrent = seat.id === activeTurn;
      return <div key={seat.id} className={`player-row ${isCurrent ? 'player-row--current' : ''} ${player?.status === 'bankrupt' ? 'player-row--bankrupt' : ''}`}>
        <span className="player-avatar" style={{ color: seat.color, backgroundColor: `${seat.color}18` }}><TokenIcon token={seat.token} size={21} /><i className={seat.connected || seat.kind === 'bot' ? 'connected' : ''} /></span>
        <div className="player-info"><strong><span>{seat.name}</span>{seat.id === playerId && <small>you</small>}</strong><span>{player ? player.status === 'bankrupt' ? 'Bankrupt' : <>{money(player.cash)}{player.jail && <span className="jail-label">In jail</span>}</> : seat.kind === 'bot' ? <><Bot size={10} /> Bot ready</> : seat.ready ? <><Check size={11} /> Ready to play</> : seat.connected ? 'Getting ready…' : 'Reconnecting…'}</span>{isCurrent && <span className="player-turn-indicator">Current turn</span>}</div>
        <span className="player-row-end">{seat.id === room?.hostId && <Crown size={13} aria-label="Room host" />}{isHost && !room?.game && seat.kind === 'bot' && <button className="tiny-button" onClick={() => onRemoveBot(seat.id)} disabled={disabled} aria-label={`Remove ${seat.name}`}><X size={13} /></button>}</span>
      </div>;
    })}{!room?.game && Array.from({ length: 6 - seats.length }, (_, index) => <div className="open-seat" key={`open-${index}`}><span className="open-seat-avatar"><Plus size={15} /></span><span>Open seat</span><span className="open-seat-number">{seats.length + index + 1}</span></div>)}</div>
    <div className="rail-note">{room?.game ? <><span className="rail-note-icon"><DoorOpen size={15} /></span><p>Small moves.<br /><strong>Big possibilities.</strong></p></> : <><span className="starting-cash">৳</span><p>{room ? 'Start with' : 'Default cash'} <strong>{money(room?.startingCash ?? STARTING_CASH)}</strong><br /><span>{room ? 'Dream much bigger.' : 'Choose yours in room setup.'}</span></p></>}</div>
  </aside>;
}
