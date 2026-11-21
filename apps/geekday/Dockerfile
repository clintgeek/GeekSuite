# Build context is the repo root (docker build -f apps/geekday/Dockerfile .).

# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app

# Workspace manifests + shared packages + this app (frontend AND backend —
# pnpm's workspace resolution needs the backend's package.json present too).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/geekday ./apps/geekday

RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile

# Build the frontend with Vite
WORKDIR /app/apps/geekday/frontend
RUN pnpm run build


# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN npm install -g pnpm@10

# Workspace manifests + shared packages + only the backend (the frontend's
# build output is copied in below; its source/devDeps have no business here).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/geekday/backend ./apps/geekday/backend

# Production deps only (resolves workspace:* links). busybox wget (for the
# compose healthcheck) ships with alpine.
RUN pnpm install --frozen-lockfile --prod

# Built frontend -> backend/public (src/app.js serves it)
WORKDIR /app/apps/geekday/backend
COPY --from=build /app/apps/geekday/frontend/dist ./public

EXPOSE 1840
CMD ["node", "server.js"]
