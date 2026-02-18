# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/flockgeek ./apps/flockgeek

# Install ALL workspace deps (resolves workspace:* links + frontend/backend deps)
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# ---------- Build frontend ----------
WORKDIR /app/apps/flockgeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN apk add --no-cache vips
RUN npm install -g pnpm

# Copy workspace manifests + shared packages + backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/flockgeek/backend ./apps/flockgeek/backend

# Install production deps (resolves workspace:* links)
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend into backend public folder
WORKDIR /app/apps/flockgeek/backend
COPY --from=build /app/apps/flockgeek/frontend/dist ./public

EXPOSE 5001
CMD ["node", "src/server.js"]
