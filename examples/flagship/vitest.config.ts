import { defineConfig } from 'vitest/config'
import benos from '@benosjs/vite'

// The flagship tests render the compiled editor, so they run with the Benos plugin.
export default defineConfig({
  plugins: [benos({ optimization: 'safe' })],
  test: {
    name: 'flagship',
    include: ['tests/**/*.test.tsx'],
    environment: 'happy-dom',
  },
})
