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

Cookies are `HttpOnly: true` (basegeek auth hardening, April 2026). Frontend never reads
tokens directly — it calls `/api/users/me` (server reads cookie, returns user or 401).

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
