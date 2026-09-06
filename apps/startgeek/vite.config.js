/* eslint-env node */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const basegeekTarget = process.env.VITE_BASEGEEK_PROXY || 'http://localhost:3000'

// ─── Service-worker precache manifest ───────────────────────────────────────
//
// startgeek ships a hand-rolled `public/sw.js` (PWA_STANDARD.md flavour B),
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
  let outDir = 'dist'
  return {
    name: 'startgeek-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      const root = path.resolve(__dirname, outDir)
      const swPath = path.join(root, 'sw.js')
      const assetsDir = path.join(root, 'assets')
      if (!fs.existsSync(swPath) || !fs.existsSync(assetsDir)) return

      const urls = fs
        .readdirSync(assetsDir)
        .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
        .sort()
        .map((f) => `/assets/${f}`)
      const buildId = crypto
        .createHash('sha1')
        .update(urls.join('\n'))
        .digest('hex')
        .slice(0, 8)

      const src = fs.readFileSync(swPath, 'utf8')
      const stamped = src
        .replace(/^const BUILD_ID = ".*";$/m, `const BUILD_ID = "${buildId}";`)
        .replace(
          /^const PRECACHE_ASSETS = \[\];$/m,
          `const PRECACHE_ASSETS = ${JSON.stringify(urls)};`
        )
      if (stamped === src) {
        // A rename in public/sw.js that silently stops the stamping would be
        // invisible at runtime until a deploy broke someone's route.
        this.error('sw.js precache placeholders not found — did they get renamed?')
      }
      fs.writeFileSync(swPath, stamped)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), swPrecache()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: basegeekTarget,
        changeOrigin: true,
        secure: false,
      },
      '/graphql': {
        target: basegeekTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
})
