import { useEffect, useId, useRef, type ReactNode } from 'react';
import {
  ArrowUpRight, Bike, Building2, Cat, CircleHelp, Coffee, Droplets, Fish, Gift,
  KeyRound, Landmark, LoaderCircle, LockKeyhole, Origami, Plane, Sailboat, Siren, TreePalm, X, Zap,
} from 'lucide-react';
import type { Tile, TokenId } from '@deshi/game';

export const money = (amount: number) => `৳${amount.toLocaleString('en-US')}`;

export function PropertyOwnerBadge({ number, name, color, className = '' }: { number: number; name: string; color: string; className?: string }) {
  return <span className={`property-owner-badge ${className}`} style={{ backgroundColor: color }} title={`${name}'s property marker`} aria-hidden="true"><KeyRound size={10} strokeWidth={2.5} /><span>{number}</span></span>;
}

export function TokenIcon({ token, size = 20 }: { token: TokenId; size?: number }) {
  switch (token) {
    case 'rickshaw': return <Bike size={size} />;
    case 'boat': return <Sailboat size={size} />;
    case 'tiger': return <Cat size={size} />;
    case 'tea': return <Coffee size={size} />;
    case 'kite': return <Origami size={size} />;
    case 'fish': return <Fish size={size} />;
    default: { const exhaustive: never = token; return exhaustive; }
  }
}

export function TileIcon({ tile, size = 20 }: { tile: Tile; size?: number }) {
  switch (tile.kind) {
    case 'go': return <ArrowUpRight size={size} />;
    case 'street': return <Building2 size={size} />;
    case 'airport': return <Plane size={size} />;
    case 'utility': return tile.id === 12 ? <Zap size={size} /> : <Droplets size={size} />;
    case 'chance': return <CircleHelp size={size} />;
    case 'treasure': return <Gift size={size} />;
    case 'tax': return <Landmark size={size} />;
    case 'jail': return <LockKeyhole size={size} />;
    case 'goToJail': return <Siren size={size} />;
    case 'vacation': return <TreePalm size={size} />;
    default: { const exhaustive: never = tile; return exhaustive; }
  }
}

export function Spinner() { return <LoaderCircle size={17} className="spinner" aria-hidden="true" />; }

export function BangladeshFlag() { return <span className="bangladesh-flag" aria-label="Bangladesh" role="img"><span /></span>; }

export function Modal({ title, children, onClose, className = '' }: {
  title: string; children: ReactNode; onClose: () => void; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-inner">
      <div className="modal-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
      {children}
    </div>
  </dialog>;
}
