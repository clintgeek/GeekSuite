# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/bookgeek ./apps/bookgeek

# Use local Verdaccio registry for @geeksuite packages
RUN echo "@geeksuite:registry=http://192.168.1.17:4873" > .npmrc

# Install ALL workspace deps
RUN npm install -g pnpm
RUN pnpm install

# Build frontend using Vite
WORKDIR /app/apps/bookgeek/web
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

# Install vips for sharp (if needed by backend)
RUN apk add --no-cache vips

WORKDIR /app

# Copy resolved node_modules and shared packages from build stage
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/apps/bookgeek/api ./apps/bookgeek/api

# Copy built frontend into backend public folder
WORKDIR /app/apps/bookgeek/api
COPY --from=build /app/apps/bookgeek/web/dist ./public

# Ensure public directory exists
RUN mkdir -p public

EXPOSE 1800
CMD ["node", "src/server.js"]
