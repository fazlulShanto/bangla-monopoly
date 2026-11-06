import type { CSSProperties } from 'react';
import { UnoCardFace } from './UnoCards';
import { CARD_FLIGHT_MS, type CardFlight } from './useUnoCardFlight';

type FlightStyle = CSSProperties & {
  '--flight-x': string;
  '--flight-y': string;
  '--flight-rotation': string;
  '--flight-scale': number;
};

export default function UnoCardFlight({ flight, onFinish }: { flight: CardFlight; onFinish: (id: number) => void }) {
  const style: FlightStyle = {
    left: flight.x - flight.width / 2,
    top: flight.y - flight.height / 2,
    width: flight.width,
    height: flight.height,
    animationDuration: `${CARD_FLIGHT_MS}ms`,
    '--flight-x': `${flight.origin.x - flight.x}px`,
    '--flight-y': `${flight.origin.y - flight.y}px`,
    '--flight-rotation': `${flight.origin.rotation}deg`,
    '--flight-scale': flight.origin.width / flight.width,
  };
  return <div className="uno-flying-card" style={style} aria-hidden="true" onAnimationEnd={() => onFinish(flight.id)}><UnoCardFace card={flight.card} /></div>;
}
