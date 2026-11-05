import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeftRight, ArrowRight, ArrowUpRight, Bot, Building2, Check, Copy, House, MessageCircle, Radio, Send, Trophy } from 'lucide-react';
import { BOARD, type Tile } from '@deshi/game';
import type { useRoom } from './useRoom';
import { money, Spinner, TileIcon } from './ui';
import ActivityText from './ActivityText';
import { TradeDialog, TradesPanel, type TradeDialogState } from './Trades';

type RoomClient = ReturnType<typeof useRoom>;

export default function GamePanel({ client, copied, onCopy, onSelect, onLeave }: {
  client: RoomClient; copied: boolean; onCopy: () => void; onSelect: (tile: Tile) => void; onLeave: () => void;
}) {
  const [tab, setTab] = useState<'activity' | 'chat' | 'portfolio' | 'trades'>('activity');
  const [tradeDialog, setTradeDialog] = useState<TradeDialogState | null>(null);
  const [message, setMessage] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  const { session, pending, connection } = client;
  const disabled = !!pending || connection !== 'online';
  useEffect(() => { if (tab === 'chat') chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [session?.chat.length, tab]);
  if (!session?.view.game) return null;
  const { view: room, playerId, chat } = session;
  const game = session.view.game;
  const myPlayer = game.players.find((player) => player.id === playerId);
  const properties = BOARD.filter((tile) => game.deeds[tile.id]?.ownerId === playerId);
  const canResign = game.legalActions.some((action) => action.type === 'resign');
  const turnSeat = game.status === 'playing' ? room.seats.find((seat) => seat.id === game.turn.playerId) : null;
  const playerNames = room.seats.map((seat) => seat.name);
  const myTrades = game.trades.filter((offer) => offer.fromPlayerId === playerId || offer.toPlayerId === playerId);
  const incomingTrades = myTrades.filter((offer) => offer.toPlayerId === playerId);
  const firstIncoming = incomingTrades[0];
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    const text = message.trim();
    if (await client.sendChat(text)) setMessage('');
  }
  return <aside className="room-panel game-panel"><div className="active-room-header"><div><span>{room.kind === 'practice' ? <Bot size={13} /> : <Radio size={13} />}{room.kind === 'practice' ? 'PRACTICE TABLE' : 'YOUR PRIVATE TABLE'}</span><h2>Room {room.code}</h2></div><button className="icon-button" onClick={onCopy} aria-label="Copy invite link">{copied ? <Check size={17} /> : <Copy size={16} />}</button></div>
    <div className="match-status">{game.status === 'finished' ? <Trophy size={17} /> : <span className="match-status-dot" style={{ backgroundColor: turnSeat?.color }} />}<div><strong>{game.status === 'finished' ? 'An empire is crowned.' : turnSeat?.id === playerId ? 'Your turn to dream big.' : `${turnSeat?.name ?? 'Your friend'} is making moves.`}</strong><span>{game.status === 'finished' ? 'Thanks for a great game.' : `Turn ${game.turnNumber} · ${game.players.filter((player) => player.status === 'active').length} tycoons in the running`}</span></div></div>
    {firstIncoming && <div className="incoming-trade-notice" role="status"><ArrowLeftRight size={17} /><div><strong>{incomingTrades.length === 1 ? `${room.seats.find((seat) => seat.id === firstIncoming.fromPlayerId)?.name ?? 'A player'} sent an offer` : `${incomingTrades.length} trade offers for you`}</strong><span>Review it whenever you’re ready.</span></div><button type="button" onClick={() => setTradeDialog({ kind: 'review', offer: firstIncoming })}>View<ArrowRight size={14} /></button></div>}
    <div className="segmented-tabs game-tabs" role="tablist" aria-label="Room information">{(['activity', 'chat', 'portfolio', 'trades'] satisfies Array<typeof tab>).map((item) => <button type="button" key={item} role="tab" aria-selected={item === tab} aria-controls={`panel-${item}`} onClick={() => setTab(item)} className={item === tab ? 'active' : ''}>{item === 'activity' ? 'Activity' : item === 'chat' ? 'Chat' : item === 'portfolio' ? 'My empire' : 'Trades'}{item === 'chat' && chat.length > 0 && <span className="tab-count">{chat.length}</span>}{item === 'trades' && myTrades.length > 0 && <span className={`tab-count${incomingTrades.length ? ' tab-count--incoming' : ''}`}>{myTrades.length}</span>}</button>)}</div>
    {tab === 'activity' && <div className="activity-feed" id="panel-activity" role="tabpanel" aria-label="Game activity">{game.log.length ? [...game.log].reverse().map((entry, index) => <div className={`activity-entry ${index === 0 ? 'activity-entry--latest' : ''}`} key={entry.id}><span className="activity-pin" /><p><ActivityText text={entry.text} playerNames={playerNames} /></p>{index === 0 && <span className="activity-new">NOW</span>}</div>) : <div className="panel-empty"><Radio size={26} /><h3>The story starts here.</h3><p>Every roll, new property, and twist<br />will appear at this table.</p></div>}</div>}
    {tab === 'chat' && <div className="chat-panel" id="panel-chat" role="tabpanel" aria-label="Room chat"><div className="chat-messages" role="log" aria-label="Chat messages">{chat.length ? chat.map((entry) => <div className={`chat-message ${entry.playerId === playerId ? 'chat-message--mine' : ''}`} key={entry.id}><div><strong>{entry.playerId === playerId ? 'You' : entry.name}</strong><time dateTime={new Date(entry.sentAt).toISOString()}>{new Date(entry.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{entry.text}</p></div>) : <div className="panel-empty"><MessageCircle size={27} /><h3>A little table talk?</h3><p>Say hello, celebrate a lucky roll,<br />or gently question a friend’s tactics.</p></div>}<div ref={chatEnd} /></div><form className="chat-form" onSubmit={send}><label className="sr-only" htmlFor="chat-message">Message your room</label><input id="chat-message" autoComplete="off" placeholder="A little friendly banter…" maxLength={280} value={message} onChange={(event) => setMessage(event.target.value)} disabled={disabled} /><button aria-label="Send message" type="submit" disabled={disabled || !message.trim()}>{pending === 'chat' ? <Spinner /> : <Send size={16} />}</button></form></div>}
    {tab === 'portfolio' && <div className="portfolio-panel" id="panel-portfolio" role="tabpanel" aria-label="Your properties"><div className="portfolio-summary"><div><span>Cash on hand</span><strong>{money(myPlayer?.cash ?? 0)}</strong></div><Building2 size={28} /></div>{properties.length ? <div className="portfolio-list">{properties.map((tile) => {
      const deed = game.deeds[tile.id];
      const build = game.legalActions.find((action) => action.type === 'build' && action.tile === tile.id);
      return <div className="portfolio-property" key={tile.id}><button className="portfolio-property-main" onClick={() => onSelect(tile)}><span style={{ color: tile.kind === 'street' ? tile.color : '#a5b8d7' }}><TileIcon tile={tile} size={18} /></span><div><strong>{tile.name}</strong><span>{deed && deed.level > 0 ? deed.level === 5 ? 'Hotel' : `${deed.level} ${deed.level === 1 ? 'house' : 'houses'}` : 'price' in tile ? money(tile.price) : 'Your property'}</span></div><ArrowUpRight size={13} /></button>{build?.type === 'build' && tile.kind === 'street' && <button className="build-property-button" disabled={disabled} onClick={() => void client.command({ type: 'play', action: build })}><House size={13} />{deed?.level === 4 ? 'Add hotel' : 'Build house'}<span>{money(tile.buildCost)}</span></button>}</div>;
    })}</div> : <div className="panel-empty"><Building2 size={27} /><h3>Every empire starts somewhere.</h3><p>Your first property is<br />a roll of the dice away.</p></div>}</div>}
    {tab === 'trades' && <TradesPanel game={game} seats={room.seats} playerId={playerId} disabled={disabled} onCreate={() => setTradeDialog({ kind: 'create' })} onReview={(offer) => setTradeDialog({ kind: 'review', offer })} />}
    <div className="game-panel-footer"><span><span className="tiny-dot" />Moves update live</span><button className="text-button" onClick={onLeave} disabled={disabled}>{canResign ? 'Leave game' : 'Leave room'}<ArrowUpRight size={12} /></button></div>
    {tradeDialog && <TradeDialog key={tradeDialog.kind === 'create' ? 'create' : `${tradeDialog.kind}-${tradeDialog.offer.id}`} client={client} state={tradeDialog} onClose={() => setTradeDialog(null)} onCounter={(offer) => setTradeDialog({ kind: 'counter', offer })} />}
  </aside>;
}
