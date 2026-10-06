import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import benos from '@benosjs/vite'

export default defineConfig({
  plugins: [benos()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: { environment: 'happy-dom' },
})
