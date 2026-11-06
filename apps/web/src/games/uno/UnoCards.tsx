import { Ban, Repeat2 } from 'lucide-react';
import type { UnoCard } from '@deshi/game';

export function cardLabel(card: UnoCard): string {
  const value = card.value === 'draw2' ? 'draw two' : card.value === 'wild4' ? 'wild draw four' : card.value;
  return card.color === 'wild' ? value : `${card.color} ${value}`;
}

export function UnoCardFace({ card }: { card: UnoCard }) {
  const mark = card.value === 'skip' ? <Ban /> : card.value === 'reverse' ? <Repeat2 />
    : card.value === 'draw2' ? '+2' : card.value === 'wild4' ? '+4' : card.value === 'wild' ? <span className="uno-wild-mark"><i /><i /><i /><i /></span> : card.value;
  return <span className={`uno-card-face uno-color-${card.color}`}>
    <span className="uno-card-frame" />
    <span className="uno-card-corner">{mark}</span>
    <span className="uno-card-value">{mark}</span>
    <span className="uno-card-corner uno-card-corner-bottom">{mark}</span>
    {card.color === 'wild' && <span className="uno-card-spectrum"><i /><i /><i /><i /></span>}
  </span>;
}

export function UnoCardBack() {
  return <span className="uno-card-back"><span className="uno-back-stripes"><i /><i /><i /><i /></span><span className="uno-back-wordmark">UNO<span>GAME NIGHT</span></span></span>;
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
