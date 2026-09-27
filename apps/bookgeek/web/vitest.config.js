import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Mirrors apps/notegeek/frontend/vitest.config.js. A separate config (not a
// `test` block merged into vite.config.js) because bookgeek's vite.config.js
// aliases @geeksuite/ui and dedupes MUI/React for the production build's dual-
// copy problem (see its comment); vitest needs neither — @geeksuite/ui's
// package.json `main`/`exports` already point straight at its source, and
// `server.deps.inline` below converges MUI/Emotion into one module graph for
// the test run.
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        // Full-page renders (LibraryView's sort menu) take several seconds on a
        // loaded CI runner; 5s timed out there on 2026-09-27. Same as StoryGeek and ThingGeek.
        testTimeout: 15000,
        setupFiles: ['./src/__tests__/setup.js'],
        include: ['src/**/*.test.{js,jsx}'],
        server: {
            deps: {
                // @geeksuite: packages/collection and packages/ui ship JSX
                // source and must share this run's one MUI/React/router.
                inline: [/@mui/, /@emotion/, /@geeksuite/],
            },
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.{js,jsx}'],
            exclude: ['src/__tests__/**', 'src/main.jsx'],
        },
    },
});
