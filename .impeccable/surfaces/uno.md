# UNO surface brief

Route: `/games/uno`. Related surface: the home game catalogue.

This brief records the implemented extension. `DESIGN.md` remains the source for the established palette and typography.

## Direction contract

**THESIS:** An evening card table for friends. The cards carry the visual identity, and the table keeps the next move clear.

**OWN-WORLD:** Reuse the established ink, slate, mint, Space Grotesk, and DM Sans. Four-color card faces, warm borders, and oval marks distinguish UNO.

**STORY:** Choose a private room or practice. Gather up to six players. Watch the active player, match a card, and race to an empty hand.

**FIRST VIEWPORT:** The welcome screen pairs a large card fan with room setup. During play, opponents sit above an oval table. Draw and discard piles sit in its center, with the player's hand below and activity beside it.

**FORM:** Code-led extension of the existing system. No concept seed or generated comp was used. Desktop hands fan; mobile hands scroll horizontally. No new raster assets are required.

**FINISH:** Preserve the established design system. Check the welcome screen and six-player table at desktop and mobile sizes.

## Interaction and responsive behavior

Mint outlines identify playable cards and the active opponent. The turn message states whose turn it is. Color names accompany swatches in the table and Wild picker. Opponents show card backs and counts.

The activity rail hides at 860px. At 650px, room setup stacks, the table contracts, and cards form a horizontal row. Card movement stops when reduced motion is requested. Card geometry comes from CSS; action symbols use the existing icon library.

## Verification limits

Source review confirms the established palette and fonts in `uno.css`, `UnoCards.tsx`, and `UnoGame.tsx`. The independent finish reviewer returned `ship` after inspecting the welcome screen and six-player practice at 1470×740 and 390×844. Keyboard-focus appearance was not verified because Chrome blocked further automation. The current browser check uses Chrome because the integrated browser is unavailable, and memory storage because MongoDB is unreachable. Durable storage still requires a live MongoDB verification.
