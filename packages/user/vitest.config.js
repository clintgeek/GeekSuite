import { defineConfig } from 'vitest/config';

// Client-side hooks only. The server tests under src/server/__tests__ run on
// node:test (see package.json "test"), so they are excluded here.
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.{js,jsx}'],
  },
  esbuild: { jsx: 'automatic' },
});
