import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost:9977',
          changeOrigin: true,
        },
        '/graphql': {
          target: 'http://localhost:8987',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(isProd ? '/api' : 'http://localhost:9977/api'),
      'import.meta.env.VITE_GRAPHQL_API_URL': JSON.stringify(isProd ? 'https://basegeek.clintgeek.com/graphql' : 'http://localhost:8987/graphql'),
    }
  };
})
