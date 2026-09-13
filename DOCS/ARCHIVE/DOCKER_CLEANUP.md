# GeekSuite Docker Cleanup + GHCR Migration

Goal: stop the box running out of Docker resources and finish the pull-based
deploy rollout. Two intertwined problems, fixed in one per-app compose sweep.

## The problems

1. **Network exhaustion.** Every app compose auto-creates its own
   `<app>_default` bridge. The box hit the hard wall —
   `all predefined address pools have been fully subnetted` (Docker's default
   pool is 31 usable blocks). 33 networks existed; most GeekSuite apps had a
   lonely 1-container bridge they don't need.
2. **Deploy path.** Apps still run `geeksuite/<app>:latest` (local `build.sh`
   images). The GHCR + Watchtower pull-based path (DOCS/CICD.md Tier 3.3) is
   built and CI is green, but only startgeek is migrated.

## What was already done (2026-08-30)

- `docker network prune` removed 8 empty networks (33 → 25).
- Watchtower running at `/mnt/Media/Docker/watchtower/` — maintained
  `nickfedor/watchtower` fork (containrrr is stale, negotiates a rejected API
  version), `network_mode: host` (box is out of subnet pools), label-scoped
  (`WATCHTOWER_LABEL_ENABLE`), 5-min poll, cleanup on. Anonymous GHCR pulls
  (packages are public — no token).
- startgeek migrated as the canary: `ghcr.io/clintgeek/startgeek:latest` +
  `com.centurylinklabs.watchtower.enable: "true"`.

## The per-app sweep (each app's docker-compose.yml)

Apps reach infra (`GATEWAY_URL`, DB) over `host.docker.internal:host-gateway`,
NOT over a shared network — so attaching to `datageek_network` is neutral to
runtime comms; it only removes the redundant private bridge. Three edits:

1. `image: geeksuite/<app>` → `image: ghcr.io/clintgeek/<app>:latest`
2. add label `com.centurylinklabs.watchtower.enable: "true"`
3. attach to the existing shared network instead of an implicit bridge:
   ```yaml
   services:
     <app>:
       networks: [datageek_network]
   networks:
     datageek_network:
       external: true
   ```
Keep `extra_hosts: host.docker.internal:host-gateway` and `GATEWAY_URL` as-is.

Then `docker compose up -d --force-recreate <app>` and health-check.

## Order (leaf apps first, basegeek last)

bookgeek → flockgeek → storygeek → fitnessgeek → notegeek → bujogeek →
basegeek. basegeek last because everything depends on it; verify each leaf
stays healthy before touching the hub.

## Behavior change (intended)

Once an app points at the GHCR image, local `./build.sh <app>` no longer
deploys a local build — compose recreates from GHCR. "Deploy" becomes "push
to main" (CI builds, Watchtower pulls within ~5 min). Break-glass rollback:
`docker tag ghcr.io/clintgeek/<app>:sha-<prev> …:latest && docker compose up -d <app>`.

## Deferred / follow-up

- Non-GeekSuite stacks (rallycenter, nextcloud, jellyfin, etc.) still hold
  ~10 networks — out of scope here, but a `docker network prune` after any
  stack teardown is worth a habit.
- Optional later optimization: apps could reach basegeek by container name on
  `datageek_network` and drop the `host.docker.internal` gateway hop. Not done
  now — it means changing `GATEWAY_URL` on every app and re-testing SSO.
