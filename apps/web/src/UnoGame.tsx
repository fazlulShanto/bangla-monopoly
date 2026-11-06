import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  ArrowLeft, ArrowRight, Bot, Check, ChevronRight, CircleHelp, Copy, Crown,
  Layers, Link, LogOut, Plus, RotateCcw, Trophy, UsersRound, Wifi, X,
} from 'lucide-react';
import { TOKENS, type TokenId, type UnoAction, type UnoCard, type UnoColor, type UnoGameView } from '@deshi/game';
import { readPreference, writePreference } from './Lobby';
import { Modal, Spinner, TokenAvatar } from './ui';
import { useRoom } from './useRoom';
import { cardLabel, UnoCardBack, UnoCardFace, UnoShowcase } from './UnoCards';
import './uno.css';

type RoomClient = ReturnType<typeof useRoom>;
const colors: UnoColor[] = ['red', 'yellow', 'green', 'blue'];

function UnoRules({ onClose }: { onClose: () => void }) {
  return <Modal title="One card away from glory." onClose={onClose} className="uno-modal">
    <p className="uno-modal-intro">2–6 players. Seven cards each. First to empty their hand wins the round.</p>
    <div className="uno-rule-list">
      <section><h3>Match it. Play it.</h3><p>Play a card that matches the discard’s color, number, or symbol. Wild cards let you choose the next color.</p></section>
      <section><h3>Change the game.</h3><p>Skip misses the next player. Reverse changes direction; with two players, it acts as a skip. +2 and +4 make the next player draw and miss their turn.</p></section>
      <section><h3>Need a card?</h3><p>Draw one card. If it fits, play that card or pass. Otherwise your turn ends automatically. You may draw even if you have a match.</p></section>
      <section><h3>Don’t forget UNO.</h3><p>With two cards left, turn on “Say UNO” before playing. If you forget, call UNO before another player catches you and makes you draw two.</p></section>
      <section><h3>Our table rules</h3><p>No stacking draw cards. Play a Wild +4 only when you have no card of the current color. There are no Wild +4 challenges. The first discard is a number card. Each game is one round.</p></section>
    </div>
    <button className="uno-button uno-button-primary" onClick={onClose}>Let’s play <ArrowRight size={17} /></button>
  </Modal>;
}

function UnoSetup({ client }: { client: RoomClient }) {
  const inviteCode = new URLSearchParams(window.location.search).get('room') ?? '';
  const [mode, setMode] = useState<'create' | 'join'>(inviteCode ? 'join' : 'create');
  const [name, setName] = useState(() => readPreference('deshi.name', ''));
  const [token, setToken] = useState<TokenId>('tiger');
  const [code, setCode] = useState(inviteCode.toUpperCase());
  const [botCount, setBotCount] = useState(3);
  const form = useRef<HTMLFormElement>(null);
  const disabled = !!client.pending || client.connection !== 'online';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'create') void client.create({ gameType: 'uno', kind: 'friends', name: name.trim(), token });
    else void client.join({ gameType: 'uno', code: code.trim().toUpperCase(), name: name.trim(), token });
  }
  function practice() {
    const input = form.current?.querySelector<HTMLInputElement>('#uno-name');
    if (!name.trim() || !input?.reportValidity()) { input?.focus(); return; }
    void client.create({ gameType: 'uno', kind: 'practice', name: name.trim(), token, botCount });
  }

  return <section className="uno-setup" aria-labelledby="uno-setup-title">
    <h2 id="uno-setup-title">Bring your favorite rivals.</h2><p>Make a private room. Deal everyone in.</p>
    <div className="uno-segment" aria-label="Room action">
      <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Create room</button>
      <button type="button" aria-pressed={mode === 'join'} onClick={() => setMode('join')}>Join room</button>
    </div>
    <form ref={form} onSubmit={submit}>
      <label htmlFor="uno-name">Your name</label>
      <input id="uno-name" placeholder="What should we call you?" autoComplete="nickname" maxLength={24} minLength={1} required value={name} disabled={disabled} onChange={(event) => { setName(event.target.value); writePreference('deshi.name', event.target.value); }} />
      {mode === 'join' && <><label htmlFor="uno-room-code">Room code</label><input id="uno-room-code" className="uno-code-input" placeholder="ABCDEF" autoComplete="off" required minLength={6} maxLength={6} value={code} disabled={disabled} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} /></>}
      <div className="uno-avatar-label"><span>Your avatar</span><span>{TOKENS.find((item) => item.id === token)?.name}</span></div>
      <div className="uno-avatar-picker" role="group" aria-label="Choose your avatar">{TOKENS.map((item) => <button type="button" key={item.id} aria-label={`Choose ${item.name}`} aria-pressed={token === item.id} disabled={disabled} onClick={() => setToken(item.id)}><TokenAvatar token={item.id} /></button>)}</div>
      <button className="uno-button uno-button-primary" disabled={disabled} type="submit">{client.pending === 'create' || client.pending === 'join' ? <><Spinner />Setting your place…</> : <>{mode === 'create' ? 'Create a room' : 'Join the room'}<ArrowRight size={18} /></>}</button>
    </form>
    <div className="uno-practice"><div><Bot size={19} /><span>Just warming up?</span><label className="sr-only" htmlFor="uno-bot-count">Number of bots</label><select id="uno-bot-count" value={botCount} disabled={disabled} onChange={(event) => setBotCount(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'bot' : 'bots'}</option>)}</select></div><button className="uno-button uno-button-secondary" disabled={disabled} onClick={practice}>{client.pending === 'practice' ? <Spinner /> : null}Practice with bots <ChevronRight size={17} /></button></div>
    <p className="uno-setup-footnote">No sign-up. Just a good hand and good company.</p>
  </section>;
}

function UnoWaiting({ client, onCopy, copied }: { client: RoomClient; onCopy: () => void; copied: boolean }) {
  const { session, pending, connection } = client;
  if (!session) return null;
  const { view, playerId } = session;
  const host = view.hostId === playerId;
  const practice = view.kind === 'practice';
  const me = view.seats.find((seat) => seat.id === playerId);
  const ready = view.seats.length >= 2 && view.seats.every((seat) => seat.kind === 'bot' || (seat.ready && seat.connected));
  const disabled = !!pending || connection !== 'online';
  return <section className="uno-waiting">
    <div className="uno-waiting-copy"><h1>{practice ? 'Another hand.' : 'Good company.'}<br /><span>{practice ? 'Another chance.' : 'Questionable alliances.'}</span></h1><p>{practice ? 'Your practice table is ready. Set your bot lineup and deal a fresh round.' : 'Your table is open. Invite your friends and get ready to turn the whole game around.'}</p><UnoShowcase />{!practice && <div className="uno-invite-ticket"><div><span>Room code</span><strong>{view.code}</strong></div><button className="uno-button uno-button-primary" onClick={onCopy}>{copied ? <Check size={17} /> : <Link size={17} />}{copied ? 'Copied!' : 'Copy invite'}</button></div>}</div>
    <div className="uno-waiting-seats"><div className="uno-section-title"><h2>At the table</h2><span>{view.seats.length} / 6 players</span></div>
      <ul>{view.seats.map((seat) => <li key={seat.id}><span className="uno-seat-avatar" style={{ '--seat-color': seat.color } as CSSProperties}><TokenAvatar token={seat.token} /></span><div><strong>{seat.name}{seat.id === playerId && <small>you</small>}</strong><span>{seat.kind === 'bot' ? 'Bot' : !seat.connected ? 'Reconnecting…' : seat.ready ? 'Ready to play' : 'Getting ready'}</span></div>{seat.id === view.hostId ? <Crown size={16} aria-label="Host" /> : seat.ready ? <Check size={17} className="uno-ready-check" /> : null}{host && seat.kind === 'bot' && <button className="uno-icon-button" aria-label={`Remove ${seat.name}`} disabled={disabled} onClick={() => void client.command({ type: 'removeBot', playerId: seat.id })}><X size={16} /></button>}</li>)}
        {Array.from({ length: 6 - view.seats.length }, (_, index) => <li className="uno-empty-seat" key={`empty-${index}`}><span className="uno-empty-avatar"><Plus size={20} /></span><span>{practice ? 'A seat for a bot' : 'A seat for a friend'}</span><small>OPEN</small></li>)}
      </ul>
      <div className="uno-waiting-actions"><button className={`uno-button ${me?.ready ? 'uno-button-secondary' : 'uno-button-primary'}`} disabled={disabled} onClick={() => void client.command({ type: 'ready', ready: !me?.ready })}><Check size={17} />{me?.ready ? 'You’re ready' : 'I’m ready'}</button>{host && <button className="uno-button uno-button-secondary" disabled={disabled || view.seats.length >= 6} onClick={() => void client.command({ type: 'addBot' })}><Bot size={17} />Add bot</button>}</div>
      {host && <button className="uno-button uno-button-primary uno-start" disabled={disabled || !ready} onClick={() => void client.command({ type: 'start' })}>{pending === 'start' ? <Spinner /> : null}Deal the cards <ArrowRight size={18} /></button>}
      <p className="uno-waiting-hint">{!host ? 'Your host will deal when everyone is ready.' : view.seats.length < 2 ? 'Invite a friend or add a bot to start.' : !ready ? 'Waiting for everyone to be ready.' : 'Everyone’s ready. Let the rivalry begin.'}</p>
    </div>
  </section>;
}

function UnoTable({ client, game, onRules }: { client: RoomClient; game: UnoGameView; onRules: () => void }) {
  const [wildCard, setWildCard] = useState<UnoCard | null>(null);
  const [sayUno, setSayUno] = useState(false);
  const { session, pending, connection } = client;
  const turnPlayerId = game.status === 'playing' ? game.turnPlayerId : null;
  useEffect(() => { setWildCard(null); setSayUno(false); }, [turnPlayerId, game.hand.length, game.status]);
  if (!session) return null;
  const { view, playerId } = session;
  const mine = turnPlayerId === playerId;
  const disabled = !!pending || connection !== 'online';
  const opponents = view.seats.filter((seat) => seat.id !== playerId);
  const me = view.seats.find((seat) => seat.id === playerId);
  const current = view.seats.find((seat) => seat.id === turnPlayerId);
  const winner = game.status === 'finished' ? view.seats.find((seat) => seat.id === game.winnerId) : null;
  const catchable = view.seats.find((seat) => seat.id === game.catchablePlayerId && seat.id !== playerId);
  function act(action: UnoAction) { void client.command({ type: 'uno', action }); }
  function play(card: UnoCard) {
    if (card.color === 'wild') setWildCard(card);
    else act({ type: 'play', cardId: card.id, sayUno });
  }
  const statusText = game.status === 'finished' ? `${winner?.name ?? 'A player'} wins the round!` : mine ? game.canPass ? 'Play your new card, or pass.' : 'Your turn. Make it count.' : `${current?.name ?? 'Your friend'}’s turn`;
  return <div className="uno-play-layout">
    <div className="uno-main-table">
      <div className="uno-opponents" style={{ '--opponents': opponents.length } as CSSProperties}>{opponents.map((seat) => {
        const player = game.players.find((item) => item.id === seat.id);
        const active = turnPlayerId === seat.id;
        return <div className={`uno-opponent${active ? ' is-current' : ''}${player?.status === 'out' ? ' is-out' : ''}`} key={seat.id}>
          <div className="uno-opponent-avatar" style={{ '--seat-color': seat.color } as CSSProperties}><TokenAvatar token={seat.token} />{active && <span className="uno-turn-dot" />}</div>
          <strong title={seat.name}>{seat.name}</strong><span className="uno-opponent-count">{player?.status === 'out' ? 'Left the round' : <>{player?.cardCount ?? 0} cards{player?.uno && <b>UNO!</b>}</>}</span>
          <div className="uno-mini-hand" aria-hidden="true">{Array.from({ length: Math.min(player?.cardCount ?? 0, 7) }, (_, index) => <i key={index}><UnoCardBack /></i>)}</div>
          {player?.status === 'active' && !seat.connected && seat.kind === 'human' && <small>Reconnecting…</small>}
        </div>;
      })}</div>
      <section className={`uno-felt${mine ? ' uno-felt-my-turn' : ''}`} aria-label="Card table">
        <div className="uno-table-topline"><span><UsersRound size={14} />{game.players.filter((player) => player.status === 'active').length} at the table</span><span><RotateCcw size={14} className={game.direction === 1 ? 'uno-clockwise' : ''} />{game.direction === 1 ? 'Clockwise' : 'Counterclockwise'}</span></div>
        <div className="uno-piles"><div className="uno-pile"><button className="uno-draw-pile" disabled={disabled || !game.canDraw} onClick={() => act({ type: 'draw' })} aria-label="Draw a card"><UnoCardBack /></button><span>DRAW PILE <small>{game.drawCount} cards</small></span></div><div className="uno-pile"><div className="uno-discard" key={game.topCard.id} role="img" aria-label={`Top card: ${cardLabel(game.topCard)}`}><UnoCardFace card={game.topCard} /></div><span>IN PLAY <small className={`uno-active-color uno-color-${game.currentColor}`}><i />{game.currentColor}</small></span></div></div>
        <div className={`uno-turn-message${mine ? ' is-yours' : ''}`} role="status"><span className="uno-turn-message-dot" /><span>{statusText}</span></div>
        {game.status === 'finished' && <div className="uno-round-result"><Trophy size={34} /><h2>{game.winnerId === playerId ? 'That’s how it’s done.' : 'A hand well played.'}</h2><p>{winner?.name ?? 'The winner'} takes the bragging rights.</p>{view.hostId === playerId ? <button className="uno-button uno-button-primary" disabled={disabled} onClick={() => void client.command({ type: 'rematch' })}><RotateCcw size={17} />Play again</button> : <p>Waiting for the host to start another round.</p>}</div>}
      </section>
      <section className="uno-hand-area" aria-label="Your hand"><div className="uno-hand-toolbar"><div><span className="uno-you-avatar"><TokenAvatar token={me?.token ?? 'tiger'} /></span><div><h2>Your hand <span>{game.hand.length} cards</span></h2><p>{game.status === 'finished' ? 'A rematch is always a good idea.' : mine ? game.canPass ? 'Only the card you just drew can be played.' : game.playableCardIds.length ? 'Pick a highlighted card to play.' : 'No match? Take a card from the draw pile.' : 'Plan your next move.'}</p></div></div><div className="uno-hand-actions">{game.canPass && <button className="uno-button uno-button-secondary" disabled={disabled} onClick={() => act({ type: 'pass' })}>Pass turn <ArrowRight size={16} /></button>}{game.canCallUno ? <button className="uno-call-button" disabled={disabled} onClick={() => act({ type: 'callUno' })}>UNO!</button> : game.status === 'playing' && game.hand.length === 2 && mine ? <button className={`uno-call-button${sayUno ? ' is-armed' : ''}`} aria-pressed={sayUno} disabled={disabled} onClick={() => setSayUno(!sayUno)}>{sayUno && <Check size={16} />}Say UNO</button> : null}{catchable && <button className="uno-button uno-button-secondary" disabled={disabled} onClick={() => act({ type: 'catchUno', playerId: catchable.id })}>Catch {catchable.name}!</button>}</div></div>
        <div className={`uno-hand${game.hand.length > 12 ? ' uno-hand-many' : ''}`} style={{ '--hand-size': game.hand.length } as CSSProperties}>{game.hand.map((card, index) => {
          const playable = game.playableCardIds.includes(card.id);
          return <button key={card.id} className={`uno-hand-card${playable ? ' is-playable' : ''}`} style={{ '--card-index': index, '--card-angle': `${Math.max(-13, Math.min(13, (index - (game.hand.length - 1) / 2) * 3))}deg`, '--card-lift': `${Math.abs(index - (game.hand.length - 1) / 2) * 3}px` } as CSSProperties} disabled={disabled || !playable} aria-label={`Play ${cardLabel(card)}`} title={cardLabel(card)} onClick={() => play(card)}><UnoCardFace card={card} /></button>;
        })}</div>
      </section>
    </div>
    <aside className="uno-match-rail"><div className="uno-round-label"><Layers size={17} /><span>Single round</span><strong>UNO</strong></div><div className="uno-section-title"><h2>The play-by-play</h2><span>Turn {game.turnNumber}</span></div><ol className="uno-activity">{game.log.slice(-7).reverse().map((entry, index) => <li key={entry.id} className={index === 0 ? 'is-latest' : ''}><span /><p>{entry.text}</p></li>)}</ol><div className="uno-table-tip"><h3>A little reminder</h3><p>{game.hand.length <= 2 ? 'One card left? Call UNO before someone catches you.' : 'Match the color or the symbol. Save a wild card for a rainy turn.'}</p><button onClick={onRules}>The table rules <ArrowRight size={14} /></button></div></aside>
    {wildCard && <Modal title="Your wild. Your color." onClose={() => setWildCard(null)} className="uno-modal uno-color-modal"><p>Choose the color everyone plays next.</p><div className="uno-color-choices">{colors.map((color) => <button key={color} className={`uno-color-choice uno-color-${color}`} disabled={disabled} onClick={() => { act({ type: 'play', cardId: wildCard.id, color, sayUno }); setWildCard(null); }}><span />{color}</button>)}</div></Modal>}
  </div>;
}

export default function UnoGame() {
  const client = useRoom('uno');
  const { session, connection, pending, error } = client;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { document.title = 'UNO — Game Night'; return () => { if (copyTimer.current) clearTimeout(copyTimer.current); }; }, []);
  useEffect(() => { if (!session) setLeaveOpen(false); }, [session]);
  const game = session?.view.unoGame;
  async function copyInvite() {
    if (!session) return;
    const address = new URL('/games/uno', window.location.origin);
    address.searchParams.set('room', session.view.code);
    try { await navigator.clipboard.writeText(address.href); setCopied(true); setCopyError(null); if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2500); }
    catch { setCopyError(`Share room code ${session.view.code} with your friends.`); }
  }
  return <div className={`uno-app${game ? ' uno-app-playing' : ''}`}>
    <header className="uno-header"><a className="uno-back" href="/" aria-label="All games"><ArrowLeft size={17} /><span>GAME NIGHT</span></a><div className="uno-header-divider" /><a className="uno-wordmark" href="/games/uno" onClick={(event) => { if (session) event.preventDefault(); }}>UNO<span className="uno-color-dots"><i /><i /><i /><i /></span></a><nav aria-label="UNO tools"><span className={`uno-connection ${connection === 'online' ? 'is-online' : ''}`}><i />{connection === 'online' ? session ? 'Connected' : 'Ready to play' : connection === 'connecting' ? 'Connecting…' : connection === 'restoring' ? 'Restoring seat…' : 'Offline'}</span><button className="uno-header-button" aria-label="How to play" onClick={() => setRulesOpen(true)}><CircleHelp size={17} /><span>How to play</span></button>{session && <button className="uno-header-button" aria-label="Leave game" disabled={!!pending || connection !== 'online'} onClick={() => game?.status === 'playing' ? setLeaveOpen(true) : void client.command({ type: 'leave' })}><LogOut size={17} /><span>Leave</span></button>}</nav></header>
    <main className="uno-content">
      {(error || copyError) && <div className="uno-error" role="alert"><p>{error ?? copyError}</p>{connection === 'offline' && <button onClick={client.reconnect}><Wifi size={16} />Reconnect</button>}<button aria-label="Dismiss message" onClick={() => { client.clearError(); setCopyError(null); }}><X size={17} /></button></div>}
      {session && <div className="uno-room-bar"><div><span className="uno-color-dots"><i /><i /><i /><i /></span><span>{session.view.kind === 'practice' ? 'Practice table' : 'Your private table'}</span></div>{session.view.kind === 'friends' && <button onClick={() => void copyInvite()} aria-label="Copy room invite">{session.view.code}{copied ? <Check size={14} /> : <Copy size={14} />}</button>}</div>}
      {game ? <UnoTable client={client} game={game} onRules={() => setRulesOpen(true)} /> : session ? <UnoWaiting client={client} onCopy={() => void copyInvite()} copied={copied} /> : <div className="uno-welcome"><section className="uno-welcome-story"><div className="uno-big-wordmark">UNO<span>.</span></div><h1>Small cards.<br /><span>Big feelings.</span></h1><p>Friendships are about to get colorful.<br />Match, reverse, and race to your last card.</p><UnoShowcase /><div className="uno-welcome-details"><span><UsersRound size={17} />2–6 players</span><span><Layers size={17} />One unforgettable hand</span></div></section><UnoSetup client={client} /></div>}
    </main>
    <footer className="uno-footer"><span>Good cards. Better company.</span><span>Part of Game Night <span className="uno-color-dots"><i /><i /><i /><i /></span></span></footer>
    {rulesOpen && <UnoRules onClose={() => setRulesOpen(false)} />}
    {leaveOpen && <Modal title="Leave this round?" onClose={() => setLeaveOpen(false)} className="uno-modal"><p className="uno-modal-intro">You’ll give up your place in this round. The other players can keep playing.</p><div className="uno-confirm-buttons"><button className="uno-button uno-button-secondary" onClick={() => setLeaveOpen(false)}>Keep playing</button><button className="uno-button uno-button-danger" disabled={!!pending || connection !== 'online'} onClick={() => { void client.command({ type: 'leave' }).then((left) => { if (left) setLeaveOpen(false); }); }}>Leave round <LogOut size={16} /></button></div></Modal>}
  </div>;
}
