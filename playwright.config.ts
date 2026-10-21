import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  // Waits for navigations and restored drafts get more room than the 5s default when the machine is busy.
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  // tests/server.mjs builds the site as files and serves it with the production Worker (wrangler dev),
  // which takes a minute or two before the first test.
  webServer: {
    command: 'node tests/server.mjs',
    url: 'http://127.0.0.1:3100/en',
    reuseExistingServer: false,
    timeout: 300000,
  },
})
