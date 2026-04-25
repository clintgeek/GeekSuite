# GeekSuite TODO

Suite-wide backlog. Grouped by theme; ordered roughly by impact and ease within each group.
Pull from here when planning the next pass; update as work lands or priorities shift.
`DEFERRED_WORK.md` is the append-only scratch-pad; this is the prioritized cut.

---

## In flight

Nothing blocked right now. The `basegeek-auth-hardening` branch is mid-flight with basegeek,
fitnessgeek, and bujogeek hardening complete. Consumer-app hardening passes are next.

---

## Next up — highest leverage

- **Timezone bug fixes (bujogeek, fitnessgeek, flockgeek)** — documented in detail in
  `DOCS/ARCHIVE/THE_TIME_ISSUE.md` + `THE_TIME_STEPS.md`. Step 0 (set `TZ=America/Chicago` in
  docker-compose) is a 5-minute safety net. The real fixes are per-app but well-specified.
  BujoGeek is most severely affected (daily/weekly/monthly views).

- **Mongo connection deduplication (basegeek)** — `models/user.js` creates its own
  `createConnection` on top of the app-wide `mongoose.connect`. Two pools, two failure modes.
  `apps/basegeek/packages/api/src/models/user.js`

- **`appPreferences` Map vs Object drift (basegeek)** — user routes read both `.get?.()` and
  bracket access; old documents are plain objects, new are Maps. Silent write failures without
  `markModified`. Pick one shape, write a migration.
  `apps/basegeek/packages/api/src/routes/users.js`

- **AI response cache TTL + LRU (basegeek)** — in-memory cache in `aiService.js` accumulates
  forever under load. Wire TTL + LRU eviction.
  `apps/basegeek/packages/api/src/services/aiService.js`

- **Admin gate on `GET /api/users`** — paginated now but still auth-only, not admin-scoped.
  Dependency: add an admin role. `apps/basegeek/packages/api/src/routes/users.js`

- **`/api/health` with dependency status** — currently always returns "up" even if Mongo or Redis
  is disconnected. Add ping-each-dependency and return structured health info.

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
| notegeek | ❌ | ❌ | Two services (backend + frontend); either combine or teach `build.sh` about multi-service apps. Dual auth system (local bcrypt + SSO) must be removed. Hardest remaining migration. |
| bookgeek | ❌ | ❌ | Format-conversion feature also pending (see Features section below) |
| startgeek | ✅ | ✅ | Static Vite app — no backend, no auth. Already in build.sh + docker-compose. |

---

## Cross-cutting security

- **CSRF protection** — cookie auth + `credentials: true` CORS across `*.clintgeek.com` means any
  XSS'd allowed origin can trigger mutations. Fix: double-submit CSRF tokens or `SameSite=Strict`
  for the refresh cookie + CSRF middleware in basegeek + per-app axios interceptor. Own branch,
  per-app verification. (`DEFERRED_WORK.md`)

- **HttpOnly cookies + stop persisting tokens in localStorage** — refresh-token rotation landed in
  basegeek (April 2026). Frontends still read cookies in some apps; Zustand stores persist JWTs to
  localStorage in others. Coordinated rollout: server sets `HttpOnly: true`, frontends call
  `/api/users/bootstrap` for identity, stop reading `document.cookie`. (`DEFERRED_WORK.md`,
  `DOCS/SSO_OVERVIEW.md` Step 4 + 5)

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

- **bookgeek format conversion** — calibre is already in the bookgeek image. Feature: drop a file
  in, bookgeek locates cover + metadata and ensures an EPUB exists (convert from PDF/MOBI/AZW via
  `ebook-convert`). Abstract as a `FormatConverter` service so the underlying tool can swap later.
  Out of scope until bookgeek enters the consolidation+hardening cycle. (`DEFERRED_WORK.md`)

- **bujogeek subtasks UI** — backend model has `parentTask`/`subtasks` fields; no frontend UI.

- **bujogeek recurring tasks UI** — backend model supports `recurrence`; no frontend UI.

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
