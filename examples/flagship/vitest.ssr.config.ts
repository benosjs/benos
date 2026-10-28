import { defineConfig } from 'vitest/config'
import benos from '@benosjs/vite'

// The server renderer walks the compiler's plan output, so these tests use
// the plan-only optimization that an SSR build uses.
export default defineConfig({
  plugins: [benos({ optimization: 'none' })],
  test: {
    name: 'flagship-ssr',
    include: ['tests/**/*.ssr.test.tsx'],
    environment: 'happy-dom',
  },
})
