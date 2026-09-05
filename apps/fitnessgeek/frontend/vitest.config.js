import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Mirrors apps/flockgeek/frontend/vitest.config.js (and notegeek's, bookgeek's,
// storygeek's). A separate config, not merged into vite.config.js, so vitest
// never loads the PWA plugin, the theme preboot or the dev-server proxy block.
//
// The `resolve` block is copied from vite.config.js on purpose: packages/ui is
// compiled from source and pnpm materializes a private @mui/material for its
// peer range, so without the dedupe a component test gets two MUI copies and an
// unthemed tree. Service-only tests do not need it; the first component test
// would.
export default defineConfig({
    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom', '@emotion/react', '@emotion/styled', '@mui/material'],
        alias: {
            '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js'),
            '@geeksuite/utils': path.resolve(__dirname, '../../../packages/utils/src/index.js'),
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
