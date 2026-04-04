import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const apiUrl = isProd ? 'https://notegeek.clintgeek.com/api' : 'http://localhost:9988/api';

  return {
    plugins: [
      react(),
      VitePWA({
        injectRegister: false,
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        manifest: {
          name: 'NoteGeek',
          short_name: 'NoteGeek',
          description: 'A powerful note-taking application',
          theme_color: '#ffffff',
          background_color: '#ffffff',
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
      include: ['jwt-decode']
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl)
    },
    resolve: {
      alias: {
        '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js')
      }
    }
  };
});
