# Deshi Tycoon

Deshi Tycoon and UNO for game nights with friends. Choose a game, create a private room, and share its link. Both games support two to six players. Add bots to fill empty seats or start a practice game.

The forty-space board uses Bangladesh cities, airports, and landmarks. Mymensingh is the first property after Go. Dhaka is the most expensive property at ৳450, followed by Chittagong at ৳400 and Cox's Bazar at ৳350. Kuakata Sea Beach is the vacation square. Game money uses taka.

## Run locally

Install Bun 1.4.3 or newer and Docker. Put your MongoDB and Redis connection strings in the root `.env` file as `MONGO_URI` and `REDIS_URI`. The supplied `.env` stays outside Git and Docker images. Use `.env.example` as a reference.

```sh
bun install
bun run setup
docker compose up -d soketi
bun run dev
```

Open [the game catalogue](http://localhost:5173) and choose Deshi Tycoon or [UNO](http://localhost:5173/games/uno). Room invite links open the correct game's lobby directly. The frontend runs directly under Vite on port 5173. Bun handles the game API on port 3001. Soketi runs in Docker on port 6001. Vite forwards API requests to Bun and Pusher WebSocket connections to Soketi.

`bun run setup` generates missing Soketi app credentials in `.env`. It preserves existing settings and does not print the generated values.

Use one Bun backend for each `MONGO_DB`. Before switching from the full Docker stack to development, run `docker compose stop app gateway`. Soketi can keep running.

Create a room and copy the invitation. A friend enters a name, chooses a token, and joins. For Deshi Tycoon, the host chooses starting cash and can change it in the lobby. Each human marks themselves ready. The host starts the game. For play across different computers, use an address that reaches your server or the VPS deployment below.

## Check the game

```sh
bun run typecheck
bun test
bun run build
bun run test:realtime
```

The realtime check requires the running Soketi service and your MongoDB connection. It starts its own backend processes and uses real Pusher private subscriptions. A separate `deshi_tycoon_smoke_*` database holds the test game. The check restarts the backend and verifies saved seats, balances, positions, dice, authorization, and duplicate request handling. It does not change existing game rooms. This smoke check covers Deshi Tycoon; Bun tests cover UNO rules and room behavior.

## Deploy on Dokploy

Bun serves the frontend and game API. A separate Soketi service handles live updates through its Redis adapter. MongoDB and Redis must be reachable from their respective containers. Dokploy's proxy handles HTTPS; these services do not start Caddy.

1. Push the repository to a Git provider that Dokploy can access.
2. Create a Dokploy **Compose** service for Soketi, using `./compose.soketi.dokploy.yaml`. In its **Environment** tab, set `REDIS_URI`, `SOKETI_APP_ID`, `SOKETI_APP_KEY`, and `SOKETI_APP_SECRET`. The image includes the Redis adapter configuration. Do not use `localhost` for an external Redis server.
3. Add an HTTPS domain for Soketi. Route `/` to `soketi` on container port `6001`, without stripping the path. Deploy the service.
4. Create a second **Compose** service using `./compose.dokploy.yaml`. Set `MONGO_URI`, `SOKETI_PUBLIC_URL`, `SOKETI_APP_ID`, `SOKETI_APP_KEY`, and `SOKETI_APP_SECRET` in its **Environment** tab. Set `SOKETI_PUBLIC_URL` to the Soketi HTTPS origin, such as `https://ws.example.com`. Optionally set `MONGO_DB`; it defaults to `deshi_tycoon`. Use the same Soketi credentials in both services.
5. Add an HTTPS domain for the game. Route `/` to `app` on container port `3001`, without stripping the path. Deploy the game service.
6. Visit `/api/health` on the game domain. Then create a room in two browser sessions and check that changes appear in both.

The Soketi image includes its configuration file, so Dokploy does not need a file mount from the Git checkout. The credentials and database URIs stay in Dokploy's environment settings. Keep one Bun app instance per `MONGO_DB`, including during updates. Room coordination runs in one process, and MongoDB stores saved room state.

## Deploy on a VPS without Dokploy

Install Docker with Compose. Copy the repository and create a server `.env` with `MONGO_URI`, `REDIS_URI`, and the generated Soketi app credentials. Permit the VPS address in your database network configuration if required.

```sh
docker compose up -d --build
```

The stack contains Bun, Soketi, and a Caddy gateway. Bun serves the built React frontend and the game API. Soketi carries Pusher protocol updates through its Redis adapter. The gateway serves both at [localhost:8080](http://localhost:8080). MongoDB and Redis use your supplied external connections. Set `APP_BIND=0.0.0.0` if you need to expose the HTTP gateway directly.

To use the included HTTPS proxy, point your domain to the VPS. Set `DOMAIN` in `.env`. Open ports 80 and 443, then run:

```sh
docker compose --profile https up -d --build
```

Caddy requests the certificate and forwards HTTP to Bun and WebSocket traffic to Soketi. `/api/health` checks MongoDB and Soketi readiness. Keep one Bun app replica. Room writes run in one server process, and MongoDB stores saved room state.

## Turn timeout

Both games give the current human player 30 seconds to make a move. A valid move restarts the countdown for their next decision. The server stores and enforces the deadline; refreshing, reconnecting, and other players' moves do not extend it. Change `GAME_CONFIG.turnTimeoutMs` in `packages/game/src/config.ts` to adjust the default.

When time runs out, UNO draws one card and passes, or passes if the player already drew. Deshi Tycoon completes the inactive player's turn by rolling, declining purchases, and ending the turn, including extra rolls from doubles. The server applies normal rent, taxes, and jail rules. It does not buy properties or build for the inactive player. Automatic moves pause when all human players disconnect; a returning player resumes the saved game with its original deadline.

## Deshi Tycoon rules

Each player starts with the amount chosen by the host: ৳500–৳10,000 in whole taka, with a default of ৳1,500. The same setting applies to practice games and bots. Starting cash cannot change after play begins. Passing Go pays ৳200. Roll two dice, buy an unowned property or pass, and pay rent on another player's property. Collect a full color group to build evenly. Four houses can become a hotel. Airport rent increases with the number of airports owned. Utility rent depends on the dice.

### Tune game values

Edit `GAME_CONFIG` in `packages/game/src/config.ts`. Each property has a named entry with its purchase price, building cost, and six rent amounts. Both the board and backend use these values.

```ts
dhaka: { price: 450, buildCost: 200, rent: [55, 225, 650, 1500, 1800, 2200] },
```

Rent amounts run from no buildings through one, two, three, and four houses, then a hotel. Set `airportRent` to the rent for owning one, two, three, and four airports, in that order. The same object contains starting cash defaults and limits, airport and utility prices, taxes, the Go salary, and bail. Restart the backend after editing. Changes apply to the whole game, including existing rooms; existing player balances stay as saved.

Doubles grant another roll. Three consecutive doubles send a player to jail. A jailed player can pay ৳50 or try to roll doubles. A third failed attempt requires bail. Kuakata Sea Beach is a free vacation square. Chance and Treasure cards change money or position.

Use the Trades tab to offer another player cash, properties, or a combination of both. The recipient can accept, decline, or negotiate a counteroffer. You can cancel an offer you sent. Trades are available between turns. Cash and properties move only when the recipient accepts, and offers close if their assets become unavailable. Streets in a color group with houses or a hotel cannot be traded. Bots compare the cash and property prices on both sides when they respond.

This version uses house rules. An unpaid mandatory bill causes immediate bankruptcy. The player's properties become unowned, with houses and hotels preserved. Any player who lands on one can buy it from the bank and keep its upgrades. The purchase price is the base property price plus the building cost multiplied by its level: one through four for houses, or five for a hotel. If the debt is owed to another player, that player receives the remaining cash. Leaving a game also releases properties with their upgrades preserved. The last solvent player wins. Auctions, mortgages, and building sales are not included.

## UNO

Open `/games/uno` to create or join a private table. Games have two to six seats, including bots. Practice starts a round against one to five bots. The host can add or remove bots in the lobby.

Each player receives seven cards from a 108-card deck. The first discard is a number card. Each game is one round: the first player to empty their hand wins. The host's **Play again** action returns everyone to the lobby for another round.

- Match the discard's color, number, or action symbol. A Wild lets you choose the next color.
- Skip misses the next player. Reverse changes direction; with two players, it acts as a skip.
- +2 and Wild +4 make the next player draw and miss their turn. Draw cards cannot stack.
- Wild +4 is legal only when you have no card of the current color. The server checks this rule, so there are no challenges.
- You can draw one card even if you have a playable card. If the drawn card is playable, play it or pass. Otherwise, your turn ends automatically. After drawing, only the new card can be played.
- With two cards left, turn on **Say UNO** before playing. If you forget, call **UNO!** before another player catches you. A catch adds two cards. The catch window closes at the next valid play, draw, pass, or resignation.

The server owns the deck, hands, legal moves, and turn order. Each player receives only their own cards; opponents see card counts and card backs. UNO shares the existing authenticated HTTP API, Soketi updates, and MongoDB storage. Each game keeps a separate browser session credential, so switching games preserves its seat.

## Repository

- `apps/web/src/games/uno` contains the UNO screens, table, hand, players, rules, card artwork, and local CSS.
- `apps/web/src` contains the Deshi Tycoon interface and shared navigation, room client, UI components, and preference helpers.
- `apps/server/src/games/uno/engine.ts` contains the UNO rules and bot decisions. Its engine and room tests live beside it.
- `apps/server/src` contains the shared HTTP server, room coordinator, realtime publisher, MongoDB store, and Deshi Tycoon rules.
- `packages/game/src/uno/index.ts` contains shared UNO card, action, and game view types.
- `packages/game/src/index.ts` contains the board and shared HTTP contracts. `packages/game/src/config.ts` contains the Deshi Tycoon game values.

The server controls dice, balances, ownership, cards, and legal actions. Authenticated HTTP requests carry commands and personalized game snapshots. Private Pusher channels carry revision hints. MongoDB saves game state, request receipts, and hashed reconnect credentials. The browser saves its private credential before creating a seat. A refresh can restore that seat. Invitation links contain the room code and never the resume token.

The frontend uses [React](https://react.dev/) and [Vite](https://vite.dev/guide/). Realtime uses self-hosted [Soketi](https://github.com/soketi/soketi) with the [Pusher protocol](https://pusher.com/docs/channels/using_channels/private-channels/).
