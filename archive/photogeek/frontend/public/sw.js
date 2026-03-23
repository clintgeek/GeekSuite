const CACHE_NAME = "photogeek-cache-v1";
const ASSETS = ["/", "/manifest.json", "/offline.html"];

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
