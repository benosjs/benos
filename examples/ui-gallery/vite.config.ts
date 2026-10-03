import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import benos from '@benosjs/vite'

export default defineConfig({
  plugins: [benos()],
  optimizeDeps: {
    noDiscovery: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
