# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app

# Copy workspace manifests + shared packages + this app (both frontend and
# backend — the build stage needs the frontend to build, and pnpm's
# workspace resolution needs the backend's package.json present too).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/gamegeek ./apps/gamegeek

RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile

# Build frontend using Vite
WORKDIR /app/apps/gamegeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-slim AS prod

# wget for the container healthcheck. No Calibre/native deps needed here —
# this image is much lighter than BookGeek's.
RUN apt-get update && apt-get install -y \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Host-mounted in compose; created here too so a bare `docker run` still works.
RUN mkdir -p /data/covers /data/imports

WORKDIR /app
RUN npm install -g pnpm@10

# Copy workspace manifests + shared packages + only the backend (the
# frontend's build output is copied in below; its source/devDeps have no
# business in the prod image).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/gamegeek/backend ./apps/gamegeek/backend

# Install production deps (resolves workspace:* links); only the backend
# package is present under apps/gamegeek, so this only installs its deps.
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend into backend public folder
WORKDIR /app/apps/gamegeek/backend
COPY --from=build /app/apps/gamegeek/frontend/dist ./public

EXPOSE 1810
CMD ["node", "server.js"]
