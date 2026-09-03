/* eslint-env node */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const basegeekTarget = process.env.VITE_BASEGEEK_PROXY || 'http://localhost:3000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: basegeekTarget,
        changeOrigin: true,
        secure: false,
      },
      '/graphql': {
        target: basegeekTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
})
