# FlockGeek – CONTEXT

_Last updated: 2025-11-28_

## Purpose

Working notes for Sage (AI) and Chef while evolving FlockGeek. This file is a living scratchpad, not formal docs.

## Repo layout (high level)

- `backend/` – Backend services and APIs for FlockGeek.
- `frontend/` – Web UI for FlockGeek.
- `DOCS/` – Additional project documentation.
- `docker-compose.yml` – Local services orchestration.
- `.env*` – Environment configuration (owned by Chef).

## Key working focus (current)

- Modernize the Home/Dashboard experience in the FlockGeek frontend.
- Align look/feel and core metrics with BabelGeek and photoGeek dashboards.

## Backend reality check (2026-09-05)

`DOCS/SUITE_TODO.md`'s GraphQL consolidation audit describes flockgeek's own
backend as "auth-only, only `/api/health` ping." **That's wrong about the
backend** (it's correct about the frontend — every page reads/writes through
Apollo → basegeek's gateway; `DashboardPage.jsx` is the only place that hits
the local backend, and only for `/api/health`). The local Express backend
(`backend/src/`) still has a full, live, mounted REST CRUD API — `routes/api.js`
wires up `/birds`, `/groups`, `/group-memberships`, `/health-records`,
`/egg-production`, `/pairings`, `/locations`, `/hatch-events`, `/meat-runs`,
each backed by a real controller doing real Mongoose queries against
`backend/src/models/*`. Nothing in this repo (frontend, startgeek, basegeek)
calls any of those routes anymore, but they are reachable in the running
server and their controllers still import the models. This is a bigger
finding than "dead models" — it's a whole parallel REST layer that predates
the GraphQL migration and was apparently never torn down. Deciding whether
to unmount/delete it is a follow-up call, not done as part of the 2026-09-05
dead-code pass (that pass only touched the models nothing imports at all).

**Deleted 2026-09-05** (proven orphaned — zero non-test importers anywhere,
including the `models/index.js` barrel's own consumers):
`backend/src/models/BirdNote.js`, `BirdTrait.js`, `Event.js`,
`LineageCache.js`. `models/index.js` no longer re-exports them.

**Left in place** (imported by the live REST controllers above, so not
dead by the "does anything import it" test): `Bird.js`, `EggProduction.js`,
`Group.js`, `GroupMembership.js`, `HatchEvent.js`, `HealthRecord.js`,
`Location.js`, `MeatRun.js`, `Pairing.js`.

There is no local `User` model — auth (`controllers/authController.js`)
proxies login/register/me to basegeek over axios; nothing in this backend
needs its own Mongoose user record.

## Conventions / notes

- This file and `THE_PLAN.md` are allowed to be rough and updated frequently.
- When starting a new session on FlockGeek: read this file and `THE_PLAN.md` first.
- **Server rule:** Sage never starts or stops servers directly. Sage must ask Chef to handle any server start/stop. Deviating from this rule is considered a failure.
