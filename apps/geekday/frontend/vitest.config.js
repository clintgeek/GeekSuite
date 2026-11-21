import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// Test-only: per-icon imports instead of the 7.5s @mui/icons-material barrel.
import muiIcons from '../../../packages/ui/testing/muiIconsPlugin.js';

// A separate config from vite.config.js: the build config's
// aliases, dedupe and VitePWA are for the production bundle. `server.deps.inline`
// converges MUI/Emotion/@geeksuite into one module graph for jsdom instead.
export default defineConfig({
  plugins: [muiIcons(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000,
    // Not UTC on purpose: calendar dates must survive a real offset.
    env: { TZ: 'America/Chicago' },
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    server: {
      deps: {
        inline: [/@mui/, /@emotion/, /@geeksuite/],
      },
    },
  },
});
