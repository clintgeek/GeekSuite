# basegeek Auth Hardening Pass — April 2026

Branch: `basegeek-auth-hardening` (off `main` @ `523262d`).

Scope = items 1-4 from the security audit. Items 5 (CSRF) and 6 (HttpOnly cookies + frontend de-coupling from tokens) are deferred to a separate cross-app branch because they ripple out to every consumer app.

Goal: move basegeek from risk-rating 4 → 3.

---

## Item 1 — Structured logging (pino)

**Why:** 345 unstructured `console.*` calls across 28 files. When a 500 fires in prod, you can't filter by request ID, can't grep by level, can't ship logs to anything that expects JSON. Every other security item benefits from this being done first (refresh-token reuse detection wants to LOG suspicious activity in a way that's actually queryable).

**Plan:**
- Add deps: `pino`, `pino-http`, `pino-pretty` (dev only).
- New module `packages/api/src/lib/logger.js` exporting a configured pino instance. Pretty-print in dev, JSON in prod. Levels: `trace|debug|info|warn|error|fatal`.
- Replace the existing request-ID middleware with `pino-http` configured to:
  - reuse `X-Request-Id` header if present, otherwise generate (preserve current behavior)
  - attach `req.log` (a child logger with request context bound)
  - keep echoing `X-Request-Id` on responses
- Migrate `console.*` calls in `src/`:
  - In route handlers / middleware: prefer `req.log.{level}(...)` so request ID is automatic.
  - In services / models / config: import the module-level logger.
  - Replace patterns:
    - `console.log('msg')` → `logger.info('msg')` (or `req.log.info`)
    - `console.error('label:', err.stack)` → `req.log.error({ err }, 'label')`
    - `console.warn(...)` → `logger.warn(...)`
- Do NOT touch test scripts at the repo root (`debug-api-keys.js`, etc.) — those are out of scope.

**Verification:** boot the server in dev, hit a route that errors, confirm log line is JSON (or pretty), includes `req.id`, and the response `X-Request-Id` matches the log.

---

## Item 2 — Refresh-token rotation + reuse detection

**Why:** today logout only clears the cookie; a stolen refresh token is good until expiry (30 days). No way to detect that a token has been replayed by a second party.

**Design:**
- Every refresh token gets a `jti` (JWT ID, random UUID) and a `family` ID. Family = the chain of rotated tokens stemming from one login session.
- Refresh-token store in Redis (already a dep, already wired):
  - Key: `refresh:{jti}` → `{ userId, family, expiresAt }`. TTL = remaining token lifetime.
  - Key: `family:{family}` → `revoked` boolean (sticky once set; TTL slightly longer than max token life).
- On `POST /auth/refresh`:
  - Validate JWT signature.
  - Look up `refresh:{jti}` in Redis.
    - **Not found:** either expired or already-rotated (which means stolen-then-replayed). If the family is still active, this is a reuse-detection event: revoke `family:{family}` and refuse. Log at `warn` with the userId.
    - **Found:** delete the entry (one-time-use), check `family:{family}` is not revoked, then issue a NEW access + refresh pair with a new `jti` and the SAME `family`. Store the new entry.
- On `POST /auth/logout`: revoke the family.
- On login: generate a fresh family.
- Access tokens stay short-lived (1h) and unchanged in shape — only the refresh path gains rotation.

**Plan:**
- New module `packages/api/src/services/refreshTokenStore.js` — wraps Redis with `issue()`, `consume()`, `revokeFamily()`, `isFamilyRevoked()`.
- Update `services/authService.js`:
  - `generateRefreshToken(user, family)` includes `jti` (uuid) and `family` in payload.
  - New `rotateRefreshToken(oldToken)` orchestrates the consume-then-issue flow.
- Update `routes/auth.js`:
  - `/login` and `/register` — on success, generate a new family + issue refresh, store in Redis.
  - `/refresh` — call `rotateRefreshToken`, set new cookies, handle reuse-detection by responding 401 + clearing cookies + logging warn.
  - `/logout` — extract jti from refresh cookie if present, revoke family, then clear cookies.
- Redis client init: reuse the pattern in `routes/redis.js`. Initialize once at boot (await, fail-fast if unreachable — same way we treat Mongo now).

**Verification:** scripted via Item 4 tests — login, refresh successfully rotates, replaying the old refresh returns 401, family is now revoked so new refresh attempts also fail.

---

## Item 3 — Encrypted API keys at rest

**Why:** `AIConfig.apiKey` is plaintext in Mongo. A backup leak or accidental export = every user's BYO provider keys. Same for `APIKey` model if it stores secrets.

**Plan:**
- New `packages/api/src/lib/cryptoVault.js`:
  - `encrypt(plaintext) → string` and `decrypt(packed) → plaintext`.
  - AES-256-GCM. Key from `KEY_VAULT_SECRET` env (32 bytes hex). Throw at module load if unset or wrong length — same fail-fast pattern as JWT secrets.
  - Output format: `v1:{iv_hex}:{tag_hex}:{ciphertext_hex}`. Versioned prefix so a future rotation can branch on it.
- Update `models/AIConfig.js` and `models/APIKey.js`:
  - The `apiKey` (or equivalent) field stays a String, but values are stored encrypted.
  - Add a Mongoose `set` transformer to encrypt-on-assign and a `get` transformer to decrypt-on-read. Or, more explicit: helper methods `getDecryptedKey()` / `setKey(plain)` and update all call sites. **Pick one** — agent should choose explicit methods (less magic) and grep all call sites.
- Update services that read/write these fields (`aiService.js`, `aiRouterService.js`, etc.) to use the helpers.
- Migration script `packages/api/scripts/encrypt-keys.js`:
  - Idempotent: skip values that already start with `v1:`.
  - Encrypt every existing plaintext value, save back.
  - Run once manually after deploy. Document in deploy notes.

**Verification:** unit test for encrypt/decrypt round-trip. Migration script can be run twice without re-encrypting (idempotency).

---

## Item 4 — Auth-flow tests

**Why:** zero coverage on auth. The password-reset bug we just fixed would have been caught by one test. We're about to add refresh-token rotation logic that is impossible to verify by hand.

**Plan:**
- Add devDeps: `mongodb-memory-server` (for in-memory Mongo), `ioredis-mock` (for in-memory Redis) OR a simple test double.
- Test setup `packages/api/src/__tests__/setup.js`: spin up in-memory Mongo + Redis-mock, set required env (`JWT_SECRET`, `JWT_REFRESH_SECRET`, `KEY_VAULT_SECRET`), tear down after.
- Coverage targets:
  - Login with valid creds returns access + refresh cookies.
  - Login with wrong password fails 401.
  - Refresh with valid token rotates and returns new cookies; old refresh now invalid.
  - Refresh with already-rotated token returns 401 AND revokes the family (subsequent legit refresh on the same family also fails).
  - Logout revokes family; subsequent refresh on that family fails.
  - Password reset actually changes the stored hash (the bug we already fixed — regression test).
  - JWT secrets shorter than 32 chars throw at module import.
  - Encrypted-key round-trip works end-to-end through AIConfig.
- Use `supertest` (already in devDeps) against the express app.

**Verification:** `pnpm test` passes locally and in CI. New tests are not skipped.

---

## Execution order

1. **Item 1 (logging)** first, alone. Touches many files — must land before items 2-3 add new code.
2. **Items 2 + 3 in parallel** after logging lands. Different files, no overlap.
3. **Item 4 (tests)** last. Validates everything above.

Each phase = its own commit. Don't squash.

## Deploy notes

- New env vars required: `KEY_VAULT_SECRET` (32-byte hex), `REDIS_URL` (if not already set).
- Migration script must run after deploy, before any AIConfig writes happen with the new code.
- Logout no longer trusts client-side cookie clearing alone — server-side family revocation is now the source of truth.
