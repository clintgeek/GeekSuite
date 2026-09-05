import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { themePreboot } from "@geeksuite/user/vite";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// ─── Vendor chunking ────────────────────────────────────────────────────────
//
// Before this (2026-09-05) flockgeek shipped ONE 1060 kB chunk: no
// `manualChunks` at all and every route imported statically by `App.jsx`.
//
// Use the FUNCTION form, never the object form. The object form matches by
// resolved module id, which silently misses CommonJS packages — react and
// react-dom arrive through @rollup/plugin-commonjs proxy modules whose ids
// never equal the bare specifier, so `{ vendor: ['react', 'react-dom'] }`
// emits an empty chunk while react-dom rides along inside whatever chunk
// happened to reach it first (fitnessgeek, f61f7ce). Matching on the path is
// proxy-proof and pnpm-proof: ids look like
// `…/node_modules/.pnpm/<hash>/node_modules/<pkg>/…`, so the LAST
// `node_modules/` segment is the one that names the package.
//
// Order matters — first match wins.
//
// Everything below is EAGER on purpose: react/router, MUI, Apollo and
// framer-motion are all on flockgeek's first paint already (`main.jsx` mounts
// `GeekSuiteApolloProvider`; `LayoutShell` mounts `GeekAppFrame`, which is a
// framer-motion element). Splitting them apart is a CACHING win rather than a
// byte win — app code re-hashes every deploy, these do not, so a deploy that
// touches only `pages/BirdsPage.jsx` no longer invalidates 1 MB of vendor.
//
// The `mui` group is a deliberate, MEASURED trade, not a copy of the recipe.
// Measured 2026-09-05 (first load = index.html's own script + every
// modulepreload it lists, raw / gzip):
//   with the mui group     1011.2 kB / 312.0 kB, app entry chunk  90 kB
//   without the mui group   979.9 kB / 302.7 kB, app entry chunk 372 kB
// Dropping the group is 31 kB cheaper cold, because the MUI components only
// the lazy routes use (Table, Accordion, Pagination…) then follow those
// routes into their own chunks. It costs far more warm: MUI folds into the
// app entry chunk, so every deploy — and flockgeek deploys on every push to
// main — re-downloads 372 kB instead of 90 kB, to a daily-use data-entry app
// whose users are repeat visitors. Keeping the group. (Splitting
// `@mui/icons-material` back out of the group was also measured: 1008.1 kB,
// i.e. noise — the icons are deep-imported one file at a time already.)
//
// Note this is the OPPOSITE call from fitnessgeek (f61f7ce), where the mui
// group is load-bearing for the async side: without a MUI chunk boundary
// rollup hoisted its chart vendors onto the first load. flockgeek has no
// chart vendors, so there is no weld to break here — only the cache trade.
//
// flockgeek has no chart library, no date library and no PDF/canvas exporter,
// so there is no async vendor group here and nothing to `await import()`
// inside a handler. If one is ever added, give it its own group and verify it
// stays OUT of dist/index.html's modulepreload list.
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


// ─── Service-worker precache manifest ───────────────────────────────────────
//
// flockgeek ships a hand-rolled `public/sw.js` (PWA_STANDARD.md flavour B),
// which has no build step of its own — so its precache list was three static
// URLs and every hashed chunk was merely cached opportunistically on first
// fetch. With route-level `lazy()` that is not enough: a client running the
// previous deploy asks for a chunk hash the server has deleted the moment the
// user opens a route they had not visited, gets the SPA fallback's 404, and
// the dynamic import rejects. PWA_STANDARD.md §1a: every hashed .js/.css must
// be precached or fetched network-first. This plugin is the precache half —
// the same thing VitePWA's `generateSW` does for the Workbox apps.
//
// It rewrites the two placeholder constants at the top of `dist/sw.js` only
// (never `public/sw.js`), so the dev server keeps serving the source file.
// Fonts are deliberately left out: 38 hashed woff/woff2 would put ~700 kB of
// blocking traffic into `install`, and the fetch handler's `text/html` guard
// already keeps a SPA-fallback response from poisoning them.
function swPrecache() {
  let outDir = "dist";
  return {
    name: "flockgeek-sw-precache",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const root = path.resolve(__dirname, outDir);
      const swPath = path.join(root, "sw.js");
      const assetsDir = path.join(root, "assets");
      if (!fs.existsSync(swPath) || !fs.existsSync(assetsDir)) return;

      const urls = fs
        .readdirSync(assetsDir)
        .filter((f) => f.endsWith(".js") || f.endsWith(".css"))
        .sort()
        .map((f) => `/assets/${f}`);
      const buildId = crypto
        .createHash("sha1")
        .update(urls.join("\n"))
        .digest("hex")
        .slice(0, 8);

      const src = fs.readFileSync(swPath, "utf8");
      const stamped = src
        .replace(/^const BUILD_ID = ".*";$/m, `const BUILD_ID = "${buildId}";`)
        .replace(
          /^const PRECACHE_ASSETS = \[\];$/m,
          `const PRECACHE_ASSETS = ${JSON.stringify(urls)};`
        );
      if (stamped === src) {
        // A rename in public/sw.js that silently stops the stamping would be
        // invisible at runtime until a deploy broke someone's route.
        this.error("sw.js precache placeholders not found — did they get renamed?");
      }
      fs.writeFileSync(swPath, stamped);
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), themePreboot(), swPrecache()],
    server: {
      port: 5173,
      open: false,
      allowedHosts: ['localhost', 'flockgeek.clintgeek.com'],
      proxy: {
        "/api": {
          // Default proxy target should match backend `env.port` (5001)
          target: env.VITE_DEV_API_PROXY || "http://localhost:4094",
          changeOrigin: true
        },
        "/graphql": {
          target: "http://localhost:3002",
          changeOrigin: true
        }
      }
    },
    preview: {
      port: 4173
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks
        }
      }
    },
    resolve: {
      alias: {
        '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js'),
        '@geeksuite/utils': path.resolve(__dirname, '../../../packages/utils/src/index.js')
      },
      // packages/ui is compiled from source (alias above) and pnpm materializes
      // a private @mui/material for its peer range; two MUI copies split the
      // theme context (shell renders unthemed). Force the app's single copy.
      // Verified 2026-09-05: with this list the build resolves exactly one
      // @mui/material tree (one .pnpm root), so the `mui` chunk above is one
      // copy, not two.
      dedupe: ['@mui/material', '@emotion/react', '@emotion/styled', 'react', 'react-dom']
    }
  };
});
