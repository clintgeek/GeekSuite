# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app

# Workspace manifests + shared packages + this app (frontend AND backend —
# pnpm's workspace resolution needs the backend's package.json present too).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/newsgeek ./apps/newsgeek

RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile

# Build the frontend with Vite
WORKDIR /app/apps/newsgeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
# node:20-slim (Debian), the same base as ThingGeek's backend. NewsGeek has
# no native modules; it simply mirrors the suite pattern.
FROM node:20-slim AS prod

# wget for the container healthcheck.
RUN apt-get update && apt-get install -y \
    wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN npm install -g pnpm@10

# Workspace manifests + shared packages + only the backend (the frontend's
# build output is copied in below; its source/devDeps have no business here).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/newsgeek/backend ./apps/newsgeek/backend

# Production deps only (resolves workspace:* links); only the backend package
# is present under apps/newsgeek, so only its deps are installed.
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/newsgeek/backend

# Built frontend → backend/public (src/app.js serves it)
COPY --from=build /app/apps/newsgeek/frontend/dist ./public

EXPOSE 1830
CMD ["node", "server.js"]
