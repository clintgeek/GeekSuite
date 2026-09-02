import { defineConfig } from 'vitest/config';

/**
 * packages/ui test config.
 *
 * The contrast suite imports each app's theme factory by relative path, so the
 * fs allow-list has to reach the repo root (two levels up from packages/ui).
 * Each app resolves `@geeksuite/ui` and `@mui/material` through its own
 * node_modules symlinks, so no aliases are needed.
 */
export default defineConfig({
  // Automatic JSX runtime so shared primitives can hold module-scope JSX
  // without importing React (matches the apps' Vite React plugin behavior).
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.{js,jsx}'],
    server: {
      deps: {
        // App theme modules live outside this package's root.
        inline: [/apps\//],
      },
    },
  },
  server: {
    fs: {
      allow: ['../..'],
    },
  },
});
