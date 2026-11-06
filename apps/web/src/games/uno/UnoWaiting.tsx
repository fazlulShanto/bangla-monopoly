import type { CSSProperties } from 'react';
import { ArrowRight, Bot, Check, Crown, Link, Plus, X } from 'lucide-react';
import { Spinner, TokenAvatar } from '../../ui';
import { UnoShowcase } from './UnoCards';
import type { UnoRoomClient } from './types';

export default function UnoWaiting({ client, onCopy, copied }: { client: UnoRoomClient; onCopy: () => void; copied: boolean }) {
  const { session, pending, connection } = client;
  if (!session) return null;
  const { view, playerId } = session;
  const host = view.hostId === playerId;
  const practice = view.kind === 'practice';
  const me = view.seats.find((seat) => seat.id === playerId);
  const ready = view.seats.length >= 2 && view.seats.every((seat) => seat.kind === 'bot' || (seat.ready && seat.connected));
  const disabled = !!pending || connection !== 'online';
  return <section className="uno-waiting">
    <div className="uno-waiting-copy"><h1>{practice ? 'Another hand.' : 'Good company.'}<br /><span>{practice ? 'Another chance.' : 'Questionable alliances.'}</span></h1><p>{practice ? 'Your practice table is ready. Set your bot lineup and deal a fresh round.' : 'Your table is open. Invite your friends and get ready to turn the whole game around.'}</p><UnoShowcase />{!practice && <div className="uno-invite-ticket"><div><span>Room code</span><strong>{view.code}</strong></div><button className="uno-button uno-button-primary" onClick={onCopy}>{copied ? <Check size={17} /> : <Link size={17} />}{copied ? 'Copied!' : 'Copy invite'}</button></div>}</div>
    <div className="uno-waiting-seats"><div className="uno-section-title"><h2>At the table</h2><span>{view.seats.length} / 6 players</span></div>
      <ul>{view.seats.map((seat) => <li key={seat.id}><span className="uno-seat-avatar" style={{ '--seat-color': seat.color } as CSSProperties}><TokenAvatar token={seat.token} /></span><div><strong>{seat.name}{seat.id === playerId && <small>you</small>}</strong><span>{seat.kind === 'bot' ? 'Bot' : !seat.connected ? 'Reconnecting…' : seat.ready ? 'Ready to play' : 'Getting ready'}</span></div>{seat.id === view.hostId ? <Crown size={16} aria-label="Host" /> : seat.ready ? <Check size={17} className="uno-ready-check" /> : null}{host && seat.kind === 'bot' && <button className="uno-icon-button" aria-label={`Remove ${seat.name}`} disabled={disabled} onClick={() => void client.command({ type: 'removeBot', playerId: seat.id })}><X size={16} /></button>}</li>)}
        {Array.from({ length: 6 - view.seats.length }, (_, index) => <li className="uno-empty-seat" key={`empty-${index}`}><span className="uno-empty-avatar"><Plus size={20} /></span><span>{practice ? 'A seat for a bot' : 'A seat for a friend'}</span><small>OPEN</small></li>)}
      </ul>
      <div className="uno-waiting-actions"><button className={`uno-button ${me?.ready ? 'uno-button-secondary' : 'uno-button-primary'}`} disabled={disabled} onClick={() => void client.command({ type: 'ready', ready: !me?.ready })}><Check size={17} />{me?.ready ? 'You’re ready' : 'I’m ready'}</button>{host && <button className="uno-button uno-button-secondary" disabled={disabled || view.seats.length >= 6} onClick={() => void client.command({ type: 'addBot' })}><Bot size={17} />Add bot</button>}</div>
      {host && <button className="uno-button uno-button-primary uno-start" disabled={disabled || !ready} onClick={() => void client.command({ type: 'start' })}>{pending === 'start' ? <Spinner /> : null}Deal the cards <ArrowRight size={18} /></button>}
      <p className="uno-waiting-hint">{!host ? 'Your host will deal when everyone is ready.' : view.seats.length < 2 ? 'Invite a friend or add a bot to start.' : !ready ? 'Waiting for everyone to be ready.' : 'Everyone’s ready. Let the rivalry begin.'}</p>
    </div>
  </section>;
}

