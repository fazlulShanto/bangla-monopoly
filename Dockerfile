FROM oven/bun:1.4.3 AS build
WORKDIR /app
COPY package.json bun.lock tsconfig.json ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/server/package.json ./apps/server/package.json
COPY packages/game/package.json ./packages/game/package.json
RUN bun install --frozen-lockfile
COPY apps ./apps
COPY packages ./packages
RUN bun run build

FROM oven/bun:1.4.3 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
COPY --from=build --chown=bun:bun /app/package.json ./package.json
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/apps/server ./apps/server
COPY --from=build --chown=bun:bun /app/packages/game ./packages/game
COPY --from=build --chown=bun:bun /app/apps/web/dist ./apps/web/dist
USER bun
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD bun -e 'fetch("http://127.0.0.1:3001/api/health").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
CMD ["bun", "run", "apps/server/src/index.ts"]
