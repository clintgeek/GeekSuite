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

---

## Further reading

- `DOCS/SSO_IMPLEMENTATION.md` — cookie spec, cross-subdomain SSO details
- `DOCS/SSO_CLIENT_MIGRATION_PLAYBOOK.md` — how client apps integrate with SSO
- `DOCS/AUTH_HARDENING_2026-04.md` — plan doc for the April 2026 hardening pass (rotation, encryption, tests)
- `DOCS/CLEANUP_PASS_2026-04.md` — plan doc for the prior critical-fix pass
