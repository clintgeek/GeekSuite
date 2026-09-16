# basegeek Deployment Guide

For general GeekSuite deploy strategy see the root `DEPLOY.md`. This doc covers basegeek-specific steps only.

---

## Compose layout

`apps/basegeek/docker-compose.yml` defines all services:

| Container | Role | External port |
|-----------|------|---------------|
| `basegeek` | app (Node/Express) | 8987 |
| `datageek_mongodb` | shared MongoDB | 27018 |
| `datageek_redis` | shared Redis (refresh-token store) | 6380 |
| `datageek_postgres` | shared Postgres | 55432 |
| `datageek_influxdb` | shared InfluxDB 1.8 | 8086 |

The network (`datageek_network`) must exist externally before starting.

---

## Required environment variables

Stored in `apps/basegeek/.env.production` (gitignored). See `.env.example` for the full template — do not inline real values here.

| Variable | Notes |
|----------|-------|
| `JWT_SECRET` | ≥32 chars. Fail-fast enforced at boot. |
| `JWT_REFRESH_SECRET` | ≥32 chars. Fail-fast enforced at boot. |
| `KEY_VAULT_SECRET` | 32-byte hex. Used by `cryptoVault.js` to encrypt API keys at rest. Fail-fast enforced. |
| `MONGODB_URI` | Connection URI for the main datageek Mongo DB. |
| `AIGEEK_MONGODB_URI` | Connection URI for the aiGeek Mongo DB. |
| `REDIS_HOST` / `REDIS_PORT` | Used by refresh-token store and rate-limiting. |
| `SSO_COOKIE_DOMAIN` | e.g. `.clintgeek.com`. Required for cross-subdomain SSO cookies. |
| `CORS_ORIGINS` | Comma-separated list of allowed origins. |
| AI provider keys | `CEREBRAS_API_KEY`, `GROQ_API_KEY`, etc. — see `DOCS/AI_CATALOG.md`. |

After the first deploy with `KEY_VAULT_SECRET` set, run the migration script to encrypt existing plaintext API keys. Run it **inside the container**, which is where `KEY_VAULT_SECRET` and `AIGEEK_MONGODB_URI` are set and where the aiGeek Mongo is reachable — from the host the URI's compose hostname does not resolve:

```bash
docker exec basegeek node scripts/encrypt-keys.js          # dry-run: reports, writes nothing
docker exec basegeek node scripts/encrypt-keys.js --yes    # actually encrypt
```

Without `--yes` it is a dry run, so the first command above is safe to run any time and is the way to check whether the boot warning is still earned. This guide showed only the bare command until 2026-09-16, which read as "this encrypts your keys" and did nothing.

It is idempotent — values already starting with `v1:` are skipped, so it can be re-run without double-encrypting.

---

## Build and deploy

From the **repo root**:

```bash
./build.sh basegeek
```

This builds the Docker image and pushes it. Then on the host:

```bash
cd apps/basegeek
docker compose pull
docker compose up -d
docker compose logs -f basegeek
```

Expected startup output:
```
{"level":"info","msg":"MongoDB connected"}
{"level":"info","msg":"Redis ready"}
{"level":"info","msg":"Server listening on port 8987"}
{"level":"info","msg":"GraphQL available at http://localhost:8987/graphql"}
```

If `JWT_SECRET`, `JWT_REFRESH_SECRET`, or `KEY_VAULT_SECRET` are missing or too short, the process exits immediately with a descriptive error — this is intentional.

---

## Verification

```bash
# Health
curl http://localhost:8987/api/health

# GraphQL
curl http://localhost:8987/graphql -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

---

## Rollback

```bash
docker compose down
# Tag the previous image or use git to find last good commit
docker compose up -d
```

---

## Database maintenance

Refresh tokens are stored in Redis with automatic TTL. No manual cleanup needed under normal operation.

MongoDB conversation records (for AI chat history) have TTL indexes:
- Active: 7 days
- Archived: 30 days
- Deleted: 24 hours

Manual cleanup if needed:
```bash
docker exec datageek_mongodb mongosh \
  -u $MONGO_ADMIN_USER -p $MONGO_ADMIN_PASSWORD \
  --authenticationDatabase admin \
  datageek --eval 'db.conversations.deleteMany({ expiresAt: { $lt: new Date() } })'
```
