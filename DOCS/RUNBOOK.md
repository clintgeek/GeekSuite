# GeekSuite Runbook — How This Machine Actually Works

Operational context: the box, the containers, the databases, the edge, CI/CD, deploy/rollback,
local dev, the mobile harness, tests, and known failure modes. `DOCS/CONTEXT.md` is the SSO
architecture reference (auth flows, cookies, migration status) — this document is everything
else: what runs, where, on what port, and what breaks.

Compiled 2026-09-05 from the repo (`DOCS/*.md`, `DEPLOY.md`, `STATUS.md`, every
`apps/*/docker-compose.yml` and app `CONTEXT.md`, `.github/workflows/*.yml`) and from this box
(`docker ps`, `docker network ls`, the nginx configs at
`/mnt/Media/Docker/nginx/config/sites-available/`). Every number below either came from a file
(named inline) or from a command run during this pass (also named). Where the repo's own docs
disagree with what the box actually runs, both are stated and the disagreement is flagged.

**A live multi-agent work session was in flight while this was written** (see
`DOCS/BURN_QUEUE.md`) — the working tree had ~20 modified files and several new, uncommitted
packages (`packages/logger`, `packages/schemas`, `packages/utils`, `tools/`). **Update
2026-09-05, later the same session:** all four landed and are committed (waves 1–7,
`DOCS/BURN_QUEUE.md`); the specific "uncommitted package" caveats below are stale. The general
warning stands, though — the burn is still running (`DOCS/BURN_QUEUE.md` "Running") and the tree
may be dirty again by the time you read this. Test counts here are the last CI/STATUS-verified
numbers; a local run against a dirty tree may differ. Run `git status --short` before trusting
any number in this doc as current.

---

## 1. The box

| | |
|---|---|
| Hostname | `server` |
| Primary LAN IP | `192.168.1.17` (`hostname -I`) — every nginx `proxy_pass` and every app's Mongo URI point here |
| Public domain | `clintgeek.com` (+ `fussymonkey.dev`, `rallycenter.org` on the same nginx, unrelated to GeekSuite) |
| Reverse proxy | container `NGINX` (image `nginx`), ports 80/443 |
| Suite containers' shared Docker network | `datageek_network` (bridge, external, created once — every `docker-compose.yml` in `apps/*` declares it `external: true`) |
| Exception | `startgeek` has no `networks:` key in its compose file, so it sits on its own auto-created `startgeek_default` bridge, not `datageek_network`. It doesn't need the shared network — it's a static frontend that talks to basegeek over public HTTPS, not `host.docker.internal`. |
| Other Docker networks on the box | many, unrelated to GeekSuite (`nextcloud_default`, `jellyfin_default`, `rallycenter-*`, `portainer_default`, etc. — `docker network ls`, run 2026-09-05) |
| Box also runs | Jellyfin, Sonarr/Radarr/Prowlarr/Bazarr/SABnzbd, Nextcloud, Home Assistant, Portainer, Vaultwarden, Duplicati, a Rally Center preview/dev stack, Grafana, and other non-suite services — `docker ps`, same pass. Don't assume every container on this box is GeekSuite. |

---

## 2. The apps

One row per app. Ports are **host → container**. "Gateway-owned data" means the app's actual
CRUD lives in `apps/basegeek/packages/api/src/graphql/<app>/` and the local backend is a thin
SSO/static-file shell (see `DOCS/CONTEXT.md` and each app's own `CONTEXT.md`).

| App | Public host | Container | Image | Port | Healthcheck | Frontend | Backend |
|---|---|---|---|---|---|---|---|
| basegeek | `basegeek.clintgeek.com` (+ `base.`) | `basegeek` | `ghcr.io/clintgeek/basegeek:latest` | 8987→8987 | none in compose; app serves `GET /api/health` | Vite 5 + React (`packages/ui`) | Node + Express (`packages/api`) |
| bookgeek | `bookgeek.clintgeek.com` | `bookgeek` | `ghcr.io/clintgeek/bookgeek:latest` | 1800→1800 | `wget --spider http://localhost:1800/api/health` | Vite + React + Tailwind + shadcn/ui (`web/`) | Node + Express (`api/`), `node:20-alpine` in `Dockerfile` — `apps/bookgeek/DOCS/CONTEXT.md`'s runtime line was corrected to node:20 2026-09-05 (`70eb36e`); no longer contradicts the shipped image |
| bujogeek | `bujogeek.clintgeek.com` (+ `bujo.`) | `bujogeek` | `ghcr.io/clintgeek/bujogeek:latest` | 5005→5005 | `wget --spider http://127.0.0.1:5005/` (root, not `/api/health`, though that route exists) | Vite + React + MUI 7 | Node + Express, thin — SSO proxy + `/api/me` + `/api/health` + static only; all task/habit/collection data is gateway-owned |
| fitnessgeek | `fitnessgeek.clintgeek.com` (+ `nutrition-tracker.`, `myfitnessgeek.`, `food.`) | `fitnessgeek` | `ghcr.io/clintgeek/fitnessgeek:latest` | 4080→3001 | none in compose; app serves `GET /health` and `GET /api/health` | Vite + React | Node + Express — hybrid: verifies JWT locally with shared `JWT_SECRET` (see `DOCS/SSO_OVERVIEW.md`) as well as proxying auth to basegeek |
| flockgeek | `flockgeek.clintgeek.com` | `flockgeek` | `ghcr.io/clintgeek/flockgeek:latest` | 5001→5001 | none in compose; app serves `GET /api/health` | Vite + React | Node + Express — owns its own Mongoose models (birds, egg production, meat runs) directly, not fully gateway-owned |
| notegeek | `notegeek.clintgeek.com` (+ `notes.`) | `notegeek` | `ghcr.io/clintgeek/notegeek:latest` | 9988→9988 | `wget --spider http://localhost:9988/` (root) | Vite + React | Node + Express — **two auth middlewares** (legacy Bearer-only + local DB, and a newer cookie-first one); see `DOCS/SSO_OVERVIEW.md` §NoteGeek |
| startgeek | `start.clintgeek.com` (canonical since 2026-09-05; `startgeek.clintgeek.com` 301-redirects there) | `startgeek` | `ghcr.io/clintgeek/startgeek:latest` | 3000→3000 | `node -e "fetch('http://localhost:3000')…"` | Vite 5 + React + Tailwind 3, standalone npm app (no pnpm workspace deps by design — see `TODO_ORDER.md` #5) | none — static build served by `serve` |
| storygeek | `storygeek.clintgeek.com` | `storygeek` | `ghcr.io/clintgeek/storygeek:latest` | 9977→9977 | `node -e "…/api/health…"` | Vite + React | Node + Express |

### Env vars required per app

Compiled from each `docker-compose.yml` `environment:`/`env_file` plus `process.env.X` greps
of each app's backend source. Names only — no values were read or printed.

- **basegeek** (`apps/basegeek/.env.example` is populated — the only app with a filled-in example):
  `PORT`, `UI_PORT`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `JWT_EXPIRES_IN`, `REFRESH_TOKEN_EXPIRES_IN`,
  `NODE_ENV`, `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `MONGODB_URI`,
  `MONGODB_DB_NAME`, `MONGODB_TEST_URI`, `MONGO_BASE_URI`, `USERGEEK_MONGODB_URI`,
  `AIGEEK_MONGODB_URI`, `REDIS_URL`, `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`,
  `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_URL`, `INFLUXDB_URL`, `INFLUXDB_ORG`,
  `INFLUXDB_BUCKET`, `INFLUXDB_TOKEN`, `INFLUXDB_SETUP_USERNAME`, `INFLUXDB_SETUP_PASSWORD`,
  `INFLUXDB_ADMIN_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
  `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `INTERNAL_JWT_SECRET`,
  `KEY_VAULT_SECRET` (shared with fitnessgeek, see below), `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `AI_CACHE_MAX_ENTRIES`, `AI_CACHE_TTL_MS`, `WEATHER_LAT`,
  `WEATHER_LON`, `SSO_COOKIE_DOMAIN`, `CSRF_GUARD` (`off|report`, all seven backends,
  2026-09-02), `CSRF_TOKEN` (`off|report|enforce`, basegeek only, 2026-09-05 — default/current
  `report`; see `DOCS/CONTEXT.md` "CSRF: the double-submit token"), `LOG_LEVEL`,
  `ONNX_RUNTIME_WEB_ONLY`, `JEST_MONGOD_STATE_FILE` (test-only)
- **bookgeek**: `API_PORT`, `LIBRARY_PATH`, `COVERS_PATH`, `TEMP_PATH`, `ADDME_PATH`,
  `MONGODB_URI`, `BASEGEEK_MONGODB_URI`, `JWT_SECRET`, `BASEGEEK_URL`, `BOOKGEEK_PUBLIC_URL`,
  `PUBLIC_BASE_URL`, `PUBLIC_URL`, `GOOGLE_BOOKS_API_KEY`,
  `CALIBRE_EBOOK_CONVERT_BIN`, `CALIBRE_EBOOK_META_BIN`, `DEVICE_BASKET_TTL_MINUTES`,
  `KINDLE_ENABLED`, `KINDLE_UI_COOKIE_SECRET`, `KINDLE_UI_PIN`, `KINDLE_UI_TO_EMAIL`,
  `KINDLE_UI_USER_ID`, `LOG_LEVEL`, `NODE_ENV`
- **bujogeek**: `DB_URI`, `JWT_SECRET`, `BASEGEEK_URL`/`BASE_GEEK_URL`, `GATEWAY_URL`, `PORT`,
  `APP_NAME`, `CORS_ORIGINS`, `LOG_LEVEL`, `NODE_ENV` — VAPID keys are **not** local; they live
  in basegeek's env (`DOCS/REMINDERS.md`)
- **fitnessgeek**: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `BASEGEEK_URL`/`BASE_GEEK_URL`,
  `REDIS_URL`, `KEY_VAULT_SECRET` (basegeek's value, copied by line — encrypts the Garmin
  password, added 2026-09-05, see `DEPLOY.md` "Shared secrets across apps"), `AI_GEEK_API_KEY`,
  `USDA_API_KEY`, `NUTRITIONIX_APP_ID`, `NUTRITIONIX_API_KEY`,
  `OPENFOODFACTS_API_URL`, `CALORIENINJAS_API_KEY`, `FATSECRET_CLIENT_ID`,
  `FATSECRET_CLIENT_SECRET`, `INFLUXDB_HOST`, `INFLUXDB_PORT`, `INFLUXDB_USERNAME`,
  `INFLUXDB_PASSWORD`, `INFLUXDB_DATABASE`, `INFLUXDB_PROTOCOL`, `LOCAL_AUTH_COOKIE_DOMAIN`,
  `MAX_SANITY_RESULTS`, `USER_PREFERENCE_LIMIT`, `LOG_LEVEL`, `PORT`, `NODE_ENV`, `APP_NAME`,
  `CORS_ORIGINS`
- **flockgeek**: `MONGODB_URI`, `JWT_SECRET`, `BASEGEEK_URL`, `CORS_ORIGIN`, `SEED_OWNER_ID`,
  `PORT`, `APP_NAME`, `LOG_LEVEL`, `NODE_ENV`
- **notegeek**: `DB_URI`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRE`/`JWT_EXPIRES_IN`,
  `BASEGEEK_URL`, `USERGEEK_API_URL`, `PORT`, `LOG_LEVEL`, `NODE_ENV`
- **startgeek** (`.env.example` populated; **no `.env.production` on the box** — it needs none,
  it's a static build that calls basegeek's public URL): `VITE_GRAPHQL_API_URL`,
  `VITE_BASEGEEK_URL`, `VITE_BASEGEEK_PROXY` (dev-only, optional)
- **storygeek**: `DB_URI`, `JWT_SECRET`, `BASEGEEK_URL`, `BASEGEEK_JWT_TOKEN`,
  `STORYGEEK_FREE_ONLY`, `STORYGEEK_GM_PROVIDER`, `STORYGEEK_GM_MODEL`, `STORYGEEK_GM_FALLBACKS`,
  `STORYGEEK_AUX_PROVIDER`, `STORYGEEK_AUX_MODEL`, `STORYGEEK_TEST_TOKEN` (test-only),
  `AI_GEEK_API_KEY`, `CORS_ORIGINS`, `PORT`, `LOG_LEVEL`, `NODE_ENV`

Shared-secret vars (`JWT_SECRET`, Mongo root creds) must be rotated across every app's
`.env.production` in the same deploy window — see `DEPLOY.md` "Shared secrets across apps".

### Data volumes

| App | Volumes | Note |
|---|---|---|
| basegeek | `./data/{mongodb,influxdb,influxdb-config,redis,postgres}` bind-mounted under `apps/basegeek/` | These four containers (`datageek_mongodb`, `datageek_influxdb`, `datageek_redis`, `datageek_postgres`) are defined in `apps/basegeek/docker-compose.yml` alongside the app itself — basegeek's compose file **is** the datastore compose file for the whole suite |
| bookgeek | `/mnt/extra_space/books` → `/data/library`, `/mnt/extra_space/books/temp` → `/data/temp`, `/mnt/extra_space/books/addMe` → `/data/addMe` | `COVERS_PATH=/data/covers` is set as an env var but **no volume mounts `/data/covers`** — the host actually has `/mnt/extra_space/books/covers` sitting unmounted right next to the mounted `library` tree. Verify whether covers persist (they may be living inside the container's writable layer, lost on recreate) before relying on this path. |
| bujogeek, fitnessgeek, flockgeek, notegeek, startgeek, storygeek | none declared | Stateless containers — their state lives in the shared Mongo/Redis/Influx (via `MONGODB_URI`/`DB_URI`) or is fully gateway-owned in basegeek |

### `.env.production` present on the box (filenames only, not read)

basegeek, bookgeek, bujogeek, fitnessgeek, flockgeek, notegeek, storygeek all have one.
**startgeek does not** — consistent with it needing no server-side secrets.

---

## 3. The databases

All four live in `apps/basegeek/docker-compose.yml` (basegeek's compose file doubles as the
suite's datastore compose file) and share `datageek_network`.

| Container | Image | Host port → container port | Used for |
|---|---|---|---|
| `datageek_mongodb` | `mongo:latest` | 27018 → 27017 | Primary store — `userGeek` (central auth, `DOCS/SSO_OVERVIEW.md`), per-app databases for gateway-owned data, plus direct connections from bujogeek/fitnessgeek/flockgeek/notegeek/storygeek's own `MONGODB_URI`/`DB_URI` |
| `datageek_postgres` | `postgres:15` | 55432 → 5432 | basegeek's AI config + related tables (README.md "Infrastructure") |
| `datageek_redis` | `redis:latest` | 6380 → 6379 | Session caching, rate limiting, refresh-token rotation state |
| `datageek_influxdb` | `influxdb:1.8` | 8086 → 8086 | Time-series — Garmin health metrics (fitnessgeek), basegeek request metrics |

Mongo's LAN address is `192.168.1.17:27018` — this is the value every app's `MONGODB_URI`/
`DB_URI` should resolve to in production (confirmed in `DOCS/SSO_OVERVIEW.md` and the
`.env.example` template; no `.env.production` values were read to confirm per-app).

---

## 4. The edge (nginx)

| | |
|---|---|
| Container | `NGINX` (image `nginx`), compose at `/mnt/Media/Docker/nginx/docker-compose.yml`, ports 80/443 |
| Config paths | `sites-available/*.conf` bind-mounted read-only from `/mnt/Media/Docker/nginx/config/sites-available/` on the host; `nginx.conf` does `include /etc/nginx/sites-available/*.conf` directly — **there is no `sites-enabled` symlink step**, every `.conf` file in that directory is live |
| Cert | Wildcard `_.clintgeek.com_ssl_cert_combined.cer` at `/etc/nginx/certs/`, renewed by the `ACME2` container (`neilpang/acme.sh`, its own IONOS DNS API account, separate from `ACME` which handles `rallycenter.org`) |
| Adding a host | Drop a new `clintgeek.com_<name>.conf` in the host's `sites-available/` directory (server blocks for 80 + 443, `proxy_pass http://192.168.1.17:<port>`), then reload |
| Reload command | Not written down anywhere in the repo or nginx config; the standard is `docker exec NGINX nginx -s reload`. `ACME2`'s `--reloadcmd` also sends a SIGHUP to `NGINX` via the mounted Docker socket after a cert renewal — same effect. |

Every suite app's site config proxies to `192.168.1.17:<app's host port>` (see the per-app
table in §2), and every one (except startgeek) also has a `/graphql` location proxied to
`http://192.168.1.17:8987/graphql` — the browser talks GraphQL to whichever app's own domain
it's on, and nginx routes it to basegeek.

---

## 5. CI/CD

Full design in `DOCS/CICD.md` — this is the as-shipped summary.

| Workflow | Trigger | Does |
|---|---|---|
| `.github/workflows/ci.yml` | PR → `main`, push → `main` (both skip `**/*.md`, `DOCS/**`, `LICENSE` via `paths-ignore`) | `test-basegeek` (jest, mongodb-memory-server), `test-bookgeek` (`node --test`), `test-notegeek` (vitest), `test-bookgeek-web`, `test-flockgeek`, `test-storygeek`, `test-fitnessgeek-web` (frontend vitest suites, added 2026-09-05), `test-basegeek-ui` (basegeek's admin console — `apps/basegeek/packages/ui` — first test suite that app has had, added 2026-09-05), `test-ui` (vitest, theme contrast), `test-utils`, `test-crypto-vault` (added 2026-09-05), `test-api-client`, `test-auth`, `test-logger`, `test-user` (four shared-package jobs added 2026-09-05, BURN_REVIEW #20 — `@geeksuite/api-client`, `@geeksuite/auth`, `@geeksuite/logger`, `@geeksuite/user` shipped real `test` scripts CI never ran), `test-bujogeek` (vitest), `test-backends` matrix (bujogeek/fitnessgeek/flockgeek/storygeek/notegeek jest, `pnpm test`), `lint` (`pnpm -r lint`, errors gate/warnings don't), `syntax` (`node tools/syntax-check.mjs`, see below), `boot-smoke` (`node tools/boot-smoke.mjs`, see below, added 2026-09-05), `build-frontends` matrix (8 apps, `npm run build`) |
| `.github/workflows/release.yml` | push → `main` (same `paths-ignore`), or `workflow_dispatch` with an optional single-app input | Matrix-builds and pushes every app with a root `Dockerfile` to `ghcr.io/clintgeek/<app>:{latest,sha-<short>,main}` |
| `.github/workflows/mobile-harness.yml` | push → `main`, PR → `main` (`paths`-scoped to `apps/**`, `packages/ui/**`, `tools/mobile-harness/**`, the workflow file itself) | Builds each app, serves `dist`, walks it with `tools/mobile-harness` at iPhone 14 (dark + light), fails on any tap target < 44px, readable text < 12px, sideways scroll, or page error. **Enforcing since 2026-09-05 14:54** (first green run; §8) — no longer report-only. |

**A push to `main` = a deploy.** Release publishes new images; Watchtower on the box polls
GHCR and recreates any container whose digest changed, within ~5 minutes, no inbound access
from CI. `docker/watchtower/` mirrors the live config in-repo.

- **Watchtower**: `nickfedor/watchtower` (the `containrrr` upstream is stale — its API
  negotiation gets rejected), `network_mode: host` (the box had exhausted Docker's subnet
  pools — `DOCS/DOCKER_CLEANUP.md`), `WATCHTOWER_POLL_INTERVAL=300` (5 min),
  `WATCHTOWER_LABEL_ENABLE=true` (only containers with
  `com.centurylinklabs.watchtower.enable: "true"` are touched — every suite app has it),
  anonymous pulls (GHCR packages are public).
- **Landmine 1 — no RepoDigest after a local `build.sh` deploy.** `build.sh <app>` tags the
  locally built image `ghcr.io/clintgeek/<app>:latest` directly, so it has no RepoDigest.
  Watchtower compares registry digest to local digest to decide whether to update; with
  nothing to compare it logs `updated=0` and never pulls, even though CI published a newer
  image. Symptom: release workflow green, `docker ps` shows the container hours old. Fix, from
  the app directory: `docker compose pull <app> && docker compose up -d <app>`.
- **Landmine 2 — basegeek publishes last and lands one scan later.** Every push rebuilds and
  republishes all 8 images in the same `release.yml` matrix run, but basegeek's image finishes
  ~1 minute after the rest and so lands on the *next* Watchtower poll, not the same one
  (`DOCS/BURN_QUEUE.md`). After a push, expect the other 7 to update on one poll and basegeek on
  the poll after. A docs-only-looking push that "did nothing" to basegeek may just not have
  reached its scan yet.
- **Everything rebuilds on every push, whether it touched that app or not** — a
  bookgeek-only fix still restarts all 8 containers whose digest actually changed, and since
  every app calls basegeek, that one restarts too whenever anything ships (`STATUS.md`
  2026-09-05: "a bookgeek-only fix restarted bookgeek and basegeek").

Docs-only commits (`**/*.md`, `DOCS/**`, `LICENSE`) are excluded from both workflows'
`paths-ignore`, so they neither run CI nor trigger a rebuild/redeploy.

### Syntax gate (`syntax` job, added 2026-09-05)

`tools/syntax-check.mjs` (`pnpm check:syntax`) parses every `.js`/`.mjs`/`.cjs` file under
`apps/*/**` and `packages/*/**` (excluding `node_modules`, `dist`, `build`, `coverage`,
`.vite`, `out`, and macOS AppleDouble `._*` sidecar junk) and fails on the first file that
can't be parsed. It exists because on 2026-09-05 basegeek crash-looped in production:
`apps/basegeek/packages/api/src/graphql/bujogeek/typeDefs.js` had an unescaped backtick
inside a `gql` template literal — a plain `SyntaxError` — and every jest suite stayed green
because none of them imported that module (fixed in `61d3109`, which also added a
`gatewaySchemaLoads` test). No test suite can be relied on to import every file in the repo;
this gate doesn't need to.

**How it works**: one child `node --check <file>` per file (capped at 2 concurrent, this box
runs other agents), letting Node's own nearest-`package.json` `type` resolution decide
CJS vs ESM per file — no manual grouping or `acorn` dependency needed. Runtime on the full
tree: ~20s. JSX (`.jsx`) is out of scope; Vite's build already gates JSX parse errors.
Point it at a fixture instead of the real tree with `SYNTAX_CHECK_DIR=<path> node
tools/syntax-check.mjs` (used to prove the gate against a scratch copy of a broken file
without touching the tree).

Caveat found while building this: `node --check` on a file with top-level `import`/`export`
syntax silently passes if there is **no** `package.json` anywhere in its ancestor chain (a
Node module-type-detection quirk) — irrelevant here since every real file's ancestor chain
always terminates at the repo root `package.json`, but it means a from-scratch fixture used
to test this gate needs its own `package.json` to behave like the real tree.

### Boot-smoke gate (`boot-smoke` job, added 2026-09-05)

`tools/boot-smoke.mjs` (`pnpm check:boot`) closes the other half of BURN_REVIEW #22: the
syntax gate and `gatewaySchemaLoads` catch parse-level failures, but nothing caught an
**import-time** failure (a missing export, a bad workspace path, a CJS/ESM interop error) or
a service booting without a required env var. For each of the seven backends
(`apps/{bujogeek,fitnessgeek,flockgeek,notegeek,storygeek}/backend`, `apps/bookgeek/api`,
`apps/basegeek/packages/api`) it spawns `node --input-type=module -e "await
import('<module>')"` with an obviously-fake `KEY_VAULT_SECRET` (64 hex chars,
`'deadbeef'.repeat(8)`, satisfying crypto-vault's format check) and fake, never-listening
Mongo URIs (`mongodb://127.0.0.1:1/...` for `DB_URI`/`MONGODB_URI`/`BASEGEEK_MONGODB_URI`/
`AIGEEK_MONGODB_URI`/`MONGO_BASE_URI`) — no real database, no bound port, no docker. None of
the seven backends has a `SKIP_LISTEN`-style guard today, so per the task that drove this none
was added; instead each target is either the app's own `app.js` (bujogeek, fitnessgeek,
storygeek — already split from `server.js` so it builds the Express app without connecting or
listening) or a documented **fallback** for the four apps with no such split:

| App | Target | Why |
|---|---|---|
| flockgeek | `routes/api.js` | No `app.js`; `server.js` builds+connects+listens inline with no guard. `routes/api.js` is the routes index pulling in all nine route modules. |
| notegeek | `routes/auth.js` | No `app.js`; `server.js`'s `start()` builds the whole app, connects, and listens inline. `auth.js` is the only route module notegeek has split out — health check, `/api/me`, and the SPA fallback are inline in `server.js` and **not** covered. |
| bookgeek | `routes/authRoutes.js`, `routes/importRoutes.js`, `deviceBasket.js` | `apps/bookgeek/api/src/server.js` is a ~2800-line monolith that connects and listens unconditionally (its own `test/csrfGuard.test.js` already documents this: *"server.js itself calls start() at import time ... so it cannot be imported here"*). These three routers are the only route logic bookgeek split out — the bulk of its routes (~2700 lines: books, profile, kindle, enrichment) live inline in `server.js` and are **not** covered. |
| basegeek | `graphql/index.js` | `server.js` does a top-level `await mongoose.connect(...)` at module scope — no function to skip. `graphql/index.js` merges all nine gateway GraphQL modules (typeDefs+resolvers) and is basegeek's dominant surface, but its REST route modules (`routes/mongo.js`, `routes/auth.js`, `routes/aiRoutes.js`, `routes/openaiProxy.js`, etc.) have no aggregator and are **not** covered. |

**Landmine found while building this**: importing `graphql/index.js` transitively pulls in
`services/aiService.js`, whose module-level singleton (`export default new AIService()`) fires
an *unawaited* `initializeService()` in its constructor — real background DB work kicked off
as a side effect of importing the module, not of calling anything. Against a fake, always-
refusing Mongo URI it's merely slow (mongoose's 10s operation-buffering timeout, twice,
sequentially) rather than fatal; against a real-but-unreachable one it left the process hanging
on an open handle indefinitely — the exact same "singleton service's open handle keeps the
process alive forever" quirk `test-basegeek`'s own job comment already works around with
jest's `--forceExit`. The script's fix is the same shape: `process.exit(0)` immediately after a
successful import, so the check reflects only "did the import succeed," not whatever the
singleton does afterward. A module that fails to import never reaches that line — Node's
default top-level-await rejection handling prints the error and exits non-zero on its own.
Not fixed here (app code, out of scope for this pass) — worth a queue entry if the singleton's
fire-and-forget init and `config/database.js`'s missing `conn.on('error', ...)` handler (it
crashed outright against this box's real local mongod on port 27017 before the fake env vars
were pinned down) ever bite in production.

Run: `pnpm check:boot` locally (~14s on a clean run) or `node tools/boot-smoke.mjs` directly.

---

## 6. Deploy procedure and rollback

**Normal path**: push to `main`. CI runs, `release.yml` publishes, Watchtower pulls within
~5 min (basegeek: within ~10 min, see landmine 2 above). Verify with `docker ps` (container
age) then `curl https://<app>.clintgeek.com/api/health`.

**Stuck app** (landmine 1): `cd apps/<app> && docker compose pull <app> && docker compose up -d <app>`.

**Rollback**: revert the commit and push (preferred — goes through the normal pipeline), or
break-glass on the box:
```
docker tag ghcr.io/clintgeek/<app>:sha-<prev> ghcr.io/clintgeek/<app>:latest
docker compose up -d --force-recreate <app>
```
Watchtower keeps that manually pinned `latest` until the next `main` push overrides it.

`./build.sh <app>` (or `--all`) still works as a break-glass local build+deploy, but is no
longer the primary deploy path (`DEPLOY.md`) — and using it re-triggers landmine 1.

---

## 7. Local development

| App | Backend dev | Frontend dev port | Notes |
|---|---|---|---|
| basegeek | `nodemon src/server.js` (`packages/api`) | `vite` — 5173 dev / 8988 preview (`packages/ui/vite.config.js`) | `npm run dev` at `apps/basegeek/` runs both concurrently |
| bookgeek | `nodemon src/server.js` (`api/`) | `vite` — 1801 (`web/vite.config.js`) | |
| bujogeek | `nodemon server.js` (`backend/`) — prod `PORT` default 5005 (compose), but its own `DOCS/CONTEXT.md` documents local dev backend on `5001` | `vite` — 3000 (`frontend/vite.config.js`) | `resolve.dedupe: ['@mui/material','@emotion/react','@emotion/styled','react','react-dom']` required (see landmine below) |
| fitnessgeek | `nodemon src/server.js` (`backend/`) | `vite` — 5173 (`frontend/vite.config.js`) | dedupe: `['react','react-dom','@emotion/react','@emotion/styled']` |
| flockgeek | `nodemon src/server.js` (`backend/`) | `vite` — 5173 dev / 4173 preview (`frontend/vite.config.js`) | dedupe: `['@mui/material','@emotion/react','@emotion/styled','react','react-dom']` |
| notegeek | `nodemon server.js` (`backend/`) | `vite` — 5173 (`frontend/vite.config.js`) | dedupe: same MUI set. **Dev server fault fixed 2026-09-05** (`70eb36e`): `styled_default is not a function` from the dependency optimizer's lazy `init_styled` — `vite.config.js` now pins `@mui/material/styles` and emotion into `optimizeDeps.include`. |
| startgeek | none (no backend) | `vite` — 3000 | Standalone `npm` app, no pnpm workspace deps, its own ESLint 8 config — a `workspace:*` devDependency broke its image build once (`TODO_ORDER.md` #5) |
| storygeek | `nodemon src/server.js` (`backend/`) | `vite` — 5173 (`frontend/vite.config.js`) | |

**The `resolve.dedupe` requirement** (all six MUI-consuming apps: bujogeek, fitnessgeek,
flockgeek, notegeek, bookgeek, basegeek's own `packages/ui`): `packages/ui` peers on
`@mui/material ^5`, and because apps alias `@geeksuite/ui` to source, pnpm installs a private
MUI 5 alongside each app's MUI 7 — two separate theme contexts, so the shell frame renders
MUI-default light regardless of the app's `ThemeProvider`. Symptom: dark mode shows white
panes under themed text; light mode looks fine by coincidence. Fix is the `dedupe` array
above in each app's `vite.config.js`.

---

## 8. The mobile harness

**As of 2026-09-05 this is in the repo and CI-enforcing** (M6, `DOCS/MOBILE_UI_PLAN.md` §5) —
the scratch Playwright script from the M0–M5 passes is now `tools/mobile-harness`
(`@geeksuite/mobile-harness`): shared iPhone-14 dark/light + 1280×900 contexts, fixture/route
plumbing per app, and a probe that fails on any tap target < 44px, readable text < 12px,
sideways scroll, or page error. `pnpm --filter @geeksuite/mobile-harness run ci` builds each
app, serves `dist` with `vite preview`, and walks its scenes; `.github/workflows/mobile-harness.yml`
runs it on pushes/PRs touching `apps/**`, `packages/ui/**` or the tool itself, and has been
enforcing (no `continue-on-error`) since its first green run at 14:54. All eight apps are at 0
findings; known violations are meant to be parked per-app in a `waivers` list, which currently
ships empty. No screenshot-diff baselines yet — the probe is the gate; diffing is the documented
next step in the tool's own README.

It no longer depends on `~/.agents/skills/playwright` (the path that broke when `ai-setup`
re-hotwired `~/.agents/skills` to `~/.ai/skills` on 2026-09-04): the tool pins its own
`playwright` devDependency and CI installs the matching Chromium; a local run without
`pnpm install` can still point `PLAYWRIGHT_MODULE` at an existing install, and
`lib/playwright.mjs` falls back to `~/.agents/skills*/playwright` on its own.

Run: `pnpm --filter @geeksuite/mobile-harness shoot -- --app <app> --base <url> --label <label>`
for one app against a running server, or `node tools/mobile-harness/ci.mjs` for the full CI walk.
Details: `tools/mobile-harness/README.md`.

---

## 9. Test commands per package

Run 2026-09-05 against the working tree at that moment (see the dirty-tree note at the top —
some of these may differ once the in-flight work lands).

| Package | Command | Result at time of writing |
|---|---|---|
| `packages/ui` | `npx vitest run` | **340 passed**, 8 files — matches `STATUS.md` |
| `apps/basegeek/packages/api` | `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --forceExit` | The `Cannot find module '@geeksuite/logger'` failure seen earlier this pass was a transient burn-session artifact (an uncommitted `packages/logger` not yet linked); resolved once it landed (`61997ed`) and the workspace was reinstalled. The suite has grown fast the same day as more gateway modules gained zod validation and shared schemas — `DOCS/BURN_QUEUE.md` cites **1082** for the api suite as of the R70 stream (09-05). Re-run `pnpm install` at the repo root if a local run disagrees, and treat any single number here as a snapshot, not a contract. |
| `apps/bookgeek/api` | `npm test` (`node --test test/*.test.js`) | **78 passed**, 2 suites |
| `apps/bujogeek/frontend` | `npx vitest run` | **64 passed**, 3 files |
| `apps/bujogeek/backend`, `apps/fitnessgeek/backend`, `apps/flockgeek/backend`, `apps/storygeek/backend`, `apps/notegeek/backend` | `pnpm test` (jest, mongodb-memory-server) — this is CI's `test-backends` matrix | fitnessgeek: **45 passed** (one run showed 1 flaky failure in `auth.test.js` on a `responseTime` assertion under load, reran clean — treat as flaky, not broken); flockgeek: **57 passed**, 5 suites; storygeek: `npm test` runs both `test:node` (**65 passed**) and `test:jest` (**41 passed**) = 106 total; notegeek backend: **96 passed / 9 skipped**, 3 of 10 suites skipped |
| `apps/notegeek/frontend` | `npx vitest run` | **130 passed / 1 failed** (a worker-timeout under heavy parallel load during this pass, not a real assertion failure) of 131 total, 21 of 22 files. `STATUS.md` reports 141 — the gap is an uncommitted new `App.test.jsx` plus general WIP noise; re-run in isolation for a trustworthy number. |
| `apps/*/frontend`, `packages/ui`, `apps/startgeek` (build smoke) | `npm run build` per app | Covered by CI's `build-frontends` matrix; not re-run individually during this pass |

---

## 10. Known failure modes

| Symptom | Cause | Fix |
|---|---|---|
| App logged in as "stale" after logout; silent refresh fails | Service worker cached `/api/me` or `/api/auth/*` | Auth endpoints must be `NetworkOnly` and evaluated **first** in the SW's runtime-caching rules — `DOCS/PWA_STANDARD.md` |
| App renders unstyled after a deploy until the user clears site data | SPA fallback answered every unknown path (including hashed asset paths) with `index.html`; an old SW revalidates a stale `/assets/*.css`, gets `index.html` back as 200, caches it as the stylesheet | Express fallback must 404 any path with a file extension, not just serve `index.html` for everything (done in bujogeek/notegeek/bookgeek servers) |
| Dark mode shows white panels / MUI-default text color after a frontend change | Two MUI 5/7 copies in the bundle (`packages/ui` materializes its own MUI 5 peer) | `resolve.dedupe` in the app's `vite.config.js` — see §7 |
| Release workflow green, `docker ps` shows a container hours old, site serves the old build | Local `build.sh` deploy left the image with no RepoDigest, so Watchtower has nothing to diff against | `docker compose pull <app> && docker compose up -d <app>` — §5 |
| A docs-only-looking push "did nothing" to basegeek specifically | basegeek's image publishes ~1 min after the other 7 in the same release run and lands on the *next* Watchtower poll | Wait one more 5-min cycle before assuming it's stuck |
| A push that only touched one app restarted the whole fleet | Every push rebuilds and republishes all 8 images; Watchtower restarts whichever digests changed, and everything calls basegeek so it restarts too whenever anything ships | Expected behavior, not a bug — `STATUS.md` 2026-09-05 |
| A new file silently missing from a commit | Root `.gitignore` had `*data*` (too broad — matched `MetadataList.jsx`), narrowed to `data/` on 2026-09-04 | After `git add`, check `git show --stat` on the new commit, not just `git status`, to confirm the file landed |
| ~~Adding a field to fitnessgeek's `UserSettings` silently disappears~~ | **Fixed 2026-09-05** (`6d7865c`, `TODO_ORDER.md` #21) — both models now build from `packages/schemas/fitnessgeek/userSettings.js` (`@geeksuite/schemas`); a parity tripwire on both sides fails if either stops consuming it. Same pattern followed for seven more fitnessgeek models the same day (`DOCS/CONTEXT.md`). | Add a field to the shared module only, per `apps/fitnessgeek/DOCS/USER_SETTINGS_SCHEMA.md` |
| notegeek dev server rendered nothing | esbuild dependency-optimizer fault (`styled_default is not a function`); production build was unaffected | **Fixed 2026-09-05** (`70eb36e`) — `vite.config.js` pins `@mui/material/styles` and emotion into `optimizeDeps.include`, so the optimizer stops re-splitting MUI's lazy init across passes |
| basegeek `packages/api` test suite fails wholesale with `Cannot find module '@geeksuite/logger'` | A new workspace package (`packages/logger`) was added but the workspace hasn't been re-linked yet | `pnpm install` at the repo root — this specific occurrence was fixed 2026-09-05 (`61997ed`); the general shape (add a workspace package, forget to reinstall) recurs any time one lands |
| An app crash-loops in production with a plain `SyntaxError` even though CI was green | A module no jest/vitest suite imports (e.g. a `typeDefs.js`) had a parse error — nothing ever loaded it to notice | Fixed by the `syntax` CI job / `pnpm check:syntax` (§5) added 2026-09-05 after exactly this happened to `apps/basegeek/packages/api/src/graphql/bujogeek/typeDefs.js` (`61d3109`) |

---

## Where to look next

- `DOCS/MOBILE_UI_PLAN.md` — the Pocket Pass mobile pass, per-app findings, and the shared
  `packages/ui` grammar. M6 guardrails (harness into the repo) landed 2026-09-05 — see §8 above.
- `DOCS/THE_UI_UNIFICATION_PLAN.md` — suite-wide design/component unification plan.
- `DOCS/AI_SEARCH_PLAN.md` — StartGeek Ask / `glanceAsk` design.
- `DOCS/TODO_ORDER.md` — the single cross-cutting prioritized work queue; consult before
  `SUITE_TODO.md`.
- `DOCS/SUITE_TODO.md` — the detailed backlog `TODO_ORDER.md` sequences.
- `DOCS/BURN_QUEUE.md` — if the tree is dirty and you don't know why, this is the live
  multi-stream work log explaining it, plus how to safely resume or commit each stream.
