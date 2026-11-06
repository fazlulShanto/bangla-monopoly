import type { Tile } from '@deshi/game';
import type { PropertyLevel } from './PropertyBuildings';

const LOCATION_SLUGS: Readonly<Partial<Record<number, string>>> = {
  0: 'kuakata-sea-beach',
  1: 'dhaka',
  3: 'gazipur',
  5: 'shah-amanat-airport',
  6: 'rangpur',
  8: 'dinajpur',
  9: 'panchagarh',
  11: 'rajshahi',
  13: 'natore',
  14: 'pabna',
  15: 'osmani-airport',
  16: 'khulna',
  18: 'jashore',
  19: 'sundarbans',
  21: 'mymensingh',
  23: 'moulvibazar',
  24: 'sylhet',
  25: 'coxs-bazar-airport',
  26: 'cumilla',
  27: 'brahmanbaria',
  29: 'feni',
  31: 'saint-martin',
  32: 'bandarban',
  34: 'coxs-bazar',
  35: 'shahjalal-airport',
  37: 'chittagong',
  39: 'sitakunda',
};

export function locationArtwork(tile: Tile): string | undefined {
  const slug = LOCATION_SLUGS[tile.id];
  return slug === undefined ? undefined : `${import.meta.env.BASE_URL}locations/${slug}.jpg`;
}

export default function LocationArt({ tile, level = 0, className = '' }: { tile: Tile; level?: PropertyLevel; className?: string }) {
  const source = locationArtwork(tile);
  if (source === undefined) return null;
  const hotel = tile.kind === 'street' && level === 5;
  return <span className={`location-art${hotel ? ' location-art--hotel' : ''} ${className}`} aria-hidden="true">
    <img src={source} className="location-art-city" width={512} height={512} alt="" draggable={false} />
    {hotel && <img src={`${import.meta.env.BASE_URL}buildings/hotel-estate.png`} className="location-art-hotel" width={1254} height={1254} alt="" draggable={false} />}
  </span>;
}
