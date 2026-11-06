import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { UnoCard, UnoGameView } from '@deshi/game';
import type { UnoRoomClient } from './types';

export const CARD_FLIGHT_MS = 560;

type CardOrigin = { x: number; y: number; width: number; rotation: number };
export type CardFlight = {
  id: number;
  card: UnoCard;
  underneath: UnoCard;
  x: number;
  y: number;
  width: number;
  height: number;
  origin: CardOrigin;
};

export function useUnoCardFlight(game: UnoGameView, playerId: string | undefined, connection: UnoRoomClient['connection']) {
  const tableRef = useRef<HTMLDivElement>(null);
  const discardRef = useRef<HTMLDivElement>(null);
  const observed = useRef({ game, connection });
  const prepared = useRef<{ cardId: string; origin: CardOrigin } | null>(null);
  const [flight, setFlight] = useState<CardFlight | null>(null);
  const finishFlight = useCallback((id: number) => {
    setFlight((current) => current?.id === id ? null : current);
  }, []);

  function preparePlay(cardId: string, element: HTMLButtonElement) {
    const bounds = element.getBoundingClientRect();
    prepared.current = { cardId, origin: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, width: element.offsetWidth, rotation: -5 } };
  }

  useLayoutEffect(() => {
    const previous = observed.current;
    observed.current = { game, connection };
    if (connection !== 'online' || previous.connection !== 'online') {
      setFlight(null);
      prepared.current = null;
      return;
    }
    const play = game.lastPlay;
    if (!play || play.id === previous.game.lastPlay?.id) return;
    if (play.id < (previous.game.lastPlay?.id ?? 0) || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setFlight(null);
      prepared.current = null;
      return;
    }
    const table = tableRef.current;
    const discard = discardRef.current;
    if (!table || !discard) return;
    const target = discard.getBoundingClientRect();
    let origin: CardOrigin | undefined;
    if (play.playerId === playerId && prepared.current?.cardId === game.topCard.id) {
      origin = prepared.current.origin;
    } else {
      const seat = Array.from(table.querySelectorAll<HTMLElement>('[data-player-id]')).find((element) => element.dataset.playerId === play.playerId);
      const source = seat?.querySelector<HTMLElement>('.uno-opponent-hand') ?? (play.playerId === playerId ? table.querySelector<HTMLElement>('.uno-hand') : null);
      if (source) {
        const bounds = source.getBoundingClientRect();
        const card = source.querySelector<HTMLElement>('.uno-hidden-card, .uno-hand-card');
        origin = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, width: card?.offsetWidth ?? discard.offsetWidth * .6, rotation: seat?.dataset.seat === 'west' ? 90 : seat?.dataset.seat === 'east' ? -90 : 5 };
      }
    }
    prepared.current = null;
    if (!origin) { setFlight(null); return; }
    setFlight({ id: play.id, card: game.topCard, underneath: previous.game.topCard, x: target.x + target.width / 2, y: target.y + target.height / 2, width: discard.offsetWidth, height: discard.offsetHeight, origin });
  }, [game, playerId, connection]);

  useEffect(() => {
    const finish = () => { if (flight) finishFlight(flight.id); };
    const resized = () => { prepared.current = null; finish(); };
    const scrolled = (event: Event) => {
      prepared.current = null;
      if (event.target instanceof Element && event.target.classList.contains('uno-hand')) return;
      finish();
    };
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changedPreference = () => { if (preference.matches) finish(); };
    // Finish if the viewport changes so a card cannot land at an obsolete position.
    window.addEventListener('resize', resized);
    window.addEventListener('scroll', scrolled, true);
    document.addEventListener('visibilitychange', finish);
    preference.addEventListener('change', changedPreference);
    const timeout = flight ? setTimeout(finish, CARD_FLIGHT_MS + 100) : null;
    return () => {
      if (timeout !== null) clearTimeout(timeout);
      window.removeEventListener('resize', resized);
      window.removeEventListener('scroll', scrolled, true);
      document.removeEventListener('visibilitychange', finish);
      preference.removeEventListener('change', changedPreference);
    };
  }, [flight, finishFlight]);

  return { tableRef, discardRef, flight, preparePlay, finishFlight };
}
