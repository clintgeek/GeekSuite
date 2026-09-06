import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import { themePreboot } from '@geeksuite/user/vite';

// ─── Vendor chunking ────────────────────────────────────────────────────────
//
// Before this, bujogeek shipped ONE 1605 kB chunk: no `manualChunks`, no route
// splitting. Two rules from fitnessgeek's pass (`apps/fitnessgeek/DOCS/
// CONTEXT.md` § Frontend — Bundle) apply here verbatim.
//
// 1. Use the FUNCTION form. The object form (`{ vendor: ['react'] }`) matches
//    by resolved module id, and react / react-dom arrive through
//    @rollup/plugin-commonjs proxy modules whose ids never equal the bare
//    specifier — so the group silently comes out empty. Matching on the path is
//    proxy-proof and pnpm-proof: ids look like
//    `…/node_modules/.pnpm/<hash>/node_modules/<pkg>/…`, so the LAST
//    `node_modules/` segment is the one that names the package.
//
// 2. Only group a package whose consumers you have checked. A group referenced
//    from the eager entry becomes an eager chunk, so grouping something the
//    shell needs alongside something only one route needs drags the second onto
//    the first load. That is why `@mui/x-date-pickers` is named NOWHERE below —
//    `App.jsx` imports `LocalizationProvider` + `AdapterDateFns` eagerly while
//    `DatePicker`/`DateTimePicker` are route-only, and leaving the package
//    unclaimed lets rollup split it at module granularity along exactly that
//    line. Grouping it would have put all of it on the first load.
//
// Order matters — first match wins.
const VENDOR_GROUPS = [
  // Eager: on the first paint no matter which route you land on. Splitting them
  // apart is a caching win, not a byte win — app code changes every deploy,
  // these do not.
  ['react-vendor', /^(react|react-dom|scheduler|react-is|use-sync-external-store|react-router|react-router-dom|@remix-run\/router)\//],
  // NO `mui` GROUP — the opposite of what fitnessgeek needed, so it is measured,
  // not assumed. Same tree, four configurations, 2026-09-05 (KiB; "/today" is
  // the shell plus the transitive static closure of the TodayPage chunk, i.e.
  // what a user landing on the default route actually downloads):
  //
  //   grouping of @mui                     shell first load   /today   entry
  //   ----------------------------------   ----------------   ------   -----
  //   none — this config                   1010.1 / gz 310    1324.0   449.4
  //   @mui/system+utils+emotion only       1030.6 / gz 317       —     384.1
  //   explicit @mui/material+system+...    1087.4 / gz 335    1339.2   165.3
  //   naive /^(@mui|@emotion)\// regex      1261.5 / gz 383    1343.4   ~165
  //
  // A manual chunk is eager the moment ANY eager module reaches it, so a `mui`
  // group puts every @mui/material component the app uses ANYWHERE on the first
  // load — including the ones only TaskEditor and the date pickers touch.
  // Leaving @mui unclaimed lets rollup split it at module granularity: the
  // shell's components go eager, the route-only ones ride their route's chunk.
  // It wins on both columns that matter, so no group it is.
  //
  // The last row is the live demonstration of rule 2 above: `/^(@mui|@emotion)\//`
  // also swallows `@mui/x-date-pickers`, and because `App.jsx` imports
  // `LocalizationProvider` eagerly the whole picker tree (~136 kB, the
  // `useMobilePicker` chunk) gets dragged onto the first load.
  //
  // fitnessgeek's `mui` group is load-bearing for the opposite reason: without a
  // MUI chunk boundary rollup hoisted its chart vendors (nivo, recharts) into
  // the entry's graph. bujogeek has no chart library, and the first-load list
  // confirms `markdown` and the pickers stay async without one. **If a heavy
  // route-only vendor is ever added here, re-measure before trusting this.**
  //
  // The trade: app code changes every deploy, so the 449 kB entry (gz 139) is
  // re-fetched every deploy, ~284 kB of it MUI that did not change. The explicit
  // `mui` group would keep that slice cached across deploys at the cost of 77 kB
  // on a cold load and 15 kB on /today. Adding
  //   ['mui', /^(@mui\/(material|system|base|utils|styled-engine|private-theming|icons-material)|@emotion)\//],
  // back to this list — note: NOT the naive regex — is the one-line flip if
  // repeat-visit bytes ever matter more than the cold ones.
  ['apollo', /^(@apollo|graphql|graphql-tag|ts-invariant|@wry|optimism|zen-observable-ts|symbol-observable|rehackt)\//],
  // framer-motion is pulled by packages/ui's GeekAppFrame (the route
  // transition), so it is eager whatever app code does.
  ['motion', /^(framer-motion|motion-dom|motion-utils)\//],

  // Leaf groups. Both are named for the reason fitnessgeek documented: a module
  // NO group claims can be folded by rollup into a manual chunk that already
  // needs it, which then makes that whole chunk a dependency of everything else
  // that needs the module. Naming each keeps it a small shared leaf instead.
  //
  // `date-fns` ends up EAGER — `AdapterDateFns` is imported by App.jsx's
  // app-wide `LocalizationProvider`, and app code formats dates in the shell —
  // but naming it still stops rollup welding all 47 kB into whichever route
  // chunk happened to reach it first.
  ['date-fns', /^date-fns\//],
  // react-markdown's whole unified/remark/micromark/mdast/hast tail. Reached
  // only through the `React.lazy` TemplatePreview island in
  // components/templates/TemplateApplier.jsx, so this chunk is fetched when a
  // template preview actually renders — never on load. Confirm after any change
  // that it is absent from dist/index.html's modulepreload list.
  ['markdown', /^(react-markdown|remark-[a-z-]+|micromark[a-z0-9-]*|mdast-util-[a-z-]+|hast-util-[a-z-]+|unified|unist-util-[a-z-]+|vfile[a-z-]*|property-information|space-separated-tokens|comma-separated-tokens|html-url-attributes|character-entities[a-z-]*|decode-named-character-reference|estree-util-is-identifier-name|markdown-table|longest-streak|zwitch|ccount|trim-lines|devlop|bail|trough|is-plain-obj|extend|style-to-js|style-to-object|inline-style-parser)\//],
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


// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [
      react(),
      themePreboot(),
      VitePWA({
        injectRegister: false,
        registerType: 'autoUpdate',
        manifest: false,
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // Push reminders need `push` / `notificationclick` handlers inside the
          // service worker. Rather than switching the whole PWA to
          // injectManifest (which would make us own precaching by hand), we keep
          // generateSW and pull the handlers in via workbox's own importScripts.
          // The path is relative to the generated sw.js, so it survives the
          // production `base: '/client/dist/'` rewrite. Source: public/push-sw.js.
          importScripts: ['push-sw.js'],
          // push-sw.js is imported, never fetched as a page asset — precaching a
          // copy of it would only duplicate bytes and invalidate on every build.
          globIgnores: ['push-sw.js'],
          runtimeCaching: [
            {
              // Auth endpoints must NEVER be cached
              urlPattern: ({ url }) =>
                url.pathname === '/api/me' ||
                url.pathname.startsWith('/api/auth/') ||
                url.pathname.startsWith('/api/users/me'),
              handler: 'NetworkOnly',
              options: { cacheName: 'auth-bypass' }
            }
          ],
        },
        devOptions: {
          enabled: false,
        },
      })
    ],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: isProduction
            ? `http://backend:${ process.env.BACKEND_PORT || 5000 }`
            : 'http://localhost:5005',
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
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: !isProduction,
      base: isProduction ? '/client/dist/' : '/',
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js'),
        '@geeksuite/utils': path.resolve(__dirname, '../../../packages/utils/src/index.js'),
      },
      // packages/ui is compiled from source (alias above), and pnpm materializes
      // its own @mui/material@5 to satisfy the package's peer range. Without
      // dedupe, the shell bundles MUI 5 (unthemed, light) beside the app's
      // MUI 7 — dark mode renders a light content pane. Force one copy of the
      // theme-context-bearing packages: always the app's.
      dedupe: ['@mui/material', '@emotion/react', '@emotion/styled', 'react', 'react-dom'],
    },
  }
});