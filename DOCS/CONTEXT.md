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

## Reference Documentation

- [`SSO_OVERVIEW.md`](SSO_OVERVIEW.md) — full SSO architecture, risks, and migration plan
- `apps/basegeek/DOCS/SSO_IMPLEMENTATION.md` — basegeek auth implementation detail
- `apps/basegeek/DOCS/AUTH_SYSTEM.md` — auth system overview
- `apps/basegeek/DOCS/SSO_CLIENT_MIGRATION_PLAYBOOK.md` — per-app migration steps

---

*Last reviewed: April 2026*
