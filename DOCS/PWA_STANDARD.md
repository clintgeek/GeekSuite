# GeekSuite PWA Standard

> **The one rule**: Auth endpoints must NEVER be cached by a service worker.

---

## Why this matters

A service worker that caches `/api/me` will serve a stale "logged in" response after the user logs out. Silent refresh will fail because the SW returns cached data instead of hitting the network. Deploys get stuck because the old app shell is served from cache. This is incompatible with cookie-first SSO.

---

## The Standard

### 1. Service Worker Caching Strategy

Every app's SW must follow this priority order:

| Priority | URL Pattern | Strategy | Why |
|----------|-------------|----------|-----|
| **1 (highest)** | `/api/me`, `/api/auth/*`, `/api/users/me` | **NetworkOnly** | Auth state must always be fresh |
| **2** | `/api/*` (everything else) | **NetworkOnly** or **NetworkFirst** (app's choice) | API data should not be stale |
| **3** | Images (`request.destination === 'image'`) | StaleWhileRevalidate | Fast loads, eventual freshness |
| **4** | JS, CSS, fonts | StaleWhileRevalidate | App shell loads fast |
| **5** | Navigation requests (fallback) | Cache → Network → `/offline.html` | Graceful offline |

**The auth bypass rule must always be FIRST.** Workbox evaluates rules in order and uses the first match.

### 1a. Code-split chunks and the SPA fallback (added 2026-09-05)

Splitting an app's bundle re-hashes every chunk name, so a deploy can leave an
old client asking for `/assets/<old-hash>.js`. Two rules keep that from turning
into a poisoned cache.

**Every hashed `.js`/`.css` must be precached, or fetched network-first.**
VitePWA's `generateSW` does this by default — its `globPatterns` already match
`**/*.{js,css,html,ico,png,svg}` — so a new chunk is covered automatically and
there is nothing to maintain when the chunk list changes. Verify it after any
chunking change rather than assuming:

```js
// count precache entries in the built SW against what is actually on disk
const urls = [...require('fs').readFileSync('dist/sw.js', 'utf8')
  .matchAll(/url:"([^"]+)"/g)].map(m => m[1]);
```

Precaching is what makes a deploy survivable: the old client keeps serving the
old chunks from its own precache instead of re-fetching URLs the server no
longer has.

**The SW must reinstall on every deploy (suite rule, Q54, 2026-09-05).**
A hand-rolled `public/sw.js` (Flavor B) has no build step, so its precache
manifest and cache name were originally hand-written constants. A constant
`CACHE_NAME` means `install` never fires again after the first visit —
`activate`'s cleanup never runs, the precache list never updates, and the
`"/"` a user's browser cached on day one is served forever, even after a
route goes from eager to lazy and needs the new SW to survive the deploy.
Found in flockgeek (115fb03) chasing the code-splitting bug above; the same
constant-name / static-list shape was then checked for and fixed suite-wide
(Q54).

The fix is a small `swPrecache()` Vite plugin (`closeBundle`, `apply:
'build'`) that stamps two placeholders at the top of `dist/sw.js` after
every production build — never `public/sw.js`, so `vite dev` keeps serving
the unstamped source:

```js
const BUILD_ID = "dev";          // → sha1 of the sorted hashed-asset list, first 8 hex chars
const PRECACHE_ASSETS = [];      // → every built assets/*.js and assets/*.css, as URLs
const CACHE_NAME = `<app>-cache-${BUILD_ID}`;
```

`install` adds each URL individually (`cache.add(url).catch(() => undefined)`
per URL, not `addAll`, so one missing asset can't fail the whole install and
leave the app with no service worker at all). `activate`'s existing
`keys.filter((key) => key !== CACHE_NAME)` cleanup needs no change — once
`CACHE_NAME` is build-derived it already deletes every prior version of the
app's own cache. The plugin hard-errors (`this.error(...)`) if either
placeholder is missing after the string replace, so a rename in
`public/sw.js` fails the build instead of silently shipping an unstamped SW.

VitePWA/Workbox apps (Flavor A) get this for free: `generateSW`'s manifest is
already content-hash-revisioned per entry, and `cleanupOutdatedCaches` +
`clientsClaim`/`skipWaiting` already reinstall and evict on every deploy —
there is nothing to stamp.

| App | Flavor | Status |
|-----|--------|--------|
| flockgeek | B (hand-rolled) | ✅ done 2026-09-05 (115fb03) — found chasing the code-splitting bug |
| storygeek | B (hand-rolled) | ✅ done 2026-09-05 (Q54) |
| bookgeek | B (hand-rolled) | ✅ done 2026-09-05 (Q54) |
| startgeek | B (hand-rolled) | ✅ done 2026-09-05 (Q54) — built with npm/Vite standalone, same plugin shape in its own `vite.config.js` |
| notegeek | A (VitePWA/Workbox) | ✅ already fine — `generateSW`'s revisioned manifest + `cleanupOutdatedCaches` reinstall on every deploy natively; no hand-rolled SW exists to fix |
| fitnessgeek | A (VitePWA/Workbox) | ✅ already fine — same as notegeek, via the plugin |
| bujogeek | A (VitePWA/Workbox) | ⏳ pending R90 — another agent owns `apps/bujogeek/frontend/vite.config.js` as of 2026-09-05; likely already fine like notegeek/fitnessgeek (same flavor) but not yet re-verified under R90 |
| basegeek | none | n/a — ships no service worker |

**A StaleWhileRevalidate rule for JS/CSS/fonts must refuse `text/html`.**
Precaching does not cover everything — hashed font files (`.woff`/`.woff2` are
not in the default `globPatterns`) and any cross-origin script fall through to
the runtime rule. If the app's SPA fallback answers a deleted asset path with
`index.html` and a 200, StaleWhileRevalidate will store that HTML *as* the
stylesheet or font and serve it until the user clears site data. Add a
`cacheWillUpdate` plugin to the rule:

```js
plugins: [{
  cacheWillUpdate: async ({ response }) => {
    if (!response || response.status !== 200) return null;
    if ((response.headers.get('content-type') || '').includes('text/html')) return null;
    return response;
  }
}]
```

This is a **mitigation, not the cure**. The cure is the extname-404 guard in the
server's SPA fallback — a path with a file extension must return 404, not the
index document. The guard makes the bad response uncacheable; only the 404
makes the failure honest.

**Suite requirement, as of 2026-09-05 (Q53): every app is guarded, both ends.**
Both rules below are mandatory for any app that serves its own SPA and/or ships
a service worker — not a per-app judgment call.

1. **Every Express SPA fallback must 404 a path with a file extension**, ahead
   of `res.sendFile(index.html)`, keeping any `/api/*` and `/graphql`
   passthroughs already in front of it:
   ```js
   if (path.extname(req.path)) {
     return res.status(404).type('text/plain').send('Not found');
   }
   ```
   Present in: `apps/bujogeek/backend/src/app.js`, `apps/notegeek/backend/server.js`,
   `apps/bookgeek/api/src/server.js`, `apps/fitnessgeek/backend/src/app.js` (fixed
   2026-09-05 — previously the one gap: `GET /assets/gone-DEAD.js` returned 200
   `text/html`), `apps/storygeek/backend/src/app.js` (added 2026-09-05),
   `apps/flockgeek/backend/src/server.js` (added 2026-09-05), and
   `apps/basegeek/packages/api/src/server.js` (added 2026-09-05 — no service
   worker exists for basegeek, but the same Express SPA fallback did, and needed
   the same guard). **startgeek** has no Express backend — it is a static bundle
   served by the `serve` npm package in its own container
   (`apps/startgeek/Dockerfile`). `serve -s`/`--single` rewrites *every*
   not-found request to `index.html` regardless of path shape, which is the same
   landmine (verified locally: `GET /assets/<deleted-hash>.js` came back 200
   `text/html`). Fixed 2026-09-05 by dropping `-s` entirely — startgeek has no
   client-side router (no react-router dependency, no `Route` definitions;
   `src/App.jsx` is the whole page), so there are no deep-link SPA routes that
   need a not-found rewrite, and plain `serve` already 404s a missing file,
   hashed asset or otherwise (verified locally the same way).
2. **Every service worker's asset-caching path must refuse to store a
   `text/html` response** under a script/style/font/image request, so a
   SPA-fallback response that gets through anyway (a font extension outside a
   VitePWA `globPatterns` list, a cross-origin script, or simply a request
   in flight before the deploy that added the guard above) can never poison
   the cache. VitePWA/Workbox apps use the `cacheWillUpdate` plugin shown
   above (`apps/fitnessgeek/frontend/vite.config.js`'s `fitnessgeek-assets`
   rule); `apps/bujogeek/frontend/vite.config.js` and
   `apps/notegeek/frontend/vite.config.js` carry no runtime-caching rule for
   scripts/styles/fonts/images at all (precache only), so there is nothing for
   this rule to guard there today — if either app ever adds a
   StaleWhileRevalidate asset rule, it must ship with the same plugin. Every
   hand-rolled `public/sw.js` (Flavor B) must check
   `response.headers.get('content-type')` before `cache.put(...)` in its fetch
   handler's static-asset branch: `apps/bookgeek/web/public/sw.js`,
   `apps/flockgeek/frontend/public/sw.js`, `apps/storygeek/frontend/public/sw.js`,
   `apps/startgeek/public/sw.js` (all added 2026-09-05).

**Per-app code-splitting status.** First load = the entry script plus every
`modulepreload` `dist/index.html` lists, plus the HTML itself; measure it with
`zlib.gzipSync`, not by eyeballing the build log (the log prints every chunk,
including the async ones nobody downloads on the first visit).

| App | Routes lazy | Vendor chunks (all eager) | First load raw / gzip | Largest chunk | New hashed chunks after a deploy |
|-----|-------------|---------------------------|------------------------|---------------|-----------------------------------|
| flockgeek | ✅ 2026-09-05 — 8 of 10 (`HomePage` + `LoginPage` stay eager, see `apps/flockgeek/CONTEXT.md` "Bundle") | react-vendor / mui / apollo / motion; no async vendor group (no chart, date or export library in the app) | 1011 kB / 312 kB (was 1072 kB / 326 kB, one 1060 kB chunk) | 313 kB `mui` (was 1060 kB) | ✅ precached — hand-rolled `public/sw.js` has no build step, so `swPrecache()` in its `vite.config.js` stamps the hashed `.js`/`.css` list + a content-hash `BUILD_ID` into `dist/sw.js` (the flavour-B equivalent of `generateSW`'s `globPatterns`) |
| bujogeek | ✅ 2026-09-05 — all 12 pages, including `LoginPage`/`RegisterPage`; fallback is the app's own `SkeletonLoader` parchment shimmer, not a spinner (see `apps/bujogeek/DOCS/CONTEXT.md` "Bundle") | react-vendor / apollo / motion / date-fns eager, `markdown` (react-markdown + the whole remark/micromark tail) async behind the lazy TemplatePreview; **deliberately no `mui` group** — measured three ways in `apps/bujogeek/frontend/vite.config.js`, and here a group costs 77 kB of first load rather than saving it (fitnessgeek's is load-bearing only because of its chart vendors) | 1010 kB / 310 kB (was 1606 kB / 480 kB, one single 1605 kB chunk — no `manualChunks`, no route splitting at all) | 449 kB entry `index` (was 1605 kB); nothing over 500 kB, build no longer warns | ✅ precached — `generateSW`'s default `globPatterns`; verified after the split: 44 hashed `.js`/`.css` on disk, all 44 in the SW's 47-entry manifest (+ `index.html`, `offline.html`, `favicon.svg`). Precache-only, no runtime asset rule, so there is no cache for a `text/html` response to poison; an unknown hashed chunk falls straight through to the network, where the backend's extname-404 guard answers 404 |

### 2. Two SW Flavors in the Suite

#### A. VitePWA + Workbox (preferred for new apps)

Used by: fitnessGeek, NoteGeek, BuJoGeek

Config lives in `vite.config.js` under `VitePWA({ workbox: { runtimeCaching: [...] } })`.

Required first rule:
```js
{
  urlPattern: ({ url }) =>
    url.pathname === '/api/me' ||
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.startsWith('/api/users/me'),
  handler: 'NetworkOnly',
  options: { cacheName: 'auth-bypass' }
}
```

#### B. Hand-rolled `public/sw.js`

Used by: FlockGeek, StoryGeek, BookGeek, StartGeek

Required pattern at the top of the fetch handler:
```js
const url = new URL(event.request.url);

// Auth endpoints: network only, never cache
if (url.pathname === "/api/me" ||
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/users/me")) {
  event.respondWith(fetch(event.request));
  return;
}

// All other API: network only
if (url.pathname.startsWith("/api/")) {
  event.respondWith(fetch(event.request));
  return;
}
```

### 3. Web App Manifest (per app)

Every app needs a `manifest.json` in its public directory with:

```json
{
  "name": "AppName",
  "short_name": "AppName",
  "description": "...",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#...",
  "theme_color": "#...",
  "orientation": "portrait-primary",
  "scope": "/",
  "icons": [
    { "src": "/icons/icon-192.svg", "sizes": "192x192", "type": "image/svg+xml", "purpose": "any" },
    { "src": "/icons/icon-512.svg", "sizes": "512x512", "type": "image/svg+xml", "purpose": "any" }
  ]
}
```

And `index.html` must include:
```html
<meta name="theme-color" content="#..." />
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/icons/icon-192.svg" />
```

### 4. Offline Behavior (v1)

Do NOT attempt full offline support. v1 goal:

- If offline and navigating → show `/offline.html` (a friendly "You're offline" screen with a Retry button)
- If offline and fetching API → let it fail naturally (the app's error handling takes over)

The offline page should:
- Match the app's theme colors
- Have a clear "You're offline" message
- Have a Retry button that calls `window.location.reload()`
- Be self-contained (inline CSS, no external dependencies)

---

## Current Status (per app)

*Updated 2026-09-05 — offline-pages-per-mode + theme-color/manifest audit (TODO_ORDER #30);
SPA-fallback / SW-poisoning guard added suite-wide (Q53, see §1a and "Remaining work" below);
SW-reinstalls-on-deploy fixed suite-wide across the hand-rolled Flavor-B apps (Q54, see §1a).*

| App | SW Type | Auth Safe | SPA Fallback Guard | SW Asset-Cache Guard | Manifest | Offline Page | Installable |
|-----|---------|-----------|---------------------|-----------------------|----------|--------------|-------------|
| bookgeek | Hand-rolled | ✅ | ✅ had | ✅ added | ✅ | ✅ — now matches both light/dark palettes via `prefers-color-scheme` | ✅ |
| bujogeek | VitePWA/Workbox | ✅ | ✅ had | n/a — no asset runtime-caching rule exists | ✅ — `scope` added, `theme_color` now matches default (light) page | ✅ (new) — precached, but **not** wired as `navigateFallback` (see note) | ✅ |
| fitnessgeek | VitePWA/Workbox | ✅ | ✅ added (2026-09-05, Q53) | ✅ had (`cacheWillUpdate`) | ✅ — inline `manifest` in `vite.config.js` replaced with `manifest: false`; `public/manifest.json` (linked in `index.html`) is now the single source, fixing the duplicate `<link rel="manifest">` in built `dist/index.html` | ✅ (new) — precached; `navigateFallback` stays `/index.html` (SPA routing), not repointed (see note) | ✅ |
| notegeek | VitePWA/Workbox | ✅ | ✅ had | n/a — no asset runtime-caching rule exists | ✅ — `theme_color` now matches default (light) page; `apple-touch-icon` link added | ✅ (new) — precached, not wired as `navigateFallback` (see note) | ✅ |
| flockgeek | Hand-rolled | ✅ | ✅ added (Q53) | ✅ added (Q53) | ✅ — `scope` added, `theme_color` now matches default (dark) page; `apple-touch-icon` link added | ✅ — now matches both palettes via `prefers-color-scheme` | ✅ |
| storygeek | Hand-rolled (new) | ✅ | ✅ added (Q53) | ✅ added (Q53) | ✅ (new) — `manifest.json` + manifest/apple-touch-icon links created | ✅ — hand-rolled SW added, per-mode `offline.html` now served via navigation fallback | ✅ (new) |
| startgeek | Hand-rolled | ✅ | ✅ — `serve -s` flag dropped (Q53) | ✅ added (Q53) | ✅ | ✅ — dark-only by design (app has one mode, no light palette exists) | ✅ |
| basegeek | None | N/A | ✅ added (Q53) | n/a — no service worker exists (out of scope by design) | — (none exists; left untouched per scope) | — | ❌ |

### Note on VitePWA `navigateFallback`

`navigateFallback` in Workbox's `generateSW` mode is **not** an offline-only catch — it
unconditionally serves the precached document for every matching navigation, online or
off (confirmed against `workbox-precaching`'s `PrecacheStrategy._handle`, which returns
the cache hit before ever considering the network). fitnessgeek already relies on this
for SPA routing (`navigateFallback: '/index.html'`); repointing it at `/offline.html`
would show the offline page for every route, always. bujogeek and notegeek both use
`react-router-dom` `BrowserRouter` with real paths, so adding a fresh
`navigateFallback: '/offline.html'` would break deep links and refreshes the same way.
None of the three were changed. Their new `offline.html` files are precached (existing
`globPatterns` already match `*.html`) and reachable by direct navigation, but are not
auto-served on a failed fetch. A true "network failed, not just unmatched" fallback
needs `workbox-recipes`' `offlineFallback()` / a custom `setCatchHandler`, which requires
`injectManifest` (custom SW code) — out of scope for a config-only pass.

### Remaining work

- **fitnessgeek**: fixed 2026-09-05. `apps/fitnessgeek/frontend/vite.config.js`'s inline
  VitePWA `manifest` block (whose `theme_color` was `#0D9488`, disagreeing with the
  corrected `public/manifest.json`'s `#FAFAF9`) is replaced with `manifest: false` —
  `public/manifest.json` (already linked in `index.html`) is now the single source.
  `registerType: 'autoUpdate'` and the workbox config are untouched. Verified via
  `pnpm build`: built `dist/index.html` now ships exactly one `<link rel="manifest">`
  (`/manifest.json`); no `manifest.webmanifest` is generated.

  **Also 2026-09-05 (bundle split):** fitnessgeek's chunks were re-split — 62
  js/css files on disk, all 62 precached (64 entries with `index.html` +
  `offline.html`) — and the `fitnessgeek-assets` StaleWhileRevalidate rule
  gained the §1a `cacheWillUpdate` guard. The real fix — `apps/fitnessgeek/backend/src/app.js`'s
  `GET *` fallback answering a deleted `/assets/<hash>.js` with 200 `text/html`
  instead of 404 — landed the same day (Q53, below).
- **Q53 (2026-09-05): every app's SPA fallback guarded, every SW refuses to
  cache HTML under an asset URL.** See §1a's suite-requirement box above for
  the full file list. Summary: `apps/storygeek/backend/src/app.js`,
  `apps/flockgeek/backend/src/server.js` and
  `apps/basegeek/packages/api/src/server.js` gained the extname-404 guard
  (bujogeek, notegeek, bookgeek, and fitnessgeek already had it).
  `apps/startgeek/Dockerfile` dropped `serve`'s `-s` flag — the same
  landmine, confirmed by local repro, closed by removing the flag rather than
  reworking the rewrite, since the app has no client-side router to protect.
  `apps/bookgeek/web/public/sw.js`, `apps/flockgeek/frontend/public/sw.js`,
  `apps/storygeek/frontend/public/sw.js` and `apps/startgeek/public/sw.js`
  (all hand-rolled, Flavor B) gained a `content-type` check ahead of
  `cache.put(...)` in their static-asset fetch handler. bujogeek's and
  notegeek's VitePWA configs carry no runtime-caching rule for
  scripts/styles/fonts/images (precache only), so neither needed the
  `cacheWillUpdate` plugin. Proof: a new `spaFallback.test.js` per fixed
  backend (storygeek, flockgeek, basegeek jest; bookgeek node:test, proving
  the pattern it already shipped) asserting `GET /assets/nope-DEAD.js` → 404
  `text/plain` and `GET /some/spa/route` → 200 index.html; `node
  tools/syntax-check.mjs`; `node --check` on every touched `sw.js`; the
  flockgeek mobile harness (`--label sw-guard --viewports phone`) — 28
  scenes, 0 page errors, SW active.
- **bujogeek**: no change needed — already `manifest: false` with `public/manifest.json`
  (`theme_color` `#FAF8F5`) as the sole source, matching the default (light) page
  background. Verified via `pnpm build`: one manifest link in `dist/index.html`.
- **storygeek**: hand-rolled `public/sw.js` added (Flavor B, matching bookgeek's
  pattern) plus the registration snippet in `index.html`. Auth bypass rule (`/api/me`,
  `/api/auth/*`, `/api/users/me`) is first and network-only, matched by pathname so it
  also covers the app's cross-origin GraphQL calls to basegeek if ever proxied through
  a matching path; all other `/api/*` is network-only; static assets are cache-first
  with network fallback; navigation failures fall back to the precached `/offline.html`.
  Verified via `pnpm build` (sw.js lands in `dist/`) + `vite preview` + Playwright:
  SW reaches `activated`, an online `/api/me` fetch hits the network (401, not a cached
  200) and is absent from the `storygeek-cache-v1` cache, and going offline and
  navigating renders the offline page.
- **bujogeek, notegeek, fitnessgeek**: `manifest.json` icons still combine
  `purpose: "any maskable"` on a single non-safe-zone SVG/PNG (no dedicated maskable
  icon exists). Left as-is — do not invent icons — but a real maskable icon (safe zone
  padding) is still missing suite-wide.
- **basegeek**: no manifest exists; PWA remains out of scope by design (gateway/auth
  portal, per the standard's original call).

---

## Rules for Future Development

1. **Never add a runtimeCaching rule for `/api/*` without the auth bypass rule above it**
2. **Never cache responses that include `Set-Cookie` headers**
3. **Never cache a `text/html` response for a script/style/font request** — see §1a; a SPA fallback that does not 404 asset paths will hand you one
4. **After any code-splitting change, re-check that every hashed chunk is precached** — §1a
5. **Always bump the cache version** (`v1` → `v2`) when changing SW logic so old caches get cleaned
6. **Always use `skipWaiting()` + `clients.claim()`** so new SWs activate immediately
7. **Test auth flow after every SW change**: login → verify `/api/me` → logout → verify `/api/me` returns 401 (not cached 200)
