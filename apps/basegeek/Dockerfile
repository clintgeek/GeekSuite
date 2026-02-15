# 1. Build stage
FROM node:20-alpine AS build

WORKDIR /app

# Install build dependencies for native modules (sharp, etc.)
RUN apk add --no-cache python3 make g++ vips-dev

# Copy package manifests
COPY apps/basegeek/package*.json ./
COPY apps/basegeek/packages/api/package*.json ./packages/api/
COPY apps/basegeek/packages/ui/package*.json ./packages/ui/

# Copy shared @geeksuite/user package (dependency of ui)
COPY packages/user ./packages/user

# Install all dependencies (including devDependencies)
RUN cd packages/api && npm install
RUN cd packages/ui && npm install

# Copy all source code
COPY . .

# Build the frontend
RUN cd apps/basegeek/packages/ui && npm run build

# 2. Production stage
FROM node:20-alpine AS prod

WORKDIR /app/packages/api

# Install runtime dependencies for sharp (vips)
RUN apk add --no-cache vips

# Copy API package files
COPY apps/basegeek/packages/api/package*.json ./

# Install only production dependencies for API
RUN npm install --production

# Install WASM ONNX runtime
RUN npm install onnxruntime-web@1.14.0

# Remove native binary completely - delete the entire problematic package
RUN rm -rf node_modules/onnxruntime-node

# Copy API source
COPY apps/basegeek/packages/api .

# Copy families.json to root app directory
COPY apps/basegeek/families.json /app/families.json

# Copy built UI to the expected location
COPY --from=build /app/apps/basegeek/packages/ui/dist ./../ui/dist

# Expose the port
EXPOSE 8987

# Start the API
CMD ["npm", "start"]