# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
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

# Install backend production deps
COPY apps/flockgeek/backend/package*.json ./apps/flockgeek/backend/
WORKDIR /app/apps/flockgeek/backend

RUN npm install --production

# Copy backend source
COPY apps/flockgeek/backend .

# Copy built frontend into backend public folder
COPY --from=build /app/apps/flockgeek/frontend/dist ./public

EXPOSE 5001
CMD ["npm", "start"]
