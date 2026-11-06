import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameView, SeatView } from '@deshi/game';
import { TradesPanel } from './Trades';

const seats: SeatView[] = [
  { id: 'a', name: 'Asha', color: '#a00', token: 'cat', kind: 'human', connected: true, ready: true },
  { id: 'b', name: 'Bashir', color: '#0a0', token: 'tiger', kind: 'human', connected: true, ready: true },
  { id: 'c', name: 'Chitra', color: '#00a', token: 'deer', kind: 'human', connected: true, ready: true },
];

const game: GameView = {
  status: 'playing', turn: { playerId: 'a', phase: 'roll' }, turnNumber: 1,
  players: seats.map(({ id }) => ({ id, cash: 1500, position: 0, jail: null, status: 'active' })),
  deeds: {}, lastRoll: null, log: [], tradeLog: [], legalActions: [], trades: [],
};

function renderPanel(view: GameView, playerId = 'c') {
  return renderToStaticMarkup(<TradesPanel game={view} seats={seats} playerId={playerId} disabled={false} onCreate={() => {}} onReview={() => {}} />);
}

describe('trade activity', () => {
  test('shows a public empty state below the new trade button', () => {
    const html = renderPanel(game);
    expect(html.indexOf('New trade')).toBeLessThan(html.indexOf('Trade activity'));
    expect(html).toContain('Visible to everyone');
    expect(html).toContain('No trades yet. Offers and responses will appear here for everyone.');
  });

  test('shows other players’ events newest first and lets only participants review their pending offer', () => {
    const view: GameView = {
      ...game,
      log: [{ id: 1, text: 'Chitra rolled 1 + 2.' }],
      tradeLog: [
        { id: 2, text: 'Asha offered trade #1 to Bashir: ৳100 for nothing.' },
        { id: 3, text: 'Bashir accepted trade #1 with Asha: ৳100 for nothing.' },
      ],
      trades: [{ id: 2, fromPlayerId: 'a', toPlayerId: 'b', give: { cash: 20, tiles: [] }, receive: { cash: 0, tiles: [] } }],
    };
    const html = renderPanel(view);
    const text = html.replace(/<[^>]+>/g, '');
    expect(text.indexOf('accepted trade #1')).toBeLessThan(text.indexOf('offered trade #1'));
    expect(text).not.toContain('rolled 1 + 2');
    expect(html).not.toContain('View offer');
    expect(renderPanel(view, 'b')).toContain('View offer');
  });
});
