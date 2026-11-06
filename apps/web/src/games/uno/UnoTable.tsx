import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, CircleHelp, RotateCcw, Trophy } from 'lucide-react';
import { UNO_COLORS, type UnoAction, type UnoCard, type UnoGameView } from '@deshi/game';
import { Modal } from '../../ui';
import { cardLabel, UnoCardBack, UnoCardFace } from './UnoCards';
import UnoHand from './UnoHand';
import UnoPlayers from './UnoPlayers';
import type { UnoRoomClient } from './types';

export default function UnoTable({ client, game, onRules }: { client: UnoRoomClient; game: UnoGameView; onRules: () => void }) {
  const [wildCard, setWildCard] = useState<UnoCard | null>(null);
  const [sayUno, setSayUno] = useState(false);
  const { session, pending, connection } = client;
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
  const status = game.status === 'finished' ? `${winner?.name ?? 'A player'} wins!` : mine ? 'Your move.' : `${current?.name ?? 'Your friend'}’s move.`;
  function act(action: UnoAction) { void client.command({ type: 'uno', action }); }
  function play(card: UnoCard) {
    if (card.color === 'wild') setWildCard(card);
    else act({ type: 'play', cardId: card.id, sayUno });
  }

  return <div className="uno-play-layout">
    <UnoPlayers room={view} game={game} playerId={playerId} />
    <div className="uno-main-table">
      <section className={`uno-arena${mine ? ' is-my-turn' : ''}`} aria-label="Card table">
        <div className="uno-arena-heading">
          <div className="uno-turn-message" role="status"><span className={`uno-turn-indicator${mine ? ' is-yours' : ''}`} /><h1>{status}</h1></div>
          <div className="uno-round-meta"><span>Turn {game.turnNumber}</span><span><RotateCcw size={14} className={game.direction === 1 ? 'uno-clockwise' : ''} />{game.direction === 1 ? 'Clockwise' : 'Counterclockwise'}</span></div>
        </div>
        <p className="uno-match-hint">{game.status === 'finished' ? 'The round is yours to remember.' : game.canPass ? 'One new card. Play it or pass.' : <><span className={`uno-color-swatch uno-color-${game.currentColor}`} />Match <strong>{game.currentColor}</strong>{game.topCard.color !== 'wild' && <> or <strong>{topValue}</strong></>}<span className="uno-hint-separator">·</span>Wild changes the color</>}</p>
        <div className="uno-play-surface">
          <div className="uno-pile uno-pile-draw">
            <button className="uno-draw-pile" disabled={disabled || !game.canDraw} onClick={() => act({ type: 'draw' })} aria-label="Draw a card"><UnoCardBack /></button>
            <span className="uno-pile-label">Draw pile <small>{game.drawCount} left</small></span>
          </div>
          <span className="uno-pile-flow" aria-hidden="true"><ArrowRight size={21} /></span>
          <div className="uno-pile uno-pile-discard">
            <div className="uno-discard" key={game.topCard.id} role="img" aria-label={`Top card: ${cardLabel(game.topCard)}`}><UnoCardFace card={game.topCard} /></div>
            <span className="uno-pile-label">In play <small className={`uno-active-color uno-color-${game.currentColor}`}><i />{game.currentColor}</small></span>
          </div>
        </div>
        <div className="uno-arena-bottom"><span>{mine ? <><ArrowDown size={14} />Your hand is up next</> : <>Waiting for {current?.name ?? 'the next round'}</>}</span><button onClick={onRules}><CircleHelp size={14} />Table rules</button></div>
        {game.status === 'finished' && <div className="uno-round-result"><span className="uno-trophy"><Trophy size={32} /></span><h2>{game.winnerId === playerId ? 'Nicely played.' : `${winner?.name ?? 'The winner'} takes the round.`}</h2><p>{game.winnerId === playerId ? 'An empty hand. A very full ego.' : 'There’s always the rematch.'}</p>{view.hostId === playerId ? <button className="uno-button uno-button-primary" disabled={disabled} onClick={() => void client.command({ type: 'rematch' })}><RotateCcw size={17} />Play again</button> : <p>Your host can start another round.</p>}</div>}
      </section>
      <UnoHand game={game} mine={mine} disabled={disabled} sayUno={sayUno} catchable={catchable} onSayUno={() => setSayUno(!sayUno)} onPlay={play} onAction={act} />
      <p className="uno-latest-move" aria-live="polite">{game.log.at(-1)?.text}</p>
    </div>
    {wildCard && <Modal title="Pick your next color." onClose={() => setWildCard(null)} className="uno-modal uno-color-modal"><p>The next player will follow your lead.</p><div className="uno-color-choices">{UNO_COLORS.map((color) => <button key={color} className={`uno-color-choice uno-color-${color}`} disabled={disabled} onClick={() => { act({ type: 'play', cardId: wildCard.id, color, sayUno }); setWildCard(null); }}><span />{color}<ArrowRight size={17} /></button>)}</div></Modal>}
  </div>;
}
