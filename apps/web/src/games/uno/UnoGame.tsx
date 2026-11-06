import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Copy, Check, Layers, LogOut, UsersRound, Wifi, X } from 'lucide-react';
import { Modal } from '../../ui';
import { useRoom } from '../../useRoom';
import { UnoShowcase } from './UnoCards';
import UnoRules from './UnoRules';
import UnoSetup from './UnoSetup';
import UnoWaiting from './UnoWaiting';
import UnoTable from './UnoTable';
import './uno.css';

export default function UnoGame() {
  const client = useRoom('uno');
  const { session, connection, pending, error } = client;
  const [rulesOpen, setRulesOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { document.title = 'UNO — Game Night'; return () => { if (copyTimer.current) clearTimeout(copyTimer.current); }; }, []);
  useEffect(() => { if (!session) setLeaveOpen(false); }, [session]);
  const game = session?.view.unoGame;
  async function copyInvite() {
    if (!session) return;
    const address = new URL('/games/uno', window.location.origin);
    address.searchParams.set('room', session.view.code);
    try { await navigator.clipboard.writeText(address.href); setCopied(true); setCopyError(null); if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2500); }
    catch { setCopyError(`Share room code ${session.view.code} with your friends.`); }
  }
  return <div className={`uno-app${game ? ' uno-app-playing' : ''}`}>
    <header className="uno-header"><a className="uno-back" href="/" aria-label="All games"><ArrowLeft size={17} /><span>GAME NIGHT</span></a><div className="uno-header-divider" /><a className="uno-wordmark" href="/games/uno" onClick={(event) => { if (session) event.preventDefault(); }}>UNO<span className="uno-color-dots"><i /><i /><i /><i /></span></a><nav aria-label="UNO tools"><span className={`uno-connection ${connection === 'online' ? 'is-online' : ''}`}><i />{connection === 'online' ? session ? 'Connected' : 'Ready to play' : connection === 'connecting' ? 'Connecting…' : connection === 'restoring' ? 'Restoring seat…' : 'Offline'}</span><button className="uno-header-button" aria-label="How to play" onClick={() => setRulesOpen(true)}><CircleHelp size={17} /><span>How to play</span></button>{session && <button className="uno-header-button" aria-label="Leave game" disabled={!!pending || connection !== 'online'} onClick={() => game?.status === 'playing' ? setLeaveOpen(true) : void client.command({ type: 'leave' })}><LogOut size={17} /><span>Leave</span></button>}</nav></header>
    <main className="uno-content">
      {(error || copyError) && <div className="uno-error" role="alert"><p>{error ?? copyError}</p>{connection === 'offline' && <button onClick={client.reconnect}><Wifi size={16} />Reconnect</button>}<button aria-label="Dismiss message" onClick={() => { client.clearError(); setCopyError(null); }}><X size={17} /></button></div>}
      {session && <div className="uno-room-bar"><div><span className="uno-color-dots"><i /><i /><i /><i /></span><span>{session.view.kind === 'practice' ? 'Practice table' : 'Your private table'}</span></div>{session.view.kind === 'friends' && <button onClick={() => void copyInvite()} aria-label="Copy room invite">{session.view.code}{copied ? <Check size={14} /> : <Copy size={14} />}</button>}</div>}
      {game ? <UnoTable client={client} game={game} onRules={() => setRulesOpen(true)} /> : session ? <UnoWaiting client={client} onCopy={() => void copyInvite()} copied={copied} /> : <div className="uno-welcome"><section className="uno-welcome-story"><div className="uno-big-wordmark">UNO<span>.</span></div><h1>Small cards.<br /><span>Big feelings.</span></h1><p>Friendships are about to get colorful.<br />Match, reverse, and race to your last card.</p><UnoShowcase /><div className="uno-welcome-details"><span><UsersRound size={17} />2–6 players</span><span><Layers size={17} />One unforgettable hand</span></div></section><UnoSetup client={client} /></div>}
    </main>
    <footer className="uno-footer"><span>Good cards. Better company.</span><span>Part of Game Night <span className="uno-color-dots"><i /><i /><i /><i /></span></span></footer>
    {rulesOpen && <UnoRules onClose={() => setRulesOpen(false)} />}
    {leaveOpen && <Modal title="Leave this round?" onClose={() => setLeaveOpen(false)} className="uno-modal"><p className="uno-modal-intro">You’ll give up your place in this round. The other players can keep playing.</p><div className="uno-confirm-buttons"><button className="uno-button uno-button-secondary" onClick={() => setLeaveOpen(false)}>Keep playing</button><button className="uno-button uno-button-danger" disabled={!!pending || connection !== 'online'} onClick={() => { void client.command({ type: 'leave' }).then((left) => { if (left) setLeaveOpen(false); }); }}>Leave round <LogOut size={16} /></button></div></Modal>}
  </div>;
}
