# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/bujogeek ./apps/bujogeek

# Install ALL workspace deps (resolves workspace:* links + frontend/backend deps)
RUN npm install -g pnpm
# --no-frozen-lockfile because @dnd-kit was added to bujogeek deps and
# the workspace lockfile may not have it registered for this consumer yet.
# The packages themselves are already resolved in the lockfile from fitnessgeek.
RUN pnpm install --no-frozen-lockfile

# ---------- Build frontend ----------
WORKDIR /app/apps/bujogeek/frontend
RUN pnpm run build


# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN npm install -g pnpm

# Copy workspace manifests + shared packages + backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/bujogeek/backend ./apps/bujogeek/backend

# Install production deps (resolves workspace:* links)
RUN pnpm install --no-frozen-lockfile --prod

# Copy built frontend into backend public folder
WORKDIR /app/apps/bujogeek/backend
COPY --from=build /app/apps/bujogeek/frontend/dist ./public

EXPOSE 5005
CMD ["node", "server.js"]
