import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Mirrors apps/notegeek/frontend/vitest.config.js, apps/bookgeek/web/vitest.config.js
// and apps/flockgeek/frontend/vitest.config.js. A separate config (not merged
// into vite.config.js) so vitest never has to load the production vite config —
// storygeek's has no PWA plugin or proxy block today, but keeping the split
// matches the rest of the suite and costs nothing.
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        testTimeout: 15000, // full-page renders (StoryPlay) take 2–3s on a loaded runner; 5s flaked
        globals: true,
        setupFiles: ['./src/test/setup.js'],
        include: ['src/**/*.test.{js,jsx}'],
        server: {
            deps: {
                inline: [/@mui/, /@emotion/],
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
