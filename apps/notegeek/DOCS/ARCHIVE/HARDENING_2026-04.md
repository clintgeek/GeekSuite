# notegeek Hardening + Consolidation Pass — April 2026

Branch: `notegeek-pass` (cut from main @ `fa32096`).

Scope: bring notegeek to the operational + security floor the other
three hardened apps (basegeek, fitnessgeek, bujogeek) already sit at.

Audit risk rating: **6/10** — higher than the three hardened apps
pre-hardening because notegeek has a structural design flaw (parallel
auth systems) on top of the usual operational gaps.

Two phases, serialized — both touch `backend/server.js` and compose,
so they can't parallelize safely.

---

## Phase 1 — Consolidation

### 1. Collapse two-service compose into one

Source compose at `apps/notegeek/docker-compose.yml` has separate
`backend:` and `frontend:` services (containers `notegeek-backend`,
`notegeek-frontend`). Every other hardened geek app is single-
container: frontend dist is baked into the backend image via the
multi-stage Dockerfile, backend serves static files from `/public`.

Target shape: one `notegeek` service, one `notegeek` container,
matching the `build.sh` convention (service name = app name).

Verify the current Dockerfile already builds a combined image
(running image `geeksuite/notegeek:latest` implies yes). If not,
adjust.

### 2. Env migration

Copy `/mnt/Media/Docker/notegeek/.env.production` (or `.env`) into
`apps/notegeek/.env.production`. Confirm gitignored. Drop any
`${VAR}` passthroughs from the new compose's `environment:` block
that duplicate what `env_file: .env.production` already provides
— same footgun bujogeek hit.

### 3. Stale-data handling

`/mnt/Media/Docker/notegeek/data/db/` — ~3 MB of Mongo data from
when notegeek ran its own Mongo. Current env points at the shared
Mongo at `192.168.1.17:27018/noteGeek?authSource=admin`. Before
archiving:
- Confirm the shared Mongo has the user's notes.
- If the local `data/db/` is genuinely stale (no unique data),
  just archive the whole `/mnt/Media/Docker/notegeek/` dir.
- If it's NOT stale (migration never happened), do an explicit
  mongodump → mongorestore into the shared Mongo's `noteGeek`
  database before archiving. Never just delete without verifying.

### 4. Update build.sh readiness

Run `./build.sh notegeek` as the final smoke of Phase 1 and confirm
the container boots. Any service-name issues surface here.

---

## Phase 2 — Hardening + the parallel-auth fix

### 1. CRITICAL — Remove the parallel auth system

Notegeek currently has two reachable auth flows:

**Local auth (remove):**
- `POST /api/auth/register` → `controllers/auth.js:registerUser`
  creates a local User with bcrypt passwordHash, returns a locally-
  signed JWT. Bypasses basegeek entirely.
- `POST /api/auth/login` → `controllers/auth.js:loginUser` same.
- `generateToken` in `controllers/auth.js` signs JWTs with the local
  `JWT_SECRET` env.

**SSO (keep):**
- `GET /api/auth/me` proxies to basegeek.
- `POST /api/auth/logout` proxies.
- `POST /api/auth/refresh` proxies.
- `POST /api/auth/validate-sso` verifies a basegeek-signed token
  with a local `jwt.verify(token, JWT_SECRET)` — this works only
  because notegeek happens to share the suite-wide `JWT_SECRET`.
  Still architecturally wrong: it's bypassing the `attachUser`
  middleware pattern everyone else uses and leaking a synchronous
  SSO validation into the request thread.

Plan:
- Delete `controllers/auth.js` and the `register` / `login` route
  handlers entirely. `routes/auth.js` imports + mounts are gone.
- Delete `/validate-sso` unless some downstream legitimately hits
  it — grep the full repo. If kept, rewrite to use
  `@geeksuite/user/server`'s identity flow rather than direct JWT
  verify. (Most likely: kill it.)
- Keep the proxy routes to basegeek (`/me`, `/logout`, `/refresh`)
  as-is or replace with `@geeksuite/user/server`'s `meHandler`
  + `attachUser` middleware pattern where it cleans up.
- User model: the `User` model with local `passwordHash` field is
  half-redundant. Keep the SSO-linked fields (`userId`, `email`,
  `preferences`), remove local-auth fields (`passwordHash`). If
  removal breaks migrations, at minimum stop writing to it.
- Drop `bcrypt` dependency if nothing else in notegeek uses it.
- Remove `authMiddleware.js` if it's the deprecated duplicate —
  keep only the `protect = attachUser` pattern from
  `middleware.js`.

### 2. Boot + shutdown

Same pattern as basegeek `31f0cf5` and fitnessgeek `af9262b`:
- Wrap boot in `async function start()`. `await connectDB()`
  BEFORE `app.listen`. Fail-fast on rejection with
  `logger.error + process.exit(1)`.
- Capture `const server = app.listen(...)`.
- `SIGTERM` + `SIGINT` → idempotent `shutdown(signal)` →
  `server.close` → `mongoose.disconnect` → 15s `setTimeout().unref()`
  force-exit ceiling.

### 3. Structured logging — pino + pino-http

- New `backend/src/lib/logger.js` matching basegeek (pretty in dev,
  JSON in prod, level from `LOG_LEVEL`). Actually notegeek's backend
  is at `backend/` not `backend/src/` — put logger at `backend/lib/logger.js`
  to respect existing layout. Update imports accordingly.
- Add pino-http middleware after body parsers / cookieParser, before
  route registrations. `genReqId` honors `X-Request-Id` or
  generates `randomUUID()`. Response echoes the header.
- Migrate every `console.log` / `console.error` to `req.log.*` (in
  handlers) or module-level `logger` (in services). Pass errors as
  `{err}` so pino's err serializer captures stacks.
- Remove morgan — pino-http covers request logging in all envs.

### 4. Fail-fast env enforcement

Match basegeek pattern: at module load, throw if `JWT_SECRET` is
missing or < 32 chars. Also `JWT_REFRESH_SECRET` (if notegeek
legitimately needs its own refresh flow — probably not after the
parallel-auth removal).

### 5. CORS from env

Replace the hardcoded array of origins with:
```
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : hardcodedOrigins;
```
Match basegeek b434848. Keep the `!origin` pass-through.

### 6. Theme standardization

`frontend/src/theme/ThemeModeProvider.jsx` currently reads
`localStorage.getItem(STORAGE_KEY)` for theme state — pre-suite
pattern. Replace with `ThemeProvider` from `@geeksuite/user`. Add
the `themePreboot()` Vite plugin to `vite.config.js` to inject
the cross-suite `geek_theme` cookie preboot script. Grep for any
consumer of the custom provider and switch them to `useThemeMode`
from `@geeksuite/user`.

### 7. Frontend transport audit

Grep for `localStorage.getItem('geek_token')` across
`frontend/src/`. If any stragglers bypass the shared auth-aware
axios instance, consolidate onto a single `restClient` that's
been through `setupAxiosInterceptors` from `@geeksuite/auth` —
same pattern fitnessgeek `af9262b` set up.

### 8. Dockerfile cleanup

Production build currently installs all dependencies including
jest/supertest/vitest/nodemon. Use `pnpm install --prod` (or a
multi-stage build with dev deps only in the builder stage). Shave
image size + remove leaked dev tooling.

### 9. Dead code

Delete after verifying nothing references them:
- Legacy `controllers/auth.js` (covered in #1).
- `middleware/authMiddleware.js` if it's the deprecated duplicate.
- `controllers/folders.js` / `models/Folder.js` (if folders routes
  aren't mounted anywhere).

---

## Deferred — explicit

- **Note body encryption at rest.** The `isEncrypted` flag in
  `models/Note.js` has a TODO comment; current implementation is a
  no-op. Plan: use **geekLock** once adopted suite-wide (see root
  `DOCS/DEFERRED_WORK.md` → "Suite-wide — geekLock sidecar adoption").
  Don't build a notegeek-specific crypto layer now — would become
  dead code the moment geekLock lands.
- **Expand tests** — notegeek has 18; basegeek has 33. Gap includes
  note-ownership integration tests, CORS rejection tests. Own pass.
- **Input validation with Joi/Zod** on mutation routes. Same as the
  other apps' deferred list.
- **Helmet CSP disabled** at `backend/server.js:41-44`. Re-enable
  with a deliberate policy. Own pass.

---

## Execution

- **Phase 1** first. One agent. Compose collapse, env migrate, data-
  archive decision. Commit. I verify in the browser before Phase 2.
- **Phase 2** second, one agent with the full scope (the dual-auth
  removal is nontrivial and wants to happen alongside the hardening
  so the test matrix collapses to one pass).

After both phases land + deploy + verify, risk should drop from
**6/10 → 3/10** in line with the other hardened apps.
