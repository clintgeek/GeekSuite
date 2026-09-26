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
    testTimeout: 15000, // full-page renders (AddThing) take ~2s alone; 5s timed out on a loaded box
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
