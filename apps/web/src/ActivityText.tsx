import { BOARD } from '@deshi/game';

const ACTIONS = [
  'paid', 'cannot pay', 'arrived at', 'passed', 'collected', 'bought', 'rolled',
  'built', 'went to', 'left', 'remains in', 'wins', 'goes first', 'is bankrupt',
  'is enjoying', 'collect', 'pay', 'visit', 'move back', 'travel to', 'gives',
];
const PLACES = BOARD.flatMap((tile) => [tile.name, tile.shortName]);
type HighlightKind = 'player' | 'amount' | 'place' | 'action';

export default function ActivityText({ text, playerNames }: { text: string; playerNames: readonly string[] }) {
  const highlights = new Map<string, HighlightKind>();
  for (const action of ACTIONS) highlights.set(action, 'action');
  for (const place of PLACES) highlights.set(place.toLowerCase(), 'place');
  for (const name of playerNames) if (name) highlights.set(name.toLowerCase(), 'player');
  const terms = [...highlights.keys()].sort((left, right) => right.length - left.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(৳[0-9][0-9,]*|${terms.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');

  return <>{text.split(pattern).map((part, index) => {
    if (index % 2 === 0) return part;
    const kind = part.startsWith('৳') ? 'amount' : highlights.get(part.toLowerCase());
    return <strong className={`activity-highlight activity-highlight--${kind}`} key={index}>{part}</strong>;
  })}</>;
}
