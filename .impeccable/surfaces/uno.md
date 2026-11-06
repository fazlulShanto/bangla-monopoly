# UNO design brief

Route: `/games/uno`. The home game catalogue also uses the UNO card artwork.

The user's latest reference requests a blue card table with opponents around centered piles and an overlapping local hand. This supersedes the earlier rejection of overlap. Keep the existing charcoal welcome and waiting screens. `DESIGN.md` records scoped UNO tokens alongside the unchanged Deshi Tycoon direction.

## Visual choices

- Use the scoped table palette during play. Preserve the lobby's charcoal panels and lavender controls.
- Keep Space Grotesk and DM Sans. Center turn status above the piles. Show direction with curved arrows around the piles, without a visible direction label.
- Give cards vivid faces, white rims, dark inset borders, and light central diamonds. Use four-color diamonds on Wild cards and black backs.
- Arrange up to five opponents around the north and side seats. Rotate side hands toward the center.
- Center the draw and discard piles. Keep named color and value guidance beneath them.
- Overlap the local hand without rotating it. Let the hand scroll horizontally when needed and show the swipe hint only when it overflows.
- Open the newest five moves through Recent moves at the table's lower edge. Show the latest move below the hand.

## Responsive layout

The table content allows a 1600px container; the play layout caps at 1440px. Local cards are 108×158px and overlap by 24px. The local hand caps at 890px.

At 1050px and narrower, opponent hands shrink and the local hand caps at 780px. At 760px and narrower, the table remains 450px tall, opponent avatars hide, and local cards become 86×126px with 38px overlap. At 400px and narrower, local cards become 80×118px with 36px overlap, and piles become 70×103px.

Desktop windows at most 820px tall use a 410px table, smaller opponent cards, 82×120px piles, and 94×138px local cards. The center sits lower to separate the turn message from the north player's label.

## Interaction

Mint outlines and a small lift identify playable cards. Pale cyan outlines identify the current opponent. Hover and keyboard focus lift available cards above their neighbors. Color names accompany swatches and Wild choices. Opponents show card counts and at most seven card backs. Only the player's own hand appears as card faces.

A confirmed play sends the card from the local hand or opponent seat into the discard pile over 560ms. The server supplies the actor and play ID; duplicate snapshots and reconnects do not replay old cards. The previous discard remains until landing. Reverse flips the arrows. Reduced-motion mode updates the pile immediately.

The welcome screen provides create, join, and bot practice controls. The waiting room shows actual seats, readiness, bot controls, and an invite. During play, the server supplies legal actions. The browser sends play, draw, pass, UNO, and catch commands through the shared room client.

UNO components and CSS live in `apps/web/src/games/uno`. `uno.css` owns lobby styles, `uno-table.css` owns the active table, and `uno-cards.css` owns shared card artwork. Shared preferences, room access, and UI components stay in `apps/web/src`. Preserve keyboard focus and reduced-motion styles.

## Verification status

Typecheck, production build, and all 154 Bun tests pass for this redesign. Chrome checks at 1440×900, 1280×740, and 390×844 confirmed readable seats, center controls, and the local hand. The short-window overlap is resolved. Checks covered mobile hand scrolling, card play, Wild color selection, drawing, Recent moves, and rules. Pass was not checked because the sampled draws were unplayable. The integrated browser was unavailable and was not checked. A natural win, six-human play, and live MongoDB persistence remain unverified in this browser pass.

The card-flight update was observed in Chrome on desktop and mobile, including local and bot plays, an overflowing mobile hand, and a Reverse that flipped the board arrows. Reduced-motion behavior was reviewed in source; browser emulation was unavailable.
