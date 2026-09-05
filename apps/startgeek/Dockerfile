# ---------- BUILD STAGE ----------
# Vite build → /app/dist. Standalone app (no @geeksuite workspace deps),
# so npm + its own lockfile is enough; no pnpm workspace dance needed.
FROM node:20-alpine AS build

WORKDIR /app

# Copy the manifest first so `npm ci` is cached across rebuilds that
# only touch source. The extra `npm install @rollup/rollup-linux-x64-musl`
# works around https://github.com/npm/cli/issues/4828 — npm ci silently
# drops platform-specific optional deps (rollup's native binary) when
# the host lockfile was produced on a different platform, which breaks
# `vite build` at runtime.
COPY apps/startgeek/package.json apps/startgeek/package-lock.json ./
RUN npm ci \
 && npm install --no-save @rollup/rollup-linux-x64-musl

# Copy the rest of the app source + build. .dockerignore at the repo
# root already excludes node_modules and .git.
COPY apps/startgeek/. .
RUN npm run build

# ---------- PRODUCTION STAGE ----------
# Serve the static dist. Keeps the final image tiny and removes the
# "npm install at container boot" pattern the old compose used.
FROM node:20-alpine AS prod

WORKDIR /app
RUN npm install -g serve@14

COPY --from=build /app/dist ./dist

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
