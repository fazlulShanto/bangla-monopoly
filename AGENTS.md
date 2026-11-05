# Working on Deshi Tycoon

Use Bun for package scripts and tests. Keep the board and HTTP types in `packages/game`. The backend owns all game rules and money changes. Realtime uses self-hosted Soketi with the Pusher protocol and a Redis adapter. Do not add Socket.IO.

For verification in the integrated browser, always delegate to `gpt-6.1-terra` with `reasoning_effort="ultra"`, as requested by the user.

Use ultra reasoning for all new subagents.

Keep `MONGO_URI`, `REDIS_URI`, and `SOKETI_APP_SECRET` server-side. Never print credentials, copy `.env` into an image, or expose secrets through a `VITE_` variable. Use isolated room IDs and test databases for verification. Do not delete unrelated database data.

Run `bun run typecheck`, `bun test`, and `bun run build` after changes. Verify game interaction in the integrated browser before reporting that it works.
