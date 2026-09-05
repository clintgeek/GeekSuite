const CACHE_NAME = "startgeek-cache-v1";
const ASSETS = ["/", "/manifest.json", "/offline.html"];

// startgeek's API/auth traffic lives on basegeek's domain, not this origin
// (see src/lib/graphql.js, src/lib/basegeek.js), so these checks match by
// pathname regardless of host — the fetch event still fires for
// cross-origin requests the page itself initiates.
function isAuthEndpoint(url) {
  return (
    url.pathname === "/api/me" ||
    url.pathname.startsWith("/api/auth/") ||
    url.pathname.startsWith("/api/users/me")
  );
}

function isApiRequest(url) {
  // Everything session-scoped: the REST auth/session endpoints and the
  // GraphQL endpoint (startgeek has no /api/* data routes of its own —
  // /graphql is the equivalent of "everything else" in the suite standard).
  return url.pathname.startsWith("/api/") || url.pathname === "/graphql";
}

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
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
  const url = new URL(event.request.url);

  // Rule 1 (highest): auth endpoints are always network-only, never cached.
  if (isAuthEndpoint(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Rule 2: all other API/GraphQL traffic is network-only — no stale data.
  if (isApiRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.method !== "GET") return;

  // Rules 3/4: images, JS, CSS, fonts — stale-while-revalidate.
  // Rule 5: navigation requests fall back to /offline.html when both the
  // cache and the network come up empty.
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            cache.put(event.request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) {
        // Serve the cached copy immediately; let the network refresh it
        // in the background for next time.
        event.waitUntil(network);
        return cached;
      }

      const fresh = await network;
      if (fresh) return fresh;
      if (event.request.mode === "navigate") {
        return caches.match("/offline.html");
      }
      return Response.error();
    })
  );
});
