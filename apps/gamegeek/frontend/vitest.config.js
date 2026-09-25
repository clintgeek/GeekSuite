import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// A separate config (not a `test` block in vite.config.js), same as bookgeek
// web: the build config aliases @geeksuite/ui and dedupes MUI/React for the
// production bundle's two-copy problem, and registers VitePWA, none of which a
// jsdom run wants. `server.deps.inline` converges MUI/Emotion into one module
// graph for the tests instead.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    // Not UTC on purpose: calendar dates must survive a real offset (a UTC
    // runner would pass a local-midnight bug straight through).
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
