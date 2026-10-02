import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command:
      'pnpm exec vite --config tests/browser/vite.config.ts --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/tests/browser/fixture.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
