import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const proxyTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:4010'
const allowedHosts = (process.env.VITE_ALLOWED_HOSTS || 'photogeek.clintgeek.com').split(',')

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true
      }
    }
  },
  preview: {
    allowedHosts,
    host: '0.0.0.0'
  }
})
