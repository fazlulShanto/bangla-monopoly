import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Bot, Check, CheckCheck, CircleHelp, Copy, Dices, Link, LockKeyhole, Plus, ShieldCheck, UsersRound } from 'lucide-react';
import { GAME_CONFIG, STARTING_CASH, TOKENS, type TokenId } from '@deshi/game';
import type { useRoom } from './useRoom';
import { money, Spinner, TokenAvatar } from './ui';

type RoomClient = ReturnType<typeof useRoom>;

export function readPreference(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* A browser without storage can still play. */ }
}

export function InviteControls({ code, onCopy, copied }: { code: string; onCopy: () => void; copied: boolean }) {
  return <div className="invite-controls"><div className="room-code"><span>ROOM CODE</span><strong>{code}</strong><button className="icon-button" onClick={onCopy} aria-label="Copy invite link">{copied ? <Check size={17} /> : <Copy size={16} />}</button></div><button className="button button-secondary copy-invite" onClick={onCopy}>{copied ? <CheckCheck size={16} /> : <Link size={16} />}{copied ? 'Invite link copied' : 'Copy invite link'}<ArrowUpRight size={14} /></button></div>;
}

function StartingCashField({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (value: string) => void }) {
  return <div className="starting-cash-field"><label className="field-label" htmlFor="starting-cash">Starting cash</label><div className="input-with-icon"><span aria-hidden="true">৳</span><input id="starting-cash" type="number" inputMode="numeric" min={GAME_CONFIG.startingCash.min} max={GAME_CONFIG.startingCash.max} step="1" required value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-describedby="starting-cash-help" /><span className="cash-unit">per player</span></div><p id="starting-cash-help">Choose {money(GAME_CONFIG.startingCash.min)}–{money(GAME_CONFIG.startingCash.max)} in whole taka.</p></div>;
}

export default function Lobby({ client, copied, onCopy, onLeave, onRules }: {
  client: RoomClient; copied: boolean; onCopy: () => void; onLeave: () => void; onRules: () => void;
}) {
  const { session, connection, pending } = client;
  const inviteCode = new URLSearchParams(window.location.search).get('room') ?? '';
  const [tab, setTab] = useState<'create' | 'join'>(inviteCode ? 'join' : 'create');
  const [name, setName] = useState(() => readPreference('deshi.name', ''));
  const [token, setToken] = useState<TokenId>('tiger');
  const [code, setCode] = useState(inviteCode.toUpperCase());
  const [cashDraft, setCashDraft] = useState<string | null>(null);
  const startingCash = cashDraft ?? String(session?.view.startingCash ?? STARTING_CASH);
  const disabled = !!pending || connection !== 'online';
  const tokenLabel = tab === 'join' ? 'Preferred avatar' : 'Pick your avatar';

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'create' : event.key === 'End' ? 'join' : tab === 'create' ? 'join' : 'create';
    setTab(next);
    event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-room-tab`)?.focus();
  }

  const formName = () => name.trim();
  async function submit(event: FormEvent) {
    event.preventDefault();
    const entered = tab === 'create'
      ? await client.create({ kind: 'friends', name: formName(), token, startingCash: Number(startingCash) })
      : await client.join({ code: code.trim().toUpperCase(), name: formName(), token });
    if (entered) setCashDraft(null);
  }
  async function saveStartingCash(event: FormEvent) {
    event.preventDefault();
    if (await client.command({ type: 'setStartingCash', startingCash: Number(startingCash) })) setCashDraft(null);
  }
  function practice() {
    if (!formName()) {
      const input = document.getElementById('player-name');
      if (input instanceof HTMLInputElement) { input.focus(); input.reportValidity(); }
      return;
    }
    const cashInput = document.getElementById('starting-cash');
    if (cashInput instanceof HTMLInputElement && !cashInput.reportValidity()) return;
    void client.create({ kind: 'practice', name: formName(), token, botCount: 3, startingCash: tab === 'create' ? Number(startingCash) : STARTING_CASH });
  }

  if (session) {
    const { view, playerId } = session;
    const isHost = view.hostId === playerId;
    const me = view.seats.find((seat) => seat.id === playerId);
    const humansReady = view.seats.filter((seat) => seat.kind === 'human').every((seat) => seat.ready);
    const cashChanged = isHost && Number(startingCash) !== view.startingCash;
    const canStart = view.seats.length >= 2 && humansReady && !cashChanged;
    const reason = cashChanged ? 'Save starting cash before starting the game.' : view.seats.length < 2 ? 'Invite a friend or add a bot to start.' : !humansReady ? 'Waiting for everyone to be ready.' : 'Everyone’s here. Let’s play.';
    return <aside className="room-panel room-panel--lobby"><div className="lobby-heading"><span className="room-status-label"><span className="tiny-dot" />PRIVATE ROOM</span><h2>Your table{' '}<br />is ready.</h2><p>A few friends. A little rivalry.{' '}<br />Send the invite and settle in.</p></div>
      <InviteControls code={view.code} onCopy={onCopy} copied={copied} />
      {isHost ? <form className="lobby-cash-settings" onSubmit={saveStartingCash}><StartingCashField value={startingCash} disabled={disabled} onChange={setCashDraft} /><button className="button button-secondary save-starting-cash" type="submit" disabled={disabled || !cashChanged}>{pending === 'setStartingCash' ? <Spinner /> : <Check size={15} />}{pending === 'setStartingCash' ? 'Saving…' : 'Save starting cash'}</button></form> : <div className="room-starting-cash"><span>Starting cash</span><strong>{money(view.startingCash)} <small>per player</small></strong></div>}
      <div className="ready-summary"><UsersRound size={17} /><span>{view.seats.length} of 6 seats filled</span><span>{view.seats.filter((seat) => seat.ready || seat.kind === 'bot').length} ready</span></div>
      <div className="lobby-room-actions"><button className={`button ${me?.ready ? 'button-ready' : 'button-primary'}`} disabled={disabled} onClick={() => void client.command({ type: 'ready', ready: !me?.ready })}>{pending === 'ready' ? <Spinner /> : <Check size={17} />}{me?.ready ? 'You’re ready' : 'I’m ready'}{me?.ready && <span className="button-sublabel">Click to undo</span>}</button>
        {isHost && <><button className="button button-secondary" onClick={() => void client.command({ type: 'addBot' })} disabled={disabled || view.seats.length >= 6}>{pending === 'addBot' ? <Spinner /> : <Bot size={17} />}Add a bot <Plus size={14} /></button><button className="button button-primary start-game" disabled={disabled || !canStart} onClick={() => void client.command({ type: 'start' })}>{pending === 'start' ? <Spinner /> : <>Start game <ArrowRight size={17} /></>}</button></>}
        <p className="start-reason">{isHost ? reason : 'Your host will start when everyone is ready.'}</p></div>
      <div className="room-bottom-note"><ShieldCheck size={15} /><p>Only people with your invite<br />can join this table.</p></div><button className="text-button leave-button" disabled={disabled} onClick={onLeave}>Leave room <ArrowUpRight size={13} /></button>
    </aside>;
  }

  return <section className="welcome-overlay" aria-labelledby="welcome-title"><div className="welcome-intro">
    <a className="welcome-back" href="/"><ArrowLeft size={16} />All games</a>
    <div className="welcome-brand"><span className="brand-mark"><Dices size={24} strokeWidth={2.3} /></span><span className="brand-name">DESHI TYCOON<span>BIG DREAMS. DESHI STREETS.</span></span></div>
    <div className="welcome-copy"><h1 id="welcome-title">A little luck.<br />A lot of Bangladesh.</h1><p>A board full of Bangladesh. A table full of your favorite people.</p><div className="welcome-facts"><span>2–6 players</span><span>40 spaces</span><span>Private rooms</span></div></div>
    <button className="welcome-rules" type="button" onClick={onRules}><CircleHelp size={18} /><span>How to play</span><ArrowUpRight size={15} /></button>
  </div><div className="welcome-setup"><div className="lobby-heading"><h2>Your next empire starts here.</h2><p>Set up a room, or join your friends.</p></div>
    <div className="segmented-tabs lobby-tabs" role="tablist" aria-label="Choose room action" onKeyDown={moveTab}><button id="create-room-tab" type="button" role="tab" tabIndex={tab === 'create' ? 0 : -1} aria-selected={tab === 'create'} aria-controls="room-form" onClick={() => setTab('create')} className={tab === 'create' ? 'active' : ''}>Create room</button><button id="join-room-tab" type="button" role="tab" tabIndex={tab === 'join' ? 0 : -1} aria-selected={tab === 'join'} aria-controls="room-form" onClick={() => setTab('join')} className={tab === 'join' ? 'active' : ''}>Join room</button></div>
    <form id="room-form" role="tabpanel" aria-labelledby={`${tab}-room-tab`} onSubmit={submit} className="room-form"><div className="room-form-fields"><div><label className="field-label" htmlFor="player-name">Your name</label><div className="input-with-icon"><UserIcon /><input id="player-name" autoComplete="nickname" placeholder="What should we call you?" value={name} minLength={1} maxLength={24} required disabled={disabled} onChange={(event) => { setName(event.target.value); writePreference('deshi.name', event.target.value); }} /></div></div>
      {tab === 'join' ? <div><label className="field-label" htmlFor="room-code-input">Room code</label><div className="input-with-icon code-input"><LockKeyhole size={16} /><input id="room-code-input" autoComplete="off" placeholder="Enter invite code" value={code} minLength={4} maxLength={12} required disabled={disabled} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} /></div></div> : <StartingCashField value={startingCash} disabled={disabled} onChange={setCashDraft} />}</div>
      <div className="token-label"><span className="field-label">{tokenLabel}</span><span>{TOKENS.find((item) => item.id === token)?.name}</span></div><div className="token-picker" role="group" aria-label={tokenLabel}>{TOKENS.map((item) => <button className={`token-option ${token === item.id ? 'selected' : ''}`} key={item.id} type="button" aria-label={`Choose ${item.name} avatar`} aria-pressed={token === item.id} title={item.name} disabled={disabled} onClick={() => setToken(item.id)}><TokenAvatar token={item.id} />{token === item.id && <span className="token-check"><Check size={9} strokeWidth={4} /></span>}</button>)}</div>
      {tab === 'join' && <p className="form-note">If it’s taken, we’ll pick an available avatar.</p>}
      <button className="button button-primary create-button" type="submit" disabled={disabled}>{pending === 'create' || pending === 'join' ? <><Spinner />{tab === 'create' ? 'Creating your room…' : 'Joining your room…'}</> : <>{tab === 'create' ? 'Create room' : 'Join room'}<ArrowRight size={17} /></>}</button><p className="form-note"><LockKeyhole size={11} />Private room. Your rules. Your people.</p>
    </form><div className="practice-section"><span>Just warming up?</span><button className="practice-button" type="button" disabled={disabled} onClick={practice}>{pending === 'practice' ? <Spinner /> : <Bot size={18} />}<span>Practice with bots</span><ArrowUpRight size={15} /></button><p>One you. Three bots. Zero pressure.</p></div>
    <div className="lobby-reassurance"><span><Check size={12} />No sign-up</span><i /><span><Check size={12} />No real money</span></div>
  </div></section>;
}

function UserIcon() { return <span className="name-field-mark" aria-hidden="true"><UsersRound size={16} /></span>; }
