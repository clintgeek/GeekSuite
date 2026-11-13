# ---------- BUILD STAGE ----------
# Vite build → /app/apps/startgeek/dist. StartGeek joined the pnpm workspace
# on 2026-11-13 to share @geeksuite/backdrop with basegeek's login
# (DOCS/BACKDROP_SERVICE_PLAN.md), so it builds the way gamegeek does:
# workspace manifests + shared packages + this app, one frozen install.
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
COPY apps/startgeek ./apps/startgeek

RUN npm install -g pnpm@10
RUN pnpm install --frozen-lockfile

WORKDIR /app/apps/startgeek
RUN pnpm run build

# ---------- PRODUCTION STAGE ----------
# Serve the static dist. Keeps the final image tiny and removes the
# "npm install at container boot" pattern the old compose used.
FROM node:20-alpine AS prod

WORKDIR /app
RUN npm install -g serve@14

COPY --from=build /app/apps/startgeek/dist ./dist

EXPOSE 3000
# No `-s`/`--single`: startgeek has no client-side router (no react-router
# dependency, no Route definitions — src/App.jsx is the whole page), so there
# are no deep-link SPA routes that need a not-found rewrite to index.html.
# `-s` rewrites EVERY not-found request to index.html regardless of path
# shape, which includes a deleted hashed asset path — verified locally
# (`serve -s .`): GET /assets/<hash>.js for a hash that no longer exists on
# disk returns 200 text/html (the index document), the exact SPA-fallback
# cache-poisoning landmine (DOCS/CONTEXT.md). Plain `serve` 404s any path
# with no matching file, hashed asset or otherwise, which is the correct
# behavior here — verified the same way (404, not 200).
CMD ["serve", "dist", "-l", "3000"]
