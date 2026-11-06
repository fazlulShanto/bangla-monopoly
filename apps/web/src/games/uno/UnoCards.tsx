import { Ban, Repeat2 } from 'lucide-react';
import type { UnoCard } from '@deshi/game';
import './uno-cards.css';

export function cardLabel(card: UnoCard): string {
  const value = card.value === 'draw2' ? 'draw two' : card.value === 'wild4' ? 'wild draw four' : card.value;
  return card.color === 'wild' ? value : `${card.color} ${value}`;
}

function WildDiamond() {
  return <span className="uno-wild-mark"><i /><i /><i /><i /></span>;
}

function CardMark({ card, corner = false }: { card: UnoCard; corner?: boolean }) {
  if (card.value === 'skip') return <Ban strokeWidth={corner ? 2.8 : 2.5} />;
  if (card.value === 'reverse') return <Repeat2 strokeWidth={corner ? 2.8 : 2.5} />;
  if (card.value === 'wild') return <WildDiamond />;
  if (card.value === 'draw2') return <span className="uno-draw-value">+2</span>;
  if (card.value === 'wild4') return <span className="uno-draw-value">+4</span>;
  return card.value;
}

export function UnoCardFace({ card }: { card: UnoCard }) {
  return <span className={`uno-card-face uno-color-${card.color} uno-card-${card.value}`} aria-hidden="true">
    <span className="uno-card-frame" />
    <span className="uno-card-diamond">{card.color === 'wild' && <WildDiamond />}</span>
    <span className="uno-card-corner"><CardMark card={card} corner /></span>
    <span className="uno-card-value"><CardMark card={card} /></span>
    <span className="uno-card-corner uno-card-corner-bottom"><CardMark card={card} corner /></span>
  </span>;
}

export function UnoCardBack() {
  return <span className="uno-card-back" aria-hidden="true"><span className="uno-card-frame" /><span className="uno-back-diamond"><WildDiamond /></span><span className="uno-back-wordmark">UNO</span></span>;
}

const showcaseCards: UnoCard[] = [
  { id: 'preview-blue', color: 'blue', value: 'reverse' },
  { id: 'preview-green', color: 'green', value: 'skip' },
  { id: 'preview-yellow', color: 'yellow', value: '7' },
  { id: 'preview-red', color: 'red', value: 'draw2' },
];

export function UnoShowcase() {
  return <div className="uno-showcase" aria-hidden="true">
    {showcaseCards.map((card) => <div className="uno-showcase-card" key={card.id}><UnoCardFace card={card} /></div>)}
  </div>;
}
