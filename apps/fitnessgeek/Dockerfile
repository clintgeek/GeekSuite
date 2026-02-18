# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/fitnessgeek ./apps/fitnessgeek

# Install ALL workspace deps (resolves workspace:* links + frontend/backend deps)
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# ---------- Build frontend ----------
WORKDIR /app/apps/fitnessgeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN apk add --no-cache vips
RUN npm install -g pnpm

# Copy workspace manifests + shared packages + backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/fitnessgeek/backend ./apps/fitnessgeek/backend

# Install production deps (resolves workspace:* links)
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend into backend public folder
WORKDIR /app/apps/fitnessgeek/backend
COPY --from=build /app/apps/fitnessgeek/frontend/dist ./public

EXPOSE 3001
CMD ["node", "src/server.js"]
