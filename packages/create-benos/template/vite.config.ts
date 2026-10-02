import { defineConfig } from 'vitest/config'
import benos from '@benosjs/vite'

export default defineConfig({
  plugins: [benos({ exclude: [/\.test\.tsx$/] })],
  test: { environment: 'happy-dom' },
})
