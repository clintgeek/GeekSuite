import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { themePreboot } from '@geeksuite/user/vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// ─── Service-worker precache manifest ───────────────────────────────────────
//
// bookgeek ships a hand-rolled `public/sw.js` (PWA_STANDARD.md flavour B),
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
    name: 'bookgeek-sw-precache',
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
  const apiUrl = isProd ? '/api' : 'http://localhost:1800/api';

  return {
    plugins: [react(), themePreboot(), swPrecache()],
    server: {
      port: 1801,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:1800',
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
      sourcemap: true,
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_BASEGEEK_URL': JSON.stringify('https://basegeek.clintgeek.com')
    },
    resolve: {
      alias: {
        '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js'),
        // The library machinery (facets, URL state, saved views, paged list),
        // from source like packages/ui. Its /server entry is gateway-only and
        // never imported here.
        '@geeksuite/collection': path.resolve(__dirname, '../../../packages/collection/src/index.js')
      },
      // MANDATORY. packages/ui and packages/collection are compiled from
      // source (aliases above) and pnpm can materialize a private
      // @mui/material for a package's peer range; two MUI copies split the
      // theme context (shell renders unthemed). Force the app's single copy of
      // MUI, its icons, React and the router (collection's URL state must use
      // the app's router context).
      dedupe: ['@mui/material', '@mui/icons-material', '@emotion/react', '@emotion/styled', 'react', 'react-dom', 'react-router-dom']
    }
  };
});
