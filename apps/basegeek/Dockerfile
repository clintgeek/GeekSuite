# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app

# Install build dependencies for native modules (sharp, etc.)
RUN apk add --no-cache python3 make g++ vips-dev

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/basegeek ./apps/basegeek

# Install ALL workspace deps (resolves workspace:* links)
RUN npm install -g pnpm
RUN pnpm install

# Build the frontend (UI)
WORKDIR /app/apps/basegeek/packages/ui
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

WORKDIR /app
RUN apk add --no-cache vips

# Copy the API source and its resolved node_modules from the build stage
COPY --from=build /app/apps/basegeek/packages/api ./apps/basegeek/packages/api
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/basegeek/node_modules ./apps/basegeek/node_modules
COPY --from=build /app/apps/basegeek/packages/api/node_modules ./apps/basegeek/packages/api/node_modules

# Copy shared packages (runtime dependency for workspace:* links)
COPY --from=build /app/packages ./packages

# Copy families.json
COPY apps/basegeek/families.json ./apps/basegeek/families.json

# Copy built UI to the expected location
WORKDIR /app/apps/basegeek/packages/api
COPY --from=build /app/apps/basegeek/packages/ui/dist ./../ui/dist

EXPOSE 8987
CMD ["node", "src/server.js"]