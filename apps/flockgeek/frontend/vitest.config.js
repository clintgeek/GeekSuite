import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Mirrors apps/notegeek/frontend/vitest.config.js and apps/bookgeek/web/vitest.config.js.
// A separate config (not merged into vite.config.js) so the production build's
// PWA plugin and API-proxy server block never load under vitest.
export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
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
