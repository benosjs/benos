import { defineConfig } from 'vitest/config'
import benos from '@benosjs/vite'

// The server renderer walks plans and direct skeletons alike; these tests
// compile exactly as the client build does, so both sides agree on every
// dynamic position.
export default defineConfig({
  plugins: [benos({ optimization: 'safe' })],
  test: {
    name: 'flagship-ssr',
    include: ['tests/**/*.ssr.test.tsx'],
    environment: 'happy-dom',
  },
})
