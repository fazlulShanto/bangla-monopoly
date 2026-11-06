import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, MoveHorizontal, Plus } from 'lucide-react';
import type { UnoAction, UnoCard, UnoGameView } from '@deshi/game';
import { cardLabel, UnoCardFace } from './UnoCards';

export default function UnoHand({ game, mine, disabled, sayUno, catchable, onSayUno, onPlay, onAction }: {
  game: UnoGameView; mine: boolean; disabled: boolean; sayUno: boolean;
  catchable: { id: string; name: string } | undefined;
  onSayUno: () => void; onPlay: (card: UnoCard) => void; onAction: (action: UnoAction) => void;
}) {
  const handRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const hand = handRef.current;
    if (!hand) return;
    const measure = () => setOverflows(hand.scrollWidth > hand.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(hand);
    measure();
    return () => observer.disconnect();
  }, [game.hand.length]);
  const hint = game.status === 'finished' ? 'Ready for another round?' : mine
    ? game.canPass ? 'Play the card you drew, or keep it and pass.'
      : game.playableCardIds.length ? 'Choose a highlighted card.' : 'No matches. Draw a card to keep going.'
    : 'Your next move is worth thinking about.';
  return <section className={`uno-hand-area${mine ? ' is-my-turn' : ''}`} aria-label="Your hand">
    <div className="uno-hand-toolbar">
      <div><h2>Your hand <span>{game.hand.length}</span></h2><p>{hint}</p></div>
      <div className="uno-hand-actions">
        {game.canDraw && <button className="uno-button uno-button-secondary" disabled={disabled} onClick={() => onAction({ type: 'draw' })}><Plus size={16} />Draw card</button>}
        {game.canPass && <button className="uno-button uno-button-secondary" disabled={disabled} onClick={() => onAction({ type: 'pass' })}>Pass turn <ArrowRight size={16} /></button>}
        {game.canCallUno ? <button className="uno-call-button" disabled={disabled} onClick={() => onAction({ type: 'callUno' })}>UNO!</button>
          : game.status === 'playing' && game.hand.length === 2 && mine ? <button className={`uno-call-button${sayUno ? ' is-armed' : ''}`} aria-pressed={sayUno} disabled={disabled} onClick={onSayUno}>{sayUno && <Check size={16} />}Say UNO</button> : null}
        {catchable && <button className="uno-button uno-button-secondary" disabled={disabled} onClick={() => onAction({ type: 'catchUno', playerId: catchable.id })}>Catch {catchable.name}!</button>}
      </div>
    </div>
    {overflows && <p className="uno-hand-scroll-hint"><MoveHorizontal size={13} />Swipe to see all cards</p>}
    <div className="uno-hand" ref={handRef}>{game.hand.map((card) => {
      const playable = game.playableCardIds.includes(card.id);
      return <button key={card.id} className={`uno-hand-card${playable ? ' is-playable' : ''}`} disabled={disabled || !playable} aria-label={`Play ${cardLabel(card)}`} onClick={() => onPlay(card)}><UnoCardFace card={card} /><span className="uno-card-play-indicator" aria-hidden="true" /></button>;
    })}</div>
  </section>;
}
