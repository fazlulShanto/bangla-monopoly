import { useId, useState, type FormEvent } from 'react';
import { ArrowLeftRight, ArrowRight, Check, CircleAlert, LockKeyhole, Plus, X } from 'lucide-react';
import { BOARD, type GameView, type PlayerView, type SeatView, type TradeAction, type TradeAssets, type TradeOffer } from '@deshi/game';
import type { useRoom } from './useRoom';
import ActivityText from './ActivityText';
import { Modal, money, Spinner, TileIcon, TokenIcon } from './ui';

type RoomClient = ReturnType<typeof useRoom>;
export type TradeDialogState = { kind: 'create' } | { kind: 'review' | 'counter'; offer: TradeOffer };
type DraftAssets = { cash: string; tiles: number[] };

function otherPlayerId(offer: TradeOffer, playerId: string) {
  return offer.fromPlayerId === playerId ? offer.toPlayerId : offer.fromPlayerId;
}

function mySides(offer: TradeOffer, playerId: string) {
  return offer.fromPlayerId === playerId
    ? { give: offer.give, receive: offer.receive }
    : { give: offer.receive, receive: offer.give };
}

function unavailableProperty(game: GameView, tileId: number, ownerId: string) {
  const tile = BOARD.find((item) => item.id === tileId);
  if (!tile || !('price' in tile) || game.deeds[tileId]?.ownerId !== ownerId) return 'No longer owned';
  if (tile.kind === 'street' && BOARD.some((item) => item.kind === 'street' && item.group === tile.group && (game.deeds[item.id]?.level ?? 0) > 0)) return 'Buildings in this color group';
  return null;
}

function cashValue(value: string) {
  if (!/^\d+$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

function assetsIssue(game: GameView, player: PlayerView | undefined, assets: DraftAssets, name: string) {
  if (!player || player.status !== 'active') return `${name} ${name === 'You' ? 'are' : 'is'} no longer playing. Close this trade and choose another player.`;
  const cash = cashValue(assets.cash);
  if (cash === null) return `Enter a whole cash amount of 0 or more for ${name}.`;
  if (cash > player.cash) return `${name} ${name === 'You' ? 'have' : 'has'} ${money(player.cash)} available. Reduce the cash amount.`;
  if (assets.tiles.some((id) => unavailableProperty(game, id, player.id))) return `Remove unavailable properties from ${name}’s side to continue.`;
  return null;
}

function draftAssets(assets: TradeAssets): DraftAssets {
  return { cash: String(assets.cash), tiles: [...assets.tiles] };
}

function assetDescription(assets: TradeAssets) {
  const pieces = assets.tiles.map((id) => BOARD.find((tile) => tile.id === id)?.name ?? 'Property');
  if (assets.cash > 0) pieces.unshift(money(assets.cash));
  return pieces.length ? pieces.join(' + ') : 'Nothing';
}

export function TradesPanel({ game, seats, playerId, disabled, onCreate, onReview }: {
  game: GameView; seats: SeatView[]; playerId: string; disabled: boolean;
  onCreate: () => void; onReview: (offer: TradeOffer) => void;
}) {
  const offers = game.trades.filter((offer) => offer.fromPlayerId === playerId || offer.toPlayerId === playerId);
  const canTrade = game.status === 'playing' && game.players.some((player) => player.id === playerId && player.status === 'active')
    && game.players.some((player) => player.id !== playerId && player.status === 'active');
  const incoming = offers.filter((offer) => offer.toPlayerId === playerId);
  const outgoing = offers.filter((offer) => offer.fromPlayerId === playerId);
  const hasAvailablePlayer = game.players.some((player) => player.id !== playerId && player.status === 'active' && !offers.some((offer) => otherPlayerId(offer, playerId) === player.id));
  return <div className="trades-panel" id="panel-trades" role="tabpanel" aria-label="Trades">
    <button className="button button-primary new-trade-button" disabled={disabled || !canTrade || !hasAvailablePlayer} onClick={onCreate}><Plus size={17} />New trade<ArrowRight size={16} /></button>
    {canTrade && !hasAvailablePlayer && <p className="trade-panel-note">You have an open offer with every player. Review one below to respond or cancel.</p>}
    {offers.length > 0 && <div className="trade-offers">{([{ title: 'Offers for you', offers: incoming }, { title: 'Waiting for a reply', offers: outgoing }]).filter((section) => section.offers.length).map((section) => <section className="trade-offer-section" key={section.title} aria-label={section.title}><h3>{section.title}<span>{section.offers.length}</span></h3>{section.offers.map((offer) => {
      const incomingOffer = offer.toPlayerId === playerId;
      const other = seats.find((seat) => seat.id === otherPlayerId(offer, playerId));
      const sides = mySides(offer, playerId);
      return <button className="trade-offer" key={offer.id} onClick={() => onReview(offer)}><span className="trade-offer-heading"><span className="trade-player-dot" style={{ backgroundColor: other?.color }} /><strong>{other?.name ?? 'Player'}</strong><span>{incomingOffer ? 'View offer' : 'View trade'}<ArrowRight size={13} /></span></span><span className="trade-offer-assets"><span><small>You give</small>{assetDescription(sides.give)}</span><ArrowLeftRight size={15} /><span><small>You receive</small>{assetDescription(sides.receive)}</span></span></button>;
    })}</section>)}</div>}
    {game.status === 'finished' && <p className="trade-panel-note">Trading is closed. This game has finished.</p>}
    <section className="trade-activity" aria-labelledby="trade-activity-heading">
      <div className="trade-activity-heading"><h3 id="trade-activity-heading">Trade activity</h3><span>Visible to everyone</span></div>
      {game.tradeLog.length ? <ol className="trade-activity-list" role="log" aria-label="Recent trade activity" aria-live="polite" aria-relevant="additions">
        {game.tradeLog.slice().reverse().map((entry) => <li key={entry.id}><p><ActivityText text={entry.text} playerNames={seats.map((seat) => seat.name)} /></p></li>)}
      </ol> : <p className="trade-activity-empty">No trades yet. Offers and responses will appear here for everyone.</p>}
    </section>
  </div>;
}

function TradeAssetsEditor({ game, player, seat, assets, onChange, side, disabled }: {
  game: GameView; player: PlayerView; seat: SeatView; assets: DraftAssets;
  onChange: (assets: DraftAssets) => void; side: 'give' | 'receive'; disabled: boolean;
}) {
  const id = useId();
  const amount = cashValue(assets.cash);
  const properties = BOARD.filter((tile) => game.deeds[tile.id]?.ownerId === player.id || assets.tiles.includes(tile.id));
  const title = side === 'give' ? 'You give' : 'You receive';
  const cashLabel = side === 'give' ? 'Cash you give' : 'Cash you receive';
  function toggle(tileId: number) {
    onChange({ ...assets, tiles: assets.tiles.includes(tileId) ? assets.tiles.filter((id) => id !== tileId) : [...assets.tiles, tileId] });
  }
  return <section className="trade-side" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>{title}</h3><div className="trade-side-player"><span style={{ color: seat.color, backgroundColor: `${seat.color}18` }}><TokenIcon token={seat.token} size={21} /></span><div><strong>{seat.name}</strong><span>{money(player.cash)} available{seat.kind === 'bot' ? ' · Bot' : ''}</span></div></div>
    <div className="trade-cash"><label htmlFor={`${id}-cash`}>{cashLabel}</label><div className="trade-cash-input"><span aria-hidden="true">৳</span><input id={`${id}-cash`} type="number" inputMode="numeric" min="0" max={player.cash} step="1" value={assets.cash} onChange={(event) => onChange({ ...assets, cash: event.target.value })} disabled={disabled} aria-invalid={amount === null || amount > player.cash} /></div><label className="sr-only" htmlFor={`${id}-range`}>{cashLabel} slider</label><input className="trade-cash-slider" id={`${id}-range`} type="range" min="0" max={Math.max(0, player.cash)} step="1" value={Math.min(amount ?? 0, player.cash)} onChange={(event) => onChange({ ...assets, cash: event.target.value })} disabled={disabled || player.cash === 0} aria-valuetext={money(Math.min(amount ?? 0, player.cash))} /><div className="trade-cash-limits"><span>{money(0)}</span><span>{money(player.cash)}</span></div></div>
    <div className="trade-properties-heading"><h4>Properties</h4><span>{assets.tiles.length} selected</span></div>
    <div className="trade-property-options trade-property-options--editable">{properties.length ? properties.map((tile) => {
      const selected = assets.tiles.includes(tile.id);
      const issue = unavailableProperty(game, tile.id, player.id);
      return <label className={`trade-property-option${selected ? ' trade-property-option--selected' : ''}${issue ? ' trade-property-option--unavailable' : ''}`} key={tile.id}><input className="sr-only" type="checkbox" checked={selected} onChange={() => toggle(tile.id)} disabled={disabled || (!!issue && !selected)} /><span className="trade-property-icon" style={{ color: tile.kind === 'street' ? tile.color : '#b7c9e0' }}><TileIcon tile={tile} size={16} /></span><span className="trade-property-details"><strong>{tile.name}</strong><small>{issue ?? ('price' in tile ? money(tile.price) : '')}</small></span>{(selected || issue) && <span className="trade-property-state" aria-hidden="true">{selected ? <Check size={14} /> : <LockKeyhole size={14} />}</span>}</label>;
    }) : <p className="trade-properties-empty">No properties owned yet.<br />You can still trade cash.</p>}</div>
  </section>;
}

function TradeAssetsSummary({ assets, seat, side }: { assets: TradeAssets; seat: SeatView; side: 'give' | 'receive' }) {
  return <section className="trade-side trade-side--summary" aria-label={side === 'give' ? 'What you give' : 'What you receive'}><h3>{side === 'give' ? 'You give' : 'You receive'}</h3><div className="trade-side-player"><span style={{ color: seat.color, backgroundColor: `${seat.color}18` }}><TokenIcon token={seat.token} size={21} /></span><div><strong>{seat.name}</strong><span>{seat.kind === 'bot' ? 'Bot player' : 'Player'}</span></div></div><div className="trade-summary-cash"><span>Cash</span><strong>{money(assets.cash)}</strong></div><div className="trade-properties-heading"><h4>Properties</h4><span>{assets.tiles.length}</span></div><div className="trade-property-options">{assets.tiles.length ? assets.tiles.map((id) => {
    const tile = BOARD.find((item) => item.id === id);
    return tile ? <div className="trade-summary-property" key={id}><span className="trade-property-icon" style={{ color: tile.kind === 'street' ? tile.color : '#b7c9e0' }}><TileIcon tile={tile} size={18} /></span><span>{tile.name}</span><Check size={14} /></div> : null;
  }) : <p className="trade-properties-empty">No properties included.</p>}</div></section>;
}

export function TradeDialog({ client, state, onClose, onCounter }: {
  client: RoomClient; state: TradeDialogState; onClose: () => void; onCounter: (offer: TradeOffer) => void;
}) {
  const session = client.session;
  const game = session?.view.game;
  const playerId = session?.playerId ?? '';
  const initialSides = state.kind === 'counter' ? mySides(state.offer, playerId) : null;
  const [toPlayerId, setToPlayerId] = useState(() => state.kind === 'create'
    ? game?.players.find((player) => player.id !== playerId && player.status === 'active' && !game.trades.some((offer) => otherPlayerId(offer, playerId) === player.id && (offer.fromPlayerId === playerId || offer.toPlayerId === playerId)))?.id ?? ''
    : otherPlayerId(state.offer, playerId));
  const [give, setGive] = useState<DraftAssets>(() => initialSides ? draftAssets(initialSides.give) : { cash: '0', tiles: [] });
  const [receive, setReceive] = useState<DraftAssets>(() => initialSides ? draftAssets(initialSides.receive) : { cash: '0', tiles: [] });
  const [submitting, setSubmitting] = useState<TradeAction['type'] | null>(null);
  const [failed, setFailed] = useState(false);
  const [unexpectedError, setUnexpectedError] = useState<string | null>(null);
  const recipientId = toPlayerId;
  if (!session || !game) return null;
  const seats = session.view.seats;
  const me = game.players.find((player) => player.id === playerId);
  const them = game.players.find((player) => player.id === recipientId);
  const mySeat = seats.find((seat) => seat.id === playerId);
  const theirSeat = seats.find((seat) => seat.id === recipientId);
  const busy = !!client.pending || !!submitting;
  const offline = client.connection !== 'online';
  const offer = state.kind === 'create' ? null : state.offer;
  const available = game.status === 'playing' && me?.status === 'active' && them?.status === 'active'
    && (!offer || game.trades.some((current) => current.id === offer.id));
  const reviewing = state.kind === 'review';
  const incoming = offer?.toPlayerId === playerId;
  const reviewSides = offer ? mySides(offer, playerId) : null;
  const existingOffer = state.kind === 'create' && game.trades.some((current) => (current.fromPlayerId === playerId && current.toPlayerId === recipientId) || (current.toPlayerId === playerId && current.fromPlayerId === recipientId));
  const validation = existingOffer ? `You already have an open trade with ${theirSeat?.name ?? 'this player'}. Choose another player, or close this dialog and review that trade.` : reviewing && reviewSides
    ? assetsIssue(game, me, draftAssets(reviewSides.give), 'You') ?? assetsIssue(game, them, draftAssets(reviewSides.receive), theirSeat?.name ?? 'The other player')
    : assetsIssue(game, me, give, 'You') ?? assetsIssue(game, them, receive, theirSeat?.name ?? 'The other player');
  const empty = !reviewing && cashValue(give.cash) === cashValue(receive.cash) && !give.tiles.length && !receive.tiles.length;
  const error = failed ? unexpectedError ?? client.error ?? 'The trade could not be completed. Check the amounts and properties, then try again.' : null;
  const title = state.kind === 'create' ? 'Create a trade' : state.kind === 'counter' ? 'Make a counteroffer' : incoming ? 'Review trade' : 'Your trade offer';
  function close() { if (!busy) onClose(); }
  function updateGive(next: DraftAssets) { setGive(next); setFailed(false); }
  function updateReceive(next: DraftAssets) { setReceive(next); setFailed(false); }
  async function submit(action: TradeAction) {
    if (busy || offline || !available) return;
    setSubmitting(action.type); setFailed(false); setUnexpectedError(null);
    try {
      if (await client.command({ type: 'trade', action })) onClose();
      else setFailed(true);
    } catch (cause) {
      setUnexpectedError(cause instanceof Error ? cause.message : 'The server could not complete this trade. Reconnect and try again.');
      setFailed(true);
    } finally { setSubmitting(null); }
  }
  function sendOffer(event: FormEvent) {
    event.preventDefault();
    const giveCash = cashValue(give.cash);
    const receiveCash = cashValue(receive.cash);
    if (validation || empty || giveCash === null || receiveCash === null) return;
    void submit({ type: 'offer', toPlayerId: recipientId, give: { cash: giveCash, tiles: give.tiles }, receive: { cash: receiveCash, tiles: receive.tiles }, ...(state.kind === 'counter' ? { replacesTradeId: state.offer.id } : {}) });
  }
  return <Modal title={title} onClose={close} className="trade-modal">
    {!available || !mySeat || !theirSeat || !me || !them ? <div className="trade-unavailable" role="status"><ArrowLeftRight size={30} /><h3>This trade is no longer available.</h3><p>The offer was closed, a player left, or the game finished. Check Trades for current offers.</p><button className="button button-primary" onClick={close} disabled={busy}>Back to the game<ArrowRight size={16} /></button></div> : <form onSubmit={sendOffer}>
      <div className="trade-form-body">
        {state.kind === 'create' ? <div className="trade-recipient"><label htmlFor="trade-recipient">Trade with</label><select id="trade-recipient" value={recipientId} disabled={busy} onChange={(event) => { setToPlayerId(event.target.value); setReceive({ cash: '0', tiles: [] }); setFailed(false); }}>{game.players.filter((player) => player.id !== playerId && player.status === 'active').map((player) => {
          const seat = seats.find((item) => item.id === player.id);
          const hasOffer = game.trades.some((current) => (current.fromPlayerId === playerId && current.toPlayerId === player.id) || (current.toPlayerId === playerId && current.fromPlayerId === player.id));
          return <option value={player.id} key={player.id} disabled={hasOffer}>{seat?.name ?? 'Player'}{seat?.kind === 'bot' ? ' · Bot' : ''}{hasOffer ? ' · Open trade' : ''}</option>;
        })}</select></div> : <p className="trade-intro">{state.kind === 'counter' ? `Adjust the deal with ${theirSeat.name}. Sending it replaces their original offer.` : incoming ? `${theirSeat.name} made you an offer. Review both sides before accepting.` : `Waiting for ${theirSeat.name} to accept, decline, or make a counteroffer.`}</p>}
        <div className="trade-columns">{reviewing && reviewSides ? <><TradeAssetsSummary assets={reviewSides.give} seat={mySeat} side="give" /><TradeAssetsSummary assets={reviewSides.receive} seat={theirSeat} side="receive" /></> : <><TradeAssetsEditor game={game} player={me} seat={mySeat} assets={give} onChange={updateGive} side="give" disabled={busy} /><TradeAssetsEditor game={game} player={them} seat={theirSeat} assets={receive} onChange={updateReceive} side="receive" disabled={busy} /></>}</div>
        {!reviewing && <p className="trade-help"><LockKeyhole size={13} />Streets cannot be traded while their color group has houses or a hotel.</p>}
      </div>
      {(error || validation || offline) && <div className={`trade-feedback${error ? ' trade-feedback--error' : ''}`} role={error ? 'alert' : 'status'}><CircleAlert size={16} /><p>{error ?? (offline ? 'Reconnect to send or respond to this trade. Your draft will stay here.' : validation)}</p></div>}
      {reviewing && offer ? <div className={`trade-dialog-actions${incoming ? ' trade-dialog-actions--incoming' : ''}`}>{incoming ? <><button className="button button-secondary" type="button" onClick={() => void submit({ type: 'decline', tradeId: offer.id })} disabled={busy || offline}>{submitting === 'decline' ? <Spinner /> : <X size={16} />}Decline</button><button className="button button-secondary" type="button" onClick={() => onCounter(offer)} disabled={busy || offline}><ArrowLeftRight size={16} />Counteroffer</button><button className="button button-primary" type="button" onClick={() => void submit({ type: 'accept', tradeId: offer.id })} disabled={busy || offline || !!validation}>{submitting === 'accept' ? <Spinner /> : <Check size={17} />}Accept trade</button></> : <><button className="button button-secondary" type="button" onClick={() => void submit({ type: 'cancel', tradeId: offer.id })} disabled={busy || offline}>{submitting === 'cancel' ? <Spinner /> : <X size={16} />}Cancel offer</button><button className="button button-primary" type="button" onClick={close} disabled={busy}>Done<Check size={16} /></button></>}</div> : <div className="trade-compose-footer"><p>{empty ? cashValue(give.cash) === 0 ? 'Add cash or a property to make an offer.' : 'A cash-only trade needs different amounts on each side.' : 'Nothing changes hands until the offer is accepted.'}</p><div className="trade-dialog-actions"><button className="button button-secondary" type="button" onClick={close} disabled={busy}>Cancel</button><button className="button button-primary" type="submit" disabled={busy || offline || !!validation || empty}>{submitting ? <Spinner /> : <ArrowRight size={17} />}{state.kind === 'counter' ? 'Send counteroffer' : 'Send offer'}</button></div></div>}
    </form>}
  </Modal>;
}
