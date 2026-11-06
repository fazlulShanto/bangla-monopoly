# Deshi Tycoon

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
React with TypeScript for the frontend. Bun handles HTTP game commands. Self-hosted Soketi uses the Pusher protocol for realtime updates and Redis for its adapter. MongoDB stores games. Both apps live in one repository. Docker Compose prepares deployment to a VPS.

## Users
Friends who want to play a property trading board game together online.

## Product purpose
Play a complete turn-based property game with private rooms and live updates. The first screen is a friends-room lobby, as confirmed by the user. A practice game is a secondary action.

## Capabilities and constraints
The board uses Bangladesh cities, airports, and landmarks. Mymensingh is the first property after Go. Dhaka is the most expensive property. Chittagong is next, followed by Cox's Bazar. Kuakata Sea Beach is the vacation square. Use taka for game money. Hosts choose starting cash before play; practice games use the same setting. Keep adjustable game values in the shared `GAME_CONFIG` const object.

The user requested polished visuals and animation. RichUp.io is a reference for the board game format. This is a new game, with its own identity.

The user supplied `MONGO_URI` and `REDIS_URI`. Save room and game state and private reconnect credentials in MongoDB. Integrated-browser verification must use a GPT-6.1 Terra agent with ultra reasoning. All new subagents must use ultra reasoning.

## Operating context
Development takes place in this repository. Deployment targets a VPS. The Docker stack includes the Bun backend, Soketi, and a Caddy gateway. The frontend runs directly under Vite during development. MongoDB and Redis use the supplied external connections.

## Open decisions and assumptions
The working name Deshi Tycoon is a proposal. Initial scope assumes two to six players, private invite links, optional bots, and English interface text with Bangla branding. Accounts, payments, custom events, and persistent match history are outside the first playable version.
