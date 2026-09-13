# bujogeek Hardening Pass — April 2026

Branch: `basegeek-auth-hardening` (continuation).

Two passes, serialized (both touch `server.js`). Pass 1 is a security
emergency — real data-isolation bugs and active credential log leaks.
Pass 2 brings bujogeek in line with basegeek's / fitnessgeek's post-
hardening operational floor.

Risk rating: **7/10 → 3/10** after both passes.

---

## Pass 1 — Security fixes (blocking)

### 1. Task data isolation — multi-user bug

`taskController.js` currently reads/mutates tasks by ID with no
ownership check. Every authenticated user can enumerate and modify
every other user's tasks.

- `getTaskById` — [taskController.js:52](apps/bujogeek/backend/src/controllers/taskController.js#L52)
- `updateTask` — [taskController.js:65](apps/bujogeek/backend/src/controllers/taskController.js#L65)
- `deleteTask` — [taskController.js:78](apps/bujogeek/backend/src/controllers/taskController.js#L78)
- `updateTaskStatus` — [taskController.js:92](apps/bujogeek/backend/src/controllers/taskController.js#L92)
- `getTaskById` called inside `createSubtask` — [taskController.js:105](apps/bujogeek/backend/src/controllers/taskController.js#L105)

Fix: enforce `createdBy === req.user._id` at the **service layer**.
Every `taskService` method that takes an id must also take (or
internally resolve) the user id and filter on it. Return null / throw
a 404-style error if the task doesn't exist under that user. That way
a future controller that forgets to check can't regress.

Do NOT rely on controller-level checks alone — that's the pattern that
already failed here.

### 2. Template auth bypass

[templateController.js:60](apps/bujogeek/backend/src/controllers/templateController.js#L60)
literally carries the comment:
```
// Temporarily return all templates without authentication checks
const templates = await Template.find(query).sort({ updatedAt: -1 });
```
End the "temporarily". Gate by ownership **or** `isPublic` flag:
```
query.$or = [{ createdBy: req.user._id }, { isPublic: true }];
```
Also audit the rest of `templateController.js`:
- `getTemplate` (single, by id)
- `updateTemplate`
- `deleteTemplate`
- `createFromTemplate` (also used by `journalController.createFromTemplate`)
should all enforce ownership (or isPublic for reads). Same service-
layer enforcement pattern as tasks.

### 3. CORS open to any origin with credentials

[server.js:34-38](apps/bujogeek/backend/server.js#L34) uses
`origin: true` with `credentials: true` — any site that loads in the
user's browser can make authenticated API calls to bujogeek.

Fix: match basegeek/fitnessgeek pattern — read `CORS_ORIGINS` env
(comma-separated), fall back to a small hardcoded list only for dev /
same-host access. Do NOT default to `true`.

### 4. Delete the debug header-logging middleware

[server.js:42-48](apps/bujogeek/backend/server.js#L42) logs full
request headers — including `Cookie` (session tokens) — to stdout on
every request. This is writing credentials to your container logs
right now.

Fix: delete the whole `// Debug logging for auth headers` block.
Replace with nothing. Pass 2 adds `pino-http` which logs request
metadata structurally without headers.

### 5. Also in Pass 1 — Don't leak DB URI in connect log

[server.js:92](apps/bujogeek/backend/server.js#L92) already masks
user/pass in the DB_URI log. That's fine. No change needed, just
flagging so Pass 2 doesn't accidentally un-mask it.

---

## Pass 2 — Operational hardening (matches fitnessgeek's pass)

Only after Pass 1 is merged and verified.

### 1. Boot + shutdown

- [server.js:110-114](apps/bujogeek/backend/server.js#L110) calls
  `app.listen` then awaits `connectDB` inside the callback — server
  is listening before mongo is ready. Wrap boot in
  `async function start()`, `await connectDB()` FIRST, then
  `const server = app.listen(...)`. Fail-fast + `process.exit(1)` on
  mongo rejection.
- No SIGTERM/SIGINT handler anywhere. Add one: `shutdown(signal)` →
  idempotent flag → `server.close()` → `mongoose.disconnect()` →
  `process.exit(0)`, with a 15s `setTimeout().unref()` force-exit
  ceiling. Exact pattern from basegeek `31f0cf5` and fitnessgeek
  `af9262b`.

### 2. Structured logging

- Replace `morgan('dev')` + any `console.*` with `pino` +
  `pino-http`. New module at `backend/src/lib/logger.js` (match
  basegeek's `lib/logger.js`: pretty in dev, JSON in prod, level
  from `LOG_LEVEL`).
- pino-http middleware after cookieParser: `genReqId` reads
  `X-Request-Id` header or generates `randomUUID()`, wrapper echoes
  the header on the response.
- Migrate all `console.{log,warn,error}` in `backend/src/` and
  `backend/server.js` to `req.log` (in handlers) or module-level
  `logger` (in services/config). Pass errors as `{err}` so pino's
  err serializer captures stacks.

### 3. deps

- Add `pino`, `pino-http` to `dependencies`.
- Add `pino-pretty` to `devDependencies`.
- Remove `morgan` if it's no longer imported anywhere else.

---

## Deferred (explicit — not this pass)

- **Input length / type validation with Joi/Zod** — the audit flagged
  client-controllable timestamps and unbounded string fields. Route-
  by-route, own pass.
- **Pagination on list endpoints** (`getTasksForDateRange`,
  `getTasksByTag`). Not urgent at current scale.
- **Rate limiting on write endpoints**. Same — not urgent at one-
  user-geek-suite scale.
- **Tests** — zero coverage. After the suite-wide testing push basegeek
  got, bujogeek should get a similar set covering auth-isolation specs
  for tasks and templates (these would have caught #1 and #2 above).
