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
typography:
  display:
    fontFamily: "Space Grotesk, sans-serif"
    fontWeight: 700
  body:
    fontFamily: "DM Sans, sans-serif"
    fontWeight: 400
---

# Deshi Tycoon visual direction

The game is an evening table for friends. Use an ink blue background, slate tiles, warm white type, and bright mint actions. Orange, violet, rose, and blue identify property groups and player tokens.

The board is the visual centre. Keep it square and display all forty spaces. On desktop, size the board to the available window height, with the player rail and room panel beside it. Place branding and game tools at the bottom of the player rail. On small screens, let the board occupy the width and place controls below it.

Use a bundled expressive sans font, generous spacing between panels, compact game labels, and tabular numbers for balances. Property strips identify color groups. Cities, airports, and Kuakata Sea Beach use miniature 3D scenes on ink-blue backgrounds, with larger artwork in property details. Street upgrades add one green-roofed house per level from one to four, then replace the houses with a coral hotel at level five. Keep the landmark visible and use the server's deed level on the board, previews, and property details. Keep names and unowned property prices readable over the board artwork. Other spaces use simple icons. Draw dice with CSS perspective and animate a roll as the authored game moment. Animate tokens along the inside edge of the board, next to their spaces. Respect reduced-motion preferences.

Show a numbered, player-colored key badge at the bottom-left of each owned property and beside its owner in the player list. Beside the badge, show an up arrow and the current level for upgraded streets: 1–4 for houses and 5 for a hotel. Keep these badges distinct from the moving player tokens and the property color groups. Show the owner's full name in property details.

The welcome screen places room setup and game information in an overlay over a board preview. After a room is created or joined, show the board, actual seats, and the room code. Empty seats invite friends. Do not present fictional friends or activity as a live match.

During an active game, use the board centre for dice, turn controls, and recent activity. Remove the centre wordmark, flag, slogans, and decorative brand labels. Keep branding in the lobby and app header. Show the newest real events first and reduce the number of visible events on small boards.

Keep game text readable. Right-panel metadata, including turn details, must be at least 12px; activity body text uses 14px. Property names use 12px and prices 11px on boards wider than 580px. Smaller boards use fewer activity rows and more compact labels, with readable details available on tap. Use intentional break opportunities for long city names rather than arbitrary character breaks.

The active game replaces the room controls with the current turn, dice, purchase decisions, player balances, property management, and live activity. All visible controls must perform their stated action.
