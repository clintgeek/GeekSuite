# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/bookgeek ./apps/bookgeek

# Install ALL workspace deps (resolves workspace:* links)
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build frontend using Vite
WORKDIR /app/apps/bookgeek/web
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-slim AS prod

# Install Calibre + wget (for healthcheck)
RUN apt-get update && apt-get install -y \
    calibre \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Create data directories
RUN mkdir -p /data/library /data/covers /data/temp

WORKDIR /app
RUN npm install -g pnpm

# Copy workspace manifests + shared packages + api
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/bookgeek/api ./apps/bookgeek/api

# Install production deps (resolves workspace:* links)
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend into backend public folder
WORKDIR /app/apps/bookgeek/api
COPY --from=build /app/apps/bookgeek/web/dist ./public

EXPOSE 1800
CMD ["node", "src/server.js"]
