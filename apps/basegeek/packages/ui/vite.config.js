import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { themePreboot } from '@geeksuite/user/vite';

export default defineConfig({
  plugins: [
    react(),
    themePreboot(),
    // PWA_STANDARD.md flavour A. injectRegister is the default ('auto'), so
    // VitePWA injects registerSW.js and turns on skipWaiting + clientsClaim.
    VitePWA({
      registerType: 'autoUpdate',
      // Icons: public/icons/ (SVG masters; PNGs rendered by tools/pwa-icons.mjs).
      manifest: {
        id: '/',
        name: 'baseGeek',
        short_name: 'baseGeek',
        description: 'The Signal Box: sign-in, accounts and the core infrastructure every GeekSuite app runs through',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#0e1012',
        background_color: '#0e1012',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        // woff2: the B612 / Big Shoulders faces are self-hosted; precache them
        // so the console keeps its type offline.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // basegeek is the SSO gateway: /api/* (login, OAuth callbacks, logout)
        // and /graphql are real top-level navigations that must reach the
        // server, never the SPA shell. Paths with a file extension 404 on the
        // server (stale hashed assets) and must here too.
        navigateFallbackDenylist: [/^\/api\//, /^\/graphql/, /\/[^/?]+\.[^/]+$/],
        runtimeCaching: [
          {
            // FIRST, always: auth state must be fresh (PWA_STANDARD rule 1).
            urlPattern: ({ url }) =>
              url.pathname === '/api/me' ||
              url.pathname.startsWith('/api/auth/') ||
              url.pathname.startsWith('/api/users/me'),
            handler: 'NetworkOnly',
            options: { cacheName: 'auth-bypass' }
          }
        ]
      }
    })
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    // Force a SINGLE instance of MUI, Emotion and React across the app and the
    // @geeksuite/ui workspace package. Without this, pnpm can hand
    // @geeksuite/ui its own MUI copy, which never sees this app's
    // ThemeProvider and falls back to MUI's default LIGHT theme.
    // Only dedupe packages the app depends on directly: deduping
    // @mui/material makes its nested @mui/system a singleton too, while
    // listing @mui/system explicitly breaks resolution under pnpm.
    dedupe: [
      '@mui/material',
      '@emotion/react',
      '@emotion/styled',
      'react',
      'react-dom'
    ]
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    port: 8988,
    host: '0.0.0.0',
    allowedHosts: ['basegeek.clintgeek.com', 'geeksuite.clintgeek.com']
  }
});