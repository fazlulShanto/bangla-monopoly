import type { Tile } from '@deshi/game';

const LOCATION_SLUGS: Readonly<Partial<Record<number, string>>> = {
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
  20: 'saint-martin',
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

export default function LocationArt({ tile, className }: { tile: Tile; className?: string }) {
  const source = locationArtwork(tile);
  if (source === undefined) return null;
  return <img src={source} className={className} width={512} height={512} alt="" aria-hidden="true" draggable={false} />;
}
