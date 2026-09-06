> **This file is the SSO architecture reference only.** For the box, containers, databases,
> nginx, CI/CD, deploy/rollback, local dev, and known failure modes, see `DOCS/RUNBOOK.md`.

# GeekSuite Unified SSO — Technical Context

Suite-wide SSO architecture reference. For the detailed SSO design, risks, and migration plan see
[`THE_SSO_OVERVIEW.md`](SSO_OVERVIEW.md) (now renamed `SSO_OVERVIEW.md`). For basegeek-specific
auth implementation see `apps/basegeek/DOCS/SSO_IMPLEMENTATION.md`.

---

## Architecture Summary

### Central Auth Authority: basegeek

- **URL**: `https://basegeek.clintgeek.com`
- **User DB**: MongoDB `userGeek` collection (suite-shared MongoDB instance)
- **Auth Endpoints**:
  - `POST /api/auth/login` — login, sets SSO cookies
  - `POST /api/auth/register` — register, sets SSO cookies
  - `POST /api/auth/refresh` — refresh tokens (reads `geek_refresh_token` cookie)
  - `POST /api/auth/validate` — validate token (body)
  - `POST /api/auth/logout` — logout, clears SSO cookies
  - `GET /api/users/me` — cookie-first identity check (used by all consumer apps)

### Token Structure (JWT payload)

```json
{
  "id": "user._id",
  "username": "user.username",
  "email": "user.email",
  "app": "appname"
}
```

### Valid Apps (VALID_APPS in basegeek)

```javascript
const VALID_APPS = [
  'basegeek', 'notegeek', 'bujogeek', 'fitnessgeek',
  'storygeek', 'startgeek', 'flockgeek', 'musicgeek',
  'babelgeek', 'bookgeek'
];
```

---

## SSO Cookie Mechanism

Cookies are set with `domain=.clintgeek.com` so every `*.clintgeek.com` subdomain receives them.

| Cookie | Purpose | Max Age | HttpOnly |
|--------|---------|---------|----------|
| `geek_token` | Access token (JWT, 1h TTL) | 1h | true |
| `geek_refresh_token` | Refresh token | 30d | true |
| `geek_csrf` | Double-submit CSRF token (basegeek only) | 30d | **false** |

Both auth cookies are `HttpOnly: true` (basegeek auth hardening, April 2026). Frontend never
reads tokens directly — it calls `/api/users/me` (server reads cookie, returns user or 401).

`geek_csrf` is deliberately **not** HttpOnly: the page has to read it to echo it back. It is
never a credential on its own — it authenticates nothing, and basegeek only ever compares it
against itself.

### CSRF: the double-submit token (basegeek, 2026-09-05)

The Origin allow-list guard (`CSRF_GUARD`, all seven backends, 2026-09-02) closes third-party
CSRF everywhere and sibling-subdomain CSRF against the six consumer backends. It cannot close
sibling-subdomain CSRF against **basegeek**, whose allow-list must contain every app origin
because every frontend calls its GraphQL API. The double-submit token closes that gap.

**The contract**

| | |
|---|---|
| Cookie | `geek_csrf=<43-char base64url>` — 32 random bytes, `domain=.clintgeek.com`, `SameSite=Lax`, `Secure` in production, `path=/`, max-age 30d |
| Header | `X-CSRF-Token: <the exact same value>` |
| Required on | `POST` / `PUT` / `PATCH` / `DELETE` to basegeek that authenticate **by cookie** |
| Not required on | `GET`/`HEAD`/`OPTIONS`/`TRACE`, and any request with no SSO cookie — API-key (`Authorization: Bearer bg_…`, `/openai/v1` and the key-authenticated `/api/ai/*`) and JWT-bearer clients are exempt **by construction**, not by a path list |
| Rejections | 403 `{ "error": "csrf_token_missing" }` (no header) / 403 `{ "error": "csrf_token_invalid" }` (header ≠ cookie) |

**Issued and rotated** wherever the SSO cookies are — login, register, refresh (`setSSOCookies`
in `apps/basegeek/packages/api/src/routes/auth.js`), so it rotates in lockstep with the refresh
token — and cleared on logout and on refresh-reuse revocation. `ensureCsrfCookie()` back-fills it
on any request that carries a session but no token yet, so a session created before this shipped
heals on its next call instead of its next login. A request whose session has no `geek_csrf` yet
is allowed and logged (`reason: no_csrf_cookie`); a third-party page cannot make the browser omit
a cookie it holds, so that branch is only reachable by a not-yet-issued session.

**The lever**: `CSRF_TOKEN=off|report|enforce` on basegeek, read once at boot, restart-only.

- **Default and current setting: `report`.** Violations are logged (`app`, `method`, `path`,
  `reason`, `wouldReject`) and let through, so deploying it cannot break a client that does not
  send the header yet. Unlike `CSRF_GUARD`, an unset or unrecognized value means `report`, not
  `enforce`.
- **Flip to `enforce`** — set `CSRF_TOKEN=enforce` in basegeek's env and restart — only after
  a day with no `CSRF token check (report-only)` warnings in the logs. `off` is the escape hatch
  if enforcing goes wrong.

  Every caller is now sending the header (2026-09-05, BURN_REVIEW #3/#17), so the remaining gate
  is the log window, not the code. The procedure:

  1. Deploy the #3/#17 fix (it ships with the normal push-to-main wave).
  2. Watch basegeek for a day: `docker logs --since 24h basegeek | grep -i 'report-only'`
     (container `basegeek`, `apps/basegeek/docker-compose.yml`). Zero `CSRF token check
     (report-only)` warnings over 24h is the gate. A warning names the `app`, `method`, `path`
     and `reason` — that is a caller still to fix, not a reason to flip anyway.
  3. Set `CSRF_TOKEN=enforce` in basegeek's `.env.production` and restart the container. The
     value is read once at boot; there is no hot reload.
  4. Smoke it: log into any app, leave a tab open past the 1h `geek_token` TTL (or force a
     refresh), and confirm the session survives. A regression here looks like every app logging
     out at once, and `CSRF_TOKEN=off` + restart is the immediate undo.

  Q18b stays Chef's call.

**Clients.** `@geeksuite/auth` (`packages/auth/src/authClient.js`) reads the cookie and adds the
header on every non-GET call it makes (`logout()`, `doTokenRefresh()`, and the
`setupAxiosInterceptors()` request interceptor every app's axios instance goes through), and
exports `csrfHeaders(method?)` for callers that reach basegeek without it. basegeek's own
`packages/ui/src/api.js` adds it via its own request interceptor.

Also sending it: `packages/api-client/src/index.js`'s shared Apollo `authLink` (spreads
`csrfHeaders()` last, so it covers every app's GraphQL mutations and cannot carry a stale value),
and startgeek's dependency-free `apps/startgeek/src/lib/{graphql,basegeek}.js`, which read the
cookie inline per call. `d8521eb`.

**The stale-tab heal.** A tab whose JS predates this rollout — or whose `geek_csrf` cookie rotated
out from under it while the tab sat open — sends no header, or a stale one, and 403s as
`csrf_token_missing` / `csrf_token_invalid` on every mutation under `CSRF_TOKEN=enforce` until
reloaded. Every browser client heals the same way: on that specific 403, retry the request **once**
with a freshly-read cookie (the value may have just been back-filled by `ensureCsrfCookie()` on the
very response that rejected it, or rotated by a concurrent refresh in another tab); if the retry
fails with the same code, reload the tab **once per session**, guarded by a `sessionStorage` flag so
a setup that is genuinely broken (cookies blocked, storage disabled) can't loop. Never fires for any
other 403. `packages/auth/src/authClient.js`'s axios response interceptor, `packages/api-client`'s
Apollo error link (which retries by hand-building an `Observable` around `forward(operation)`, since
`onError` only invokes its handler once per original failure), and startgeek's
`apps/startgeek/src/lib/csrfHeal.js` (`shouldHealCsrf()` / `triggerCsrfReloadOnce()`, imported by
both `graphql.js` and `basegeek.js`) all share the same `geeksuite:csrf-reload-attempted`
sessionStorage key, so a tab that trips the guard from a REST call and a GraphQL call in the same
page load still reloads only once. A reload drops unsaved page state — worth knowing, since it's the
one part of this that is user-visible — but it's the last resort after a same-cookie retry has
already failed, not the first response to any 403.

**Server-to-server: the six auth proxies.** notegeek, bujogeek, fitnessgeek, storygeek, flockgeek
and bookgeek expose `POST /api/auth/{refresh,logout}` as thin proxies — the browser calls its own
app's backend, the backend replays the browser's cookies up to basegeek with axios. That upstream
call is not a browser request: it sends no `Origin` and no `Referer`, so `csrfGuard`'s "neither
header present → pass" branch lets it through and the double-submit token is the only control in
front of it. All six build their upstream headers with `authProxyHeaders()`
(`packages/user/src/server/authProxyHeaders.js`), which forwards `Cookie`, `Authorization` and
`X-CSRF-Token` as received and never synthesizes a token from the replayed cookie — a proxy that
did would hand every proxied path a standing pass through the check. bookgeek's `/login` and
`/register` forward no cookie at all: they are credential exchanges that need no session.
Before this (BURN_REVIEW #3) none of the six forwarded the header, which would have made the
enforce flip a suite-wide logout inside an hour.

**What it does not do.** A token cannot stop full script execution on an allow-listed origin: the
cookie is readable by any `*.clintgeek.com` page by design (that is how a sibling app attaches the
header), so an XSS on a suite origin can read and replay it. It closes everything short of that —
injected markup that cannot script, a hostile page on a `*.clintgeek.com` host a wildcard rule
lets through, a stale allow-list entry, a future mount where the Origin guard is bypassed. The
Origin guard stays in front of it as defense in depth.

**Stored HTML is sanitized on both sides (Q63, 2026-09-05).** The one place in the suite that
renders stored content as markup is notegeek's `NoteViewer` (a `type: 'text'` note is TipTap HTML),
and it now passes through `frontend/src/utils/sanitizeNoteHtml.js` while the gateway sanitizes the
same string on save (`graphql/notegeek/sanitize.js`) — one DOMPurify allow-list profile, duplicated
line-for-line in both files because they live in different workspaces. That matters here rather than
in notegeek alone: script on any `*.clintgeek.com` origin can read the domain-wide SSO cookie and
the double-submit CSRF token, which is the one attack the paragraph above says a token cannot stop.

**Code**: `apps/basegeek/packages/api/src/middleware/csrfToken.js` (guard + issuance),
mounted in `server.js` immediately after `csrfGuard()`; `X-CSRF-Token` is on basegeek's CORS
`allowedHeaders` list, without which the cross-origin preflight would fail.

### Standard pattern (every app)

```javascript
// Frontend: ask server who am I
const res = await fetch('/api/users/me', { credentials: 'include' });
const user = res.ok ? (await res.json()).user : null;

// Backend: read cookie, verify JWT
const token = req.cookies?.geek_token;
const user = jwt.verify(token, process.env.JWT_SECRET);
res.json({ user });
```

### Who validates a session — and what an unanswerable check means

**Two different answers, never collapsed into one.** A session check can come back "this token is
bad" or "nobody could check the token". They look alike in a `catch` block and they are nothing
alike to a user: the first means log out, the second means try again in a moment.

**Who does the checking.** `attachUser()` / `optionalUser()` from `@geeksuite/user/server` guard
every authenticated route in the suite. By default they validate over HTTP —
`GET BASEGEEK_URL/api/users/me` with the caller's token, bounded by `BASEGEEK_TIMEOUT_MS`
(default 8 s). That is correct for the **six consumer backends** — bookgeek, bujogeek,
fitnessgeek, flockgeek, notegeek, storygeek — because basegeek is a different process and the only
holder of `JWT_SECRET`.

basegeek is the **seventh** caller and does *not* use the HTTP path. Its `/graphql` mount passes a
`validateSession` function that verifies the JWT in-process:

```javascript
app.use('/graphql', optionalUser({ validateSession: localSessionValidator }));
```

Before this, `BASEGEEK_URL` inside basegeek resolved to basegeek, so the gateway went out through
nginx and back in to ask *itself* who the caller was — spending an inbound request slot on every
inbound request. Under load that is a feedback loop, and once the timeout landed it stopped being
slow and became a suite-wide logout (see below). `localSessionValidator`
(`apps/basegeek/packages/api/src/middleware/auth.js`) reads the token cookie-first, verifies it with
`verifyAccessToken` — the same parser every basegeek REST route uses, not a second one — applies the
password-change rule (a token minted before `user.passwordChangedAt` is dead, same as a refresh
token), and returns the exact payload `GET /api/users/me` returns. Resolvers reading
`context.user.id` cannot tell the two paths apart.

**The 503 contract.** When validation is *unavailable* — a timeout, a refused connection, a DNS
failure, a 5xx, a local database that will not answer, or any status that is not a flat 401/403 —
every consumer answers:

```
HTTP/1.1 503 Service Unavailable
Retry-After: 5

{ "message": "Authentication service unavailable", "code": "AUTH_UNAVAILABLE", "retryAfter": 5 }
```

This holds on **both** paths. `optionalUser()` means *the user may be absent*, not *the check may be
skipped*: an unavailable check 503s even there. It replaces the old 502, which the `required` path
sent and the optional path did not send at all.

**Why it matters.** `optionalUser()` used to swallow an unavailable check and run the request
**anonymously**. On basegeek's gateway that anonymous request reached a resolver, which threw
`UNAUTHENTICATED` for want of a user, which `packages/api-client`'s shared Apollo error link turns
into `logout()` + a login redirect in every app built on `createApolloClient`. So a basegeek that
was merely *slow* logged every open tab in the suite out. (`DOCS/BURN_REVIEW_2.md` §3.)

**Client side.** A 503 must never reach a logout path:

- `packages/api-client/src/index.js` — the Apollo error link returns early on any `networkError`
  with `statusCode >= 500`. Only a 401, or a real `UNAUTHENTICATED` GraphQL error, logs out.
- `packages/auth/src/authClient.js` — the axios response interceptor already gates on 401/403 only;
  a 503 rejects normally, with no refresh attempt and no logout. Unchanged.

**Writing a new validator.** Throw `invalidSession()` or `sessionUnavailable()` from
`@geeksuite/user/server` to say which kind of failure you hit. Anything else is classified by
`classifyValidationError()`, which fails **closed**: only an upstream 401/403 counts as "invalid",
everything else is "unavailable". A 404 from a mistyped `BASEGEEK_URL` is not evidence that a user's
token is bad.

---

## App Migration Status

> **Note**: The table below reflects state as of early 2026 and is partially historical.
> As of April 2026: basegeek, fitnessgeek, and bujogeek have completed consolidation +
> hardening. storygeek and flockgeek are consolidated but not yet hardened. bookgeek,
> notegeek, dashgeek, and startgeek are pending consolidation. See `DOCS/SUITE_TODO.md`
> for the current backlog.

Apps that have completed the hardening pattern use `@geeksuite/auth` middleware, pino
logging, graceful shutdown, and environment-driven CORS.

**2026-09-05:** the migration axis above (SSO/auth hardening) is orthogonal to a second axis
that moved a lot this day — how much of each app's own CRUD lives on basegeek's gateway vs.
its local REST. fitnessgeek's food-log writes and bookgeek's profile/filters/shelves/AI-status
are now gateway-owned with the REST routes deleted; notegeek's legacy REST and `Note` model are
gone; every gateway mutation module (bujogeek, fitnessgeek, notegeek, flockgeek, bookgeek) has
zod validation. See `DOCS/SUITE_TODO.md` "GraphQL consolidation audit" for the current per-app
state, which has moved past this table.

---

## Known Issues / Architecture Debt

### ~~Duplicated `UserSettings` schema (fitnessgeek)~~ — resolved 2026-09-05, see the tripwire test

The Mongoose `UserSettings` schema used to be declared twice — once for fitnessgeek's REST routes,
once for basegeek's GraphQL resolvers — against one collection. Because Mongoose strict mode strips
unknown fields on `$set` rather than erroring, a field added to one copy was accepted, logged as a
success, and silently discarded by the other. That is how keto config vanished in April 2026.

The field set now lives in **one** file, `packages/schemas/fitnessgeek/userSettings.js`
(`@geeksuite/schemas`), which both models build from. Consolidation was a pure refactor: no document
rewritten, no migration, no field added, removed, retyped or re-defaulted — the two copies had
already been hand-synced to an identical 81 paths.

Tripwires fail the moment either model stops consuming the shared definition:

- `apps/basegeek/packages/api/src/__tests__/userSettingsSchemaParity.test.js` — imports both real
  models, compares `schema.paths` path-by-path, and proves write-through in both directions on the
  in-memory Mongo
- `apps/fitnessgeek/backend/src/__tests__/models/userSettingsSchemaParity.test.js` — the hermetic
  half, plus a check that the REST allow-lists name only real schema paths

**Adding a field**: shared module only, then `typeDefs.js` for GraphQL and `settingsRoutes.js`'s
allow-list for REST. Full field inventory, drift history, and the design rationale:
[`apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md`](../apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md).

### Stale hardcoded AI models (basegeek)

`apps/basegeek/packages/api/src/services/aiService.js` has hardcoded default model names (e.g.,
`gemini-1.5-flash-latest`) that may be deprecated. The fallback chain routes to groq on failure so
users get responses, but log noise is misleading. Polish ticket — not a fire.

---

## Time zones (Q42, Night 2 — 2026-09-06)

Containers run **UTC**, full stop. The `TZ=America/Chicago` line in every consumer app's
`docker-compose.yml` (bookgeek, fitnessgeek, notegeek, flockgeek, storygeek, bujogeek, startgeek)
was removed — it was inert dead weight. None of these images carry `tzdata` (plain
`node:20-alpine`/`-slim`), so `TZ` had no effect on any server-side `new Date()`, `Date.now()`, or
log timestamp; it was misleading, not merely useless, because it looked like a config a reader
could rely on.

**The rule going forward**: the browser owns the local day. A server never guesses what "today"
means for a user — it either receives a calendar-day string from the client or computes one in
UTC and lets the client re-derive the local view. Calendar-day fields (a habit's date, a food
log's day, a journal entry's day) are `YYYY-MM-DD` strings, not `Date` objects with an implied
zone, produced via `@geeksuite/utils` (`packages/utils/src/dates.js`):

- `utcDateString(value)` — canonical `YYYY-MM-DD` for storage/comparison, computed in UTC
- `localDateString(value)` — the same shape, computed in the caller's local zone (browser-side)
- `toUtcMidnight(value)` — parses a `YYYY-MM-DD` string to a `Date` at UTC midnight, for querying
- `displayCalendarDate`, `startOfLocalDay`, `utcDayRange` — display/range helpers built on the same
  contract

**Never install `tzdata` and set a real `TZ`** without first re-auditing every server-side
`new Date()` call site across the seven consumer backends: today those calls are UTC by the
container's own emptiness (no zone data to consult), and every calendar-day computation upstream
already assumes that. Giving the container a real zone would silently shift midnight for any call
site that isn't already going through the `@geeksuite/utils` helpers above — the exact class of bug
the stripped `TZ` line was pretending to prevent.

`basegeek`'s compose file is out of this stream's scope (a different agent owns it this session);
its own `TZ` handling, if any, is unaudited by this pass.

---

## Night 2 — 2026-09-06 (R123 — Q42 TZ, Q70 orphan cleanup)

**Built/changed:**
- Removed the `TZ: America/Chicago` line from the seven in-scope compose files: `apps/bookgeek`,
  `apps/fitnessgeek`, `apps/notegeek`, `apps/flockgeek`, `apps/storygeek`, `apps/bujogeek`,
  `apps/startgeek` — each a single-line, byte-identical-otherwise diff, YAML-validated with
  `python3 -c "import yaml; yaml.safe_load(...)"` (no `docker compose config` available/allowed).
- Added the "Time zones" section above.
- Updated `DOCS/RUNBOOK.md`'s existing "TZ is inert, Chef's call" line to record that Q42 is done.
- New `tools/kill-orphans.mjs` (Q70) — see `DOCS/RUNBOOK.md` §11 for usage; a line was added there
  since `tools/README.md` doesn't exist yet.

**Decisions made on Chef's behalf:**
- `basegeek/docker-compose.yml` was left untouched — out of scope for this stream (another agent
  owns it this session), so its `TZ` line (if any) is unaudited here.
- No Dockerfile in scope sets `TZ` itself (grepped, zero hits) — nothing to change there.
- `DEPLOY.md` has no `TZ` mention — nothing to fix there.
- `kill-orphans.mjs`'s `serve` detection matches on the resolved executable's basename (`serve`) or
  the `serve` npm package's known install paths, specifically to avoid false-positives on this
  box's other same-named "serve" subcommands (`ollama serve`, `registry serve ...`) that are
  unrelated dev tooling.

**Left, with reasons:**
- `--kill` was never invoked by this agent, per the hard rules — verified in list/dry-run mode only
  (see the report for the observed output shape). Chef or Sage should run `--kill` when actually
  clearing a stuck box.
- No root ESLint config exists to cover `tools/**` (confirmed: no root `eslint.config.*`, no root
  `.eslintrc*`; lint is per-workspace-package via `pnpm -r lint`), so no lint pass was run against
  the new tool.

---

## Reference Documentation

- [`SSO_OVERVIEW.md`](SSO_OVERVIEW.md) — full SSO architecture, risks, and migration plan
- `apps/basegeek/DOCS/SSO_IMPLEMENTATION.md` — basegeek auth implementation detail
- `apps/basegeek/DOCS/AUTH_SYSTEM.md` — auth system overview
- `apps/basegeek/DOCS/SSO_CLIENT_MIGRATION_PLAYBOOK.md` — per-app migration steps

---

## Going-over 2026-09-05 — `packages/**` (the shared packages)

A read of every file in `packages/{ui,auth,api-client,user,utils,logger,schemas,crypto-vault,eslint-config}`.
These packages are consumed by every app, so the bar for changing one is higher than for an
app: everything below is either a bug fix or additive, and every consumer was grepped.

### Fixed

- **`packages/user/src/server/tokenUtils.js` — `validateToken()` had no timeout.** axios
  defaults `timeout: 0` (wait forever), and this call runs on *every* authenticated request in
  the six consumer backends (`attachUser()`, no cache). A basegeek that is hung rather than down
  parked every inbound request in every app until the socket died on its own. Now bounded at
  8s, `BASEGEEK_TIMEOUT_MS` overriding (a non-positive or unparseable value falls back to the
  default rather than restoring "forever"). A timeout carries no `error.response`, so it lands
  in `attachUser()`'s existing 502 branch and is never mistaken for a 401. *(Superseded 2026-09-05: that branch now answers 503 + `Retry-After`, and the optional path reaches it too — see "Who validates a session" above.)*
- **`packages/auth/src/authClient.js` — a transient refresh failure logged you out.**
  `startRefreshTimer`'s `catch` did not look at the error: a rejected `fetch` (wifi blinked,
  laptop just woke), a 502 while a container restarted, or a 200 whose body was an nginx error
  page all stopped the timer *and* fired `onFailure` — which `AuthProvider` wires to "clear the
  user and run the app's logout callback". The comment above it said the opposite. Only a real
  401/403 is terminal now; everything else warns and retries on the next 50-minute tick.
- **`packages/logger` — an axios rejection logged as `{ err }` wrote the caller's credentials
  in the clear.** An axios error hangs `config`, `request` and `response` off itself as own
  enumerable properties, and pino's standard `err` serializer copies those verbatim. Measured
  on a real 401: one `logger.error({ err })` wrote 9.5 KB and repeated the
  `Authorization: Bearer …` three times (`config.headers`, `request._header`,
  `request._redirectable._options.headers`), the replayed `Cookie` twice, the upstream
  `set-cookie` twice and the outbound request body — a password, on the login/register proxies
  — twice. Every backend logs failures this way (`req.log.error({ err }, 'Unhandled error')` is
  fitnessgeek's global handler). A redaction path list cannot win that game, because
  `err.request` is a live `ClientRequest` whose internals are node's to rename, so
  `createLogger` now installs a `serializers.err` that **drops** the transport objects and keeps
  `{ method, url, timeout }` / `{ status, statusText, data }`. Same line, 1.4 KB, no secret.
  `serializeError` is exported for a consumer building its own pino. Non-axios errors and a
  non-object `err` (`{ err: err.message }`) are untouched.
- **`packages/utils/src/dates.js` — `toUtcMidnight(null)` was 1 January 1970.** `new Date(null)`
  is the epoch (`null` coerces to `0`) while `new Date(undefined)` is Invalid Date, and that
  asymmetry passed straight through, so a calendar date the caller never supplied reached Mongo
  as a perfectly storable 1970 row instead of a cast error somebody would see. `null` and `''`
  now yield Invalid Date in `toUtcMidnight` and `startOfLocalDay`, matching what
  `utcDateString` / `displayCalendarDate` / `localDateString` have always done. An explicit
  `0` still means the epoch. `utcDayRange` inherits the guard.
- **`packages/user/src/server/createUserModel.js` — two conflicting specs per index.**
  `userId` and `email` both declare `unique: true, sparse: true` on the path *and* had a bare
  `schema.index({ … })` beside it: same default name, different options, which MongoDB refuses
  with `IndexOptionsConflict` on an event nothing listens for. Nothing consumes this factory
  yet — which is why the trap was worth removing before something does.
- **`packages/ui/src/surfaces/GeekDialog.jsx` — `dialogProps.PaperProps` was silently dropped.**
  `dialogProps` is the slot every app primitive forwards its `...rest` into (PremiumDialog,
  BujoDialog, LedgerDialog, CodexDialog), and this assigned `PaperProps` rather than merging it,
  unlike `GeekSheet`, which has always merged. Latent — no app passes it today. Ladder is now
  full-screen defaults → `dialogProps` → the primitive's own `sx`.
- **`packages/schemas/fitnessgeek/weight.js` — exports `weightBounds`** (BURN_REVIEW note (r)).
  `medication` and `bloodPressure` export theirs and their zod validators import them; `weight`
  was the one member of the set whose ceiling was hand-copied. Definition values are unchanged
  byte for byte — both parity tripwires stay green. **Follow-up for the fitnessgeek tree:**
  `apps/fitnessgeek/backend/src/validation/schemas/weight.js:11` can now import it instead of
  writing `.max(1000)`. Its positive *floor* is deliberate and documented; only the ceiling and
  the notes length should come from here.
- **Doc drift**: `getTokenFromRequest`'s docstring claimed "cookie-first, then Authorization
  header". Six backends have shipped header-first since inception. The comment now says what the
  code does, and a test pins the order.
- Dead code removed: `getStoredRefreshToken` in `authClient.js` (never read — refresh is
  cookie-first on purpose, and replaying a rotated localStorage token is what trips basegeek's
  reuse revocation), the unused `apiBase` in `startRefreshTimer`, three unused React imports in
  `useUserStore.js`.

### Left in place, with reasons

- **The shared Apollo link does not refresh on a 401 — it logs you out.** `packages/auth`'s
  axios interceptor refreshes and replays; `packages/api-client`'s `errorLink` treats a 401
  `networkError` (or an `UNAUTHENTICATED` GraphQL error) as terminal and calls `logout()` +
  `loginRedirect()` immediately. Normally invisible, because `startRefreshTimer` rotates the
  cookie every 50 minutes — but a tab that was backgrounded or a laptop that slept past the 1h
  `geek_token` TTL gets a hard logout on its next query where a refresh would have worked.
  The machinery to fix it exists in that file (the CSRF heal already retries by hand-building an
  `Observable` around `forward(operation)`), but it needs `doTokenRefresh` exported from
  `@geeksuite/auth` and it changes session behaviour for all eight apps at once. **Chef's call.**
- **`packages/schemas/fitnessgeek/nutritionGoals.js` — sugar/sodium are a ceiling in
  `evaluateGoalsMet` and a floor in `computeGoalProgress`**, so hitting your sodium limit exactly
  reads as 100% "progress". Q39, confirmed by the burn review; the file says in as many words
  that it moved verbatim and is a product question. Both methods still have zero non-test
  callers.
- **`packages/ui/src/color.js`'s `readableCache` is an unbounded `Map`** keyed on
  `color|surface|min|under`. Called from inside `sx`, so it grows with distinct tuples rather
  than with renders; every consumer today feeds it from a fixed palette. A cap is cheap if that
  ever stops being true.
- **`useUserStore`'s `useUser()` can tear**: it seeds `useState` from the module store at first
  render and only subscribes in an effect, so a store change landing in that window is missed
  until the next notify. Live in bujogeek and notegeek; not observed, and the fix is a
  `useSyncExternalStore` rewrite of a module every app's bootstrap touches.
- **`createUserModel` has no consumers at all.** Left (now trap-free) rather than deleted —
  deleting a shared factory is a Chef call, not a going-over call.
- **`getTokenFromRequest`'s header-first order** itself: a stale bearer beating a fresh cookie
  costs one 401 and the client's own refresh, and changing the order changes auth resolution in
  six backends at once. Documented instead.

### Verification

608 → 644 tests, all green (ui 414→417, auth 35→43, api-client 9, user 82→95, utils 36→42,
logger 7→13, crypto-vault 25). Lint 18 → 12 warnings, 0 errors, none new.
`node tools/syntax-check.mjs` clean over 811 files; `node tools/boot-smoke.mjs` clean over all
seven backends. No package has a build step — they are source-only, bundled by each app's Vite,
so `pnpm build` does not apply here. The mobile harness was **not** run: the only frontend change
is the `GeekDialog` merge, which is provably inert for every current caller (no app passes
`PaperProps` through `dialogProps` — all app `PaperProps` uses are on raw MUI `Dialog`/`Popover`),
and the box was at load 9 with six other reviewers on it.

---

*Last reviewed: April 2026 (SSO architecture); `packages/**` going-over 2026-09-05*
