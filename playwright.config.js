import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:8099',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  webServer: {
    // Serve the repo root so fixture pages can load the committed dist/ bundles.
    command: 'python3 -m http.server 8099 --directory .',
    url: 'http://127.0.0.1:8099/',
    reuseExistingServer: !process.env.CI,
    timeout: 10_000
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
