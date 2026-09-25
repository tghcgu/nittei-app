import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  // The test server is `next dev`, which compiles a route on its first visit. Under load that
  // can exceed the 5s default, so waits for navigations and restored drafts get more room.
  expect: { timeout: 15000 },
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: 'node tests/server.mjs',
    url: 'http://127.0.0.1:3100/en',
    reuseExistingServer: false,
    timeout: 180000,
  },
})
