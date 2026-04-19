# bujogeek

Bullet-journal-inspired task and journal app. Part of GeekSuite.

---

## What bujogeek is

A daily-driver digital planner built around the bullet journal ritual: Today → Review → Plan. Tasks migrate forward automatically. Aging tasks surface visually (sage → amber → red → plum) to create passive accountability. Templates create batches of tasks from multi-line content.

Not a kanban board. Not a project tracker. A planner you open every morning.

---

## Main features

- **Tasks** — create, complete, migrate forward/back. Signifiers (`* @ x < > - ! ? #`), priorities (high/medium/low), hashtag-based tags, due dates.
- **Status migration** — `pending`, `completed`, `migrated_back` (backlog), `migrated_future`.
- **Task aging** — color-coded left-border urgency system across all views.
- **Views** — Today (daily), Review (aging tasks), Plan (weekly spread, monthly calendar, backlog), Templates, Tags.
- **Daily review** — dedicated Review view with Keep / Move / Backlog / Delete actions per aging task. Keyboard shortcuts: `1/2/3/d`.
- **Templates** — multi-line content becomes individual tasks on apply. Supports `{{variable}}` interpolation with live preview before creation.
- **Keyboard-first** — `j/k` nav, `x` complete, `e` edit, `d` delete, `Cmd+K` command palette, `Cmd+N` quick-add, `g t/r/p` navigation chords, `?` shortcut overlay.
- **Dark mode** — themed via `@geeksuite/user`.

---

## Architecture

bujogeek is a single container (`bujogeek`) running a Node.js ES-module backend (Express, pino logging, mongoose) on port 5005, with a pre-built React+Vite frontend served as static files. It authenticates via `@geeksuite/auth` (SSO with basegeek), fetches task data from the shared basegeek GraphQL gateway (`GATEWAY_URL`), and uses the suite-wide MongoDB instance (`DB_URI`). Theme is provided by `@geeksuite/user`. There is no separate DB container for bujogeek.

```
Container: bujogeek (port 5005)
  backend/          Node ES modules — Express, Mongoose, pino
  frontend/         React 18 + Vite, MUI, Framer Motion, Lucide
packages/
  @geeksuite/auth   SSO middleware
  @geeksuite/user   theme + /me handler
  @geeksuite/api-client → GATEWAY_URL (basegeek at host.docker.internal:4100)
```

---

## Required env vars

These go in `apps/bujogeek/.env.production` (gitignored). `env_file` is set in `docker-compose.yml`.

| Var | Purpose |
|-----|---------|
| `DB_URI` | MongoDB connection string (suite-shared instance) |
| `JWT_SECRET` | Suite-shared JWT signing key |
| `JWT_REFRESH_SECRET` | Suite-shared refresh token key |
| `SECRET_KEY` | App-level secret (cookie/session) |
| `BASEGEEK_URL` | basegeek service URL for SSO (`https://basegeek.clintgeek.com`) |
| `PORT` | Default `5005` |
| `CORS_ORIGINS` | Comma-separated allowed origins (optional — falls back to hardcoded dev list) |
| `LOG_LEVEL` | pino log level (default `info`) |

`GATEWAY_URL` is hardcoded in `docker-compose.yml` as `http://host.docker.internal:4100` — do not put it in `.env.production`.

---

## Quick start (dev)

Backend runs on port 5001 in dev (`server/.env.local`). Frontend on 5173 (Vite default).

```bash
# Backend
cd apps/bujogeek/backend
nvm use --lts
node server.js           # or: npm run dev

# Frontend (separate terminal)
cd apps/bujogeek/frontend
nvm use --lts
npm run dev
```

Dev backend connects to the shared MongoDB on the production server via `DB_URI` in `backend/.env.local`. No local MongoDB needed.

---

## Deploy

See root `DEPLOY.md`. Build and deploy via:

```bash
./build.sh bujogeek
```

Compose file: `apps/bujogeek/docker-compose.yml`. Container name: `bujogeek`.

---

## Further reading

- [`DOCS/CONTEXT.md`](DOCS/CONTEXT.md) — current architecture, data models, API endpoints, and known issues.
- [`DOCS/SORTING_RULES.md`](DOCS/SORTING_RULES.md) — task display and sorting rules (floating, past-due, scheduled).
- [`DOCS/HARDENING_2026-04.md`](DOCS/HARDENING_2026-04.md) — security and operational hardening pass (April 2026): data isolation, CORS, pino logging, graceful shutdown.
- [`../../DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md`](../../DOCS/GEEK_SUITE_DESIGN_LANGUAGE.md) — suite-wide design system (colors, typography, spacing, components).
