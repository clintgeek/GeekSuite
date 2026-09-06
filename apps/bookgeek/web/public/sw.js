// ─── Precache ───────────────────────────────────────────────────────────────
//
// The two constants below are PLACEHOLDERS. `swPrecache()` in
// `vite.config.js` rewrites them in `dist/sw.js` after every production
// build; `vite dev` serves this file untouched, so the dev SW precaches
// nothing but the three shell URLs (correct — dev has no hashed assets).
//
// Precaching every hashed `.js`/`.css` is what makes a deploy survivable: an
// old client keeps serving the old chunks from its own cache until it
// updates, instead of asking the server for a hash it has already deleted
// and getting the SPA fallback's 404 (DOCS/PWA_STANDARD.md §1a).
//
// `BUILD_ID` changes whenever the asset list does, which also fixes a
// second, older bug: with a fixed cache name the SW never reinstalled, so
// the `"/"` entry cached on a user's first ever visit was served forever
// and the root route never picked up a deploy.
const BUILD_ID = "dev";
const PRECACHE_ASSETS = [];

const CACHE_NAME = `bookgeek-cache-${BUILD_ID}`;
const ASSETS = ["/", "/manifest.json", "/offline.html", ...PRECACHE_ASSETS];

function isAuthEndpoint(url) {
  return (
    url.pathname === "/api/me" ||
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/users/me")
  );
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      // Per-URL, not `addAll`: `addAll` rejects the whole install if any one
      // request fails, and one missing asset must not leave the app with no
      // service worker at all.
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => undefined)))
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Auth endpoints: network only, never cache
  if (isAuthEndpoint(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // API: network only
  if (isApiRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Static assets: cache first, network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type !== "basic") {
            return response;
          }
          // SPA-fallback poisoning guard (DOCS/CONTEXT.md landmine). A
          // deleted hashed asset path answered by the backend's SPA
          // catch-all comes back 200 text/html — never cache that under
          // the script/style/font/image URL it was requested as, or every
          // later load serves the wrong body until the cache is cleared.
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("text/html")) {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          if (event.request.mode === "navigate") {
            return caches.match("/offline.html");
          }
        });
    })
  );
});
