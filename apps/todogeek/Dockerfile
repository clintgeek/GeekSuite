# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/todogeek ./apps/todogeek

# Install ALL workspace deps (resolves workspace:* links + frontend/backend deps)
RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile

# ---------- Build frontend ----------
WORKDIR /app/apps/todogeek/frontend
RUN pnpm run build


# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN npm install -g pnpm@10

# Copy workspace manifests + shared packages + backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/todogeek/backend ./apps/todogeek/backend

# Install production deps (resolves workspace:* links)
RUN pnpm install --frozen-lockfile --prod

# Copy built frontend into backend public folder
WORKDIR /app/apps/todogeek/backend
COPY --from=build /app/apps/todogeek/frontend/dist ./public

EXPOSE 5005
CMD ["node", "server.js"]
