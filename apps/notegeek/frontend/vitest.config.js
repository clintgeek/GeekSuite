import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./src/__tests__/setup.js'],
        include: ['src/**/*.test.{js,jsx}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.{js,jsx}'],
            exclude: ['src/__tests__/**', 'src/main.jsx'],
        },

        server: {
            deps: {
                inline: [/@mui/, /@emotion/],
            },
        },
        pool: 'threads',
        poolOptions: {
            threads: {
                singleThread: true,
                isolate: false,
            }
        },
    },
});
