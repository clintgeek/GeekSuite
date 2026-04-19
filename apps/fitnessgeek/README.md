# fitnessgeek

Nutrition and fitness tracking app in the GeekSuite. Tracks food intake,
weight, macros (including keto mode), medications, and Garmin activity. AI
assists with meal suggestions and food search.

---

## Main features

- **Food log** — search USDA, Nutritionix, OpenFoodFacts, and local DB; log meals by type; AI-powered composite query parsing
- **Weight tracking** — daily log, goal setting, trend charts
- **Macro tracking** — standard calorie-first or keto net-carb-first mode with mode-aware dashboard hero
- **Medications** — add/edit medications, track supply, PDF export
- **Garmin integration** — activity, steps, sleep via Garmin OAuth
- **AI meal suggestions** — via basegeek's AI service (Claude)
- **InfluxDB health dashboard** — time-series metrics via own Influx instance
- **SSO** — login via basegeek; all auth proxied through `/api/auth/*`

---

## Quick start (dev)

**Backend:**
```bash
cd apps/fitnessgeek/backend
cp env.example .env        # fill in real values
npm install
npm run dev                # nodemon on port 3001
```

**Frontend:**
```bash
cd apps/fitnessgeek/frontend
npm install
npm run dev                # Vite dev server, proxies /api → localhost:3001
```

Dev note: BaseGeek issues cookies scoped to `.clintgeek.com`. In dev mode
the backend rewrites `Set-Cookie` headers to `localhost` so sessions persist.
See `DOCS/LOCAL_AUTH_NOTES.md` for details.

---

## Deploy

See root [`DEPLOY.md`](../../DEPLOY.md) for the consolidated-in-source-tree
deployment convention. From the repo root:

```bash
./build.sh fitnessgeek
```

This builds the image and deploys via `apps/fitnessgeek/docker-compose.yml`.
The container is named `fitnessgeek`. Env lives in
`apps/fitnessgeek/.env.production` (gitignored).

Dev compose (`docker-compose.dev.yml`) exists but service names are stale;
see `DEFERRED_WORK.md` at repo root before using it.

---

## Required env vars

| Variable | Description |
|---|---|
| `MONGODB_URI` | Shared suite MongoDB connection string |
| `JWT_SECRET` | Suite-wide JWT signing secret (shared with basegeek) |
| `BASEGEEK_URL` | URL of basegeek service (e.g. `https://basegeek.clintgeek.com`) |
| `VITE_BASEGEEK_URL` | Same, injected into frontend build |
| `VITE_API_URL` | Frontend-facing API base URL (e.g. `https://fitnessgeek.clintgeek.com/api`) |
| `REDIS_URL` | Redis connection URL for caching |
| `CORS_ORIGINS` | Comma-separated allowed origins (falls back to hardcoded list if unset) |
| `INFLUXDB_HOST` | InfluxDB host |
| `INFLUXDB_PORT` | InfluxDB port (default 8086) |
| `INFLUXDB_USERNAME` | InfluxDB username |
| `INFLUXDB_PASSWORD` | InfluxDB password |
| `INFLUXDB_DATABASE` | InfluxDB database name |
| `USDA_API_KEY` | USDA FoodData Central API key |
| `NUTRITIONIX_APP_ID` | Nutritionix app ID |
| `NUTRITIONIX_API_KEY` | Nutritionix API key |
| `FATSECRET_CLIENT_ID` | FatSecret OAuth2 client ID |
| `FATSECRET_CLIENT_SECRET` | FatSecret OAuth2 client secret |
| `CALORIENINJAS_API_KEY` | CalorieNinjas API key (optional fallback) |
| `LOG_LEVEL` | Pino log level (default `info`) |
| `NODE_ENV` | `production` or `development` |

See `env.example` for the full template.

---

## Architecture

fitnessgeek is a single Docker image: Node.js backend (Express, ES modules,
port 3001) with a React+Vite frontend served by nginx. The backend talks to
basegeek via GraphQL (`@geeksuite/api-client`) for cross-app domain data and
directly via REST for auth proxy, AI, and Garmin OAuth. MongoDB is the
primary store, shared with the suite via `MONGODB_URI`. Redis caches food
API responses (7-day TTL) and AI classification results. InfluxDB is used
for time-series health metrics. Structured logging via pino + pino-http;
every request gets a `X-Request-Id`. Six frontend services share a single
axios instance via `setupAxiosInterceptors` from `@geeksuite/auth`.

See `DOCS/` for deeper topics.

---

## External integrations

| Integration | Purpose | Key env var(s) |
|---|---|---|
| **USDA FoodData Central** | Raw ingredient nutrition data | `USDA_API_KEY` |
| **Nutritionix** | Branded food search | `NUTRITIONIX_APP_ID`, `NUTRITIONIX_API_KEY` |
| **OpenFoodFacts** | Barcodes, international products (no key required) | — |
| **FatSecret** | Restaurant and branded foods | `FATSECRET_CLIENT_ID`, `FATSECRET_CLIENT_SECRET` |
| **CalorieNinjas** | Natural language fallback (10k/month free) | `CALORIENINJAS_API_KEY` |
| **Garmin Connect** | Activity, steps, sleep via OAuth | Garmin credentials stored in user settings |

---

## Further reading

- [`DOCS/HARDENING_2026-04.md`](DOCS/HARDENING_2026-04.md) — April 2026 hardening pass: boot, shutdown, logging, CORS, axios consolidation
- [`DOCS/LOCAL_AUTH_NOTES.md`](DOCS/LOCAL_AUTH_NOTES.md) — How cookie rewriting keeps BaseGeek SSO working on localhost
- [`DOCS/ARCHIVE/`](DOCS/ARCHIVE/) — Historical design docs: keto mode plan, food lookup plan, upgrade plan, issue plan, docker deployment, theme test guide
