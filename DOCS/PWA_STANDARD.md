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

| App | SW Type | Auth Safe | Manifest | Offline Page | Installable |
|-----|---------|-----------|----------|--------------|-------------|
| fitnessGeek | VitePWA/Workbox | ✅ | ✅ | via navigateFallback | ✅ |
| NoteGeek | VitePWA/Workbox | ✅ | ✅ | — | ✅ |
| BuJoGeek | VitePWA/Workbox | ✅ | ✅ | — | ✅ |
| BabelGeek | Hand-rolled | ✅ | ✅ | ✅ | ✅ |
| FlockGeek | Hand-rolled | ✅ | ✅ | ✅ | ✅ |
| TemplateGeek | Hand-rolled | ✅ | ✅ | ✅ | ✅ |
| MusicGeek | Hand-rolled | ✅ | ✅ (new) | ✅ | ✅ |
| photoGeek | Hand-rolled | ✅ | ✅ (new) | ✅ | ✅ |
| bookgeek | Hand-rolled | ✅ | ✅ (new) | ✅ | ✅ |
| geekSuite | None (Bun) | N/A | — | — | ❌ |
| baseGeek | None | N/A | — | — | ❌ |

### Remaining work

- **NoteGeek, BuJoGeek**: Could benefit from offline.html fallback pages
- **geekSuite, baseGeek**: Low priority — gateway and auth portal don't benefit much from PWA

---

## Rules for Future Development

1. **Never add a runtimeCaching rule for `/api/*` without the auth bypass rule above it**
2. **Never cache responses that include `Set-Cookie` headers**
3. **Always bump the cache version** (`v1` → `v2`) when changing SW logic so old caches get cleaned
4. **Always use `skipWaiting()` + `clients.claim()`** so new SWs activate immediately
5. **Test auth flow after every SW change**: login → verify `/api/me` → logout → verify `/api/me` returns 401 (not cached 200)
