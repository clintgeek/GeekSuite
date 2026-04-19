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
| `data/` | **no** (gitignored) | Mongo/Postgres/Redis/Influx volumes. Never committed. |
| `mongodb-init.js` (app-specific) | yes | Init scripts run once at volume creation. |

`.env.production` and any subdirectory named `data` are covered by the
repo root `.gitignore` (`.env.*` and `*data*`). Re-check before every
commit that runs `git add -A` — an accidental commit of either
destroys the guardrail.

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
| `KEY_VAULT_SECRET` | basegeek only | encrypts API keys at rest. Never share across apps. |
| `JWT_REFRESH_SECRET` | basegeek only | only basegeek signs/verifies refresh tokens. |

When rotating `JWT_SECRET`, every app's `.env.production` has to be
updated in the same deploy window or apps will reject each other's
tokens.

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
