import { defineConfig } from 'vitest/config';

/**
 * packages/collection test config: jsdom + Testing Library for the client
 * pieces; server helpers opt into node with `// @vitest-environment node`.
 *
 * No React plugin (not a devDependency here): esbuild's automatic JSX runtime
 * compiles the .jsx, as packages/ui does. `server.deps.inline` converges
 * MUI/Emotion/@geeksuite/ui into one module graph, as the apps' configs do.
 */
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/__tests__/**/*.test.{js,jsx}'],
    server: {
      deps: {
        inline: [/@mui/, /@emotion/, /@geeksuite/],
      },
    },
  },
});
