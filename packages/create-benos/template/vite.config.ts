import { defineConfig } from 'vitest/config'
import benos from '@benosjs/vite'

export default defineConfig({
  plugins: [benos()],
  test: { environment: 'happy-dom' },
})
