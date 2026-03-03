import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const isProduction = mode === 'production'

  return {
    plugins: [
      react(),
      VitePWA({
        injectRegister: false,
        registerType: 'autoUpdate',
        manifest: false,
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
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
          target: isProduction
            ? `http://backend:${ process.env.BACKEND_PORT || 5000 }`
            : 'http://localhost:5005',
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
    },
  }
});