# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/photogeek ./apps/photogeek

# Install ALL workspace deps (resolves workspace:* links + frontend/backend deps)
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# ---------- Build frontend ----------
WORKDIR /app/apps/photogeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN apk add --no-cache vips

# Install backend production deps
COPY apps/photogeek/backend/package*.json ./apps/photogeek/backend/
WORKDIR /app/apps/photogeek/backend

RUN npm install --production

# Copy backend source
COPY apps/photogeek/backend .

# Copy built frontend into backend public folder
COPY --from=build /app/apps/photogeek/frontend/dist ./public

EXPOSE 5173
CMD ["npm", "start"]
