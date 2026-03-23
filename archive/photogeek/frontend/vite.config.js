import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    host: '0.0.0.0'
  },
  resolve: {
    alias: {
      '@geeksuite/ui': path.resolve(__dirname, '../../../packages/ui/src/index.js')
    }
  }
})
