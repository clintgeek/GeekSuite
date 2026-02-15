# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/musicgeek ./apps/musicgeek

# Install ALL workspace deps (resolves workspace:* links + frontend/backend deps)
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# ---------- Build frontend ----------
WORKDIR /app/apps/musicgeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN apk add --no-cache vips

# Install backend production deps
COPY apps/musicgeek/backend/package*.json ./apps/musicgeek/backend/
WORKDIR /app/apps/musicgeek/backend

RUN npm install --production

# Copy backend source
COPY apps/musicgeek/backend .

# Copy built frontend into backend public folder
COPY --from=build /app/apps/musicgeek/frontend/dist ./public

EXPOSE 3005
CMD ["npm", "start"]
