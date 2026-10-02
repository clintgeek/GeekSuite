import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { themePreboot } from '@geeksuite/user/vite';
import path from 'path';
import { runtimeCaching } from './pwa/runtimeCaching.js';

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
        // The SPA shell must never answer for the API, the gateway, or a path
        // with a file extension (a stale hashed asset, sw.js, the manifest) —
        // the server 404s those, and so must the service worker.
        navigateFallbackDenylist: [/^\/api\//, /^\/graphql/, /\/[^/?]+\.[^/]+$/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // pwa/runtimeCaching.js: the Attic first (NetworkOnly, never cached), then auth, photos, /api, assets.
        runtimeCaching,
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
