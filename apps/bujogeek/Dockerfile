# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/bujogeek ./apps/bujogeek

# Install ALL workspace deps (resolves workspace:* links + frontend/backend deps)
RUN npm install -g pnpm
RUN pnpm install --frozen-lockfile

# ---------- Build frontend ----------
WORKDIR /app/apps/bujogeek/frontend
RUN pnpm run build


# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app

# Install backend production deps
COPY apps/bujogeek/backend/package*.json ./apps/bujogeek/backend/
WORKDIR /app/apps/bujogeek/backend

RUN npm install --production

# Copy backend source
COPY apps/bujogeek/backend .

# Copy built frontend into backend public folder
COPY --from=build /app/apps/bujogeek/frontend/dist ./public

EXPOSE 5005
CMD ["npm", "start"]
