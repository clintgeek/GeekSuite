# basegeek Auth System

basegeek is the central auth authority for all GeekSuite apps. Every app validates JWTs issued here; no app mints its own tokens.

---

## Token model

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access token (JWT) | 1 hour | `geek_token` cookie + JSON response body |
| Refresh token (JWT with `jti` + `family`) | 30 days | `geek_refresh_token` cookie + JSON response body |

Cookies are set for `SSO_COOKIE_DOMAIN` (e.g. `.clintgeek.com`) so all subdomains share the session. Cookies are **not** HttpOnly — JavaScript must be able to read them during the cookie-first rollout. See `SSO_IMPLEMENTATION.md` for the full cookie spec.

---

## Refresh-token rotation + reuse detection

Every refresh token carries a `jti` (UUID) and a `family` ID. On each refresh:

1. The old token's Redis entry (`refresh:{jti}`) is consumed (deleted, one-time-use).
2. A new access + refresh pair is issued under the same `family`, stored in Redis.
3. If a token is presented but not found in Redis, it has already been rotated — this means a possible theft replay. The entire `family` is immediately revoked; any subsequent request with a token from that family gets a 401.

On logout, the family is revoked server-side. Client-side cookie clearing is secondary.

Redis keys:
- `refresh:{jti}` → `{ userId, family, expiresAt }` (TTL = remaining token lifetime)
- `family:{family}` → `"revoked"` (sticky; TTL slightly beyond max token life)

Implementation: `packages/api/src/services/refreshTokenStore.js`

---

## Fail-fast env enforcement

At boot, `authService.js` and `cryptoVault.js` throw immediately if any of these are missing or too short (< 32 chars for secrets, ≠ 32 hex bytes for vault key):

- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `KEY_VAULT_SECRET`

The server will not start in a degraded state.

---

## API key authentication (AI proxy endpoints)

Separately from JWT, basegeek supports `bg_`-prefixed API keys for machine-to-machine access to AI routes. Keys are:
- Stored as SHA-256 hashes in MongoDB (never plaintext)
- The underlying provider API keys they manage are AES-256-GCM encrypted at rest via `cryptoVault.js`
- Subject to per-key rate limits and permission scopes

See `DOCS/API_KEYS.md` for management and integration details.

---

## Auth endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Returns access + refresh tokens; sets cookies |
| POST | `/api/auth/register` | Creates user, same response as login |
| POST | `/api/auth/refresh` | Rotates refresh token; issues new pair |
| POST | `/api/auth/logout` | Revokes refresh-token family; clears cookies |
| POST | `/api/auth/validate` | Validates an access token; returns user |
| POST | `/api/auth/forgot-password` | Sends reset email |
| POST | `/api/auth/reset-password` | Applies new password (bcrypt via pre-save hook) |

Login request shape:
```json
{
  "identifier": "username or email",
  "password": "string",
  "app": "basegeek"
}
```

The `app` field must be a value in the canonical `VALID_APPS` list (`packages/api/src/config/validApps.js`).

---

## Middleware

`packages/api/src/middleware/auth.js` — `authenticateToken`:
- Reads token cookie-first (`geek_token`), then `Authorization: Bearer` header.
- Verifies JWT signature against `JWT_SECRET`.
- Validates `app` claim against `VALID_APPS` if present.
- Attaches decoded payload to `req.user`.

`requireAdmin` (same file) — `authenticateToken`, then a role check. `requireRole('admin')` is the role half on its own, for composing onto a route that is already authenticated.

---

## Roles

Two roles, on the user document itself:

```js
// packages/api/src/models/user.js
role: { type: String, enum: ['user', 'admin'], default: 'user', index: true }
```

**Role is deliberately not in the JWT.** Access tokens are long-lived, so a role baked into the payload would keep a demoted admin privileged until their token expired. `requireAdmin` reads `role` from the userGeek document on every gated request (one indexed-field projection), so a promotion or demotion is live on the user's very next request — no logout, no refresh.

A plain user hitting a gated route gets `403 { error: 'admin_required' }`. A missing token still gets `401` and an invalid one `403` from `authenticateToken`.

### Admin-gated routes

| Method | Path | Why |
|--------|------|-----|
| GET | `/api/users` | Lists every user in the suite |
| POST | `/api/users` | Creates a user out-of-band of registration |
| DELETE | `/api/users/:id` | Deletes any user |
| POST | `/api/apps` | Adds an app to the registry every consumer trusts |
| PUT | `/api/apps/:name` | Rewrites an app's URL, health endpoint or enabled flag |
| DELETE | `/api/apps/:name` | Removes an app from the registry |
| POST | `/api/apps/seed` | Re-seeds the default registry |
| _all_ | `/api/mongo/*` | Enumerates every database on the instance, with per-collection counts and sizes |
| _all_ | `/api/redis/*` | Returns the shared instance's full `INFO` dump |
| _all_ | `/api/postgres/*` | Server version, uptime, database size, live connection count |
| _all_ | `/api/influx/*` | Influx url/org/bucket config, measurement names, point counts |

The four infrastructure browsers gate the whole router (a `requireAdmin` in a `router.use` at the top of each route file, so the gate travels with the router and cannot be lost by a re-mount in `server.js`). They previously took plain `authenticateToken`, which under SSO means any logged-in user of any suite app — every frontend holds a valid basegeek token. Their only intended consumers are the parked dashgeek console and basegeek's own DataGeek pages.

Self routes are untouched and open to any authenticated user: `/api/users/me`, `/api/users/bootstrap`, `/api/users/profile`, `/api/users/preferences`, `/api/users/preferences/*`.

**The app registry's reads stay public on purpose.** `GET /api/apps`, `GET /api/apps?all=true` and `GET /api/apps/:name` take no credentials. Nothing in the collection is secret — display name, icon, colour, tag and a public `https://*.clintgeek.com` URL, which is the same directory the public Portal already prints. The public `/api/health/app/:name` proxy resolves an app's base URL out of the same collection server-side, so its contents are already reachable unauthenticated by another door. Only the mutations are administrative, and until 2026-09-03 they took no credentials at all.

Caller audit (2026-09-03): the only in-repo HTTP consumer of `GET /api/apps` is `packages/ui/src/pages/BaseGeekHome.jsx`, which is behind `RequireAuth`. `PortalPage.jsx` renders a **hardcoded** `appsData` array and calls only `/api/health/infra` and `/api/health/app/:name`. So nothing would break today if the reads were gated too — the decision to keep them public rests on the content not being sensitive and on the (parked) dashgeek console plus any future logged-out directory wanting them. If that ever changes, gate them; there is no live unauthenticated caller to preserve.

**Consequence of gating the browsers:** basegeek's own DataGeek page, Mongo status card and home-page infrastructure tiles call these routes, so for a non-admin account they now render as offline/error rather than showing data. basegeek is an operator console; that is the intended outcome. The public Portal is unaffected — it reads `/api/health/infra` and `/api/health/app/:name`, which are deliberately public and report only reachability.

`GET /api/users/me` returns `user.role` (and the admin list returns `role` per row) so a frontend can hide admin UI without a second call. It is a display hint only — the gate is server-side.

### Promoting a user

```bash
cd apps/basegeek/packages/api
node scripts/setUserRole.js <username> admin   # promote
node scripts/setUserRole.js <username> user    # demote
```

Reads `USERGEEK_MONGODB_URI` from the API's own `.env`. It refuses to run against a username that does not exist (it never creates a user), rejects a role outside the enum, prints only the before/after role, and is idempotent. The change is live immediately — no restart, no re-login.

---

## Logging

All auth events use structured pino logging (see `packages/api/src/lib/logger.js`):
- Successful logins: `info`
- Failed logins: `warn` with IP
- Refresh-token reuse detection: `warn` with `userId` and `family`
- Boot-time secret failures: `fatal` then exit

Every request has a `req.id` (from `pino-http`; reuses `X-Request-Id` header if present). Auth errors include `req.id` so log entries are correlatable.

---

## Tests

33 auth-flow tests in `packages/api/src/__tests__/auth.test.js`, run against mongodb-memory-server + a Redis fake:

```bash
cd apps/basegeek/packages/api
pnpm test
```

Key coverage: login happy path, wrong password, refresh rotation, replay detection, family revocation after replay, logout revocation, password-reset hash correctness, JWT secret length enforcement, cryptoVault round-trip.

Role and admin-gate coverage lives in two suites:

- `packages/api/src/__tests__/userRoles.test.js` — the `role` default, the 401/403/200 ladder on `GET /api/users`, promotion and demotion taking effect on the same token, the other gated user routes, self routes staying open, and `setUserRole()`.
- `packages/api/src/__tests__/adminGates.test.js` — the app registry split (reads public, every mutation 401/403/2xx) and the four infrastructure browsers (401 unauthenticated, `403 admin_required` for a plain user with no infrastructure detail in the body, handler reached for an admin, demotion closing the door again on the same token). node-redis is stubbed in that file because the real client retries a missing server forever.

---

## Further reading

- `DOCS/SSO_IMPLEMENTATION.md` — cookie spec, cross-subdomain SSO details
- `DOCS/SSO_CLIENT_MIGRATION_PLAYBOOK.md` — how client apps integrate with SSO
- `DOCS/AUTH_HARDENING_2026-04.md` — plan doc for the April 2026 hardening pass (rotation, encryption, tests)
- `DOCS/CLEANUP_PASS_2026-04.md` — plan doc for the prior critical-fix pass
