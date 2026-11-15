import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
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
