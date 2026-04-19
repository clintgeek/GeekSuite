# Deferred Work — Running List

Things that came up during the April 2026 hardening + consolidation sprints
but were scoped out of their respective passes. Tracked here so nothing
gets quietly dropped. Not all of these need doing, and not all of them
need doing soon — this is a menu, not a mandate.

Grouped by the branch or pass that deferred them. Keep adding to this
file as work happens; prune entries when they get done or consciously
decided against.

---

## Security work spun off from basegeek-auth-hardening

These were explicitly carved out of the auth hardening branch because
they touch every consumer app and want a dedicated branch with
per-app verification.

- **CSRF protection.** Cookie auth + `credentials: true` CORS across
  every `*.clintgeek.com` subdomain means any allowed origin that gets
  XSSed can trigger mutations. Adding double-submit CSRF tokens (or
  moving the refresh cookie to `SameSite=Strict`) requires server
  middleware in basegeek plus every app's axios client sending the
  token on mutations. Cross-app — own branch.

- **HttpOnly cookies + stop persisting tokens in localStorage.**
  [`DOCS/CONTEXT.md`](DOCS/CONTEXT.md) already flags `httpOnly: false`
  as the target-state problem. Frontend Zustand stores still persist
  JWTs to localStorage in some apps — XSS = full session theft. The
  rework is: server sets `HttpOnly: true`, frontends stop reading
  `document.cookie`, every app calls `/api/users/bootstrap` for
  identity instead. Needs coordinated rollout — if one app's auth
  breaks mid-deploy, nobody can log in there. Own branch, per-app
  verification.

## fitnessgeek hardening pass — explicitly deferred

- **Garmin password encrypted at rest.** Currently stored plaintext
  in the `UserSettings` document. Response masks it but the DB
  doesn't. Fix requires promoting `cryptoVault` (currently at
  `apps/basegeek/packages/api/src/lib/cryptoVault.js`) into a shared
  package — probably `@geeksuite/crypto-vault` — so fitnessgeek can
  `encrypt()` before writing and `decrypt()` on read. Two-step:
  1. Promote `cryptoVault` to shared package, update basegeek to
     consume it from there (drop the local copy).
  2. Wire fitnessgeek to encrypt Garmin creds + add a backfill
     migration script like basegeek's `encrypt-keys.js`.

- **Circuit breakers on external APIs.** fitnessgeek calls USDA,
  Nutritionix, OpenFoodFacts, Garmin. Today there's a 30s timeout
  per call but no circuit breaker — repeated upstream failures turn
  into a slow page for every user. Use a library like `opossum`
  or hand-roll with Redis as the state backing.

- **Input validation with Joi / Zod.** Most REST routes do ad-hoc
  `if (!field)` checks or allowlist filtering. The audit flagged
  `settingsRoutes.js` as fragile. Schema-driven validation on every
  mutation route. Route-by-route, not urgent, but closes a real
  bug class.

## Observations flagged but deferred across the suite

- **Mongo connection duplication in basegeek.**
  [`models/user.js`](apps/basegeek/packages/api/src/models/user.js)
  creates its own `createConnection` on top of the app-wide
  `mongoose.connect` in `server.js`. Two pools, two failure modes,
  confusing in logs. Consolidate to one connection.

- **`appPreferences` Map vs Object drift.** basegeek's user routes
  read both `.get?.()` and bracket access on `appPreferences`. Old
  documents are plain objects, new are Maps. Silent drift — writes
  can land without `markModified` persisting them. Pick one shape,
  migrate old docs.

- **In-memory AI response cache in basegeek has no TTL or max size.**
  `services/aiService.js` accumulates forever under steady load.
  Wire TTL + LRU eviction.

- **`/api/health` should report dependency status.** Right now it's
  always "up" even if Mongo or Redis is disconnected. Add a cheap
  ping to each dependency and return structured health info so
  orchestrators can tell "up but broken."

- **Admin gate on `GET /api/users` in basegeek.** Paginated now
  (thanks to `b434848`) but still auth-only, not admin-scoped. No
  admin role exists yet — dependency on adding one.

- **Hardcoded `localhost` / LAN IPs in CORS defaults.** basegeek and
  fitnessgeek both support `CORS_ORIGINS` env now, but their
  fallback arrays still ship with dev + LAN origins baked in. Fine
  for dev, sketchy for prod. Either enforce env in production
  (throw if unset) or strip the defaults in a future release.

- **No tests on fitnessgeek, flockgeek, storygeek, bujogeek, notegeek.**
  basegeek now has 33 auth tests; the apps have none. Coverage for
  each app's critical paths (login flow via baseGeek, primary CRUD
  routes, any GraphQL resolvers that touch state) is a slow-burn
  project, not a single pass.

- **fitnessgeek `docker-compose.dev.yml`** references service names
  (`backend`, `frontend`) that no longer exist in the new
  single-service base compose. Rewrite to target the `fitnessgeek`
  service with an image override + bind-mount if the dev hot-reload
  workflow is actually being used; delete if not.

## Apps still to migrate (consolidation, not hardening)

- `bujogeek` — local Mongo data to migrate; first app with state
  that moves from `/mnt/Media/Docker/bujogeek/` into the source
  tree. Do next.
- `notegeek` — two services (backend + frontend) + local Mongo data.
  Either combine into one container or teach `build.sh` about apps
  with multiple services. Hardest of the remaining migrations.

## Apps still to harden (after consolidation)

`storygeek`, `flockgeek`, `bujogeek`, `notegeek` — migrated (or will
be) but haven't had the same logging / boot-await / graceful-shutdown
pass fitnessgeek just got. Each is probably a ~90-minute agent
round, same shape as Item A of the fitnessgeek hardening plan.
