# Deployment convention

Each GeekSuite app is deployed out of its **own source directory** under
`apps/<appname>/`. Code, runtime config, and persistent data all live
next to each other in one path. `build.sh` builds and deploys every app
from that layout.

This document exists because that convention is invisible otherwise —
discoverable only by reading `build.sh` line-by-line and watching
which volumes docker mounts. If you ever see a split like
`/mnt/Media/Docker/<app>/` alongside `apps/<app>/`, you're looking at a
legacy layout; consolidate it (see **Migration** below) before it drifts.

## Layout of `apps/<app>/`

| Path | In git? | Notes |
|---|---|---|
| `docker-compose.yml` | yes | Single source of truth for the compose stack. |
| `Dockerfile` (+ `Dockerfile.ui` etc.) | yes | Image definitions. |
| `DOCS/` | yes | Runbooks, architectural notes. |
| `.env.example` | yes | Shape of required env, placeholders only. |
| `.env.production` | **no** (gitignored) | Real secrets. |
| `.env` | **no** (gitignored), basegeek only | Symlink → `.env.production`. See "Datastore env convention" below. |
| `data/` | **no** (gitignored) | Mongo/Postgres/Redis/Influx volumes. Never committed. |
| `mongodb-init.js` (app-specific) | yes | Init scripts run once at volume creation. |

`.env.production` and any subdirectory named `data` are covered by the
repo root `.gitignore` (`.env.*` and `data/`). Re-check before every
commit that runs `git add -A` — an accidental commit of either
destroys the guardrail. (`.gitignore` used to say `*data*`, which also
silently matched `MetadataList.jsx`; narrowed to `data/` 2026-09-04.)

## Build + deploy

From the repo root:

```
./build.sh <app>           # build image, then deploy from apps/<app>/
./build.sh                 # interactive (requires dialog)
./build.sh --all           # every app in APPS
./build.sh --list          # list buildable apps
```

`build.sh` sets `DOCKER_ROOT="$SCRIPT_DIR/apps"` so every `docker compose up`
runs in the source tree. No second path to keep in sync.

## Guardrails (the reason this pattern is safe enough)

1. **`data/` and `.env.production` must never be git-tracked.** Verify:
   ```
   git check-ignore apps/<app>/data/mongodb apps/<app>/.env.production
   ```
   Both should print the path (meaning "ignored"). If either prints
   nothing, the `.gitignore` has regressed — fix before committing.

2. **Off-host snapshots of `data/` and `.env.production`.** With code
   and state in the same tree, one `rm -rf apps/<app>` takes out both.
   Put a periodic backup somewhere docker can't reach from this host.

3. **Every secret in `.env.production` is reproducible or recoverable.**
   Store `KEY_VAULT_SECRET`, `JWT_SECRET`, Mongo passwords, etc. in a
   password manager. Losing `KEY_VAULT_SECRET` makes every encrypted
   AIConfig key garbage — the migration in
   `apps/basegeek/DOCS/AUTH_HARDENING_2026-04.md` is a one-way door.

## Shared secrets across apps

Some env vars are **intentionally shared** across multiple apps because
they form part of the SSO / suite boundary:

| Var | Shared by | Notes |
|---|---|---|
| `JWT_SECRET` | every app | basegeek issues tokens; every other app validates. Mismatch = nobody can log in. |
| `MONGO_INITDB_ROOT_USERNAME/PASSWORD` | apps that share a Mongo instance | set once, reuse everywhere that connects to that Mongo. |
| `KEY_VAULT_SECRET` | basegeek + fitnessgeek, **one shared value** | encrypts API keys (basegeek) and the Garmin password (`@geeksuite/schemas` UserSettings, written and read by both apps) at rest. Copy basegeek's value into fitnessgeek; a different value would make basegeek read ciphertext into a Garmin login. Other apps: never. |
| `JWT_REFRESH_SECRET` | basegeek only | only basegeek signs/verifies refresh tokens. |

When rotating `JWT_SECRET`, every app's `.env.production` has to be
updated in the same deploy window or apps will reject each other's
tokens.

## Datastore env convention (`apps/basegeek/`)

`apps/basegeek/docker-compose.yml` doubles as the suite's datastore compose file
(mongodb, postgres, redis, influxdb live there alongside the basegeek app itself —
see `DOCS/RUNBOOK.md` §3). Those four services must **not** carry
`env_file: .env.production` — that hands every one of basegeek's ~40 secrets
(`JWT_SECRET`, `KEY_VAULT_SECRET`, OAuth client secrets, VAPID keys, the lot) to
containers that only ever need two or three names each (BURN_REVIEW_2 #10:
briefly true tonight, fixed same session).

Instead:
- `apps/basegeek/.env` is a **symlink to `.env.production`** (gitignored — the
  root `.gitignore`'s `.env`/`.env.*` rules already cover it; verify with
  `git check-ignore apps/basegeek/.env`). Compose reads `${VAR}` substitutions
  in `environment:` from this file automatically — no `env_file:` needed for
  that.
- `mongodb` and `postgres` declare only the exact vars each one needs as
  explicit `environment:` entries — `${MONGO_INITDB_ROOT_USERNAME}` /
  `${MONGO_INITDB_ROOT_PASSWORD}` for mongo, `${POSTGRES_USER}` /
  `${POSTGRES_PASSWORD}` / `${POSTGRES_DB}` for postgres — which the `.env`
  symlink resolves. `redis` and `influxdb` substitute nothing and carry no
  `env_file:` either.
- `env_file: .env.production` stays **only** on the `basegeek` app service,
  which legitimately needs the full set.
- Verify least privilege after any change here with:
  ```
  cd apps/basegeek
  docker compose config --quiet
  docker compose config --format json | python3 -c \
    "import json,sys; d=json.load(sys.stdin); print({k: sorted(v.get('environment',{}).keys()) for k,v in d['services'].items()})"
  ```
  This prints variable **names only** (never values) per service — confirm
  mongodb/postgres/redis/influxdb show only their own few names and basegeek
  shows its full set. Never pipe `docker compose config` output anywhere else;
  its default output is resolved values.

If a new datastore-shaped service is ever added to this compose file, follow
the same pattern — explicit `environment:` entries for exactly the vars it
needs, no blanket `env_file:`.

## Applying the #10/#12 fix (2026-09-05 burn review)

The compose changes for BURN_REVIEW_2 #10 (env_file scoping, above) and #12
(datastore healthchecks + `depends_on: condition: service_healthy`, see
`DOCS/RUNBOOK.md` §10) are written to `apps/basegeek/docker-compose.yml` and
validated (`docker compose config --quiet` passes), but **not yet applied** —
doing so recreates all four datastore containers plus basegeek (same class as
Q57: a compose-level change to a running service requires a recreate to take
effect). Chef/Sage, at a chosen low-traffic moment, from `apps/basegeek/`:

```
docker compose up -d
```

Expected blip: mongodb, postgres, redis, and influxdb all recreate (new
`environment:`/`healthcheck:` sections), then basegeek recreates and now
waits for all four to report `healthy` before its own container starts
(previously it started as soon as they were merely *running*). Total
downtime should be short — each datastore's healthcheck `start_period` is
20s and basegeek's is 30s — but this is every datastore in the suite
recreating at once, so treat it like any full-stack restart: pick a quiet
window, then `docker ps` to confirm all five show `(healthy)`, then spot
check `curl https://basegeek.clintgeek.com/api/health` and one dependent
app.

## Migration (legacy `/mnt/Media/Docker/<app>/` → consolidated)

If an app still has a split deploy:

```
# 1. stop the current deploy cleanly (never while copying state)
cd /mnt/Media/Docker/<app> && docker compose down

# 2. copy config + state into the source tree
cp -a /mnt/Media/Docker/<app>/.env.production apps/<app>/
cp -a /mnt/Media/Docker/<app>/data apps/<app>/

# 3. reconcile docker-compose.yml — diff both, pick/merge; do NOT blindly overwrite
diff /mnt/Media/Docker/<app>/docker-compose.yml apps/<app>/docker-compose.yml

# 4. run the new path
./build.sh <app>
docker compose -f apps/<app>/docker-compose.yml logs -f

# 5. once verified healthy, archive the old location
mv /mnt/Media/Docker/<app> /mnt/Media/Docker/<app>.archived-$(date +%F)
```

Keep the archived copy for at least one full backup cycle before
deleting.
