import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { themePreboot } from '@geeksuite/user/vite'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

// ─── Service-worker precache manifest ───────────────────────────────────────
//
// storygeek ships a hand-rolled `public/sw.js` (PWA_STANDARD.md flavour B),
// which has no build step of its own — its precache list was three static
// URLs under a constant cache name, so a new deploy never reinstalled the SW
// and every hashed chunk was merely cached opportunistically on first fetch.
// PWA_STANDARD.md §1a: every hashed .js/.css must be precached or fetched
// network-first. This plugin is the precache half — the same thing
// VitePWA's `generateSW` does for the Workbox apps (see flockgeek, 115fb03).
//
// It rewrites the two placeholder constants at the top of `dist/sw.js` only
// (never `public/sw.js`), so the dev server keeps serving the source file.
function swPrecache() {
  let outDir = 'dist';
  return {
    name: 'storygeek-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const root = path.resolve(__dirname, outDir);
      const swPath = path.join(root, 'sw.js');
      const assetsDir = path.join(root, 'assets');
      if (!fs.existsSync(swPath) || !fs.existsSync(assetsDir)) return;

      const urls = fs
        .readdirSync(assetsDir)
        .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
        .sort()
        .map((f) => `/assets/${f}`);
      const buildId = crypto
        .createHash('sha1')
        .update(urls.join('\n'))
        .digest('hex')
        .slice(0, 8);

      const src = fs.readFileSync(swPath, 'utf8');
      const stamped = src
        .replace(/^const BUILD_ID = ".*";$/m, `const BUILD_ID = "${buildId}";`)
        .replace(
          /^const PRECACHE_ASSETS = \[\];$/m,
          `const PRECACHE_ASSETS = ${JSON.stringify(urls)};`
        );
      if (stamped === src) {
        // A rename in public/sw.js that silently stops the stamping would be
        // invisible at runtime until a deploy broke someone's route.
        this.error('sw.js precache placeholders not found — did they get renamed?');
      }
      fs.writeFileSync(swPath, stamped);
    }
  };
}

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    plugins: [react(), themePreboot(), swPrecache()],
    // Force a SINGLE instance of MUI, Emotion, and React across the app and
    // the @geeksuite/ui workspace package. Without this, pnpm can give
    // @geeksuite/ui its own copies, so shared components (GeekShell,
    // GeekAppFrame, …) render through a different MUI/Emotion instance that
    // never sees the app's ThemeProvider — they fall back to MUI's default
    // LIGHT theme, which is why the content frame stayed white in dark mode
    // while app-owned components (top bar, cards) were correctly dark.
    // Only dedupe packages the app directly depends on. Deduping @mui/material
    // transitively makes its nested @mui/system a singleton too; listing
    // @mui/system explicitly instead breaks resolution (it isn't hoisted to a
    // root-resolvable location under pnpm).
    resolve: {
      dedupe: [
        '@mui/material',
        '@emotion/react',
        '@emotion/styled',
        'react',
        'react-dom',
      ],
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:9977',
          changeOrigin: true,
        },
        '/graphql': {
          target: 'http://localhost:8987',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(isProd ? '/api' : 'http://localhost:9977/api'),
      'import.meta.env.VITE_GRAPHQL_API_URL': JSON.stringify(isProd ? 'https://basegeek.clintgeek.com/graphql' : 'http://localhost:8987/graphql'),
    }
  };
})
