import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// Test-only: per-icon imports instead of the 7.5s @mui/icons-material barrel.
import muiIcons from '../../../packages/ui/testing/muiIconsPlugin.js';

export default defineConfig({
    plugins: [muiIcons(), react()],
    test: {
        environment: 'jsdom',
        globals: true,
        // Whole-page tests take 3–6 s on a busy runner; 5 s flaked under load.
        testTimeout: 20000,
        setupFiles: ['./src/__tests__/setup.js'],
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
