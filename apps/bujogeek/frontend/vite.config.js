import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';
import { themePreboot } from '@geeksuite/user/vite';

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
    },
    resolve: {
      extensions: ['.js', '.jsx', '.json'],
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js'),
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