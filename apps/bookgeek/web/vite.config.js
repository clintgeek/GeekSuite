import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const apiUrl = isProd ? '/api' : 'http://localhost:1800/api';

  return {
    plugins: [react()],
    server: {
      port: 1801,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: 'http://localhost:1800',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
      'import.meta.env.VITE_BASEGEEK_URL': JSON.stringify('https://basegeek.clintgeek.com')
    },
    resolve: {
      alias: {
        '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js')
      }
    }
  };
});
