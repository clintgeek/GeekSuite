# Standalone image for the backend alone. NOT what production builds:
# .github/workflows/release.yml builds one image per app from
# apps/<app>/Dockerfile with the repo root as the context, so fitnessgeek's
# production image comes from ../Dockerfile (frontend build + backend runtime,
# with the pnpm workspace and packages/* copied in so the workspace:*
# dependencies — @geeksuite/logger, /schemas, /user, /utils — resolve).
#
# This file is kept in step with that one: node 20, because the backend is
# native ESM and consumes the ESM-only @geeksuite/utils. It installs from
# package-lock.json, so the workspace:* deps do NOT resolve here — use it only
# for a quick standalone smoke test, never for a deploy.
FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Expose the port defined in environment variables
EXPOSE ${PORT}

# Start the server
CMD ["npm", "start"]
