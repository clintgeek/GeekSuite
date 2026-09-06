# FlockGeek – CONTEXT

_Last updated: 2026-09-05_

## Going-over 2026-09-05

A read of the whole app — every route, controller, model, page, component and
test — looking for correctness and security rather than polish. Backend tests
76 → 111, frontend 37 → 48, lint unchanged at 24 warnings, harness 28 scenes
0/0/0 with `--enforce-a11y`.

### Backend — fixed

- **`requireOwner` took ownership from the request.** The chain was
  `userOwner || headerOwner || req.body?.ownerId || req.query?.ownerId`, so a
  session whose user object carried none of `id`/`_id`/`userId`/`ownerId` fell
  back to an `X-Owner-Id` header, then the body, then the query string — and
  `req.ownerId` is the value *every* owner-scoped filter in this backend is
  built around, reads included. This is BURN_REVIEW #4/#18's hole one layer
  earlier and wider than the controllers. Ownership now comes only from the
  session; a session with no usable id is a 401.
  `middleware/authMiddleware.js`, `__tests__/middleware/requireOwner.test.js`.
- **Cross-owner reference reads.** `createHatchEvent`, `registerChicks`,
  `getLineageBlacklist` and `canBreedWith` looked their pairing (and a
  membership's group) up with `Model.findById(...)`, no owner filter. Not
  theft — the owning record is always scoped — but the *payload* leaked:
  `registerChicks` stamps `pairing.name` into the brood group's and meat run's
  name, and `getLineageBlacklist` returns the pairing's `roosterIds`/`henIds`
  as `blacklistedBirdIds`. Naming a foreign pairing id was enough. All four are
  owner-scoped `findOne` now.
  `controllers/hatchEventController.js`, `controllers/birdController.js`,
  `__tests__/routes/hatchEvents.test.js`, `__tests__/routes/birdLineage.test.js`.
- **`registerChicks` took `count` raw.** A fractional value produced fewer temp
  tag ids than birds — the surplus were created with `tagId: undefined`, the
  loop failed part way, and a half-built brood was left behind — and a large one
  turned one HTTP request into an unbounded insert loop. Now a whole number,
  1..`MAX_CHICKS_PER_REGISTRATION` (500).
- **`?q=` compiled straight into a RegExp.** `new RegExp(q, "i")` on the raw
  query value: a bird named `Hen (Big)` could not be searched for at all (a 500
  on an ordinary search), a `.` matched more than the user typed, and `(a+)+$`
  is catastrophic backtracking pointed at the API process. Escaped now.
  `controllers/birdController.js`, `__tests__/routes/birds.test.js`.
- **Pagination was unbounded and NaN-prone.** Every list handler did
  `parseInt(req.query.page)` / `parseInt(req.query.limit)`: `?page=abc` gave
  `.skip(NaN)` (a driver error, i.e. a 500 on a malformed URL) and
  `?limit=1000000` asked Mongo for the whole collection. One helper,
  `utils/pagination.js`'s `readPagination`, now makes both decisions for all
  eight list handlers plus `getBreedingCandidates`. Max page size 200.
  `__tests__/utils/pagination.test.js`.
- **`getBirdGroups` 500'd on a stale membership.** A membership whose group row
  is gone populates to `null`, and `.toObject()` on that took the whole list
  down. Skipped instead.
- Dropped the unused `crypto` import from `server.js`.
- **Test-harness honesty:** `__tests__/utils/fakeModel.js` did not understand
  `$or` (it read it as a field name, so every `$or` filter matched nothing) or a
  `RegExp` condition. Any test written against the `?q=` search would have
  passed for the wrong reason. Both are implemented now.
- **`controllers/authController.js`'s basegeek proxies had no axios timeout**
  — axios defaults to `0`, so a *hung* basegeek parked the handler and the
  browser until the socket died. Now bounded by `BASEGEEK_TIMEOUT_MS` (default
  8000), the same knob `packages/user`'s `validateToken` uses; a timeout
  carries no `.response` and now 502s explicitly rather than falling into each
  handler's generic 500, and never a 401.

### Frontend — fixed

- **The "Hatched" chip flipped a day early.** `isHatched` compared a
  UTC-midnight calendar day to `new Date()`, so a clutch due tomorrow read as
  hatched from 6pm tonight in US Central. Compares calendar day to calendar day
  now. `pages/HatchLogPage.jsx`.
- **The hatch log's End Date filter dropped its own day.** It compared the
  gateway's serialized ISO instant (`2026-09-05T00:00:00.000Z`) to the
  `YYYY-MM-DD` an `<input type="date">` produces; the ISO string always sorts
  *after* the bare day it names, so the last day of any range vanished.
  (`EggLogPage` already read the day first — this is the copy that did not.)
- **The Groups Active/Ended chip had the same instant comparison**, shifting the
  whole window a day west of UTC: a group starting tomorrow read Active from
  6pm tonight, one ending today read ended since 6pm yesterday. Now inclusive
  at both ends, day against day. `pages/GroupsPage.jsx`.
- **"Add hatch event" silently discarded five fields.** The dialog collects
  Hatch Date, Fertile Eggs, Chicks Hatched, Pullets and Cockerels and sent
  `setDate`/`eggsSet`/`notes`; the dialog then closed as if it had saved.
  `hatchDate` was simply an undeclared variable on `RECORD_HATCH_EVENT` (GraphQL
  drops an undeclared variable in silence), and the four counts have no argument
  on the gateway's `recordHatchEvent` at all — so the create is now followed by
  an `updateHatchEvent` carrying whatever was filled in.
- **Home's rolling window was frozen at page load.** `useHomeData` computed
  `todayStr`/`rollingStartStr` at *module* scope, and HomePage is the eager
  index route — a tab left open overnight (a coop tablet, a wall dashboard) kept
  asking for yesterday's 14-day window, so the morning's harvest never appeared
  and the average lagged a day. Computed per render; the strings are stable
  within a day so Apollo does not refetch.
- **The activity feed rendered calendar days as elapsed times.** A harvest
  `date` and a hatch `setDate` are UTC-midnight days; subtracting one from
  `now` measures the distance to UTC midnight ("19h ago" for something logged
  this afternoon, and a day out west of UTC). Rows now carry `calendarDay` and
  render the day itself; a bird's `createdAt` still reads "20m ago".
  `hooks/useHomeData.js`, `components/home/RecentActivity.jsx`.
- **`QuickHarvestEntry` sent `source: "manual"` into the void.**
  `RECORD_EGG_PRODUCTION` declares no `$source` and the gateway's
  `recordEggProduction` takes no `source` argument, so the key was dropped
  silently and the field has never been set on a single record. Removed — and
  `QuickHarvestEntry.test.jsx` was asserting it, which is how a test agreed with
  a payload the server never saw.

- **The BirdsPage edit form discarded twelve fields — FIXED 2026-09-05 (Q59).**
  Breed, Hatch Date, Species, Strain, Cross, Origin, Foundation Stock,
  Temperament, Status Date and Status Reason are editable inputs that
  `handleSaveEdit` never sent, because the gateway's `updateBird` declared only
  `tagId`/`name`/`sex`/`status`/`notes`/`locationId`. Editing a bird's breed
  closed the dialog and changed nothing.

  The gateway mutation is widened: `createBird` and `updateBird` now take the
  **same bird field list**, differing only by `id` and by whether `tagId` is
  required, so the edit form round-trips every field it collects. The zod
  schema is built from one shared `birdFields` object for the same reason, and
  `temperamentScore` is now bounded to the 1-10 scale `models/Bird.js` only ever
  described in a comment. `createBird` also gained `locationId` — with the
  ownership check `updateBird` already had — and the Add dialog's Species and
  Strain inputs, which it rendered and never sent.

  Guarded on both sides: `flockgeekBirdFieldParity.test.js` in the gateway
  drives the real resolver against real Mongo and asserts the GraphQL argument
  list and the zod keys match; `__tests__/birdMutationFields.test.jsx` here
  holds `CREATE_BIRD`/`UPDATE_BIRD` to the form's field list. Suite-wide,
  `tools/gql-arg-audit.mjs` (`pnpm check:gql`, CI job `gql-audit`) now fails on
  this whole class — see `apps/basegeek/DOCS/CONTEXT.md`, "Frontend/gateway
  argument parity".

New tests: `__tests__/calendarDay.test.jsx` (8), `__tests__/homeActivity.test.jsx`
(3). Each was checked against the pre-fix code and fails there. Q59 added
`__tests__/birdMutationFields.test.jsx` (7) on 2026-09-05 — 55 tests in this
tree now.

### Left in place, with reasons

- ~~Sire and Dam are still not wired, and should not be.~~ **Fixed 2026-09-05
  (Q67).** The two inputs are removed from `BirdsPage.jsx`; the Lineage
  section now reads `bird.pairingId` (added to `GET_BIRDS`) and shows that
  pairing's name plus its `roosterIds`/`henIds` (resolved to tag IDs) as
  possible sires/dams — the pairing's rosters, not a single parent, are the
  source of truth for lineage here.
- **Q22 — the REST CRUD layer itself.** Still mounted, still caller-less, still
  Chef's call. Everything above hardens it rather than removing it, on the
  principle that a reachable route is a live route.
- **`registerChicks` is not atomic.** A failure part-way through leaves the
  brood group and the birds created so far. Bounding `count` removes the input
  that made this likely; a transaction is a bigger change than this pass.
- **`routes/groupMemberships.js` returns `error.message` verbatim on a 500**,
  unlike the central error handler which hides it in production, and uses a
  different error envelope from every controller. Cosmetic-adjacent, and the
  route has no caller; folded into Q22.
- **`groupMemberships` POST does not verify that `groupId`/`birdId` are the
  caller's**, and neither do `createBird` (`pairingId`/`locationId`),
  `createEggProduction` or `createHealthRecord`. Same class as the reads fixed
  above, on the write side. Reported rather than fixed: it needs a shared
  `assertOwnedRef` helper across six controllers, which is a larger change than
  the read-side leaks it would close, and Q22 may delete the whole layer.

## Bundle (2026-09-05)

**Before:** one chunk. No `manualChunks` at all, every route a static import in
`App.jsx` — `dist/assets/index-*.js` was 1060 kB (324 kB gzip) and rollup
printed the "larger than 500 kB" warning on every build. First load (the entry
script + every `modulepreload` `index.html` lists + the HTML) was 1072 kB raw /
326 kB gzip.

**After:** 1011 kB raw / 312 kB gzip, largest chunk 313 kB, no warning.

| Chunk | Before | After | Eager? |
|---|---|---|---|
| app entry `index-*.js` | 1060 kB / 324 kB gz | **90 kB / 28 kB gz** | yes |
| `mui` (`@mui`, `@emotion`) | — | 313 kB / 96 kB gz | yes |
| `motion` (framer-motion) | — | 230 kB / 74 kB gz | yes |
| `apollo` (`@apollo`, `graphql`, `@wry`…) | — | 200 kB / 58 kB gz | yes |
| `react-vendor` (react, react-dom, router) | — | 165 kB / 53 kB gz | yes |
| 8 route chunks + `ResponsiveTable`/`LedgerDialog` | — | 1.2–20 kB each, 60 kB total | on demand |
| `index-*.css` | 10 kB / 1.7 kB gz | unchanged | yes |
| **first load** | **1072 kB / 326 kB gz** | **1011 kB / 312 kB gz** | |

Measure it the same way before claiming a change helped — the build log lists
every chunk including the async ones, which is not the first load:

```bash
cd apps/flockgeek/frontend && pnpm build   # then sum index.html's own
# <script src> + every <link rel=modulepreload> + the HTML, raw and via
# zlib.gzipSync. No new deps; a ~20-line node script does it.
```

### What actually moved, and what didn't

- **Routes are `lazy()`** — eight of ten, behind one `Suspense` boundary that
  `LayoutShell` puts around the `Outlet` (inside `GeekAppFrame`, so the
  sidebar/top bar/bottom nav never blink), falling back to
  `components/RouteFallback.jsx` — the app's existing centred
  `CircularProgress`, sized to the content area instead of `100vh`. That is
  where the 61 kB came from: BirdsPage alone is 20 kB, and a visitor to Home
  used to download all of it.
- **`HomePage` and `LoginPage` stay eager, deliberately.** Home is the index
  route — `/`, the first bottom-nav tab, and every post-login redirect — so a
  chunk boundary there buys a second round-trip in front of the app's most
  common first paint. It also registers the **harvest FAB**
  (`QuickHarvestSheet` → `useGeekPrimaryAction`); lazy would mean the shell
  paints and the FAB pops in a beat later, on the one screen where the FAB is
  the point. `LoginPage` is 34 lines and is the entire unauthenticated app.
  `EggLogPage` registers the same FAB and **is** lazy: it is a route you
  navigate to, so its FAB registers exactly when its content appears — there
  is no window where the page is up and its FAB is missing. Harness scene
  `02-harvest-sheet` (the FAB's sheet) and `09-egg-log` are both clean, and
  `QuickHarvestSheet.test.jsx` still asserts the registration.
- **`manualChunks` is a path-matching function, never the object form.** The
  object form matches resolved module ids and silently misses CJS packages
  (react/react-dom arrive as commonjs proxies), which is how fitnessgeek ended
  up with an empty `vendor` chunk and react-dom hidden inside `mui`
  (`f61f7ce`). The function matches the last `node_modules/` path segment, so
  it is proxy-proof and pnpm-proof.
- **All four vendor groups are eager, and that is not a failure.** MUI, Apollo
  (`main.jsx` mounts `GeekSuiteApolloProvider` above the router), framer-motion
  (`GeekAppFrame` is a motion element) and react are on the first paint by
  construction. Splitting them is a *caching* win: a deploy that touches one
  page now re-downloads 90 kB, not 1 MB.
- **The `mui` group is a measured trade, not a copied recipe.** Without it:
  980 kB / 303 kB first load — 31 kB cheaper cold, because MUI parts only the
  lazy routes use follow those routes — but MUI folds into the app entry chunk
  (372 kB) and every push to main makes daily users re-download all of it.
  Kept. (Pulling `@mui/icons-material` back out of the group: 1008 kB, noise.)
  Note this is the *opposite* call from fitnessgeek, where the `mui` boundary
  is load-bearing because dropping it hoists chart vendors onto the first load;
  flockgeek has no chart vendors, so only the cache trade is in play.
- **Nothing was deferred with `await import()`, because there is nothing to
  defer.** flockgeek's whole dependency surface is react + router + MUI +
  Apollo + framer-motion. No chart library, no date library, no PDF/canvas
  exporter — no heavy, rarely-used module hiding behind a button. Every icon
  is already deep-imported (`@mui/icons-material/Add`), not barrelled.
- **Not attempted:** shrinking `motion` (230 kB, the second-heaviest eager
  chunk). It comes in through `@geeksuite/ui`'s `GeekAppFrame`, which wraps
  every page, so no app-side boundary can defer it — and `packages/*` was out
  of scope. If framer-motion is ever worth attacking it has to happen in
  `packages/ui` and it pays out across the whole suite at once.
- **`resolve.dedupe` already listed `@mui/material`** (the suite landmine) and
  a probe build confirmed it: exactly one `@mui/material`, one `react-dom` and
  one `@emotion/react` `.pnpm` root reach the bundle.

### Service worker

`public/sw.js` is hand-rolled (PWA_STANDARD flavour B) and had **no build
step**, so its precache list was three static URLs — fine when the app was one
chunk, wrong the moment routes became lazy: a client still on the previous
deploy would ask for a chunk hash the server had deleted, get the SPA
fallback's 404 (`backend/src/server.js` has the extname guard), and the dynamic
import would reject into a blank route.

`swPrecache()` in `vite.config.js` closes that: after each build it rewrites
`dist/sw.js`'s two placeholder constants with the full hashed `.js`/`.css` list
and a `BUILD_ID` hashed from that list — the flavour-B equivalent of VitePWA's
`globPatterns`. It only ever touches `dist/`, so `vite dev` keeps serving the
source file, and it hard-errors if the placeholders go missing (a silent
stamping failure would only show up as a stranger's broken route after a
deploy). Verified: 16 precache entries, byte-identical to what is on disk.

A content-hashed `BUILD_ID` also fixes an older bug. `CACHE_NAME` used to be
the constant `flockgeek-cache-v2`, so the SW never reinstalled and the `"/"`
entry cached on a user's first ever visit was served forever — the root route
could not pick up a deploy. Now every build with different assets is a new
cache name: install precaches the new files, activate drops the old cache, and
the existing `controllerchange` reload in `main.jsx` takes the tab to it.

Everything else about the SW is unchanged and re-verified: auth endpoints are
network-only first, `/api/*` network-only next, static assets cache-first with
a network fallback (so a chunk not in the cache — a new hash — is fetched
normally), the `text/html` guard still refuses to store a SPA-fallback response
under an asset URL (`2d0f5a5`), and a failed navigation still lands on
`/offline.html`. `install` now uses per-URL `cache.add(...).catch()` instead of
`cache.addAll`, so one bad URL can no longer leave the app with no SW at all.

**Verified:** `pnpm lint` 24 warnings (baseline, none new); `npx vitest run`
37/37; mobile harness `--enforce-a11y --viewports phone` 28 scenes, 0
violations, 0 a11y findings, 0 page errors; `vite preview` + `curl` — `/` 200
`text/html`, entry chunk and a lazy route chunk 200 `text/javascript`, `/sw.js`
200 with the stamped manifest.

## Mobile-harness a11y pass: 16 findings → 0 (2026-09-05)

All 16 axe findings flockgeek contributed to the suite baseline were the same
two bugs, repeated at every call site: MUI `Select`s rendered with a visible
`InputLabel` but no `labelId`/`id` pairing, so the `role="combobox"` div had
no accessible name (`aria-input-field-name`, 8 findings/28 nodes across
`02-harvest-sheet`, `05-birds-edit-dialog`, `07-add-bird-dialog`,
`13-location-dialog`); and two unlabelled inputs plus an unlabelled notes
`<textarea>` (`label`, 4 findings/6 nodes) — one of them (the ÷-days field)
had an `aria-label` prop, but passed directly on `TextField` it lands on the
outer root div, not the actual `<input>`, so the input itself stayed
unnamed. Fixed every `FormControl`/`InputLabel`/`Select` in `BirdsPage.jsx`,
`LocationsPage.jsx`, `GroupsPage.jsx`, and `QuickHarvestEntry.jsx` with a
real `labelId`; gave the egg-count stepper `aria-label="Eggs collected"`
(a visible label would wreck its 2rem centred layout) and moved the ÷-days
`aria-label="Days observed"` into `inputProps`; added `label="Notes"` to the
bird notes textarea. Also fixed `nested-interactive` (4 findings/7 nodes,
`11-groups` + `12-locations`): both pages had Edit/Delete `IconButton`s
inside `AccordionSummary` (MUI's own `role="button"`, unreachable by a
screen reader) — moved them out to a flex row that is a sibling of the
`Accordion`, not a descendant of its summary. Mobile harness: 28 scenes,
0 violations, 0 a11y findings (`--enforce-a11y`) — flockgeek's contribution
to the suite's a11y burn-down is now zero.

## REST `create`/`update` let the body set/reassign `ownerId` (2026-09-05, BURN_REVIEW #4/#18)

The legacy REST CRUD layer (see "Backend reality check" below) built its Mongoose `create`/
`findOneAndUpdate` payloads by spreading `req.body` directly. `createEggProduction`/`createBird`
spread it last, so a body `ownerId` won and minted the record under whatever account the caller
named; the eight update handlers (`birdController`, `eggProductionController`,
`healthRecordController`, `locationController`, `hatchEventController`, `groupController`,
`pairingController`, `meatRunController`) spread it into an owner-scoped update, so a body `ownerId`
could reassign an existing record to another account (self-transfer, not theft — the filter already
required the caller's own `ownerId` to find the record at all).

Fix: `backend/src/utils/ownerFields.js` exports `withoutOwnerFields(body)` — strips `ownerId`,
`owner_id`, `owner`, `userId`, `user_id`, `_id` — and every create/update handler now routes
`req.body` through it before merging. Ownership still comes only from `req.ownerId`
(`authMiddleware.js`, derived from the SSO session). 12 new tests (create-spoofing on
bird/eggProduction, update-reassignment on bird/eggProduction/group/meatRun, 6 unit tests on the
helper); flockgeek's 57 baseline auth tests plus these are 69, all green. See
`DOCS/BURN_REVIEW.md` #4 and #18.

## First-visit theme flicker (2026-09-05, TODO_ORDER #30)

Cause: `theme/AppThemeProvider.jsx` mounted `@geeksuite/user`'s `<ThemeProvider
defaultPreference="dark">`. The theme-preboot inline script (`themePreboot()` from
`@geeksuite/user/vite`, injected into every app's `<head>`, not parameterizable) always
falls back to `'auto'` (resolves via `prefers-color-scheme`) when there's no `geek_theme`
cookie. So a cookie-less visitor on a light OS got preboot's light guess as the first
paint, then this provider's own hardcoded "dark" default resolved the mode the instant it
mounted — a real light-to-dark repaint, not just a mismatched initial value. bujogeek and
notegeek never override `defaultPreference` (both stay on the shared `'auto'`), which is
why only flockgeek showed this.

Fix: dropped the `defaultPreference="dark"` override (now the shared `'auto'` default,
matching bujogeek/notegeek and agreeing with preboot's assumption) and added the missing
baseline `:root` / `:root[data-theme="dark"]` CSS snap block to `index.html` — bujogeek and
notegeek's `index.html` both have this (colors matching their theme's `background.default`
+ `text.primary` exactly) but flockgeek's never did, so its very first paint (before the
preboot script's effect could even show through) had no themed background at all. One
regression test added: `__tests__/theme/AppThemeProvider.test.jsx` asserts a cookie-less
render resolves to `'light'` under the test suite's default (light) `matchMedia` mock.
Mobile harness (`flockgeek-small` label, phone viewport): 28 scenes, 0 violations —
unchanged from baseline.

`apps/flockgeek/frontend/src/theme/AppThemeProvider.jsx`,
`apps/flockgeek/frontend/index.html`.

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
