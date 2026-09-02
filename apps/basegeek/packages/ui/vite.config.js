import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { themePreboot } from '@geeksuite/user/vite';

export default defineConfig({
  plugins: [
    react(),
    themePreboot(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'baseGeek',
        short_name: 'baseGeek',
        description: 'Core Infrastructure for GeekSuite',
        theme_color: '#121215',
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