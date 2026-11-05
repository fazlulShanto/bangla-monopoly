import type { GameView } from '@deshi/game';

export type PropertyLevel = NonNullable<GameView['deeds'][number]>['level'];

export default function PropertyBuildings({ level, className = '' }: { level: PropertyLevel; className?: string }) {
  if (level === 0) return null;
  const hotel = level === 5;
  const description = hotel ? 'Hotel' : `${level} ${level === 1 ? 'house' : 'houses'}`;
  const source = `${import.meta.env.BASE_URL}buildings/${hotel ? 'hotel' : 'house'}.png`;
  return <span className={`property-buildings property-buildings--${hotel ? 'hotel' : 'houses'} ${className}`} role="img" aria-label={description}>
    {Array.from({ length: hotel ? 1 : level }, (_, index) => <img key={`${hotel ? 'hotel' : 'house'}-${index}`} src={source} width={256} height={256} alt="" aria-hidden="true" draggable={false} />)}
  </span>;
}
