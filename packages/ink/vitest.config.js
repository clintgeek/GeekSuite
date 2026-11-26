import { defineConfig } from 'vitest/config';

/**
 * packages/ink test config. jsdom: the pen helpers listen to DOM pointer and
 * key events, and the export and prefs helpers use Blob and localStorage.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.js'],
  },
});
