import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// A separate config from vite.config.js, same as GameGeek: the build config's
// aliases, dedupe and VitePWA are for the production bundle. `server.deps.inline`
// converges MUI/Emotion/@geeksuite into one module graph for jsdom instead.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    testTimeout: 15000, // full-page renders on a loaded box
    // UTC on purpose: the masthead's "today" is America/Chicago by code, never
    // by the machine's zone, and a UTC test box is exactly where that breaks.
    env: { TZ: 'UTC' },
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    server: {
      deps: {
        inline: [/@mui/, /@emotion/, /@geeksuite/],
      },
    },
  },
});
