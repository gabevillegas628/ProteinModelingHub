import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/modeling/',
  build: {
    outDir: '../server/public',
    emptyOutDir: true
  },
  server: {
    port: 5173,
    proxy: {
      '/modeling/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
})
