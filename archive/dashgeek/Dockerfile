# ---------- BUILD STAGE ----------
FROM node:20-alpine AS build

ARG VERDACCIO_URL=http://localhost:4873

WORKDIR /app
RUN apk add --no-cache python3 make g++

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/dashgeek ./apps/dashgeek

# Use Verdaccio registry for @geeksuite packages
RUN echo "@geeksuite:registry=${VERDACCIO_URL}" > .npmrc

# Install ALL workspace deps
RUN npm install -g pnpm
RUN pnpm install

# Build frontend
WORKDIR /app/apps/dashgeek/frontend
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
FROM node:20-alpine AS prod

ARG VERDACCIO_URL=http://localhost:4873

WORKDIR /app
RUN npm install -g pnpm

# Copy workspace manifests + shared packages + backend
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/dashgeek/backend ./apps/dashgeek/backend

# Use Verdaccio registry for @geeksuite packages
RUN echo "@geeksuite:registry=${VERDACCIO_URL}" > .npmrc

# Install production deps
WORKDIR /app/apps/dashgeek/backend
RUN pnpm install --prod

# Copy built frontend into backend public folder
COPY --from=build /app/apps/dashgeek/frontend/dist ./public

EXPOSE 4090
CMD ["node", "server.js"]
