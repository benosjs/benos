import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'packages',
          include: [
            'packages/**/tests/**/*.test.ts',
            'tests/**/*.test.ts',
            'benchmarks/**/*.test.js',
          ],
          environment: 'node',
        },
      },
      // The flagship slice is compiled with the Benos plugin.
      'examples/flagship/vitest.config.ts',
      'examples/flagship/vitest.ssr.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**/*.ts'],
      exclude: ['packages/core/src/index.ts'],
      thresholds: { lines: 95 },
    },
  },
})
