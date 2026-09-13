# fitnessgeek Hardening Pass — April 2026

Branch: `basegeek-auth-hardening` (continuation — not worth cutting a new branch mid-stream since we're landing small commits).

Scope follows the audit: real issues, not bikeshedding. Deferred items are listed at the bottom.

---

## Item A — Backend boot, shutdown, structured logging, CORS

**File scope:** `apps/fitnessgeek/backend/src/` only.

**A1. Await DB connection before `app.listen`.** [server.js:17](apps/fitnessgeek/backend/src/server.js#L17) fires `connectDB()` without awaiting, so Express starts listening before Mongo is ready. Same pre-hardening bug we just fixed in basegeek. Wrap boot in an async start(), await `connectDB()` (and the Redis `.connect()` can stay non-blocking since app is designed to run without Redis). On connection failure → `logger.error(...)` + `process.exit(1)`.

**A2. Graceful shutdown.** No SIGTERM/SIGINT handler anywhere in the backend. Every deploy truncates in-flight requests. Mirror basegeek's pattern: capture `server = app.listen(...)`, register one `shutdown(signal)` function for both signals, `server.close()` → `mongoose.disconnect()` → 15s force-exit ceiling with `unref()`ed timer, idempotent on double-signal.

**A3. Structured logging via pino + pino-http with request IDs.** `backend/src/config/logger.js` already exists (the audit flagged double-logging in dev). Replace it with a clean pino setup matching basegeek's `lib/logger.js` — pretty in dev, JSON in prod, level from `LOG_LEVEL`. Add `pino-http` middleware that reads `X-Request-Id` or generates `randomUUID()`, attaches `req.log`, echoes the header on the response.

**A4. Migrate `console.*` to logger.** Routes currently use a mix of `logger.error(...)` and `console.error(...)` (audit found instances in medicationRoutes, aiCoachRoutes, goalRoutes). Grep all `console.{log,warn,error}` under `backend/src/` and migrate using the basegeek patterns — in route handlers use `req.log.{level}`, in services use module-level `logger`. Errors pass `{err}` so pino's err serializer captures the stack.

**A5. CORS from env.** [server.js:34-50ish](apps/fitnessgeek/backend/src/server.js) currently hardcodes the allowlist including prod URL and a `192.168.1.17` LAN IP. Read `CORS_ORIGINS` env (comma-separated), fall back to the current list if unset — same pattern we just added to basegeek. Don't reorder other middleware.

**Verification:** `node --check` each edited file, boot-check that logger loads and `/api/health` still responds (try with deliberately unset `CORS_ORIGINS` and confirm the fallback works).

---

## Item B — Frontend: consolidate axios, drop localStorage token reads, remove theme shim

**File scope:** `apps/fitnessgeek/frontend/src/` only.

**B1. Shared axios instance, token handling via `@geeksuite/auth`.** Six services each do:
```js
const restApi = axios.create({ baseURL: '/api', ... });
const token = localStorage.getItem('geek_token');   // added in request interceptor
```
That bypasses refresh-token rotation. Create one `frontend/src/services/restClient.js` (name to match existing conventions) that exports a single axios instance configured with `setupAxiosInterceptors` from `@geeksuite/auth`. Update the six services to import and use it:
- `services/foodService.js`
- `services/medsService.js`
- `services/fitnessGeekService.js`
- `services/influxService.js`
- `services/aiService.js`
- `services/userService.js`

Also check `services/authService.js` — it has its own axios instance too. Probably keep it separate (it targets baseGeek directly for login endpoints) but confirm it goes through the same interceptor pattern where relevant.

Also sweep the codebase for any OTHER `localStorage.getItem('geek_token')` calls (audit mentioned BarcodeScanner/AuthListener) and route them through whatever already holds the token (typically `useAuth()` context from `@geeksuite/auth`).

**B2. Remove the redundant ThemeContext shim.** If `frontend/src/contexts/ThemeContext.jsx` exists only to re-export from `@geeksuite/user`, delete it and update imports across the codebase to point at `@geeksuite/user` directly.

**Verification:** Grep `localStorage.getItem.*geek_token` under `src/` — should return zero hits. Build with `pnpm run build` (or `vite build`) must succeed. No need to run the app.

---

## Execution order

1. **Item A** and **Item B** are in disjoint directories (`backend/src/` vs `frontend/src/`) — dispatch in parallel.
2. After both land, a single commit per item.
3. Rebuild + redeploy via `./build.sh fitnessgeek`.

## Deferred (explicit — save for later)

- **Garmin password at-rest encryption.** Requires promoting `cryptoVault` from basegeek's internal module to a shared package (`@geeksuite/crypto-vault` or similar) so fitnessgeek can encrypt before writing to `UserSettings`. Not small — own pass.
- **Circuit breakers** on USDA / Nutritionix / OpenFoodFacts / Garmin. Separate reliability pass, not urgent.
- **Input validation with Joi/Zod** on REST routes. Route-by-route migration, not scoped here.
- **Logout IIFE** in `authRoutes.js` — style nit, not a bug. Leave it.
