# dashgeek x geekPanel Merger — Deploy Checklist

Pre-flight for the dashgeek redesign (`dashgeek-redesign` branch). Run through
this end-to-end before cutting over from geekPanel. Verification results from
the pre-flight session are at the bottom.

---

## 1. basegeek env additions

Add the following keys to **`apps/basegeek/.env.production`** (NOT
`.env.example` — the example is already committed with placeholders).

```env
# Google OAuth (reuse geekPanel's existing client — same ID/secret)
GOOGLE_CLIENT_ID=<existing google client ID from geekPanel .env>
GOOGLE_CLIENT_SECRET=<existing google secret from geekPanel .env>
GOOGLE_REDIRECT_URI=https://basegeek.clintgeek.com/api/connections/google/callback

# Spotify OAuth (reuse geekPanel's existing app — same ID/secret)
SPOTIFY_CLIENT_ID=<existing spotify client ID from geekPanel .env>
SPOTIFY_CLIENT_SECRET=<existing spotify secret from geekPanel .env>
SPOTIFY_REDIRECT_URI=https://basegeek.clintgeek.com/api/connections/spotify/callback

# Internal JWT (signs service-to-service calls; generate once and keep stable)
#   openssl rand -hex 32
INTERNAL_JWT_SECRET=<generate with: openssl rand -hex 32>

# Weather coordinates (same values geekPanel uses)
WEATHER_LAT=33.749
WEATHER_LON=-84.388
```

> The Google/Spotify client IDs and secrets live in
> `/mnt/Media/Docker/geekPanel/api/.env` — copy them over as-is. Do not rotate
> them yet; geekPanel needs to keep working until you cut over.
>
> `WEATHER_LAT` / `WEATHER_LON` are confirmed to match what geekPanel uses
> (`/mnt/Media/Docker/geekPanel/api/.env.example`).

---

## 2. OAuth provider console steps

You do these in the provider web consoles. **Keep the existing geekPanel
redirect URIs in place** — add the new ones alongside them so both apps
keep working until the cutover is confirmed.

### Google Cloud Console
1. Open the existing OAuth 2.0 Client ID used by geekPanel.
2. Under **Authorized redirect URIs**, add:
   ```
   https://basegeek.clintgeek.com/api/connections/google/callback
   ```
3. Save. Leave the geekPanel URI in place.

### Spotify Developer Dashboard
1. Open the existing Spotify app used by geekPanel.
2. Under **Redirect URIs**, add:
   ```
   https://basegeek.clintgeek.com/api/connections/spotify/callback
   ```
3. Save. Leave the geekPanel URI in place.

---

## 3. Redeploy sequence

Run from the monorepo root (`/mnt/Media/Projects/GeekSuite`).

```bash
# 1. Build fresh images
cd /mnt/Media/Projects/GeekSuite
./build.sh basegeek
./build.sh dashgeek
```

> **Note:** `./build.sh` automatically runs
> `docker compose up -d --force-recreate <app>` after a successful build
> (see `build.sh` — `build_and_deploy` is the default path). If you want to
> build without deploying, build with `docker build` directly:
>
> ```bash
> docker build -t geeksuite/basegeek:latest -f apps/basegeek/Dockerfile .
> docker build -t geeksuite/dashgeek:latest -f apps/dashgeek/Dockerfile .
> ```
>
> Then deploy explicitly:
>
> ```bash
> cd apps/basegeek && docker compose up -d --force-recreate basegeek
> cd ../dashgeek && docker compose up -d --force-recreate dashgeek
> ```

Service name for basegeek in `apps/basegeek/docker-compose.yml` is
`basegeek` (confirmed). Service name for dashgeek in
`apps/dashgeek/docker-compose.yml` is `dashgeek` (confirmed).

---

## 4. First-run flow (browser)

1. Visit https://dashgeek.clintgeek.com/ (or wherever dashgeek is hosted).
2. Sign in via baseGeek SSO.
3. Swipe / arrow right to `/suite` — verify the search + Bujo + Fitness +
   Flock cards render.
4. Swipe / arrow back to `/` (Ambient). On first load every ambient card
   should show a **"Reconnect Google →"** or **"Reconnect Spotify →"** chip
   (no tokens yet in the new `oauthConnections` collection).
5. Click **Reconnect Google →** → redirects to Google consent → returns to
   dashgeek → card begins polling.
6. Click **Reconnect Spotify →** → same flow.
7. Verify all five ambient cards come alive within their poll intervals:
   - Clock (tick every second)
   - Weather
   - Spotify now-playing
   - Agenda (Google Calendar)
   - Gmail

---

## 5. Post-merger follow-ups (not this session's scope)

- **`/settings/connections` UI is stubbed.** The `ReconnectChip` links to a
  placeholder route. Build a small settings page that consumes
  `GET /api/connections` and `POST /api/connections/:provider/disconnect`.
- **geekPanel cutover.** geekPanel at `/mnt/Media/Docker/geekPanel/` still
  runs at its old URL. Leave it running until dashgeek is verified on the
  desk tablet. Then archive geekPanel (user-gated — not part of this pass).
- **NowPlayingDialog volume slider.** Seeds at `60` because the now-playing
  contract doesn't include volume. If you want it to reflect the real
  device volume, add `volume_percent` to basegeek's
  `ambientService.shapeNowPlaying(...)` output and have the dialog read it.

---

## Pre-flight verification results (session of 2026-04-20)

| Check | Result |
| --- | --- |
| basegeek API tests (`npm test` in `apps/basegeek/packages/api`) | **88 passing, 1 failing, 1 skipped** — matches the expected baseline. The one failure is the pre-existing `conversationService › Automatic Summarization › should trigger summarization at threshold` (All AI providers failed — unrelated to this work). |
| `pnpm --filter dashgeek-frontend build` | PASS — `✓ built in 10.61s`. 2511 modules transformed. |
| `./build.sh dashgeek` | PASS — `geeksuite/dashgeek:latest built successfully`. Image also auto-deployed via `docker compose up -d --force-recreate dashgeek` (build.sh default behavior). |
| `./build.sh basegeek` | **FAILED** at build context transfer — `error from sender: open apps/basegeek/data/influxdb/wal/_internal/monitor/92: permission denied`. This is an environment issue (InfluxDB container wrote WAL dirs with root-owned perms that the build daemon can't stat). **Not caused by this branch's work.** See "Known issue" below. |

### Known issue — basegeek build blocked by data-dir permissions

The monorepo-root `.dockerignore` contains only `**/node_modules` and
`**/.git`, so `docker build` tries to stream `apps/basegeek/data/` into the
build context. That directory contains live DB state (influxdb, mongo,
postgres, redis) — some paths under `data/influxdb/wal/_internal/monitor/`
are owned by root and unreadable by the build daemon, which aborts the
context transfer.

The basegeek Dockerfile does **not** need `apps/basegeek/data/` (it only
COPYs `packages/`, `apps/basegeek/*` source, and `families.json`). The fix
is one line in `/mnt/Media/Projects/GeekSuite/.dockerignore`:

```
**/node_modules
**/.git
apps/*/data/
```

This is safe: no Dockerfile in the monorepo copies from `apps/*/data/`.
dashgeek doesn't have a `data/` dir so it was unaffected in the pre-flight
run. This fix was **not applied** in the pre-flight session (per
instructions: stop and report on build failure rather than reflexively fix).
Apply the one-line edit, then rerun `./build.sh basegeek`.
