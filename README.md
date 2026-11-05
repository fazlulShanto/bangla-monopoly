# Deshi Tycoon

A property board game for Bangladesh game nights. Create a private room, share its link, and play with two to six people. Add bots to fill empty seats or start a practice game.

The forty-space board uses Bangladesh cities, airports, and landmarks. Dhaka is the first property after Go and the most expensive property at ৳450, followed by Chittagong at ৳400 and Cox's Bazar at ৳350. Saint Martin is the vacation square. Game money uses taka.

## Run locally

Install Bun 1.4.3 or newer and Docker. Put your MongoDB and Redis connection strings in the root `.env` file as `MONGO_URI` and `REDIS_URI`. The supplied `.env` stays outside Git and Docker images. Use `.env.example` as a reference.

```sh
bun install
bun run setup
docker compose up -d soketi
bun run dev
```

Open [the game](http://localhost:5173). The frontend runs directly under Vite on port 5173. Bun handles the game API on port 3001. Soketi runs in Docker on port 6001. Vite forwards API requests to Bun and Pusher WebSocket connections to Soketi.

`bun run setup` generates missing Soketi app credentials in `.env`. It preserves existing settings and does not print the generated values.

Use one Bun backend for each `MONGO_DB`. Before switching from the full Docker stack to development, run `docker compose stop app gateway`. Soketi can keep running.

Choose starting cash, create a room, and copy the invitation. A friend enters a name, chooses a token, and joins. The host can change and save starting cash in the lobby before the game starts. Each human marks themselves ready. The host starts the game. For play across different computers, use an address that reaches your server or the VPS deployment below.

## Check the game

```sh
bun run typecheck
bun test
bun run build
bun run test:realtime
```

The realtime check requires the running Soketi service and your MongoDB connection. It starts its own backend processes and uses real Pusher private subscriptions. A separate `deshi_tycoon_smoke_*` database holds the test game. The check restarts the backend and verifies saved seats, balances, positions, dice, chat, authorization, and duplicate request handling. It does not change existing game rooms.

## Deploy on Dokploy

The Dokploy stack runs two services: Bun serves the built frontend and game API, and Soketi handles live updates. MongoDB and Redis must be reachable from the containers. Dokploy's Traefik proxy handles HTTPS and routes requests; the stack does not start Caddy.

1. Push the repository to a Git provider that Dokploy can access. Create a **Compose** service, select **Docker Compose** rather than Stack, and set the Compose path to `./compose.dokploy.yaml`.
2. Enable **Isolated Deployments** so both services share a network with Traefik.
3. In the Compose service's **Environment** tab, set `MONGO_URI`, `REDIS_URI`, `SOKETI_APP_ID`, `SOKETI_APP_KEY`, and `SOKETI_APP_SECRET`. Optionally set `MONGO_DB`; it defaults to `deshi_tycoon`. Use the same Soketi credentials for both services. `bun run setup` can generate them in a local `.env` without printing them. Do not use `localhost` for a database running outside the container.
4. Point your domain to the Dokploy server. In **Domains**, add two HTTPS routes for the same domain:

   | Service | Path | Container port | Strip Path |
   | --- | --- | --- | --- |
   | `app` | `/` | `3001` | Off |
   | `soketi` | `/app` | `6001` | Off |

   Leave **Internal Path** empty. The browser uses `/app/*` for its WebSocket connection, so Traefik must forward that path unchanged. Select a certificate for both routes.
5. Deploy the Compose service. Visit `/api/health` on the domain, then create a room in two browser sessions and check that changes appear in both.

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

## Game rules

Each player starts with the amount chosen by the host: ৳500–৳10,000 in whole taka, with a default of ৳1,500. The same setting applies to practice games and bots. Starting cash cannot change after play begins. Passing Go pays ৳200. Roll two dice, buy an unowned property or pass, and pay rent on another player's property. Collect a full color group to build evenly. Four houses can become a hotel. Airport rent increases with the number of airports owned. Utility rent depends on the dice.

### Tune game values

Edit `GAME_CONFIG` in `packages/game/src/config.ts`. Each property has a named entry with its purchase price, building cost, and six rent amounts. Both the board and backend use these values.

```ts
dhaka: { price: 450, buildCost: 200, rent: [55, 225, 650, 1500, 1800, 2200] },
```

Rent amounts run from no buildings through one, two, three, and four houses, then a hotel. The same object contains starting cash defaults and limits, airport and utility prices, taxes, the Go salary, and bail. Restart the backend after editing. Changes apply to the whole game, including existing rooms; existing player balances stay as saved.

Doubles grant another roll. Three consecutive doubles send a player to jail. A jailed player can pay ৳50 or try to roll doubles. A third failed attempt requires bail. Saint Martin is a free vacation square. Chance and Treasure cards change money or position.

Use the Trades tab to offer another player cash, properties, or a combination of both. The recipient can accept, decline, or negotiate a counteroffer. You can cancel an offer you sent. Trades are available between turns. Cash and properties move only when the recipient accepts, and offers close if their assets become unavailable. Streets in a color group with houses or a hotel cannot be traded. Bots compare the cash and property prices on both sides when they respond.

This version uses house rules. An unpaid mandatory bill causes immediate bankruptcy. The last solvent player wins. Auctions, mortgages, and building sales are not included.

## Repository

- `apps/web` contains the React interface, CSS board and dice, and Pusher client.
- `apps/server` contains the Bun HTTP server, room coordinator, rules engine, bots, and MongoDB store.
- `packages/game` contains the shared board, types, and HTTP contracts.

The server controls dice, balances, ownership, and legal actions. Authenticated HTTP requests carry commands and personalized game snapshots. Private Pusher channels carry revision hints. MongoDB saves game state, request receipts, and hashed reconnect credentials. The browser saves its private credential before creating a seat. A refresh can restore that seat. Invitation links contain the room code and never the resume token.

The frontend uses [React](https://react.dev/) and [Vite](https://vite.dev/guide/). Realtime uses self-hosted [Soketi](https://github.com/soketi/soketi) with the [Pusher protocol](https://pusher.com/docs/channels/using_channels/private-channels/).
