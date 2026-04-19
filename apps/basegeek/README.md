# basegeek

Central SSO authority, user store, and shared infrastructure hub for the GeekSuite. Every other app authenticates against basegeek, and all shared data services (MongoDB, Redis, Postgres, InfluxDB) are managed here.

---

## What basegeek provides to the rest of the suite

| Capability | Detail |
|-----------|--------|
| **SSO / Auth** | Issues JWTs (access + refresh). Sets `.clintgeek.com` cookies so any subdomain stays logged in. |
| **User store** | Single MongoDB collection for all GeekSuite users. Apps never maintain their own user tables. |
| **Shared databases** | Mongo, Redis, Postgres, and InfluxDB containers are defined here; other apps connect by service name on `datageek_network`. |
| **GraphQL gateway** | Apollo Server at `/graphql` — unified query surface across the suite. |
| **AI proxy** | Multi-provider AI routing with fallback chain, rate limiting, and conversation state. Accessed via API key or JWT. |

---

## Quick start (dev)

```bash
# From repo root
pnpm install

# Copy and fill in env
cp apps/basegeek/.env.example apps/basegeek/.env.local

# Start just the data services
cd apps/basegeek && docker compose up -d mongodb redis postgres influxdb

# Run the API
cd packages/api && pnpm dev
```

Required env vars must be set before the server will start — see the table below.

---

## Deploy

See the root `DEPLOY.md` for the general build + push flow. Basegeek-specific steps:

```bash
# Build and push image
./build.sh basegeek

# On the host
cd apps/basegeek
docker compose pull && docker compose up -d
docker compose logs -f basegeek
```

Full deploy details and database maintenance: `DOCS/DEPLOYMENT_GUIDE.md`.

---

## Required env vars

See `.env.example` for the full template. Never commit real values.

| Variable | Required by | Notes |
|----------|-------------|-------|
| `JWT_SECRET` | boot | ≥32 chars. Fail-fast if missing. Shared with all apps that validate tokens. |
| `JWT_REFRESH_SECRET` | boot | ≥32 chars. Fail-fast if missing. basegeek only. |
| `KEY_VAULT_SECRET` | boot | 32-byte hex. Encrypts AI provider keys at rest. Fail-fast if missing. |
| `MONGODB_URI` | boot | Main datageek database. |
| `AIGEEK_MONGODB_URI` | boot | AI config / key database. |
| `REDIS_HOST` / `REDIS_PORT` | boot | Refresh-token store and rate limiting. |
| `SSO_COOKIE_DOMAIN` | auth | e.g. `.clintgeek.com`. Sets cookie domain for cross-app SSO. |
| `CORS_ORIGINS` | server | Comma-separated allowed origins. |
| AI provider keys | runtime | `CEREBRAS_API_KEY`, `GROQ_API_KEY`, etc. Optional; absent providers are skipped. |

---

## Architecture highlights

**Auth (SSO + token rotation)**
JWT-based SSO with refresh-token rotation and reuse detection (Redis-backed). Every refresh invalidates the old token; a replayed token revokes the entire session family. API keys (for M2M AI access) are SHA-256 hashed in Mongo; the underlying provider secrets are AES-256-GCM encrypted via `cryptoVault.js`. See `DOCS/AUTH_SYSTEM.md`.

**User store**
Single `users` collection in MongoDB. All apps reference the same records. `GET /api/users` is paginated. Passwords are bcrypt-hashed via a Mongoose pre-save hook — the `passwordHash` field, not `password`.

**GraphQL gateway**
Apollo Server 4 mounted at `/graphql`. Provides a unified query API across all GeekSuite data. Schema and resolvers live in `packages/api/src/graphql/`.

**AI proxy**
Multi-provider routing (Cerebras → Groq → Together → OpenRouter → Gemini → Cohere → Anthropic) with per-provider rate limits, conversation state (MongoDB TTL store), and auto-summarization. Accessible via JWT or `bg_` API keys. See `DOCS/AI_CATALOG.md` for the full provider/model list and `DOCS/API_KEYS.md` for key management.

---

## Tests

```bash
cd apps/basegeek/packages/api
pnpm test
```

33 auth-flow tests (login, refresh rotation, reuse detection, family revocation, password reset regression, secret enforcement, cryptoVault round-trip) run against `mongodb-memory-server` + a Redis fake. No external services required.

---

## Further reading

- `DOCS/AUTH_SYSTEM.md` — token model, rotation, fail-fast env, middleware
- `DOCS/SSO_IMPLEMENTATION.md` — cross-subdomain cookie spec
- `DOCS/SSO_CLIENT_MIGRATION_PLAYBOOK.md` — how client apps integrate
- `DOCS/DEPLOYMENT_GUIDE.md` — full deploy + database maintenance
- `DOCS/AI_CATALOG.md` — all AI providers, models, rate limits, API formats
- `DOCS/API_KEYS.md` — machine-to-machine API key management
- `DOCS/AUTH_HARDENING_2026-04.md` — hardening pass plan (April 2026)
- `DOCS/CLEANUP_PASS_2026-04.md` — critical-fix pass plan (April 2026)
