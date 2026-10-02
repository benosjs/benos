import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: [
      'packages/**/tests/**/*.test.ts',
      'tests/**/*.test.ts',
      'benchmarks/**/*.test.js',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['packages/core/src/index.ts'],
      thresholds: { lines: 95 },
    },
  },
})
