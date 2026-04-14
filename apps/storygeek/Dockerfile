# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/storygeek ./apps/storygeek

# Use local Verdaccio registry for @geeksuite packages
RUN echo "@geeksuite:registry=http://192.168.1.17:4873" > .npmrc

# Install ALL workspace deps
RUN npm install -g pnpm
RUN pnpm install

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

# Use local Verdaccio registry for @geeksuite packages
RUN echo "@geeksuite:registry=http://192.168.1.17:4873" > .npmrc

# Install production deps (resolves workspace:* links)
WORKDIR /app/apps/storygeek/backend
RUN pnpm install --prod

# Copy built frontend into backend public folder
COPY --from=build /app/apps/storygeek/frontend/dist ./public

EXPOSE 9977
CMD ["node", "src/server.js"]
