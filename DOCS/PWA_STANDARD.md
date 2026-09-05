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

Used by: BabelGeek, FlockGeek, TemplateGeek

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

*Updated 2026-09-05 — offline-pages-per-mode + theme-color/manifest audit (TODO_ORDER #30).*

| App | SW Type | Auth Safe | Manifest | Offline Page | Installable |
|-----|---------|-----------|----------|--------------|-------------|
| bookgeek | Hand-rolled | ✅ | ✅ | ✅ — now matches both light/dark palettes via `prefers-color-scheme` | ✅ |
| bujogeek | VitePWA/Workbox | ✅ | ✅ — `scope` added, `theme_color` now matches default (light) page | ✅ (new) — precached, but **not** wired as `navigateFallback` (see note) | ✅ |
| fitnessgeek | VitePWA/Workbox | ✅ | ⚠️ static `manifest.json` fixed; inline `manifest` in `vite.config.js` still stale — that file was already dirty (busy), skipped | ✅ (new) — precached; `navigateFallback` stays `/index.html` (SPA routing), not repointed (see note) | ✅ |
| notegeek | VitePWA/Workbox | ✅ | ✅ — `theme_color` now matches default (light) page; `apple-touch-icon` link added | ✅ (new) — precached, not wired as `navigateFallback` (see note) | ✅ |
| flockgeek | Hand-rolled | ✅ | ✅ — `scope` added, `theme_color` now matches default (dark) page; `apple-touch-icon` link added | ✅ — now matches both palettes via `prefers-color-scheme` | ✅ |
| storygeek | None | N/A | ✅ (new) — `manifest.json` + manifest/apple-touch-icon links created | ✅ (new) — file exists, per-mode; **no SW yet**, so nothing auto-serves it | ❌ (no SW) |
| startgeek | Hand-rolled | ✅ | ✅ | ✅ — dark-only by design (app has one mode, no light palette exists) | ✅ |
| basegeek | None | N/A | — (none exists; left untouched per scope) | — | ❌ |

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

- **fitnessgeek**: `apps/fitnessgeek/frontend/vite.config.js` was already modified in the
  working tree when this pass ran — skipped per the busy-file rule. Its inline VitePWA
  `manifest.theme_color` (`#0D9488`) still disagrees with the corrected
  `public/manifest.json` (`#FAFAF9`), and the built `dist/index.html` ships **two**
  conflicting `<link rel="manifest">` tags (`/manifest.json` and the VitePWA-generated
  `/manifest.webmanifest`) — pre-existing, not caused by this pass. Needs a follow-up
  once that file is free.
- **bujogeek**: `apps/bujogeek/frontend/vite.config.js` was already modified — skipped,
  same rule. No corrections were needed there this pass regardless (`manifest: false`,
  external `manifest.json` only).
- **storygeek**: has no service worker at all. `manifest.json` and `offline.html` now
  exist and are theme-correct, but nothing serves the offline page without a SW. Adding
  one (hand-rolled, matching the standard's Flavor B) is app-code-shaped work, deferred.
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
3. **Always bump the cache version** (`v1` → `v2`) when changing SW logic so old caches get cleaned
4. **Always use `skipWaiting()` + `clients.claim()`** so new SWs activate immediately
5. **Test auth flow after every SW change**: login → verify `/api/me` → logout → verify `/api/me` returns 401 (not cached 200)
