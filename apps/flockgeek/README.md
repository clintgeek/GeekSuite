# FlockGeek

Flock management for a small poultry flock: birds, eggs, harvests. Part of GeekSuite.

- **Frontend** (`frontend/`): React 18 + Vite + MUI 5, an installed PWA.
- **Backend** (`backend/`): a thin Express server — auth proxying to basegeek, a status
  route, and the built frontend. It has no models and no CRUD of its own.
- **Data**: every read and write goes through basegeek's GraphQL gateway
  (`apps/basegeek/packages/api/src/graphql/flockgeek/`).
- **Auth**: basegeek SSO cookies; there is no local login.

## Run it

This is a pnpm workspace member — install once from the repo root with `pnpm install`.

```bash
pnpm --filter ./apps/flockgeek/backend dev     # nodemon; PORT defaults to 4094
pnpm --filter ./apps/flockgeek/frontend dev    # Vite, http://localhost:5173
pnpm --filter ./apps/flockgeek/backend test    # jest
pnpm --filter ./apps/flockgeek/frontend test   # vitest
```

## Deploy

A push to `main` builds `ghcr.io/clintgeek/flockgeek:latest` and Watchtower rolls the
container (port 5001). Procedure, rollback and landmines: `DOCS/RUNBOOK.md` and
`DOCS/CICD.md` at the repo root.

## Docs

- `DOCS/CONTEXT.md` — how this app actually works, and its dated going-over notes.
- `DOCS/ARCHIVE/` — the migration-era notes and the old starter-kit README.
- `archive/` — an older standalone copy of the app's code; not built, not deployed.
