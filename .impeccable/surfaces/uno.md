# UNO design brief

Route: `/games/uno`. The home game catalogue also uses the UNO card artwork.

The user rejected the previous oval table, cream card borders, and overlapping fanned hand. The replacement uses a compact charcoal arena and a separate row of cards. `DESIGN.md` records the UNO palette alongside the unchanged Deshi Tycoon direction.

## Visual choices

- Use `#101116` for the page, `#191a23` for panels, and `#b4a7ff` for primary actions and turn cues.
- Keep Space Grotesk and DM Sans. Use clear turn messages and compact labels.
- Give cards saturated red, yellow, green, or blue faces, large values, and action symbols. Remove cream outer borders.
- Place players in a left rail on desktop and a three-column grid at 860px and narrower.
- Group the turn message, draw pile, and discard in a rectangular arena.
- Keep cards in the player's hand separate, with no overlap or fan rotation. Let the hand scroll horizontally when needed.
- Show recent moves beside the desktop table and the latest move below the hand.

## Interaction

Lavender outlines identify playable cards and the active player. Color names accompany swatches and Wild choices. Opponents show card counts. Only the player's own hand appears as card faces.

The welcome screen provides create, join, and bot practice controls. The waiting room shows actual seats, readiness, bot controls, and an invite. During play, the server supplies legal actions. The browser sends play, draw, pass, UNO, and catch commands through the shared room client.

UNO components and CSS live in `apps/web/src/games/uno`. Shared preferences, room access, and UI components stay in `apps/web/src`. Keyboard focus and reduced-motion styles are defined in the UNO CSS.

## Verification status

Typecheck, production build, and all 151 Bun tests pass after the folder moves and redesign. A fresh browser review returned `ship` at 1440×900, 1280×740, and 390×844. Checks covered six-seat practice, card play, draw and pass, mobile hand scrolling and reload, host readiness, rules, and Wild +4 selection. Chrome was used because the integrated browser was unavailable. The preview uses temporary memory storage. Six human players, a natural win, and live MongoDB persistence were not rechecked in this browser pass.
