import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { themePreboot } from '@geeksuite/user/vite'
import path from 'path'

// ─── Vendor chunking ────────────────────────────────────────────────────────
//
// The OBJECT form of `manualChunks` matches by resolved module id, which
// silently misses CommonJS packages: react / react-dom arrive through
// @rollup/plugin-commonjs proxy modules whose ids never equal the bare
// specifier. The old `vendor: ['react', 'react-dom']` entry therefore emitted
// a 0.03 kB chunk while react-dom (130 kB raw) rode along inside the `mui`
// chunk — so every MUI bump invalidated react-dom's cache and vice versa.
//
// The function form matches on the path instead, which is proxy-proof and
// pnpm-proof (ids look like `…/node_modules/.pnpm/<hash>/node_modules/<pkg>/…`,
// so the LAST `node_modules/` segment is the one that names the package).
//
// Order matters — first match wins. Only add a group whose members are used
// by exactly one part of the app: a group referenced from the eager entry
// becomes an eager chunk, so putting a chart library in with something the
// shell needs would drag it onto the first load.
const VENDOR_GROUPS = [
  // Eager. Everything in `react-vendor`/`mui`/`apollo`/`motion` is on the
  // first paint already; splitting them apart is a caching win, not a
  // byte win — app code changes every deploy, these do not.
  //
  // `mui` is also load-bearing for the ASYNC side, which is not obvious.
  // Measured 2026-09-05: dropping this one group and letting rollup place
  // @mui itself pushed the eager payload from 991 kB to 1439 kB and — worse —
  // dragged `nivo` (303 kB) and `recharts` (269 kB) onto the first load, because
  // without a MUI chunk boundary rollup's automatic grouping hoisted the chart
  // vendors into the entry's graph. Do not "simplify" this away.
  ['react-vendor', /^(react|react-dom|scheduler|react-is|use-sync-external-store|react-router|react-router-dom|@remix-run\/router)\//],
  ['mui', /^(@mui|@emotion)\//],
  ['apollo', /^(@apollo|graphql|graphql-tag|ts-invariant|@wry|optimism|zen-observable-ts|symbol-observable|rehackt)\//],
  ['motion', /^(framer-motion|motion-dom|motion-utils)\//],

  // On demand. Reached only from lazy route chunks, so these stay async —
  // verify after any change that they are absent from dist/index.html's
  // modulepreload list.
  //
  // `date-fns` and `d3` are split out for a reason that only shows up in the
  // chunk graph. A module NOT claimed by a group here can be folded by rollup
  // into a manual chunk that already needs it — which then makes that whole
  // chunk a dependency of everything else that needs the module:
  //   - date-fns landed inside `chartjs`, so /weight (which only wants
  //     differenceInWeeks) statically imported all 217 kB of chart.js.
  //   - the shared d3 packages landed inside `nivo`, so the `recharts` chunk
  //     imported `nivo`, and one Recharts heart-rate chart cost 574 kB.
  // Naming them makes each a small leaf that both chart libraries can share.
  ['date-fns', /^date-fns\//],
  ['lodash', /^lodash(-es)?\//],
  // delaunator + robust-predicates are d3-delaunay's deps, not Nivo's. Leaving
  // them in the `nivo` group put a d3 -> nivo edge in the chunk graph on top of
  // the nivo -> d3 one, so the cycle made every d3 consumer pull all of Nivo.
  ['d3', /^(d3-[a-z0-9-]+|internmap|delaunator|robust-predicates)\//],
  ['nivo', /^(@nivo|@react-spring|react-virtualized-auto-sizer|use-debounce)\//],
  ['recharts', /^(recharts|recharts-scale|victory-vendor|decimal\.js-light|@reduxjs\/toolkit|react-redux|redux|redux-thunk|immer|reselect)\//],
  ['chartjs', /^(chart\.js|react-chartjs-2|chartjs-adapter-date-fns|@kurkle)\//],
]

function manualChunks(id) {
  const marker = 'node_modules/'
  const at = id.lastIndexOf(marker)
  if (at === -1) return undefined
  const spec = id.slice(at + marker.length)
  for (const [name, test] of VENDOR_GROUPS) {
    if (test.test(spec)) return name
  }
  return undefined
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    themePreboot(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      // Single source of truth is public/manifest.json (linked in index.html).
      // An inline manifest here would make VitePWA emit its own
      // manifest.webmanifest + <link rel="manifest">, producing two
      // conflicting manifest links in the built index.html.
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Auth endpoints must NEVER be cached — stale /api/me causes ghost sessions
            urlPattern: ({ url }) =>
              url.pathname === '/api/me' ||
              url.pathname.startsWith('/api/auth/') ||
              url.pathname.startsWith('/api/users/me'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'auth-bypass'
            }
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'fitnessgeek-api',
              networkTimeoutSeconds: 5,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 5
              }
            }
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fitnessgeek-images',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          },
          {
            urlPattern: ({ request }) => ['script', 'style', 'font'].includes(request.destination),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'fitnessgeek-assets',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 7
              },
              plugins: [
                {
                  // SPA-fallback poisoning guard (DOCS/CONTEXT.md landmine).
                  //
                  // The backend's `GET *` catch-all in backend/src/app.js
                  // answers ANY unknown path with index.html, 200 text/html —
                  // including a hashed asset path that a deploy has just
                  // deleted. StaleWhileRevalidate would then store that HTML
                  // under the stylesheet's/script's/font's URL and serve it
                  // forever, and the app renders unstyled until the user
                  // clears site data.
                  //
                  // Every hashed .js/.css is precached, so the exposure is the
                  // 38 hashed @fontsource .woff/.woff2 files (generateSW's
                  // globPatterns do not match them) plus the cross-origin
                  // ZXing script BarcodeScanner appends. Returning null from
                  // cacheWillUpdate declines the write: the response still
                  // reaches the page, it just never becomes the cached copy.
                  //
                  // This is a mitigation, not the cure. The cure is the
                  // extname-404 guard in the Express fallback, which
                  // bujogeek/notegeek/bookgeek have and fitnessgeek does not.
                  cacheWillUpdate: async ({ response }) => {
                    if (!response || response.status !== 200) return null;
                    const type = response.headers.get('content-type') || '';
                    if (type.includes('text/html')) return null;
                    return response;
                  }
                }
              ]
            }
          }
        ]
      }
    })
  ],
  resolve: {
    // `@mui/material` belongs here even though the app declares it directly:
    // packages/ui peers on MUI ^5 and pnpm materializes it its own copy, so
    // without the dedupe the bundle carried TWO @mui/material 5.18.0 trees
    // (Tooltip, Chip, InputBase, Select, Button, Popover, createStyled all
    // appeared twice) and GeekShell/GeekAppFrame rendered through a MUI
    // ThemeContext the app's ThemeProvider never reaches. Suite standard —
    // bujogeek, notegeek, flockgeek and storygeek all carry the same list.
    // Do NOT list `@mui/system` explicitly: deduping `@mui/material` makes its
    // nested `@mui/system` a singleton transitively, while naming it here
    // breaks resolution (pnpm does not hoist it to a root-resolvable path).
    dedupe: ['@mui/material', '@emotion/react', '@emotion/styled', 'react', 'react-dom'],
    alias: {
      '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js'),
      '@geeksuite/utils': path.resolve(__dirname, '../../../packages/utils/src/index.js'),
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      '@emotion/react': path.resolve(__dirname, './node_modules/@emotion/react'),
      '@emotion/styled': path.resolve(__dirname, './node_modules/@emotion/styled')
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5002',
        changeOrigin: true,
        secure: false,
      },
      '/graphql': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks
      }
    }
  },
  // PWA configuration
  publicDir: 'public',
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.svg', '**/*.ico'],
})
