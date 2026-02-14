FROM node:18-alpine as build

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --verbose

# Copy application code
COPY . .

# Set build arguments
ARG BACKEND_PORT=3001
ENV BACKEND_PORT=$BACKEND_PORT
ENV NODE_ENV=production
ENV VITE_BASE_URL=/client/dist/

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Create the web root directory and ensure proper permissions
RUN mkdir -p /usr/share/nginx/html && \
    chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Copy the build output
COPY --from=build /app/dist/ /usr/share/nginx/html/

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Expose port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]