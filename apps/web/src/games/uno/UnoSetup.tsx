import { useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Bot, ChevronRight } from 'lucide-react';
import { TOKENS, type TokenId } from '@deshi/game';
import { readPreference, writePreference } from '../../preferences';
import { Spinner, TokenAvatar } from '../../ui';
import type { UnoRoomClient } from './types';

export default function UnoSetup({ client }: { client: UnoRoomClient }) {
  const inviteCode = new URLSearchParams(window.location.search).get('room') ?? '';
  const [mode, setMode] = useState<'create' | 'join'>(inviteCode ? 'join' : 'create');
  const [name, setName] = useState(() => readPreference('deshi.name', ''));
  const [token, setToken] = useState<TokenId>('tiger');
  const [code, setCode] = useState(inviteCode.toUpperCase());
  const [botCount, setBotCount] = useState(3);
  const form = useRef<HTMLFormElement>(null);
  const disabled = !!client.pending || client.connection !== 'online';

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'create') void client.create({ gameType: 'uno', kind: 'friends', name: name.trim(), token });
    else void client.join({ gameType: 'uno', code: code.trim().toUpperCase(), name: name.trim(), token });
  }
  function practice() {
    const input = form.current?.querySelector<HTMLInputElement>('#uno-name');
    if (!name.trim() || !input?.reportValidity()) { input?.focus(); return; }
    void client.create({ gameType: 'uno', kind: 'practice', name: name.trim(), token, botCount });
  }

  return <section className="uno-setup" aria-labelledby="uno-setup-title">
    <h2 id="uno-setup-title">Bring your favorite rivals.</h2><p>Make a private room. Deal everyone in.</p>
    <div className="uno-segment" aria-label="Room action">
      <button type="button" aria-pressed={mode === 'create'} onClick={() => setMode('create')}>Create room</button>
      <button type="button" aria-pressed={mode === 'join'} onClick={() => setMode('join')}>Join room</button>
    </div>
    <form ref={form} onSubmit={submit}>
      <label htmlFor="uno-name">Your name</label>
      <input id="uno-name" placeholder="What should we call you?" autoComplete="nickname" maxLength={24} minLength={1} required value={name} disabled={disabled} onChange={(event) => { setName(event.target.value); writePreference('deshi.name', event.target.value); }} />
      {mode === 'join' && <><label htmlFor="uno-room-code">Room code</label><input id="uno-room-code" className="uno-code-input" placeholder="ABCDEF" autoComplete="off" required minLength={6} maxLength={6} value={code} disabled={disabled} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ''))} /></>}
      <div className="uno-avatar-label"><span>Your avatar</span><span>{TOKENS.find((item) => item.id === token)?.name}</span></div>
      <div className="uno-avatar-picker" role="group" aria-label="Choose your avatar">{TOKENS.map((item) => <button type="button" key={item.id} aria-label={`Choose ${item.name}`} aria-pressed={token === item.id} disabled={disabled} onClick={() => setToken(item.id)}><TokenAvatar token={item.id} /></button>)}</div>
      <button className="uno-button uno-button-primary" disabled={disabled} type="submit">{client.pending === 'create' || client.pending === 'join' ? <><Spinner />Setting your place…</> : <>{mode === 'create' ? 'Create a room' : 'Join the room'}<ArrowRight size={18} /></>}</button>
    </form>
    <div className="uno-practice"><div><Bot size={19} /><span>Just warming up?</span><label className="sr-only" htmlFor="uno-bot-count">Number of bots</label><select id="uno-bot-count" value={botCount} disabled={disabled} onChange={(event) => setBotCount(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((count) => <option key={count} value={count}>{count} {count === 1 ? 'bot' : 'bots'}</option>)}</select></div><button className="uno-button uno-button-secondary" disabled={disabled} onClick={practice}>{client.pending === 'practice' ? <Spinner /> : null}Practice with bots <ChevronRight size={17} /></button></div>
    <p className="uno-setup-footnote">No sign-up. Just a good hand and good company.</p>
  </section>;
}

