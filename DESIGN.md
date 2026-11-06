---
name: Deshi Tycoon
description: A Bangladesh property game for friends.
colors:
  ink: "#101624"
  surface: "#171f32"
  surface-raised: "#222c42"
  text: "#f5f3eb"
  muted: "#a7b1c6"
  line: "#2a354d"
  mint: "#a1efbd"
  mint-text: "#122a21"
  uno-lobby-bg: "#101116"
  uno-lobby-surface: "#191a23"
  uno-lobby-accent: "#b4a7ff"
  uno-text: "#f6f5fa"
  uno-table-bg: "#082a46"
  uno-table-center: "#14628a"
  uno-table-mid: "#0c4265"
  uno-table-edge: "#061f37"
  uno-table-accent: "#a8e4f4"
  uno-table-action: "#b6eaf7"
  uno-table-action-ink: "#0b324c"
  uno-table-muted: "#b1d1e5"
  uno-playable: "#baf4df"
  uno-card-red: "#ed292d"
  uno-card-yellow: "#ffd12d"
  uno-card-green: "#53ce22"
  uno-card-blue: "#039fd8"
  uno-card-dark: "#111a22"
  uno-card-outline: "#13232e"
  uno-card-paper: "#fffef5"
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "DM Sans, sans-serif"
    fontWeight: 400
  uno-turn:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  uno-card-value:
    fontFamily: "Space Grotesk, sans-serif"
    fontSize: "79cqw"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.04em"
components:
  uno-table-primary:
    backgroundColor: "{colors.uno-table-action}"
    textColor: "{colors.uno-table-action-ink}"
    rounded: "9px"
  uno-lobby-primary:
    backgroundColor: "{colors.uno-lobby-accent}"
    textColor: "#211936"
    rounded: "9px"
---

# Deshi Tycoon visual direction

The game is an evening table for friends. Use an ink blue background, slate tiles, warm white type, and bright mint actions. Orange, violet, rose, and blue identify property groups and player tokens.

The board is the visual centre. Keep it square and display all forty spaces. On desktop, size the board to the available window height, with the player rail and room panel beside it. Place branding and game tools at the bottom of the player rail. On small screens, let the board occupy the width and place controls below it.

Use a bundled expressive sans font, generous spacing between panels, compact game labels, and tabular numbers for balances. Property strips identify color groups. Cities, airports, and Kuakata Sea Beach use miniature 3D scenes on ink-blue backgrounds, with larger artwork in property details. Street upgrades add one green-roofed house per level from one to four, then replace the houses with a coral hotel at level five. Keep the landmark visible and use the server's deed level on the board, previews, and property details. Keep names and unowned property prices readable over the board artwork. Other spaces use simple icons. Draw dice with CSS perspective and animate a roll as the authored game moment. Animate tokens along the inside edge of the board, next to their spaces. Respect reduced-motion preferences.

Show a numbered, player-colored key badge at the bottom-left of each owned property and beside its owner in the player list. Beside the badge, show an up arrow and the current level for upgraded streets: 1–4 for houses and 5 for a hotel. Keep these badges distinct from the moving player tokens and the property color groups. Show the owner's full name in property details.

The home screen presents available games as cards. Selecting Deshi Tycoon opens its welcome screen, which places room setup and game information in an overlay over a board preview. Existing room links open the Deshi Tycoon lobby directly. After a room is created or joined, show the board, actual seats, and the room code. Empty seats invite friends. Do not present fictional friends or activity as a live match.

During an active game, use the board centre for dice, turn controls, and recent activity. Remove the centre wordmark, flag, slogans, and decorative brand labels. Keep branding in the lobby and app header. Show the newest real events first and reduce the number of visible events on small boards.

Keep game text readable. Right-panel metadata, including turn details, must be at least 12px; activity body text uses 14px. Property names use 12px and prices 11px on boards wider than 580px. Smaller boards use fewer activity rows and more compact labels, with readable details available on tap. Use intentional break opportunities for long city names rather than arbitrary character breaks.

The active game replaces the room controls with the current turn, dice, purchase decisions, player balances, property management, and live activity. All visible controls must perform their stated action.

## UNO visual direction

### Overview

**Creative North Star: "An evening table for friends"**

The supplied blue card-table reference sets the active UNO game's visual direction. Opponents surround centered draw and discard piles. The local hand overlaps along the bottom. Keep the Deshi Tycoon design above and the charcoal UNO lobby unchanged.

**Key Characteristics:**

- A blue playing surface with opponents in their seats.
- Vivid physical cards with white rims and diamond centers.
- Clear legal actions, named colors, and private hands.

### Colors

The `uno-lobby-*` tokens retain the charcoal welcome and waiting screens with lavender actions. The `uno-table-*` tokens apply only during active play: deep blue edges, a brighter blue center, pale cyan controls, and blue-tinted secondary text. Mint outlines mark playable cards. Card colors use the shared `uno-card-*` tokens in the catalogue, lobby, and table.

### Typography

Space Grotesk carries headings, card values, and compact control labels. DM Sans carries body text and metadata. Turn messages use the `uno-turn` role, reducing to 21px on short desktop windows and 20px on mobile. Card lettering scales with each card's width.

### Layout

The active table replaces the player rail. Opponents occupy the north and side seats according to their count. The local player stays at the bottom. Draw and discard piles, turn status, and match guidance stay together in the center. Curved arrows around the piles show the direction and flip when Reverse is played.

The local hand overlaps and scrolls horizontally when necessary. At 760px and narrower, opponent cards and labels shrink while their seat positions remain around the table. A further adjustment at 400px reduces the piles and local cards. Short desktop windows use a compact table and smaller cards. Exact layout values and verification belong to the UNO surface brief.

### Elevation & Depth

Confirmed plays move a card from the local hand or opponent seat into the discard pile over 560ms. Keep the previous discard visible until the moving card lands. Initial loads and reconnects do not replay old moves. Reduced-motion mode updates the pile immediately.

Soft shadows lift the cards from the blue surface. Offset card layers give the draw pile physical depth. The recent-moves list opens above its control on a dark blue surface. Preserve visible keyboard focus and reduced-motion behavior.

### Shapes

Card faces use white rims, dark inset borders, and a large light diamond behind outlined values or action symbols. Wild cards and black backs use a four-color diamond. Rounded opponent labels remain visually quieter than the cards.

### Components

Playable cards lift slightly and gain mint outlines. Hover or keyboard focus lifts an available card farther above its neighbors. Opponents show card backs and actual card counts. Current players receive a pale outline around their label. Color names accompany swatches and Wild choices.

Recent moves opens the newest five events, newest first. The latest event also appears below the local hand. The table's base colors, responsive layout, and artwork live in separate UNO stylesheets.
