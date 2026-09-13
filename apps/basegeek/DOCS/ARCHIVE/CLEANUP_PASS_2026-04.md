# basegeek Cleanup Pass — April 2026

Scope: the six items flagged as Critical + High-but-small in the senior review. Each is a verifiable, self-contained fix. No scope creep — security work (CSRF, plaintext keys, localStorage tokens), test coverage, and CORS externalization are deferred to a dedicated pass.

Branch: `tweaks-and-fixes`

---

## 1. Password reset silently no-ops — CRITICAL

**File:** `packages/api/src/routes/auth.js` (handler at `/reset-password`, ~line 341)

**Problem:** handler does `user.password = newPassword`. The schema field is `passwordHash` and the bcrypt pre-save hook is keyed on `isModified('passwordHash')`. Setting `password` is a no-op — non-existent field, hook never fires, save persists nothing, old password continues to authenticate.

**Fix:** set `user.passwordHash = newPassword` so the existing pre-save hook bcrypts it. Confirm by reading `models/user.js` — there is a `pre('save')` hook that hashes when `passwordHash` is modified.

**Verification:** grep for any other caller doing `user.password =` in this codebase. If found, fix or flag.

---

## 2. Server accepts traffic before MongoDB is connected — CRITICAL

**File:** `packages/api/src/server.js` (~lines 37-46 and the later `app.listen`)

**Problem:** `mongoose.connect(...).then(...).catch(...)` and `connectAIGeekDB().then(...).catch(...)` are not awaited. Express starts listening immediately. Early requests get queued as mongoose "buffering" operations and time out after 10s. This is the `users.findOne() buffering timed out` we saw today.

**Fix:** wrap boot in an async IIFE (or `async function start()`). `await` both connections before `app.listen(PORT, ...)`. On connection failure, log and `process.exit(1)` — let the orchestrator restart. Do not catch-and-continue.

**Verification:** deliberately break `MONGODB_URI`, start the process, confirm it exits non-zero instead of listening.

---

## 3. No graceful shutdown — CRITICAL

**File:** `packages/api/src/server.js` (same boot area)

**Problem:** no `SIGTERM` / `SIGINT` handler. Every deploy truncates in-flight requests mid-flight, including streaming AI responses.

**Fix:** capture the `http.Server` returned by `app.listen`. On SIGTERM and SIGINT, stop accepting new connections (`server.close`), wait for in-flight to drain with a hard ceiling (e.g., 15s), close mongoose connections, then `process.exit(0)`. Force-exit on the timeout.

**Verification:** start the server, `kill -TERM` the PID while a request is in flight, confirm it completes before exit.

---

## 4. JWT secrets have insecure defaults — CRITICAL

**File:** `packages/api/src/services/authService.js` (~lines 5-6)

**Problem:** `JWT_SECRET` and `JWT_REFRESH_SECRET` fall back to hardcoded strings (`'your-secret-key'`) if env is missing. One misconfigured deploy makes every token forgeable.

**Fix:** remove the fallback. At module load, if either env var is missing or shorter than 32 chars, throw. Fail fast at boot — do not let the server start with weak secrets.

**Verification:** unset `JWT_SECRET`, start the server, confirm it exits with a clear error message.

---

## 5. Dead `src/routes/user.js` file — HIGH (cleanup)

**File:** `src/routes/user.js` (77 lines, at repo root — NOT the one under `packages/api/`)

**Problem:** the live server imports from `packages/api/src/routes/user.js` (324 lines). The repo-root `src/routes/user.js` is an older divergent copy. Someone will "fix a bug" in the wrong file eventually.

**Fix:** verify nothing imports from `apps/basegeek/src/routes/user.js` (grep the full repo). Delete the file. If `apps/basegeek/src/routes/` becomes empty, delete the directory too.

**Verification:** `rg "src/routes/user"` at the suite root returns no hits.

---

## 6. Debug side-effects at model import time — HIGH (cleanup)

**File:** `packages/api/src/models/user.js` (~lines 27-55)

**Problem:** the `userGeekConn.once('open', ...)` block runs a test query every time the module is imported, logs collection names, and prints a specific user's document field keys (`clint@clintgeek.com`) to stdout on every boot. Production log noise with a real email embedded.

**Fix:** delete the entire `once('open', ...)` block (lines ~27-55). Keep the `on('error')`, `on('connected')`, `on('disconnected')` handlers — those are fine.

**Verification:** restart the service, confirm startup logs no longer include collection listings or user field dumps.

---

## Execution plan

Three parallel sonnet agents, each with tightly scoped files to avoid merge conflicts:

- **Agent A:** server.js boot sequence — items #2 and #3.
- **Agent B:** password-reset + model side-effects — items #1 and #6.
- **Agent C:** JWT secret enforcement + dead-file deletion — items #4 and #5.

After all three complete:
1. `pnpm install --frozen-lockfile` (if needed)
2. `cd apps/basegeek/packages/api && pnpm run build` (or whatever the script is) — must compile clean
3. Start the service locally with valid env — must boot and serve `/api/health`
4. Start with `JWT_SECRET` unset — must exit non-zero with clear message
5. Start with a bad `MONGODB_URI` — must exit non-zero (not hang)

Only after all verifications pass is this cleanup pass considered done.
