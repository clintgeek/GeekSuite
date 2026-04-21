# GeekSuite CI/CD

Suite-wide continuous integration + deploy plan. GitHub is the single
remote (see [MEMORY: GitHub authoritative](../README.md)); workflows
live under `.github/workflows/` and deploys are pull-based.

---

## Goals

1. **Every PR and push to `main` runs automated checks.** Tests for apps
   that have them; build smoke for any app whose Dockerfile changed.
   Status checks on PRs block obviously broken merges.
2. **Images published to GHCR on every `main` commit.** Tagged with
   both `latest` and the short commit SHA. Acts as the deploy-ready
   artifact and gives the portfolio a visible "Packages" list per app.
3. **Server pulls + restarts automatically.** When a new `latest` tag
   lands on GHCR, the production box detects it and recreates the
   relevant container without any inbound connection from CI. Deploys
   are observable (a `deployments` Watchtower log, Slack/email optional).
4. **Portfolio legible.** Green checks on commits, README build badges,
   GHCR packages tied to releases. Someone browsing the repo should
   be able to answer "how do they deploy?" from the README alone.

## Non-goals (for this cycle)

- Multi-stage environments (staging / prod). We have one box.
- Rollback UI / one-click revert. `docker pull sha-<prev>` by hand is
  acceptable given the scale.
- Secret scanning / SBOM / signing. Worth revisiting later; not first.
- Cross-suite tests (integration between apps). Each app tests itself.

---

## Tier 1 — PR + push checks

### Workflow: `.github/workflows/ci.yml`

Triggered on:
- `pull_request` → any branch targeting `main`
- `push` → `main`

Jobs run in parallel where possible:

1. **`setup`** — checkout, setup pnpm with cache, `pnpm install
   --frozen-lockfile`. Output the install's store path so downstream
   jobs reuse the cache.
2. **`test-basegeek`** — runs `cd apps/basegeek/packages/api && npm test`.
   Currently 88 passing / 1 pre-existing failure (flagged but not
   gating until fixed).
3. **`test-notegeek`** — runs whatever backend + frontend tests
   notegeek ships. Inspect `apps/notegeek/backend/package.json` and
   `apps/notegeek/frontend/package.json` for the actual scripts.
4. **`lint`** — loop the apps that have an eslint config and run
   `pnpm --filter <app> lint`. Don't gate on warnings initially.
5. **`docker-build-changed`** — detect which `apps/*/Dockerfile` files
   (or their contexts) changed in the PR, and run `./build.sh <app>`
   for each. For `push` to `main` this runs for every app. Uses
   `docker/setup-buildx-action` + layer caching to stay under ~5 min.
6. **`status-summary`** — a final job that depends on all of the
   above and posts a single digest comment on the PR (optional but
   nice).

### Guardrails

- Never run `./build.sh` in its default `build_and_deploy` mode in CI.
  Add a `--no-deploy` flag (or a `BUILD_ONLY=1` env) so CI can build
  images without the `docker compose up` side-effect. **Blocker**:
  `build.sh` currently deploys unconditionally — needs the flag added
  before CI can use it safely.
- Use GitHub's OIDC + `ghcr.io` only in the Tier 2/3 workflow; this
  tier is just building, never pushing images.
- Cache pnpm store per-lockfile-hash to keep CI under 2 min for a
  test-only run.

### Expected runtime

- Tests + lint: 1–2 min
- Docker smoke (one affected app): 2–4 min with buildx layer cache
- Docker smoke (all apps, on `main` push): 5–8 min

### Status checks required on `main`

After the workflow is green once, protect `main` in GitHub settings:
- Require PR before merge
- Require `test-*` + `lint` + `docker-build-changed` checks
- Require branches up-to-date before merge
- No admin bypass (portfolio-facing — look professional)

---

## Tier 3.3 — Pull-based deploy via GHCR + Watchtower

### The shape

```
┌──────────────┐    push to main    ┌──────────────────┐
│   developer  │ ─────────────────▶ │  GitHub Actions  │
└──────────────┘                    │ build + publish  │
                                    │   ghcr.io/…:sha  │
                                    │   ghcr.io/…:latest
                                    └────────┬─────────┘
                                             │ image manifest
                                             ▼
                                    ┌──────────────────┐
                                    │  ghcr.io registry│
                                    └────────┬─────────┘
                                             │ poll every 5 min
                                             ▼
                                    ┌──────────────────┐
                                    │   production box │
                                    │    Watchtower    │
                                    │ pulls + restarts │
                                    └──────────────────┘
```

No inbound connection to the box. GitHub never authenticates to the
server. The server authenticates to GHCR to pull (read-only token).

### Workflow: `.github/workflows/release.yml`

Triggered on:
- `push` → `main`
- `workflow_dispatch` (manual re-release of a specific commit)

Jobs:
1. **`build-and-publish`** — matrix over the suite apps (same list as
   `build.sh`'s `APPS`). For each:
   - `docker/login-action` against `ghcr.io` using
     `secrets.GITHUB_TOKEN` (no extra secret needed — built-in).
   - `docker/build-push-action` with:
     - `file: apps/<app>/Dockerfile`
     - `context: .` (monorepo root, matching `build.sh`)
     - Tags: `ghcr.io/clintgeek/<app>:latest`,
       `ghcr.io/clintgeek/<app>:sha-<short>`,
       `ghcr.io/clintgeek/<app>:main`
     - Layer cache via `cache-from: type=gha` + `cache-to: type=gha`
   - Needs `permissions: { packages: write, contents: read }` on the
     job so `GITHUB_TOKEN` can push.
2. **Changed-only vs full-matrix**: for `push` we publish all apps.
   For a manual `workflow_dispatch` we accept an `app` input and
   publish just that one.

### Watchtower setup on the production box

Watchtower is a small daemon (one docker container) that polls
configured images and restarts containers when a newer digest lands.

```yaml
# /mnt/Media/Docker/watchtower/docker-compose.yml (new)
services:
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ${HOME}/.docker/config.json:/config.json:ro  # GHCR read token
    environment:
      WATCHTOWER_POLL_INTERVAL: 300              # 5 min
      WATCHTOWER_CLEANUP: "true"                 # prune old images
      WATCHTOWER_LABEL_ENABLE: "true"            # only update opted-in containers
      WATCHTOWER_INCLUDE_RESTARTING: "true"
      WATCHTOWER_NOTIFICATIONS: shoutrrr         # optional
      # WATCHTOWER_NOTIFICATION_URL: …           # fill when we pick a channel
```

Each suite app's `docker-compose.yml` gets one extra label to opt in:

```yaml
services:
  basegeek:
    image: ghcr.io/clintgeek/basegeek:latest   # switched from geeksuite/basegeek
    labels:
      com.centurylinklabs.watchtower.enable: "true"
    # …
```

### Registry auth on the server

One-time setup:
1. Create a fine-grained GitHub personal access token with
   `read:packages` (and nothing else).
2. `docker login ghcr.io -u clintgeek -p <token>` — writes
   `~/.docker/config.json`.
3. Watchtower reads that file via the volume mount above.

### Rollback

1. SSH to box.
2. `docker tag ghcr.io/clintgeek/<app>:sha-<prev> ghcr.io/clintgeek/<app>:latest`
3. `docker compose up -d --force-recreate <app>`

Watchtower will then keep that manual `latest` pinned until the next
`main` push overrides it. Acceptable given our blast radius.

### What changes on disk

- `.github/workflows/ci.yml` (new, Tier 1)
- `.github/workflows/release.yml` (new, Tier 3.3)
- `build.sh` — add `--no-deploy` flag so CI can build without the
  auto-deploy side-effect
- `apps/*/docker-compose.yml` — switch `image:` from
  `geeksuite/<app>:latest` to `ghcr.io/clintgeek/<app>:latest`, add
  the watchtower-enable label
- `/mnt/Media/Docker/watchtower/docker-compose.yml` (outside the
  monorepo — created on the production box)
- `README.md` — build + deploy badges, short "How deploys work"
  paragraph pointing at this doc

### Rollout order

1. Land the `build.sh --no-deploy` flag + Tier 1 workflow. Ship a PR,
   watch it go green, enable branch protection.
2. Add badges to README, ship a doc-only PR to prove the workflow.
3. Add the Tier 3.3 `release.yml`. First run publishes every app's
   `latest` to GHCR but doesn't touch the server. Confirm packages
   show up on the GitHub repo sidebar.
4. On the box, bring up Watchtower *disabled by default*
   (`WATCHTOWER_LABEL_ENABLE: true`, no containers labeled yet). Confirm
   it starts cleanly and polls without doing anything.
5. Flip **one** low-risk app over: change its compose `image:` to the
   ghcr tag, add the watchtower label, `docker compose up -d`. Let
   Watchtower cycle it once on a no-op push to verify end-to-end.
6. Migrate the rest of the apps one at a time.
7. Once everything's on GHCR + Watchtower, remove `build.sh`'s deploy
   codepath entirely (or scope it behind a `LOCAL_DEPLOY=1` env for
   dev-only use).

---

## Decisions still open

1. **Public or private repo.** Everything above assumes public (GHCR
   free, workflows free). If the repo is private, GHCR storage has a
   small free tier and workflow minutes are limited — still workable
   but worth confirming.
2. **Notifications.** Watchtower supports Shoutrrr URLs for Slack,
   Telegram, email, etc. Recommend: add a cheap notification later
   (start with logs only).
3. **One workflow or per-app workflows.** The plan above uses one
   `ci.yml` with matrix jobs. Alternative is per-app workflows under
   `.github/workflows/<app>-ci.yml` gated by `paths:` filters. The
   per-app style is more granular but multiplies YAML maintenance.
   Starting with one monolithic workflow; split if it grows unwieldy.
4. **Cache strategy.** `type=gha` layer caching is simplest and free
   but eviction is LRU and shared across all workflows. If cache hit
   rates tank, consider publishing a `buildcache` tag to GHCR and
   using `cache-from: type=registry,ref=…:buildcache`. Defer.

## Related docs

- [`build.sh`](../build.sh) — current local build/deploy script
- [`DEFERRED_WORK.md`](DEFERRED_WORK.md) — suite-wide follow-ups
- [`SUITE_TODO.md`](SUITE_TODO.md) — active roadmap
