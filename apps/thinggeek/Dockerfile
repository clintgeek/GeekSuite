# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app

# Workspace manifests + shared packages + this app (frontend AND backend —
# pnpm's workspace resolution needs the backend's package.json present too).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/thinggeek ./apps/thinggeek

RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile

# Build the frontend with Vite
WORKDIR /app/apps/thinggeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
# node:20-slim is Debian (glibc): the prod install below resolves sharp's
# prebuilt @img/sharp-linux-x64 + @img/sharp-libvips-linux-x64 for THIS
# platform. Do not install in the alpine stage and copy node_modules across —
# that would carry the musl binary into a glibc image.
FROM node:20-slim AS prod

# wget for the container healthcheck.
RUN apt-get update && apt-get install -y \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Host-mounted in compose; created here too so a bare `docker run` still works.
RUN mkdir -p /data/files

WORKDIR /app
RUN npm install -g pnpm@10

# Workspace manifests + shared packages + only the backend (the frontend's
# build output is copied in below; its source/devDeps have no business here).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/thinggeek/backend ./apps/thinggeek/backend

# Production deps only (resolves workspace:* links); only the backend package
# is present under apps/thinggeek, so only its deps are installed.
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/thinggeek/backend

# Fail the BUILD, not the first upload, if sharp's native binary is missing.
RUN node -e "const s=require('sharp'); console.log('sharp', s.versions.sharp, 'libvips', s.versions.vips)"

# Built frontend → backend/public (src/app.js serves it)
COPY --from=build /app/apps/thinggeek/frontend/dist ./public

EXPOSE 1820
CMD ["node", "server.js"]
