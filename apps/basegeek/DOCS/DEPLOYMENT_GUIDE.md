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

After the first deploy with `KEY_VAULT_SECRET` set, run the migration script to encrypt existing plaintext API keys:

```bash
node packages/api/scripts/encrypt-keys.js
```

This is idempotent — already-encrypted values are skipped.

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
