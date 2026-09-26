import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { themePreboot } from '@geeksuite/user/vite';
import path from 'path';

// ─── Vendor chunking ────────────────────────────────────────────────────────
// Function form, matched on the LAST node_modules/ segment, so it is proxy-
// and pnpm-proof (see apps/fitnessgeek/frontend/vite.config.js for the long
// story). These are all on the first paint; splitting them is a caching win —
// app code changes every deploy, these do not.
const VENDOR_GROUPS = [
  ['react-vendor', /^(react|react-dom|scheduler|react-is|use-sync-external-store|react-router|react-router-dom|@remix-run\/router)\//],
  ['mui', /^(@mui|@emotion)\//],
  ['apollo', /^(@apollo|graphql|graphql-tag|ts-invariant|@wry|optimism|zen-observable-ts|symbol-observable|rehackt)\//],
  ['motion', /^(framer-motion|motion-dom|motion-utils)\//],
];

function manualChunks(id) {
  const marker = 'node_modules/';
  const at = id.lastIndexOf(marker);
  if (at === -1) return undefined;
  const spec = id.slice(at + marker.length);
  for (const [name, test] of VENDOR_GROUPS) {
    if (test.test(spec)) return name;
  }
  return undefined;
}

export default defineConfig({
  plugins: [
    react(),
    themePreboot(),
    // PWA_STANDARD.md flavour A (VitePWA generateSW), the preferred one for new
    // apps: the precache manifest is content-hash revisioned per entry and
    // cleanupOutdatedCaches + skipWaiting/clientsClaim reinstall on every
    // deploy, so there is nothing to stamp by hand.
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      // public/manifest.json (linked in index.html) is the single source; an
      // inline manifest here would emit a second <link rel="manifest">.
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // The SPA shell must never answer for the API or the gateway.
        navigateFallbackDenylist: [/^\/api\//, /^\/graphql/],
        runtimeCaching: [
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
            // Covers. `coverUrl` is cache-busted by updatedAt, so a cached
            // byte-for-byte copy is always the right one — CacheFirst, capped.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && /^\/api\/games\/[^/]+\/cover$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'gamegeek-covers',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  // An SPA fallback's index.html must never be stored as art.
                  cacheWillUpdate: async ({ response }) => {
                    if (!response || response.status !== 200) return null;
                    if ((response.headers.get('content-type') || '').includes('text/html')) return null;
                    return response;
                  },
                },
              ],
            },
          },
          {
            // Everything else under /api is live data.
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            options: { cacheName: 'api-bypass' },
          },
          {
            // Anything the precache missed (fonts outside globPatterns, a
            // cross-origin script). Guarded: PWA_STANDARD §1a rule 3.
            urlPattern: ({ request }) => ['style', 'script', 'font', 'image'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'gamegeek-assets',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              plugins: [
                {
                  cacheWillUpdate: async ({ response }) => {
                    if (!response || response.status !== 200) return null;
                    if ((response.headers.get('content-type') || '').includes('text/html')) return null;
                    return response;
                  },
                },
              ],
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 1811,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://localhost:1810', changeOrigin: true, secure: false },
      '/graphql': { target: 'http://localhost:3002', changeOrigin: true, secure: false },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: { output: { manualChunks } },
  },
  define: {
    'import.meta.env.VITE_BASEGEEK_URL': JSON.stringify('https://basegeek.clintgeek.com'),
  },
  resolve: {
    alias: {
      '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js'),
      // The library machinery (filters, URL state, paged list), from source
      // like packages/ui. Its /server entry is gateway-only and never imported here.
      '@geeksuite/collection': path.resolve(__dirname, '../../../packages/collection/src/index.js'),
    },
    // MANDATORY. packages/ui and packages/collection are compiled from source
    // (aliases above) and pnpm can materialize a private @mui/material for a
    // package's peer range; two MUI copies split the theme context and the
    // shell renders unthemed. Force one copy of MUI, React and the router.
    //
    // @apollo/client is deliberately NOT here (yet): packages/collection
    // already resolves the app's own copy, but @geeksuite/api-client resolves
    // a second one (a graphql@16.13.0 peer variant), and deduping would fold
    // it in — a real bundle change (-27 kB) that belongs in its own commit,
    // not in a behaviour-identical extraction. They share Apollo's global
    // context symbol, which is why two copies work today.
    dedupe: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled', 'react', 'react-dom', 'react-router-dom'],
  },
});
