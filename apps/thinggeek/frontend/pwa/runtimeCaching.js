/**
 * ThingGeek's service-worker runtime caching (VitePWA generateSW; PWA_STANDARD
 * flavour A). Its own module so a unit test can run every route against the
 * requests that matter (src/__tests__/pwa/runtimeCaching.test.js) and
 * tools/pwa-audit.mjs can check the built sw.js.
 *
 * Every urlPattern is SELF-CONTAINED: generateSW copies each function's
 * source into sw.js, so it may not call anything defined in this module.
 *
 * Workbox takes the FIRST route that matches, so order is the rule:
 *   1. The Attic (/api/attic/…): NetworkOnly, always first. Its answers are
 *      `Cache-Control: no-store` and must never land in any cache — not the
 *      photo cache, not the asset cache (an Attic <img> has destination
 *      "image"), nowhere (DOCS/THINGGEEK_PLAN.md "The Attic").
 *   2. Auth state: NetworkOnly (PWA_STANDARD §2A).
 *   3. Thing photos and thumbnails: CacheFirst (immutable per id).
 *   4. The rest of /api: NetworkOnly.
 *   5. Anything the precache missed: StaleWhileRevalidate, never HTML.
 */

/** An SPA fallback's index.html must never be stored as a photo or a script. */
const notHtml = {
  cacheWillUpdate: async ({ response }) => {
    if (!response || response.status !== 200) return null;
    if ((response.headers.get('content-type') || '').includes('text/html')) return null;
    return response;
  },
};

/** True for every Attic URL (the vault, sealed fields, sealed files). */
export const isAtticUrl = (url) => url.pathname === '/api/attic' || url.pathname.startsWith('/api/attic/');

export const runtimeCaching = [
  {
    // FIRST, always: the Attic is never cached, anywhere.
    urlPattern: ({ url }) => url.pathname === '/api/attic' || url.pathname.startsWith('/api/attic/'),
    handler: 'NetworkOnly',
    options: { cacheName: 'attic-no-store' },
  },
  {
    // Auth state must be fresh (PWA_STANDARD §2A).
    urlPattern: ({ url }) =>
      url.pathname === '/api/me' ||
      url.pathname.startsWith('/api/auth/') ||
      url.pathname.startsWith('/api/users/me'),
    handler: 'NetworkOnly',
    options: { cacheName: 'auth-bypass' },
  },
  {
    // Photos and thumbnails. A file's bytes never change under its id
    // (sha256-deduped, new upload = new file), so CacheFirst, capped.
    // The backend serves them `Cache-Control: private`, which the
    // service worker honours for this origin only. Never an Attic file.
    urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/files/') && !url.pathname.startsWith('/api/attic'),
    handler: 'CacheFirst',
    options: {
      cacheName: 'thinggeek-files',
      expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
      cacheableResponse: { statuses: [200] },
      plugins: [notHtml],
    },
  },
  {
    // Everything else under /api is live data.
    urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
    handler: 'NetworkOnly',
    options: { cacheName: 'api-bypass' },
  },
  {
    // Anything the precache missed. Guarded: PWA_STANDARD §1a rule 3. Never /api.
    urlPattern: ({ url, request }) => ['style', 'script', 'font', 'image'].includes(request.destination) && !url.pathname.startsWith('/api/'),
    handler: 'StaleWhileRevalidate',
    options: {
      cacheName: 'thinggeek-assets',
      expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
      plugins: [notHtml],
    },
  },
];

export default runtimeCaching;
