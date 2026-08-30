# Watchtower — pull-based deploy for GeekSuite

Reference copy of the Watchtower stack. **The live copy runs from
`/mnt/Media/Docker/watchtower/` on the production box** (outside the repo, next
to the other host stacks); keep this in sync when you change it.

## What it does

Polls GHCR every 5 minutes and recreates any container whose image has a newer
digest — but only containers that opted in with the label
`com.centurylinklabs.watchtower.enable: "true"`. Every GeekSuite app carries
that label and points at `ghcr.io/clintgeek/<app>:latest`, so a push to `main`
→ CI green → `release.yml` publishes new images → Watchtower deploys them
within ~5 minutes. No inbound connection to the box.

## Notes / gotchas learned the hard way

- **Image**: `nickfedor/watchtower` (maintained fork). The original
  `containrrr/watchtower` is stale and negotiates Docker API v1.25, which the
  current daemon rejects (needs ≥1.40).
- **Networking**: `network_mode: host`. The box had exhausted Docker's default
  address pools (33 networks), so Watchtower must not create its own bridge.
  It only needs the docker socket anyway.
- **Credentials**: none. GeekSuite's GHCR packages are public (they inherit the
  public source repo's visibility), so Watchtower pulls anonymously. If a
  package is ever made private, `docker login ghcr.io` on the box and mount
  `~/.docker/config.json` into the container (commented line in the compose).

## Operate

```bash
cd /mnt/Media/Docker/watchtower && docker compose up -d   # start / apply changes
docker logs watchtower --tail 20                          # see poll cycles + updates
```

## Rollback an app to a previous build

```bash
docker tag ghcr.io/clintgeek/<app>:sha-<prev> ghcr.io/clintgeek/<app>:latest
cd apps/<app> && docker compose up -d --force-recreate <app>
```
Watchtower keeps that pin until the next `main` push publishes a newer `latest`.
