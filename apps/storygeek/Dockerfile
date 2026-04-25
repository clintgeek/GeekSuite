# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/storygeek ./apps/storygeek

# Install ALL workspace deps
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# Build frontend
WORKDIR /app/apps/storygeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN apk add --no-cache vips
RUN npm install -g pnpm

# Copy workspace manifests + shared packages + backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/storygeek/backend ./apps/storygeek/backend

# Install production deps (resolves workspace:* links)
RUN pnpm install --frozen-lockfile --prod

WORKDIR /app/apps/storygeek/backend

# Copy built frontend into backend public folder
COPY --from=build /app/apps/storygeek/frontend/dist ./public

EXPOSE 9977
CMD ["node", "src/server.js"]
