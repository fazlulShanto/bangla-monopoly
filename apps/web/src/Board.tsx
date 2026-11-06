import { useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, CircleHelp, Dice5, Gift, LockKeyhole, Trophy, UsersRound } from 'lucide-react';
import { BOARD, BAIL, GO_SALARY, type Die, type GameAction, type RoomView, type Tile } from '@deshi/game';
import { BangladeshFlag, money, PropertyOwnerBadge, Spinner, TileIcon, TokenIcon } from './ui';
import { DICE_LANDING_MS, diceReducer, diceSnapshot, initialDiceState, type DicePresentation, type PawnPositions } from './dicePresentation';
import ActivityText from './ActivityText';
import LocationArt, { locationArtwork } from './LocationArt';
import PropertyBuildings from './PropertyBuildings';

export function tilePosition(id: number) {
  if (id <= 10) return { row: 11, column: 11 - id, edge: id === 0 || id === 10 ? 'corner' : 'bottom' };
  if (id <= 20) return { row: 21 - id, column: 1, edge: id === 20 ? 'corner' : 'left' };
  if (id <= 30) return { row: 1, column: id - 19, edge: id === 30 ? 'corner' : 'top' };
  return { row: id - 29, column: 11, edge: 'right' };
}

const PIPS: Record<Die, readonly number[]> = {
  1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

const TILE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  Panchagarh: 'Pancha\u00adgarh',
  Sundarbans: 'Sundar\u00adbans',
  Moulvibazar: 'Moulvi\u00adbazar',
  Brahmanbaria: 'Brahman\u00adbaria',
  Mymensingh: 'Mymen\u00adsingh',
  Chittagong: 'Chitta\u00adgong',
};

const DIE_ORIENTATIONS: Record<Die, string> = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
  6: 'rotateX(0deg) rotateY(180deg)',
};

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  return reduced;
}

function useDicePresentation(room: RoomView | null, requestingRoll: boolean, reducedMotion: boolean) {
  const snapshot = useMemo(() => diceSnapshot(room), [room]);
  const [state, dispatch] = useReducer(diceReducer, null, () => initialDiceState(snapshot, requestingRoll));
  useEffect(() => {
    dispatch({ type: 'sync', snapshot, requestingRoll, reducedMotion });
  }, [snapshot, requestingRoll, reducedMotion]);
  const landingEvent = state.presentation.phase === 'landing' ? state.presentation.event : null;
  useEffect(() => {
    if (landingEvent === null) return;
    const timer = window.setTimeout(() => dispatch({ type: 'settle', event: landingEvent }), DICE_LANDING_MS + 20);
    return () => window.clearTimeout(timer);
  }, [landingEvent]);
  return { presentation: state.presentation, settle: (event: number) => dispatch({ type: 'settle', event }) };
}

function DieFace({ value, face }: { value: Die; face: string }) {
  return <div className={`die-face die-face--${face}`} aria-hidden="true"><span className="die-panel">
    {Array.from({ length: 9 }, (_, index) => <i key={index} className={PIPS[value].includes(index) ? 'pip visible' : 'pip'} />)}
  </span></div>;
}

function Dice({ presentation, onSettled }: { presentation: DicePresentation; onSettled: (event: number) => void }) {
  const { dice, phase } = presentation;
  const timing: CSSProperties & { '--dice-duration': string } = { '--dice-duration': `${DICE_LANDING_MS}ms` };
  return <div className={`dice-stage dice-stage--${phase}`} style={timing} role="img" aria-label={phase !== 'settled' ? 'Dice rolling' : `Dice showing ${dice[0]} and ${dice[1]}`}>
    {dice.map((value, index) => <div className={`die-wrap die-wrap--${index + 1}`} key={`${index}:${phase}:${presentation.event ?? 'idle'}`}>
      <span className="die-shadow" aria-hidden="true" />
      <div className="die-hop" onAnimationEnd={(event) => {
        if (index === 1 && event.target === event.currentTarget && phase === 'landing') onSettled(presentation.event);
      }}>
        <div className="die-camera"><div className="die-tumble"><div className="die" style={{ transform: DIE_ORIENTATIONS[value] }}>
          <div className="die-core" aria-hidden="true">{['front', 'back', 'right', 'left', 'top', 'bottom'].map((face) => <i key={face} className={`die-core-face die-face--${face}`} />)}</div>
          <DieFace value={1} face="front" /><DieFace value={6} face="back" />
          <DieFace value={3} face="right" /><DieFace value={4} face="left" />
          <DieFace value={2} face="top" /><DieFace value={5} face="bottom" />
        </div></div></div>
      </div>
    </div>)}
  </div>;
}

function trackCenter(track: number, innerSize: number) {
  const unit = (innerSize - 30) / 11.64;
  const weight = track === 1 ? 0.66 : track === 11 ? 10.98 : 1.32 + track - 2 + 0.5;
  return weight * unit + (track - 1) * 3;
}

function BoardTokens({ room, boardSize, targets, reducedMotion }: { room: RoomView; boardSize: number; targets: PawnPositions; reducedMotion: boolean }) {
  const players = room.game?.players ?? [];
  const [positions, setPositions] = useState<PawnPositions>(targets);
  const displayed = useRef(targets);
  const destinations = useRef(targets);
  const timers = useRef(new Map<string, number[]>());

  useEffect(() => {
    function show(id: string, position: number) {
      displayed.current = { ...displayed.current, [id]: position };
      setPositions(displayed.current);
    }
    for (const [id, target] of Object.entries(targets)) {
      if (destinations.current[id] === target && !reducedMotion) continue;
      timers.current.get(id)?.forEach(window.clearTimeout);
      timers.current.delete(id);
      const start = displayed.current[id];
      const distance = start === undefined ? 0 : (target - start + 40) % 40;
      if (reducedMotion || start === undefined || distance > 14 || distance === 0) {
        show(id, target);
      } else {
        const path = Array.from({ length: distance }, (_, index) => window.setTimeout(() => {
          show(id, (start + index + 1) % 40);
          if (index === distance - 1) timers.current.delete(id);
        }, (index + 1) * 90));
        timers.current.set(id, path);
      }
    }
    destinations.current = targets;
  }, [targets, reducedMotion]);

  useEffect(() => {
    const activeTimers = timers.current;
    return () => { for (const path of activeTimers.values()) path.forEach(window.clearTimeout); };
  }, []);

  return <div className="board-tokens" aria-hidden="true">{players.filter((player) => player.status === 'active').map((player) => {
    const seat = room.seats.find((item) => item.id === player.id);
    if (!seat) return null;
    const position = positions[player.id] ?? targets[player.id] ?? player.position;
    const { row, column } = tilePosition(position);
    const neighbors = players.filter((item) => (positions[item.id] ?? targets[item.id] ?? item.position) === position && item.status === 'active');
    const offset = neighbors.findIndex((item) => item.id === player.id);
    const pawnSize = Math.max(14, Math.min(23, boardSize * 0.031));
    const inward = trackCenter(1, boardSize - 12) + pawnSize / 2 + 2;
    const spacing = pawnSize * 0.75;
    const line = Math.floor(offset / 3);
    const count = Math.min(3, neighbors.length - line * 3);
    const along = (offset % 3 - (count - 1) / 2) * spacing;
    const furtherIn = line * spacing;
    const horizontal = row === 1 || row === 11;
    const cornerShift = horizontal && (column === 1 || column === 11) ? (Math.min(neighbors.length, 3) - 1) * spacing / 2 : 0;
    const x = trackCenter(column, boardSize - 12) + (column === 1 ? inward : column === 11 ? -inward : 0)
      + (horizontal ? along + (column === 1 ? cornerShift : -cornerShift) : column === 1 ? furtherIn : -furtherIn);
    const y = trackCenter(row, boardSize - 12) + (row === 1 ? inward : row === 11 ? -inward : 0)
      + (horizontal ? row === 1 ? furtherIn : -furtherIn : along);
    return <div key={player.id} className={`board-pawn ${room.game?.status === 'playing' && room.game.turn.playerId === player.id ? 'is-current' : ''}`}
      style={{ left: x, top: y, backgroundColor: seat.color }}>
      <TokenIcon token={seat.token} size={13} />
    </div>;
  })}</div>;
}

function BoardTile({ tile, room, onHover, onSelect }: {
  tile: Tile; room: RoomView | null; onHover: (tile: Tile | null) => void; onSelect: (tile: Tile) => void;
}) {
  const { row, column, edge } = tilePosition(tile.id);
  const deed = room?.game?.deeds[tile.id];
  const ownerIndex = deed ? room?.seats.findIndex((seat) => seat.id === deed.ownerId) ?? -1 : -1;
  const owner = ownerIndex >= 0 ? room?.seats[ownerIndex] : undefined;
  const illustrated = !!locationArtwork(tile);
  const development = tile.kind === 'street' && deed && deed.level > 0
    ? deed.level === 5 ? ', hotel' : `, ${deed.level} ${deed.level === 1 ? 'house' : 'houses'}`
    : '';
  return <button className={`board-tile board-tile--${edge} board-tile--${tile.kind} ${illustrated ? 'board-tile--illustrated' : ''} ${owner ? 'is-owned' : ''}`}
    style={{ gridRow: row, gridColumn: column }}
    onMouseEnter={() => onHover(tile)} onMouseLeave={() => onHover(null)}
    onFocus={() => onHover(tile)} onBlur={() => onHover(null)} onClick={() => onSelect(tile)}
    aria-label={`${tile.name}${'price' in tile ? `, ${money(tile.price)}` : ''}${owner ? `, owned by ${owner.name}` : ''}${development}. View details.`}>
    {illustrated && <LocationArt tile={tile} className="tile-artwork" />}
    {tile.kind === 'street' && <span className="property-strip" style={{ backgroundColor: tile.color }} />}
    <span className="tile-content">
      {tile.kind !== 'street' && !illustrated && <span className="tile-icon"><TileIcon tile={tile} /></span>}
      <span className="tile-name">{tile.kind === 'go' ? 'GO' : tile.kind === 'goToJail' ? 'GO TO JAIL' : tile.kind === 'jail' ? 'JUST VISITING' : TILE_DISPLAY_NAMES[tile.name] ?? tile.shortName}</span>
      {owner ? <PropertyOwnerBadge number={ownerIndex + 1} name={owner.name} color={owner.color} className="property-owner-badge--tile" /> : 'price' in tile && <span className="tile-price">{money(tile.price)}</span>}
      {tile.kind === 'tax' && <span className="tile-price">Pay {money(tile.amount)}</span>}
      {tile.kind === 'go' && <span className="tile-price">Collect {money(GO_SALARY)}</span>}
      {tile.kind === 'vacation' && <span className="tile-price">Take a break</span>}
    </span>
    {tile.kind === 'street' && deed && <PropertyBuildings level={deed.level} className="tile-buildings" />}
  </button>;
}

function BoardCenter({ room, playerId, presentation, onSettled, pending, disabled, onAction, onLeave }: {
  room: RoomView | null; playerId: string | null; presentation: DicePresentation; onSettled: (event: number) => void; pending: string | null; disabled: boolean;
  onAction: (action: GameAction) => void; onLeave: () => void;
}) {
  const game = room?.game;
  const rolling = presentation.phase !== 'settled';
  const turnSeat = game?.status === 'playing' ? room?.seats.find((seat) => seat.id === game.turn.playerId) : null;
  const isMine = game?.status === 'playing' && game.turn.playerId === playerId;
  const actions = game?.legalActions.filter((action) => action.type !== 'build' && action.type !== 'resign') ?? [];
  const winner = game?.status === 'finished' ? room?.seats.find((seat) => seat.id === game.winnerId) : null;
  const recentActivity = game?.log.slice(-6).reverse() ?? [];
  const playerNames = room?.seats.map((seat) => seat.name) ?? [];
  return <div className={`board-center ${game ? 'board-center--playing' : ''}`}>
    {!game && <>
      <div className="center-identity"><BangladeshFlag /><span>A BANGLADESH ORIGINAL</span></div>
      <div className="board-wordmark">DESHI <span>TYCOON<span className="wordmark-dot">.</span></span></div>
      <p className="board-tagline">A little luck. A lot of Bangladesh.</p>
    </>}
    <Dice presentation={presentation} onSettled={onSettled} />
    {!game ? <>
      <div className="center-welcome"><span className="center-table-icon"><UsersRound size={15} /></span><strong>{room ? 'Good company. Great game.' : 'Your next game night, upgraded.'}</strong>
        <p>{room ? 'Invite your friends. Pick your rivals.' : 'Bring your friends. Build your empire.'}</p></div>
      <div className="card-decks" aria-hidden="true"><div className="deck deck-chance"><CircleHelp /><span>CHANCE</span></div><span className="center-player-count">2–6 PLAYERS<br /><i>Endless possibilities.</i></span><div className="deck deck-treasure"><Gift /><span>TREASURE</span></div></div>
    </> : game.status === 'finished' ? <div className="game-result" aria-live="polite"><span className="winner-icon"><Trophy size={25} /></span><h2>{winner?.name ?? 'The last tycoon'} wins!</h2><p>An empire, well earned.</p><button className="button button-primary center-button" onClick={onLeave} disabled={disabled}>Back to lobby <ArrowRight size={16} /></button></div>
      : <div className="turn-controls" aria-live="polite"><div className="turn-title"><span className="turn-dot" style={{ backgroundColor: turnSeat?.color ?? '#99efbb' }} /><h2>{isMine ? 'Your move.' : `${turnSeat?.name ?? 'Your friend'}’s turn.`}</h2></div>
        <div className="center-actions">{isMine && actions.map((action) => {
          let label: string;
          let primary = true;
          let icon = <ArrowRight size={16} />;
          switch (action.type) {
            case 'roll': label = 'Roll dice'; icon = <Dice5 size={18} />; break;
            case 'buy': label = 'Buy property'; break;
            case 'decline': label = 'Pass'; primary = false; break;
            case 'payBail': label = `Pay bail · ${money(BAIL)}`; primary = false; icon = <LockKeyhole size={15} />; break;
            case 'endTurn': label = 'End turn'; break;
            default: return null;
          }
          return <button key={action.type} className={`button ${primary ? 'button-primary' : 'button-secondary'} center-button`} disabled={disabled || rolling} onClick={() => onAction(action)}>{pending === action.type ? <Spinner /> : icon}{pending === action.type ? 'One moment…' : label}</button>;
        })}{!isMine && <span className="waiting-indicator"><span /><span /><span /></span>}</div>
        <span className="roll-result">{presentation.phase === 'settled' && presentation.resultVisible ? <>{presentation.dice[0]} + {presentation.dice[1]} = {presentation.dice[0] + presentation.dice[1]}{presentation.dice[0] === presentation.dice[1] ? ' · doubles' : ''}</> : rolling ? 'Rolling…' : '\u00a0'}</span>
      </div>}
    {game && <section className="center-activity" aria-label="Recent game activity">
      <div className="center-activity-heading"><h3>Latest activity</h3></div>
      <ol className="center-activity-list" role="log" aria-label="Latest game events" aria-live="polite" aria-relevant="additions">
        {recentActivity.map((entry) => <li key={entry.id}><span className="center-activity-pin" aria-hidden="true" /><p><ActivityText text={entry.text} playerNames={playerNames} /></p></li>)}
      </ol>
    </section>}
    {!game && <span className="center-corner-mark">EST. IN BANGLADESH</span>}
  </div>;
}

function TilePeek({ tile, room }: { tile: Tile; room: RoomView | null }) {
  const deed = room?.game?.deeds[tile.id];
  const owner = deed && room?.seats.find((seat) => seat.id === deed.ownerId);
  return <div className="tile-peek" role="tooltip"><span className="peek-icon" style={tile.kind === 'street' ? { color: tile.color } : undefined}>{locationArtwork(tile) ? <LocationArt tile={tile} className="peek-artwork" /> : <TileIcon tile={tile} size={22} />}{tile.kind === 'street' && deed && deed.level > 0 && <PropertyBuildings level={deed.level} className="peek-buildings" />}</span><div><strong>{tile.name}</strong><span>{owner ? `Owned by ${owner.name}` : 'price' in tile ? `${money(tile.price)} · Available` : tile.kind === 'tax' ? `Pay ${money(tile.amount)} to the bank` : tile.kind === 'go' ? `Collect ${money(GO_SALARY)} when you pass` : tile.kind === 'vacation' ? 'A well-deserved free stop' : 'A little twist in your journey'}</span>{tile.kind === 'street' && <span>Rent {money(tile.rent[deed?.level ?? 0])} · Build {money(tile.buildCost)}</span>}</div><span className="peek-hint">Click to inspect</span></div>;
}

function BoardPresentation({ room, playerId, pending, disabled, onAction, onLeave, boardSize }: {
  room: RoomView | null; playerId: string | null; pending: string | null; disabled: boolean; boardSize: number;
  onAction: (action: GameAction) => void; onLeave: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const { presentation, settle } = useDicePresentation(room, pending === 'roll', reducedMotion);
  return <>
    <BoardCenter room={room} playerId={playerId} presentation={presentation} onSettled={settle} pending={pending} disabled={disabled} onAction={onAction} onLeave={onLeave} />
    {room?.game && <BoardTokens room={room} boardSize={boardSize} targets={presentation.positions} reducedMotion={reducedMotion} />}
  </>;
}

export default function Board({ room, playerId, pending, disabled, onAction, onSelect, onLeave }: {
  room: RoomView | null; playerId: string | null; pending: string | null; disabled: boolean;
  onAction: (action: GameAction) => void; onSelect: (tile: Tile) => void; onLeave: () => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(700);
  const [hovered, setHovered] = useState<Tile | null>(null);
  useEffect(() => {
    const element = boardRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setBoardSize(element.getBoundingClientRect().width));
    observer.observe(element);
    setBoardSize(element.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);
  return <section className="board-shell" aria-label="Bangladesh game board"><div className="board" ref={boardRef}>
    {BOARD.map((tile) => <BoardTile key={tile.id} tile={tile} room={room} onHover={setHovered} onSelect={(selected) => { setHovered(null); onSelect(selected); }} />)}
    <BoardPresentation key={room?.code ?? 'lobby'} room={room} playerId={playerId} pending={pending} disabled={disabled} onAction={onAction} onLeave={onLeave} boardSize={boardSize} />
    {hovered && <TilePeek tile={hovered} room={room} />}
  </div><div className="board-caption"><span><span className="tiny-dot" />{room?.game ? `Turn ${room.game.turnNumber}` : '40 spaces. One incredible Bangladesh.'}</span><span>Click any space to explore <ArrowRight size={12} /></span></div></section>;
}
