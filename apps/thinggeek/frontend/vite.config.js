import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { themePreboot } from '@geeksuite/user/vite';
import path from 'path';

// ─── Vendor chunking ────────────────────────────────────────────────────────
// Same function form as GameGeek: matched on the LAST node_modules/ segment,
// so it is pnpm-proof. These are all on the first paint; splitting them is a
// caching win — app code changes every deploy, these do not.
const VENDOR_GROUPS = [
  ['react-vendor', /^(react|react-dom|scheduler|react-is|use-sync-external-store|react-router|react-router-dom|@remix-run\/router)\//],
  ['mui', /^(@mui|@emotion)\//],
  ['apollo', /^(@apollo|graphql|graphql-tag|ts-invariant|@wry|optimism|zen-observable-ts|symbol-observable|rehackt)\//],
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

/** An SPA fallback's index.html must never be stored as a photo or a script. */
const notHtml = {
  cacheWillUpdate: async ({ response }) => {
    if (!response || response.status !== 200) return null;
    if ((response.headers.get('content-type') || '').includes('text/html')) return null;
    return response;
  },
};

export default defineConfig({
  plugins: [
    react(),
    themePreboot(),
    // PWA_STANDARD.md flavour A (VitePWA generateSW), like GameGeek.
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      // public/manifest.json (linked in index.html) is the single source.
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
            // Photos and thumbnails. A file's bytes never change under its id
            // (sha256-deduped, new upload = new file), so CacheFirst, capped.
            // The backend serves them `Cache-Control: private`, which the
            // service worker honours for this origin only.
            urlPattern: ({ url, request }) => request.method === 'GET' && url.pathname.startsWith('/api/files/'),
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
            // Anything the precache missed. Guarded: PWA_STANDARD §1a rule 3.
            urlPattern: ({ request }) => ['style', 'script', 'font', 'image'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'thinggeek-assets',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              plugins: [notHtml],
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 1821,
    host: '0.0.0.0',
    proxy: {
      '/api': { target: 'http://localhost:1820', changeOrigin: true, secure: false },
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
      '@geeksuite/collection': path.resolve(__dirname, '../../../packages/collection/src/index.js'),
    },
    // MANDATORY (see GameGeek's vite.config): packages/ui and
    // packages/collection compile from source, and two MUI copies split the
    // theme context. One copy of MUI, React and the router.
    dedupe: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled', 'react', 'react-dom', 'react-router-dom'],
  },
});
