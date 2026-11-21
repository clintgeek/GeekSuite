/**
 * GeekDay's service-worker runtime caching (VitePWA generateSW; PWA_STANDARD
 * flavour A). Its own module so a unit test can run every route against the
 * requests that matter (src/__tests__/pwa/runtimeCaching.test.js) and
 * tools/pwa-audit.mjs can check the built sw.js.
 *
 * Every urlPattern is SELF-CONTAINED: generateSW copies each function's
 * source into sw.js, so it may not call anything defined in this module.
 *
 * Workbox takes the FIRST route that matches, so order is the rule:
 *   1. Auth state: NetworkOnly (PWA_STANDARD §2A), always first.
 *   2. The rest of /api: NetworkOnly.
 *   3. Anything the precache missed: StaleWhileRevalidate, never HTML.
 */

/** An SPA fallback's index.html must never be stored as a script or style. */
const notHtml = {
  cacheWillUpdate: async ({ response }) => {
    if (!response || response.status !== 200) return null;
    if ((response.headers.get('content-type') || '').includes('text/html')) return null;
    return response;
  },
};

export const runtimeCaching = [
  {
    // FIRST, always: auth state must be fresh (PWA_STANDARD §2A).
    urlPattern: ({ url }) =>
      url.pathname === '/api/me' ||
      url.pathname.startsWith('/api/auth/') ||
      url.pathname.startsWith('/api/users/me'),
    handler: 'NetworkOnly',
    options: { cacheName: 'auth-bypass' },
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
      cacheName: 'geekday-assets',
      expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
      plugins: [notHtml],
    },
  },
];

export default runtimeCaching;
