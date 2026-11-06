import { useEffect, useState } from 'react';
import { ArrowRight, CircleHelp, History, RotateCcw, Trophy, UsersRound } from 'lucide-react';
import { UNO_COLORS, type UnoAction, type UnoCard, type UnoGameView } from '@deshi/game';
import { Modal } from '../../ui';
import TurnCountdown from '../../TurnCountdown';
import { cardLabel, UnoCardBack, UnoCardFace } from './UnoCards';
import UnoHand from './UnoHand';
import UnoPlayers from './UnoPlayers';
import UnoCardFlight from './UnoCardFlight';
import UnoDirectionMark from './UnoDirectionMark';
import { useUnoCardFlight } from './useUnoCardFlight';
import type { UnoRoomClient } from './types';
import './uno-table.css';

export default function UnoTable({ client, game, onRules }: { client: UnoRoomClient; game: UnoGameView; onRules: () => void }) {
  const [wildCard, setWildCard] = useState<UnoCard | null>(null);
  const [sayUno, setSayUno] = useState(false);
  const { session, pending, connection } = client;
  const { tableRef, discardRef, flight, preparePlay, finishFlight } = useUnoCardFlight(game, session?.playerId, connection);
  const turnPlayerId = game.status === 'playing' ? game.turnPlayerId : null;
  useEffect(() => { setWildCard(null); setSayUno(false); }, [turnPlayerId, game.hand.length, game.status]);
  if (!session) return null;
  const { view, playerId } = session;
  const mine = turnPlayerId === playerId;
  const disabled = !!pending || connection !== 'online';
  const current = view.seats.find((seat) => seat.id === turnPlayerId);
  const winner = game.status === 'finished' ? view.seats.find((seat) => seat.id === game.winnerId) : null;
  const catchable = view.seats.find((seat) => seat.id === game.catchablePlayerId && seat.id !== playerId);
  const topValue = game.topCard.value === 'draw2' ? '+2' : game.topCard.value === 'wild4' ? '+4' : game.topCard.value;
  const status = game.status === 'finished' ? `${winner?.name ?? 'A player'} wins!` : mine ? 'Your turn' : `${current?.name ?? 'Your friend'}’s turn`;
  function act(action: UnoAction) { void client.command({ type: 'uno', action }); }
  function play(card: UnoCard, element: HTMLButtonElement) {
    preparePlay(card.id, element);
    if (card.color === 'wild') setWildCard(card);
    else act({ type: 'play', cardId: card.id, sayUno });
  }

  return <div className="uno-play-layout" ref={tableRef}>
    <section className={`uno-arena${mine ? ' is-my-turn' : ''}`} aria-label="Card table">
      <div className="uno-table-meta"><span><UsersRound size={14} />{game.players.filter((player) => player.status === 'active').length} / 6 players</span><span>Turn {game.turnNumber}</span></div>
      <UnoPlayers room={view} game={game} playerId={playerId} />
      <div className="uno-table-center">
        <div className="turn-heading"><div className={`uno-turn-message${mine ? ' is-yours' : ''}`} role="status"><span className="uno-turn-indicator" /><h1>{status}</h1></div>
          {game.status === 'playing' && view.turnTimer && <TurnCountdown timer={view.turnTimer} serverTime={view.serverTime} />}</div>
        <div className="uno-play-surface">
          <UnoDirectionMark direction={game.direction} />
          <div className="uno-pile uno-pile-draw">
            <button className="uno-draw-pile" disabled={disabled || !game.canDraw} onClick={() => act({ type: 'draw' })} aria-label="Draw a card"><UnoCardBack /></button>
            <span className="uno-pile-label">Draw pile <small>{game.drawCount} cards</small></span>
          </div>
          <div className="uno-pile uno-pile-discard">
            <div className="uno-discard" ref={discardRef} role="img" aria-label={`Top card: ${cardLabel(game.topCard)}`}><UnoCardFace card={flight?.underneath ?? game.topCard} /></div>
            <span className="uno-pile-label">In play <small className={`uno-active-color uno-color-${game.currentColor}`}><i />{game.currentColor}</small></span>
          </div>
        </div>
        <p className="uno-match-hint">{game.status === 'finished' ? 'The round is complete.' : game.canPass ? 'Play your new card or pass.' : <><span className={`uno-color-swatch uno-color-${game.currentColor}`} />Match <strong>{game.currentColor}</strong>{game.topCard.color !== 'wild' && <> or <strong>{topValue}</strong></>}</>}</p>
      </div>
      <div className="uno-arena-tools"><details className="uno-history"><summary><History size={15} />Recent moves</summary><ol>{game.log.slice(-5).reverse().map((entry) => <li key={entry.id}>{entry.text}</li>)}</ol></details><button onClick={onRules}><CircleHelp size={15} />Table rules</button></div>
      {game.status === 'finished' && !flight && <div className="uno-round-result"><span className="uno-trophy"><Trophy size={32} /></span><h2>{game.winnerId === playerId ? 'Nicely played.' : `${winner?.name ?? 'The winner'} takes the round.`}</h2><p>{game.winnerId === playerId ? 'An empty hand. A very full ego.' : 'There’s always the rematch.'}</p>{view.hostId === playerId ? <button className="uno-button uno-button-primary" disabled={disabled} onClick={() => void client.command({ type: 'rematch' })}><RotateCcw size={17} />Play again</button> : <p>Your host can start another round.</p>}</div>}
    </section>
    <UnoHand game={game} mine={mine} disabled={disabled} sayUno={sayUno} catchable={catchable} seat={view.seats.find((seat) => seat.id === playerId)} onSayUno={() => setSayUno(!sayUno)} onPlay={play} onAction={act} />
    {flight && <UnoCardFlight key={flight.id} flight={flight} onFinish={finishFlight} />}
    <p className="uno-latest-move" aria-live="polite">{game.log.at(-1)?.text}</p>
    {wildCard && <Modal title="Pick your next color." onClose={() => setWildCard(null)} className="uno-modal uno-color-modal"><p>The next player will follow your lead.</p><div className="uno-color-choices">{UNO_COLORS.map((color) => <button key={color} className={`uno-color-choice uno-color-${color}`} disabled={disabled} onClick={() => { act({ type: 'play', cardId: wildCard.id, color, sayUno }); setWildCard(null); }}><span />{color}<ArrowRight size={17} /></button>)}</div></Modal>}
  </div>;
}
