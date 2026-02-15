ARG BUN_CALIBRE_BASE=geeksuite/bun-calibre:latest

# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app

# Copy workspace root + shared packages
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/bookgeek ./apps/bookgeek

# Install ALL workspace deps (resolves workspace:* links + frontend/backend deps)
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# ---------- Build frontend ----------
WORKDIR /app/apps/bookgeek/web
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM ${BUN_CALIBRE_BASE} AS prod

WORKDIR /app

# Install backend production deps
COPY apps/bookgeek/api/package.json ./apps/bookgeek/api/package.json
WORKDIR /app/apps/bookgeek/api

RUN bun install --production

# Copy backend source
COPY apps/bookgeek/api .

# Copy built frontend into backend public folder
RUN mkdir -p ./public/src
COPY --from=build /app/apps/bookgeek/web/dist ./public/dist
COPY --from=build /app/apps/bookgeek/web/index.html ./public/index.html
COPY --from=build /app/apps/bookgeek/web/manifest.json ./public/manifest.json
COPY --from=build /app/apps/bookgeek/web/offline.html ./public/offline.html
COPY --from=build /app/apps/bookgeek/web/sw.js ./public/sw.js
COPY --from=build /app/apps/bookgeek/web/icons ./public/icons
COPY --from=build /app/apps/bookgeek/web/src/styles.css ./public/src/styles.css

EXPOSE 1800
CMD ["bun", "run", "start"]
