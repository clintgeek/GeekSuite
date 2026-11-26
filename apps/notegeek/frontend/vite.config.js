import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { themePreboot } from '@geeksuite/user/vite';

/**
 * Mermaid (diagrams in Typed notes, DOCS/CONTEXT.md §27) is a dynamic import
 * of several megabytes used now and then. Every chunk that only Mermaid
 * reaches is written under assets/mermaid/, which the service worker leaves
 * out of the precache (installing the app must not download it) and caches
 * on first use instead (the runtime rule below). A module the app also
 * reaches without going through Mermaid stays in the ordinary, precached
 * chunks, so leaving these out can never break the app offline.
 */
export const MERMAID_DIR = 'assets/mermaid/';
const IN_MERMAID = /[\\/]node_modules[\\/]mermaid[\\/]/;

function mermaidChunks() {
  let mermaidOnly = new Set();
  return {
    name: 'notegeek-mermaid-chunks',
    apply: 'build',
    buildEnd() {
      // Everything the app reaches without entering the mermaid package.
      const reached = new Set();
      const stack = [...this.getModuleIds()].filter((id) => this.getModuleInfo(id)?.isEntry);
      while (stack.length) {
        const id = stack.pop();
        if (reached.has(id) || IN_MERMAID.test(id)) continue;
        reached.add(id);
        const info = this.getModuleInfo(id);
        if (info) stack.push(...info.importedIds, ...info.dynamicallyImportedIds);
      }
      mermaidOnly = new Set([...this.getModuleIds()].filter((id) => !reached.has(id)));
    },
    outputOptions(options) {
      const fallback = options.chunkFileNames || 'assets/[name]-[hash].js';
      return {
        ...options,
        chunkFileNames: (chunk) => {
          const ids = chunk.moduleIds || [];
          if (ids.length && ids.every((id) => mermaidOnly.has(id))) return `${MERMAID_DIR}[name]-[hash].js`;
          return typeof fallback === 'function' ? fallback(chunk) : fallback;
        },
      };
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const apiUrl = isProd ? 'https://notegeek.clintgeek.com/api' : 'http://localhost:9988/api';

  return {
    plugins: [
      react(),
      themePreboot(),
      mermaidChunks(),
      VitePWA({
        injectRegister: false,
        registerType: 'autoUpdate',
        // Icons: public/icons/ (masters + PNGs rendered by tools/pwa-icons.mjs);
        // favicon.ico stays at the root because browsers ask for it there.
        manifest: {
          id: '/',
          name: 'NoteGeek',
          short_name: 'NoteGeek',
          description: 'An engineer\'s notebook: notes, markdown, code, mind maps and sketches — part of GeekSuite',
          theme_color: '#F1F4EF',
          background_color: '#E9EEE7',
          display: 'standalone',
          orientation: 'any',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
          ],
          start_url: '/',
          scope: '/',
          categories: ['productivity', 'utilities'],
          // Long-press shortcuts on the installed icon. One icon size is
          // enough (Chromium accepts a single one).
          shortcuts: [
            {
              name: 'New note',
              short_name: 'New note',
              url: '/notes/new',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            },
            {
              name: 'Photo of a page',
              short_name: 'Photo',
              url: '/notes/photo',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            },
            {
              name: 'Search',
              short_name: 'Search',
              url: '/search',
              icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
            }
          ],
          // Android "Share -> NoteGeek". GET-only (title/text/url); see the
          // note below for why shared images aren't handled.
          share_target: {
            action: '/share',
            method: 'GET',
            params: {
              title: 'title',
              text: 'text',
              url: 'url'
            }
          }
        },
        // Image sharing would need `method: 'POST'` +
        // `enctype: 'multipart/form-data'` on share_target and a service
        // worker that intercepts that POST, stores the file, and redirects
        // to /share — which in turn needs `strategies: 'injectManifest'`
        // (a hand-written SW `fetch` handler; `generateSW` cannot express
        // "intercept this one POST route"). notegeek's SW is flavour A
        // (VitePWA/generateSW, DOCS/PWA_STANDARD.md §2) specifically because
        // its precache manifest, cleanupOutdatedCaches/skipWaiting/
        // clientsClaim wiring, and tools/pwa-audit.mjs's flavour-A checks
        // all assume `generateSW`'s shape. Switching strategies to gain one
        // feature would touch the update-survives-a-deploy guarantee
        // PWA_STANDARD.md §1a documents for this exact app, for a payload
        // (a photo shared from the OS share sheet) that "Photo of a page"
        // (DOCS/HANDWRITING.md §3) already covers by a more deliberate,
        // multi-page path. Decision: GET-only, text/url. Follow-up if image
        // sharing turns out to be wanted: add a second, narrowly-scoped
        // `injectManifest` entry point rather than converting the app's main
        // SW, so the generateSW guarantees above stay intact.
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          // Mermaid's chunks: cached on first use (runtime rule), not installed.
          globIgnores: [`${MERMAID_DIR}**`],
          // The HandwrittenEditor (tldraw) chunk is ~1 MB; the default 2 MiB cap
          // silently drops anything bigger from the precache. 4 MiB is headroom,
          // and tools/pwa-audit.mjs fails CI if a hashed chunk still misses.
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // The SPA shell must never answer for the API, the gateway, or a
          // path with a file extension (a stale hashed asset, sw.js, the
          // manifest) — the server 404s those, and so must the SW.
          navigateFallbackDenylist: [/^\/api\//, /^\/graphql/, /\/[^/?]+\.[^/]+$/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => {
                return url.pathname === '/api/me' ||
                  url.pathname.startsWith('/api/auth/') ||
                  url.pathname.startsWith('/api/users/me');
              },
              handler: 'NetworkOnly',
              options: {
                cacheName: 'auth-bypass'
              }
            },
            {
              // Mermaid's chunks (left out of the precache above). Hashed
              // names never change content, so cache-first; a text/html
              // answer (an SPA fallback) is never stored as a script
              // (DOCS/PWA_STANDARD.md §1a rule 2).
              urlPattern: ({ url }) => url.pathname.startsWith('/assets/mermaid/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'notegeek-mermaid',
                expiration: { maxEntries: 120, maxAgeSeconds: 60 * 24 * 60 * 60 },
                plugins: [{
                  cacheWillUpdate: async ({ response }) => {
                    if (!response || response.status !== 200) return null;
                    if ((response.headers.get('content-type') || '').includes('text/html')) return null;
                    return response;
                  }
                }]
              }
            },
            {
              urlPattern: ({ url }) => {
                // Match both relative and absolute API URLs
                return url.pathname.startsWith('/api/') ||
                  url.href.startsWith('https://notegeek.clintgeek.com/api/');
              },
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                networkTimeoutSeconds: 10,
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 24 * 60 * 60 // 24 hours
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: !isProd,
          type: 'module'
        }
      })
    ],
    server: {
      port: 5173,
      host: '0.0.0.0', // Allow external access
      proxy: {
        '/api': {
          target: 'http://localhost:9988',
          changeOrigin: true,
          secure: false,
          ws: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Copy Origin header to the proxy request
              if (req.headers.origin) {
                proxyReq.setHeader('Origin', req.headers.origin);
              }
            });
          }
        },
        '/graphql': {
          target: 'http://localhost:3002',
          changeOrigin: true,
          secure: false,
          ws: true
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    optimizeDeps: {
      // jwt-decode: small CJS dep the scanner otherwise finds late.
      // @mui/material/styles + the emotion pair: notegeek's entry graph is
      // the heaviest in the suite (tldraw has a deep dynamic import graph of
      // its own), which makes esbuild's scanner
      // discover MUI's styled() chain across more than one optimize pass
      // ("Re-optimizing dependencies..."). Each pass can re-split chunks
      // differently, and MUI's styles module is lazy-initialized (CJS
      // interop wraps it in an __esm() block) — if the chunk that calls
      // init_styled() isn't guaranteed to run before the chunk that calls
      // styled_default(), the latter throws "styled_default is not a
      // function". Forcing these into the *first* scan pins one stable
      // chunk graph instead of letting late discovery reshuffle it.
      include: ['jwt-decode', '@mui/material/styles', '@emotion/react', '@emotion/styled']
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl)
    },
    resolve: {
      alias: {
        '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js')
      },
      // packages/ui is compiled from source (alias above), and pnpm materializes
      // a private @mui/material@5 to satisfy that package's peer range. Without
      // dedupe the shell bundles MUI 5 (unthemed, default-light) beside the
      // app's MUI 7, splitting the theme context — dark mode renders light
      // panes. Force a single copy of the context-bearing packages: the app's.
      dedupe: ['@mui/material', '@emotion/react', '@emotion/styled', 'react', 'react-dom']
    }
  };
});
