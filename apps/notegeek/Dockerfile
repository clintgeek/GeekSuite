# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/notegeek ./apps/notegeek

# Install ALL workspace deps
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build frontend
WORKDIR /app/apps/notegeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN apk add --no-cache vips
RUN npm install -g pnpm

# Copy workspace manifests + shared packages + backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/notegeek/backend ./apps/notegeek/backend

# Install production deps (resolves workspace:* links)
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/notegeek/backend

# Copy built frontend into backend public folder
COPY --from=build /app/apps/notegeek/frontend/dist ./public

EXPOSE 9988
CMD ["node", "server.js"]
