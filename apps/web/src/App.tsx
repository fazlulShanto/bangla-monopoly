import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight, ArrowUpRight, Building2, Check, CircleAlert, CircleHelp, Dices, Expand,
  House, Link, Maximize2, Minimize2, ShieldCheck, Sparkles, Volume2, VolumeX, Wifi, X,
} from 'lucide-react';
import { BAIL, BOARD, GAME_CONFIG, GO_SALARY, STARTING_CASH, type GameAction, type RoomView, type Tile } from '@deshi/game';
import Board from './Board';
import GamePanel from './GamePanel';
import Lobby, { readPreference, writePreference } from './Lobby';
import LocationArt, { locationArtwork } from './LocationArt';
import Players from './Players';
import PropertyBuildings from './PropertyBuildings';
import { BangladeshFlag, Modal, money, Spinner, TileIcon } from './ui';
import { useRoom } from './useRoom';

function Rules({ startingCash, onClose }: { startingCash: number | null; onClose: () => void }) {
  return <Modal title="A little luck. A few house rules." onClose={onClose} className="rules-modal"><p className="modal-intro">Gather 2–6 players. Travel Bangladesh. Build the last empire standing.</p>
    <div className="rules-flow"><div><Dices size={23} /><h3>Roll & explore</h3><p>{startingCash === null ? <>The host chooses starting cash. The default is {money(STARTING_CASH)}.</> : <>Everyone starts with {money(startingCash)}.</>} Roll two dice and follow the board. Collect {money(GO_SALARY)} each time you pass Go.</p></div><div><Building2 size={23} /><h3>Claim your corner</h3><p>Buy an available property when you land on it, or pass. Pay rent when you visit someone else’s property.</p></div><div><House size={23} /><h3>Dream a little bigger</h3><p>Own a complete color group to build houses evenly. Four houses can become a hotel. A full group doubles rent on its undeveloped streets.</p></div></div>
    <div className="rules-detail"><h3>The twists along the way</h3><p>Doubles give you another roll. Three doubles in one turn send you to jail. To leave jail, pay {money(BAIL)} or roll doubles. After three failed attempts, you pay bail and move.</p><p>Chance and Treasure can change your plans. Airports earn more rent when you own more airports. Utilities charge four times the dice total, or ten times if you own both.</p><h3>Make a deal</h3><p>Open <strong>Trades</strong> to offer cash and properties to another player, even outside your turn. They can accept, decline, or make a counteroffer. A trade happens only when accepted. You can cancel your pending offers.</p><p>Streets cannot be traded while any street in their color group has houses or a hotel. Bots accept offers when the cash and property purchase prices they receive cover what they give.</p><h3>Our house rules</h3><p>There are no auctions, mortgages, or building sales. If you cannot pay a required bill, you become bankrupt immediately and your properties return to the bank. The last solvent player wins.</p><p>Kuakata Sea Beach is a free vacation stop. All taka is game money.</p></div>
    <div className="rules-controls"><ShieldCheck size={19} /><p>The host starts when every human is ready. Click any space to inspect it. Find your properties under <strong>My empire</strong> and use available Build buttons on your turn.</p></div><button className="button button-primary" onClick={onClose}>Got it. Let’s play. <ArrowRight size={17} /></button>
  </Modal>;
}

function TileDetails({ tile, room, playerId, disabled, pending, onAction, onClose }: {
  tile: Tile; room: RoomView | null; playerId: string | null; disabled: boolean; pending: string | null;
  onAction: (action: GameAction) => void; onClose: () => void;
}) {
  const deed = room?.game?.deeds[tile.id];
  const owner = deed && room?.seats.find((seat) => seat.id === deed.ownerId);
  const buildAction = room?.game?.legalActions.find((action) => action.type === 'build' && action.tile === tile.id);
  const group = tile.kind === 'street' ? BOARD.filter((item) => item.kind === 'street' && item.group === tile.group) : [];
  const ownedGroupCount = owner ? group.filter((item) => room?.game?.deeds[item.id]?.ownerId === owner.id).length : 0;
  const artwork = locationArtwork(tile);
  const development = !deed || deed.level === 0 ? 'Unimproved' : deed.level === 5 ? 'Hotel' : `${deed.level} ${deed.level === 1 ? 'house' : 'houses'}`;
  return <Modal title={tile.name} onClose={onClose} className="tile-modal"><div className="deed-layout"><div className="deed-overview">
    {artwork ? <div className="deed-landscape"><LocationArt tile={tile} />{tile.kind === 'street' && <><PropertyBuildings level={deed?.level ?? 0} className="deed-buildings" /><span className="deed-landscape-strip" style={{ backgroundColor: tile.color }} /></>}</div>
      : <div className="deed-banner" style={tile.kind === 'street' ? { backgroundColor: tile.color, color: '#081321', textShadow: 'none' } : undefined}><TileIcon tile={tile} size={35} /><span>{tile.kind === 'street' ? 'A PIECE OF YOUR NEXT EMPIRE' : tile.kind === 'airport' ? 'CONNECT THE WHOLE COUNTRY' : tile.kind === 'utility' ? 'KEEP BANGLADESH MOVING' : 'THE JOURNEY HAS A FEW TWISTS'}</span></div>}
    {tile.kind === 'street' && <p className="deed-development">{development}</p>}
    {'price' in tile && <div className="deed-price-row"><span>Property price</span><strong>{money(tile.price)}</strong></div>}
    {'price' in tile && <div className="deed-owner">{owner ? <><span className="owner-marker" style={{ backgroundColor: owner.color }} /><span>Owned by <strong>{owner.id === playerId ? 'you' : owner.name}</strong></span></> : <><Building2 size={16} /><span>Available from the bank</span></>}</div>}
    </div><div className="deed-details">
    {tile.kind === 'street' && <><div className="rent-heading"><h3>Rent at a glance</h3><span>Build for {money(tile.buildCost)}</span></div><div className="rent-table">{tile.rent.map((rent, level) => <div className={deed && deed.level === level ? 'current-level' : ''} key={level}><span>{level === 0 ? 'Unimproved' : level === 5 ? 'Hotel' : `${level} ${level === 1 ? 'house' : 'houses'}`}{deed && deed.level === level && <Check size={11} />}</span><strong>{money(rent * (level === 0 && ownedGroupCount === group.length ? 2 : 1))}</strong></div>)}</div><div className="color-group"><h3>The complete color group</h3><div>{group.map((item) => <span key={item.id}><i style={{ backgroundColor: tile.color }} />{item.name}{room?.game?.deeds[item.id]?.ownerId === owner?.id && owner && <Check size={11} />}</span>)}</div><p>Own the full set to double unimproved rent and build evenly.</p></div></>}
    {tile.kind === 'airport' && <div className="special-tile-detail"><h3>More connections. Better returns.</h3><p>Rent depends on the owner’s total airports.</p><div className="rent-table">{GAME_CONFIG.airportRent.map((rent, index) => <div key={index}><span>{index + 1} {index === 0 ? 'airport' : 'airports'}</span><strong>{money(rent)}</strong></div>)}</div></div>}
    {tile.kind === 'utility' && <div className="special-tile-detail"><h3>Every empire needs the essentials.</h3><p>With one utility, rent is <strong>4 × the dice total</strong>. With both utilities, rent is <strong>10 × the dice total</strong>.</p></div>}
    {tile.kind === 'go' && <div className="special-tile-detail"><h3>A fresh lap. A fresh start.</h3><p>Collect {money(GO_SALARY)} whenever you pass or land on Go.</p></div>}
    {tile.kind === 'tax' && <div className="special-tile-detail"><h3>A small cost of a big empire.</h3><p>Pay {money(tile.amount)} to the bank when you land here.</p></div>}
    {tile.kind === 'chance' && <div className="special-tile-detail"><h3>Fortune favors the curious.</h3><p>Draw a Chance card. A surprise payment, a new destination, or an unexpected bill could be next.</p></div>}
    {tile.kind === 'treasure' && <div className="special-tile-detail"><h3>A little community good fortune.</h3><p>Draw a Treasure card and follow its instructions. Your next little windfall might be waiting.</p></div>}
    {tile.kind === 'vacation' && <div className="special-tile-detail"><h3>Even tycoons need a sea breeze.</h3><p>Take a free stop at Kuakata Sea Beach. There is no rent, tax, or bonus here. Just a moment to enjoy the view.</p></div>}
    {tile.kind === 'jail' && <div className="special-tile-detail"><h3>Just visiting? Carry on.</h3><p>Landing here normally is a free visit. If sent to jail, pay {money(BAIL)} or try to roll doubles to leave.</p></div>}
    {tile.kind === 'goToJail' && <div className="special-tile-detail"><h3>A detour you didn’t plan.</h3><p>Go directly to jail. Your turn ends and you do not collect a Go salary on the way.</p></div>}
    {buildAction?.type === 'build' && tile.kind === 'street' && <button className="button button-primary deed-build" disabled={disabled} onClick={() => onAction(buildAction)}>{pending === 'build' ? <Spinner /> : <House size={17} />}{deed?.level === 4 ? 'Build a hotel' : 'Build a house'}<span>{money(tile.buildCost)}</span></button>}
  </div></div></Modal>;
}

export default function App() {
  const client = useRoom();
  const { session, connection, pending, error } = client;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [sound, setSound] = useState(() => readPreference('deshi.sound', 'on') === 'on');
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const game = session?.view.game;
  const disabled = !!pending || connection !== 'online';

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => {
      document.removeEventListener('fullscreenchange', handler);
      window.clearTimeout(copyTimer.current);
      void audio.current?.close();
    };
  }, []);

  function rollSound() {
    if (!sound) return;
    try {
      audio.current ??= new AudioContext();
      const context = audio.current;
      void context.resume();
      for (let index = 0; index < 5; index++) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.07;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(170 + index * 37, start);
        oscillator.frequency.exponentialRampToValueAtTime(65, start + 0.05);
        gain.gain.setValueAtTime(0.035, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(start); oscillator.stop(start + 0.07);
      }
    } catch { /* Sound is optional when the browser has no audio device. */ }
  }

  function play(action: GameAction) {
    if (action.type === 'roll') rollSound();
    void client.command({ type: 'play', action });
  }

  async function copyInvite() {
    if (!session) return;
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('room', session.view.code);
    try {
      await navigator.clipboard.writeText(url.toString());
      setCopied(true); setCopyError(null);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2500);
    } catch { setCopyError(`Copy this room code and share it with your friends: ${session.view.code}`); }
  }

  function leave() {
    if (game?.status === 'playing') setLeaveOpen(true);
    else void client.command({ type: 'leave' });
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setCopyError('Your browser cannot enter full screen here. You can expand the browser window instead.'); }
  }

  const gameTools = <nav className="header-actions" aria-label="Game tools"><button className="how-to-play" onClick={() => setRulesOpen(true)}><CircleHelp size={16} /><span>How to play</span></button><span className="header-divider" /><button className="icon-button" aria-label={sound ? 'Turn sound off' : 'Turn sound on'} aria-pressed={sound} title={sound ? 'Sound on' : 'Sound off'} onClick={() => { setSound(!sound); writePreference('deshi.sound', !sound ? 'on' : 'off'); }}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="icon-button fullscreen-button" aria-label={fullscreen ? 'Exit full screen' : 'Enter full screen'} title={fullscreen ? 'Exit full screen' : 'Full screen'} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button></nav>;

  return <div className={`app${session ? ' app--in-room' : ' app--home'}${fullscreen ? ' app--fullscreen' : ''}`}><header className="site-header"><div className="header-inner"><a className="brand" href={window.location.pathname} onClick={(event) => { if (session) event.preventDefault(); }} aria-label="Deshi Tycoon home"><span className="brand-mark"><Dices size={24} strokeWidth={2.3} /></span><span className="brand-name">DESHI TYCOON<span>BIG DREAMS. DESHI STREETS.</span></span></a><span className="edition"><BangladeshFlag />Bangladesh edition</span>{gameTools}</div></header>
    {fullscreen && <button className="fullscreen-exit" onClick={() => void toggleFullscreen()}><Minimize2 size={16} aria-hidden="true" /><span>Exit full screen</span></button>}
    <main className={`workspace${session ? '' : ' workspace--welcome'}`}>
      {(error || copyError) && <div className="error-banner" role="alert"><CircleAlert size={17} /><p>{error ?? copyError}</p>{connection === 'offline' && <button onClick={client.reconnect}>Reconnect <Wifi size={13} /></button>}<button className="icon-button" aria-label="Dismiss message" onClick={() => { client.clearError(); setCopyError(null); }}><X size={16} /></button></div>}
      {session ? <div className="game-layout"><div className="table-rail"><Players room={session.view} playerId={session.playerId} disabled={disabled} onRemoveBot={(id) => void client.command({ type: 'removeBot', playerId: id })} /><div className="table-utilities"><div className="table-brand"><span className="brand-mark"><Dices size={18} strokeWidth={2.3} /></span><span className="brand-name">DESHI TYCOON<span>BIG DREAMS. DESHI STREETS.</span></span></div>{gameTools}</div></div><Board room={session.view} playerId={session.playerId} pending={pending} disabled={disabled} onAction={play} onSelect={setSelectedTile} onLeave={leave} />{game ? <GamePanel client={client} copied={copied} onCopy={() => void copyInvite()} onSelect={setSelectedTile} onLeave={leave} /> : <Lobby client={client} copied={copied} onCopy={() => void copyInvite()} onLeave={leave} onRules={() => setRulesOpen(true)} />}</div> : <div className="welcome-stage"><div className="welcome-board-preview" aria-hidden="true" inert><Board room={null} playerId={null} pending={pending} disabled onAction={play} onSelect={setSelectedTile} onLeave={leave} /></div><Lobby client={client} copied={copied} onCopy={() => void copyInvite()} onLeave={leave} onRules={() => setRulesOpen(true)} /></div>}
    </main><footer className="site-footer"><span>Made for game nights. <strong>Made for Bangladesh.</strong></span><div><button onClick={() => setRulesOpen(true)}>The house rules <ArrowUpRight size={11} /></button><span>Play for the bragging rights.</span></div></footer>
    {rulesOpen && <Rules startingCash={session?.view.startingCash ?? null} onClose={() => setRulesOpen(false)} />}{selectedTile && <TileDetails tile={selectedTile} room={session?.view ?? null} playerId={session?.playerId ?? null} disabled={disabled} pending={pending} onAction={play} onClose={() => setSelectedTile(null)} />}{leaveOpen && <Modal title="Leave this game?" onClose={() => setLeaveOpen(false)} className="leave-modal"><p className="modal-intro">Your properties return to the bank and you cannot rejoin this seat.</p><div className="confirm-buttons"><button className="button button-secondary" onClick={() => setLeaveOpen(false)}>Keep playing</button><button className="button button-danger" disabled={disabled} onClick={() => { setLeaveOpen(false); void client.command({ type: 'leave' }); }}>Leave game <ArrowUpRight size={16} /></button></div></Modal>}
  </div>;
}
