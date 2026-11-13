# Backdrop Service — Plan

*Status: APPROVED, 2026-11-13. Scope set by Chef: backgrounds only, public sources
only, consumers are StartGeek and the unified login screen.*

## Why

StartGeek hot-linked `picsum.photos` on every page load. On 2026-11-13 Picsum
answered 522 (Cloudflare origin timeout) and LoremFlickr 500, so StartGeek fell
back to the plain ground with no wallpaper. A wallpaper should never depend on
a third party being up at the moment the page opens.

## What it does

basegeek fetches a small batch of wallpapers from several public sources on a
schedule, stores them, and serves them from our own origin. A dead source
shrinks the batch; it never empties it, and a failed refresh keeps the previous
batch.

## Requirements

1. **Sources (public, no key):** Bing Image of the Day (`HPImageArchive.aspx`),
   Picsum, LoremFlickr. Each is a small adapter with the same interface, so a
   source can be added or dropped without touching the rest.
2. **Batch:** ~10 photos, mixed across sources. Missing ones are made up from
   the sources that answered.
3. **Refresh every 48 h.** A refresh that gets fewer than N (say 4) good photos
   keeps the old batch instead of replacing it.
4. **Two crops per photo:** landscape 1920×1080 and portrait 1080×1920 of the
   same image, requested at those sizes from the source (Bing publishes native
   portrait crops). A phone held upright gets a picture composed for it. No
   image processing in basegeek.
5. **Public, read-only HTTP:** the login screen and logged-out StartGeek both
   show it, so no auth. Cross-origin reads (StartGeek's brightness probe) ride
   basegeek's existing cors() allow-list, which already lists
   start.clintgeek.com. Long cache headers on image bytes (immutable ids).
6. **Fallback:** if the service has nothing, each consumer shows what it shows
   today (StartGeek's plain ground, login's steel panel). Nothing breaks.
7. **Credits stored** per photo (source, title/copyright string when given).
   Bing images are licensed for wallpaper use only — this service is
   wallpaper-only for that reason.

## Shape

- **Job:** `services/backdropJob.js`, same class/`start()`/`stop()` shape as
  `aiCatalogJob.js`; `BACKDROP_JOB=off` disables it. Writes one run record per
  attempt (even failed ones).
- **Storage:** Mongo, one `Backdrop` doc per photo with both sizes as Buffers
  (~5 MB total). Chosen over a disk volume because a compose/volume change
  doesn't deploy through Watchtower and needs a manual step. Regenerable, so
  backup inclusion doesn't matter.
- **Endpoints:**
  - `GET /api/backdrops` → `{ batchId, photos: [{ id, source, credit, landscape, portrait }] }`
    (the two crops are paths; `Cache-Control: public, max-age=300`)
  - `GET /api/backdrops/:id/(landscape|portrait).jpg` → bytes, `Cache-Control: public, max-age=31536000, immutable`
- **Client helper:** small framework-free module (pick one at random, choose
  the crop by viewport orientation, preload, try another, resolve or give up). StartGeek is standalone
  npm/Tailwind and the login is MUI, so the shared piece is plain JS, not a
  React component. It lives in `packages/backdrop` (decision 2 below).

## Consumers

- **StartGeek:** `BackgroundManager.jsx` swaps the Picsum URL for the service.
  Keeps its scrim, blur and brightness probe.
- **Login (`AuthFrame.jsx`):** photo behind the Signal Box card under a
  darkening scrim. The card, mark and wordmark are unchanged; the image is
  static (no motion), so the "calmest identity" rule still holds.

## Decisions (Chef, 2026-11-13)

1. Login: photo behind the card (above).
2. StartGeek joins the pnpm workspace and imports the helper from a shared
   package (`packages/backdrop`), rather than copying it.

## Build order

Each step is its own commit; nothing is pushed until Chef calls it (a basegeek
push restarts the fleet).

1. basegeek: model, job, routes, tests.
2. `packages/backdrop`: the plain-JS client helper + tests.
3. StartGeek joins the workspace (package.json, Dockerfile, lockfile, CI) and
   `BackgroundManager` uses the helper.
4. basegeek login: `AuthFrame` uses the helper.

## Out of scope (for now)

Personal/Nextcloud photos, keyed APIs (Unsplash, Pexels), other apps, other
image uses, server-side brightness or resizing.

## As built (2026-11-13)

- basegeek: `services/backdropSources.js` (bing, picsum, loremflickr),
  `services/backdropJob.js` (hourly tick, 48 h refresh, TARGET 10, MIN_KEEP 4),
  `models/Backdrop.js`, `models/BackdropRun.js`, `routes/backdrops.js`; tests in
  `__tests__/backdrops.test.js`. `BACKDROP_JOB=off` disables the job;
  `BACKDROP_REFRESH_HOURS` overrides 48.
- `packages/backdrop`: `loadBackdrop({ base })` → `{ url, credit, source, orientation } | null`.
- StartGeek: `BackgroundManager.jsx` uses the helper; StartGeek builds from the
  pnpm workspace (Dockerfile, CI) and no longer has its own package-lock.
- Login: `AuthFrame.jsx` paints the photo behind the card under a scrim of
  `surfaces.base` at 0.78.
- On day one Picsum (522) and LoremFlickr (500) were both down, so the first
  batch will be all Bing. That is the fill rule working, not a bug.
- **Check after deploy:** `GET https://basegeek.clintgeek.com/api/backdrops`
  lists ~10 photos about 30 s after the container starts; the latest
  `backdropruns` document says what each source did.
