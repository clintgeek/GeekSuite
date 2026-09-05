import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Mirrors apps/fitnessgeek/frontend/vitest.config.js (and flockgeek's,
// notegeek's, bookgeek's, storygeek's). A separate config, not merged into
// vite.config.js, so vitest never loads the PWA plugin, the theme preboot or
// the dev-server proxy block.
//
// The `resolve` block is copied from vite.config.js on purpose: packages/ui
// (this admin console) is compiled from source and pnpm materializes a
// private @mui/material for its peer range, so without the dedupe a
// component test gets two MUI copies and an unthemed tree.
export default defineConfig({
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled', '@mui/material'],
        alias: {
            '@geeksuite/ui': path.resolve(__dirname, '../../../../packages/ui/src/index.js'),
            'react': path.resolve(__dirname, './node_modules/react'),
            'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
            '@emotion/react': path.resolve(__dirname, './node_modules/@emotion/react'),
            '@emotion/styled': path.resolve(__dirname, './node_modules/@emotion/styled'),
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/test/setup.js'],
        include: ['src/**/*.test.{js,jsx}'],
        testTimeout: 15000, // mirrors storygeek's vitest.config.js: full-tab renders (AIGeekPage) take 2-3s on a loaded runner; 5s flaked
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
