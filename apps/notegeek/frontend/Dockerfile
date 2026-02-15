# Stage 1: Build
FROM node:20-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with cache optimization
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy source code
COPY . .

# Build the app with cache optimization
RUN --mount=type=cache,target=/root/.npm \
    npm run build

# Stage 2: Serve
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration template
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Expose port 80
EXPOSE 80

# Start Nginx with environment variable substitution
CMD ["/bin/sh", "-c", "envsubst '${BACKEND_PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]