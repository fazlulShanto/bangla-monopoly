# Deshi Tycoon

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React with TypeScript for the frontend. Bun handles HTTP game commands. Self-hosted Soketi uses the Pusher protocol for realtime updates and Redis for its adapter. MongoDB stores games. Both apps live in one repository. Docker Compose prepares deployment to a VPS.

## Users
Friends who want to play games together online.

## Product purpose
Choose Deshi Tycoon or UNO from the home screen, then open its game-specific lobby. Both games provide private rooms and live updates. A practice game is a secondary action.

## Capabilities and constraints
The board uses Bangladesh cities, airports, and landmarks. Mymensingh is the first property after Go. Dhaka is the most expensive property. Chittagong is next, followed by Cox's Bazar. Kuakata Sea Beach is the vacation square. Use taka for game money. Hosts choose starting cash before play; practice games use the same setting. Keep adjustable game values in the shared `GAME_CONFIG` const object.

UNO lives at `/games/uno` and supports two to six players, including bots. Practice supports one human and one to five bots. Each player starts with seven cards from a 108-card deck. Match colors or values, use action and Wild cards, and call or catch UNO. Each game is one round; the first empty hand wins. Draw cards do not stack, and the server rejects Wild +4 when the player holds the current color. There are no challenges. The host can return the room to its lobby for a rematch.

The backend owns both games' rules. UNO hands stay private in personalized snapshots. Both games share the authenticated HTTP, Soketi, Redis, and MongoDB services. Separate browser session credentials preserve each game's seat when switching between games. Keep shared game and HTTP types in `packages/game`.

The user requested polished visuals and animation. RichUp.io is a reference for the board game format. This is a new game, with its own identity.

The user supplied `MONGO_URI` and `REDIS_URI`. Save room and game state and private reconnect credentials in MongoDB. Integrated-browser verification must use a GPT-6.1 Terra agent with ultra reasoning. All new subagents must use ultra reasoning.

## Operating context
Development takes place in this repository. Deployment targets a VPS. The Docker stack includes the Bun backend, Soketi, and a Caddy gateway. The frontend runs directly under Vite during development. MongoDB and Redis use the supplied external connections.

## Open decisions and assumptions
The working name Deshi Tycoon is a proposal. Initial scope assumes two to six players, private invite links, optional bots, and English interface text with Bangla branding. Accounts, payments, custom events, and persistent match history are outside the first playable version.
