# GeekSuite TODO

Suite-wide backlog. Grouped by theme; ordered roughly by impact and ease within each group.
Pull from here when planning the next pass; update as work lands or priorities shift.
`DEFERRED_WORK.md` is the append-only scratch-pad; this is the prioritized cut.

---

## In flight

All 8 apps consolidated and hardened (April 2026). `storygeek-auth-hardening` branch open —
StoryGeek SSO alignment + Settings page fix + AuthProvider refactor. Pending merge.

---

## Landed 2026-08-30 (overnight hardening pass)

- Gateway ownership/IDOR enforcement across **every** basegeek module
  (bujogeek, fitnessgeek, storygeek, bookgeek, flockgeek — the last was
  anonymously writable — dashboard, notegeek), with 344 jest tests now green.
- storygeek REST `getStorySummary` ownership check.
- bujogeek: UTC date-key fixes, dead REST layer removed (−7.5k lines), sort
  comparator fixed, errors surfaced, optimistic toggles, RRULE-only
  recurrence (+migration), cancelled state, search + export, collections,
  habits, web-push reminders.
- bookgeek: device download basket + secret-word landing page, favicon.
- Suite-wide: MUI dedupe (two-copy theme split), SPA fallbacks 404 asset
  paths (SW cache poisoning), immutable caching for hashed assets, pnpm
  pinned in Dockerfiles, CI + GHCR release workflows (`DOCS/CICD.md` Tier 1
  + 3.3 publish; Watchtower box setup still manual).

---

## Next up — highest leverage

- ~~Timezone bug fixes (bujogeek, fitnessgeek, flockgeek)~~ — **Done 2026-08-30**
  across all three (streaks, daily summary, egg/group/mortality dates, quick-add
  date keys). Remaining timezone work is the shared-utility extraction below.

- **Admin gate on `GET /api/users`** — paginated now but still auth-only, not admin-scoped.
  Dependency: add an admin role. `apps/basegeek/packages/api/src/routes/users.js`

- **Mongo connection topology (basegeek)** — INVESTIGATED 2026-08-30: not a
  duplicate pool; four connections deliberately serve four different databases.
  Deferred. Latent hazard noted: `getAppConnection('usergeek')` would spawn a
  second pool to the auth DB — don't call it. Consolidation shape (route
  `models/user.js` through the factory with a per-app URI override) is in the
  session report if ever pursued.

- ~~`appPreferences` Map vs Object drift~~ — **Fixed 2026-08-30:** all access
  through `src/lib/appPreferences.js` (Map + markModified), migration script,
  route + helper tests.

- ~~AI response cache TTL + LRU~~ / ~~`/api/health` dependency status~~ —
  **Done 2026-08-30:** cache is env-configurable with an eviction fix;
  `/api/health` now reports per-dependency readiness (incl. the auth DB) via
  non-blocking cached probes.

---

## App consolidation + hardening (per-app passes)

Consolidation = source-tree deploy via `build.sh`, `@geeksuite/auth`, `@geeksuite/api-client`.
Hardening = pino logging, request IDs, graceful shutdown, env-driven CORS, data-isolation audit.

| App | Consolidated | Hardened | Notes |
|-----|-------------|---------|-------|
| basegeek | ✅ | ✅ | Reference implementation |
| fitnessgeek | ✅ | ✅ | |
| bujogeek | ✅ | ✅ | |
| flockgeek | ✅ | ✅ | |
| storygeek | ✅ | ✅ | |
| notegeek | ✅ | ✅ | |
| bookgeek | ✅ | ✅ | Format-conversion feature also pending (see Features section below) |
| startgeek | ✅ | ✅ | Static Vite app — no backend, no auth. Already in build.sh + docker-compose. |

---

## Cross-cutting security

- **CSRF protection** — cookie auth + `credentials: true` CORS across `*.clintgeek.com` means any
  XSS'd allowed origin can trigger mutations. Fix: double-submit CSRF tokens or `SameSite=Strict`
  for the refresh cookie + CSRF middleware in basegeek + per-app axios interceptor. Own branch,
  per-app verification. (`DEFERRED_WORK.md`)

- **HttpOnly cookies + stop persisting tokens in localStorage** — ✅ resolved across all apps
  (April 2026). Dead localStorage token reads removed from all frontends; StoryGeek's Zustand
  auth store replaced with `AuthProvider`/`useAuth`. Remaining: verify no app reads
  `document.cookie` directly for `geek_token`. (`DEFERRED_WORK.md`, `DOCS/SSO_OVERVIEW.md`)

- **BroadcastChannel inconsistencies** — `bookgeek` uses `geek-auth`/`logout`; several apps use
  lowercase `logout`; basegeek uses `postMessage`. Cross-tab logout is fragmented.
  Standardize to channel `geeksuite-auth` / type `LOGOUT` everywhere.
  (See `DOCS/SSO_OVERVIEW.md` BroadcastChannel table.)

- **Hardcoded CORS fallback origins** — basegeek and fitnessgeek support `CORS_ORIGINS` env but
  fallback arrays include dev/LAN IPs. Either enforce env in production (throw if unset) or strip
  the defaults. (`DEFERRED_WORK.md`)

---

## Shared libraries / refactors

- **`cryptoVault` → `@geeksuite/crypto-vault`** — currently internal to basegeek at
  `apps/basegeek/packages/api/src/lib/cryptoVault.js`. Promote to a shared package so fitnessgeek
  (and future apps) can encrypt sensitive fields (Garmin password) before writing to MongoDB.
  Step 1: promote + update basegeek to consume from there. Step 2: wire fitnessgeek encryption +
  backfill migration script. (`DEFERRED_WORK.md`)

- **Shared date utilities** — the timezone bug analysis identified a `toUtcMidnight()` /
  `localDateString()` / `displayCalendarDate()` pattern needed across bujogeek, fitnessgeek, and
  flockgeek. Promote to `packages/utils/src/dates.js` and import from there.
  (Full spec in `DOCS/ARCHIVE/THE_TIME_ISSUE.md`)

- **Shared logger** — basegeek has a pino logger module; fitnessgeek and bujogeek got the same
  pattern in their hardening passes. Consider extracting to `@geeksuite/logger` to ensure
  consistent JSON structure + pretty-dev behavior across all apps.

- **`UserSettings` schema consolidation (fitnessgeek)** — schema lives in both
  `apps/fitnessgeek/backend/src/models/UserSettings.js` and
  `apps/basegeek/packages/api/src/graphql/fitnessgeek/models/UserSettings.js` and has drifted.
  Consolidate to one source of truth. (See `DOCS/CONTEXT.md`)

---

## Features not yet implemented

- ~~bookgeek format conversion~~ — **Done (Aug 2026):** on-demand `ebook-convert` to
  EPUB/AZW3/MOBI with cover embedding, shared `ensureFormat()`, used by both normal
  downloads and the device basket.

- **bujogeek subtasks UI** — backend model has `parentTask`/`subtasks` fields; no frontend UI.

- ~~bujogeek quick-add hyphenated-date bug~~ — **Fixed 2026-08-30:** date
  parsing now runs before signifier detection in `utils/parseTaskInput.js`, so
  `/2026-03-15` / `/03-15-2026` dates parse correctly; regression tests added.

- ~~Extract bujogeek `compareTasks`~~ — **Done 2026-08-30:** moved from
  `context/TaskContext.jsx` (which pulls Apollo + MUI at module scope) to a pure
  `utils/taskSort.js` with 7 unit tests locking in the previously-NaN-broken
  sort logic. TaskContext re-exports it, so importers are unchanged.

- ~~bujogeek recurring tasks UI~~ — **Done (2026-08-30):** RRULE series with editScope
  (this/all/future instances), editor + quick-add syntax, virtual expansion.

---

## Tests + observability

- **Per-app auth test suites** — basegeek has 33 auth tests. bujogeek, fitnessgeek, flockgeek,
  storygeek, and notegeek have zero. Priority for each app after its hardening pass: auth-isolation
  specs (login flow, `/api/users/me`, data scoping). (`DEFERRED_WORK.md`)

- **Circuit breakers on fitnessgeek external APIs** — USDA, Nutritionix, OpenFoodFacts, Garmin.
  30s timeout per call but no circuit breaker. Use `opossum` or Redis-backed state. (`DEFERRED_WORK.md`)

- **Input validation (Joi/Zod)** — most REST routes do ad-hoc `if (!field)` checks. Flag:
  bujogeek (client-controllable timestamps, unbounded strings), fitnessgeek (`settingsRoutes.js`).
  Route-by-route, not urgent — own slow-burn pass. (`DEFERRED_WORK.md`)

---

## Nice-to-haves / backlog

- **`fitnessgeek docker-compose.dev.yml`** — references service names that no longer exist in the
  new single-service compose. Rewrite for hot-reload or delete if not in use. (`DEFERRED_WORK.md`)

- **bujogeek Apollo cache invalidation on mutations** — currently refreshing the view gives latest
  data; mutations don't invalidate the cache. Proper `refetchQueries` or cache update on write.
  `apps/bujogeek/DOCS/CONTEXT.md`

- **bujogeek duplicate model files** — `userModel.js`/`User.js`, `templateModel.js`/`Template.js`.
  Only PascalCase versions are canonical; delete the legacy copies.

- **basegeek stale AI model defaults** — hardcoded `gemini-1.5-flash-latest` and similar in
  `aiService.js` may be deprecated. Polish pass to remove or update defaults.
  `apps/basegeek/packages/api/src/services/aiService.js`

- **notegeek `formatRelativeTime` deduplication** — same function copied in three files.
  Extract to `frontend/src/utils/dateUtils.js`. (Low priority — NoteGeek needs full consolidation pass first.)

- **geekSuite/Bun gateway BroadcastChannel logout** — currently uses direct `fetch` without
  BroadcastChannel. Add `geeksuite-auth`/`LOGOUT` broadcast on logout.
  `src/server/index.js` (geekSuite gateway)
