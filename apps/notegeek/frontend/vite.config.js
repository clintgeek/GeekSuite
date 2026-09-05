import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { themePreboot } from '@geeksuite/user/vite';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const apiUrl = isProd ? 'https://notegeek.clintgeek.com/api' : 'http://localhost:9988/api';

  return {
    plugins: [
      react(),
      themePreboot(),
      VitePWA({
        injectRegister: false,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'NoteGeek',
          short_name: 'NoteGeek',
          description: 'A powerful note-taking application',
          theme_color: '#FBF7EE',
          background_color: '#FBF7EE',
          display: 'standalone',
          orientation: 'any',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ],
          start_url: '/',
          scope: '/',
          categories: ['productivity', 'utilities']
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => {
                return url.pathname === '/api/me' || url.pathname.startsWith('/api/auth/');
              },
              handler: 'NetworkOnly',
              options: {
                cacheName: 'auth-bypass'
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
      // the heaviest in the suite (tiptap, tldraw, reactflow, all with deep
      // dynamic import graphs of their own), which makes esbuild's scanner
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
