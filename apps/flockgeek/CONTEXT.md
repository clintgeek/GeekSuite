# FlockGeek – CONTEXT

_Last updated: 2026-09-05_

## Feedback primitives fan-out (2026-09-05, TODO_ORDER #15)

Frontend now uses `@geeksuite/ui`'s `GeekEmptyState` / `GeekErrorState` /
`GeekToastProvider` + `useToast` throughout, replacing every ad-hoc empty
block, inline error `Alert`, and `useState`-driven success/error message.
See `THE_UI_UNIFICATION_PLAN.md` "Feedback primitives" (the fan-out
paragraph under "Migrating an app") for the full account. Short version:

- `components/primitives/ResponsiveTable.jsx` (shared by Birds/Pairings/
  EggLog/HatchLog) grew `error` / `errorTitle` / `onRetry` props: a query
  load failure now renders `GeekErrorState` in place of the whole ledger;
  an empty result renders `GeekEmptyState` (compact) in both its
  mobile-card and desktop-table branches.
- Groups/LocationsPage (no `ResponsiveTable`, a custom accordion list)
  converted their inline empty/error blocks directly.
- Every page's `mutationError` state + inline error `Alert` became
  `notify(msg, { tone: 'error' })`. `QuickHarvestEntry`'s local success/
  error state (with its `setTimeout` auto-clear) collapsed the same way.
- `GeekToastProvider` is mounted in `components/LayoutShell.jsx`, inside
  `GeekShell` and outside `GeekAppFrame`.
- Left alone: `DashboardPage`'s persistent "backend responded at …"
  success `Alert` — a standing status readout, not a transient
  confirmation, so it doesn't fit `GeekToastProvider`'s use case. Its
  sibling error case *was* converted to `GeekErrorState` (compact, with
  `onRetry={fetchHealth}`).
- No local `EmptyState`/`ErrorState`/toast component existed here to
  delete, and no hand-rolled `isDark ? lighten(...) : darken(...)` tone
  helper (TODO_ORDER #19) — this app inherits the shared themed tooltip
  from `createGeekSuiteTheme` with no local `MuiTooltip` override, so
  nothing to convert there either.
- Mobile harness (`flock-primitives` label, phone viewport): 28 scenes,
  0 violations — unchanged from baseline.

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
