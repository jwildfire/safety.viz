import { defineConfig, devices } from '@playwright/test';

// The keynote's demo path (#287, tests/demo-path/): one walk through a
// published demo app, apart from the browser suite of playwright.config.js.
// No server is started: the address is the dev demo's, or DEMO_PATH_URL's.
const base = process.env.DEMO_PATH_URL || 'https://jwildfire.github.io/safety.viz/dev/demo/';

export default defineConfig({
  testDir: './tests/demo-path',
  // Real R is downloaded twice on the path, once by each tab that uses it.
  timeout: 900_000,
  expect: { timeout: 15_000 },
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: base.endsWith('/') ? base : `${base}/`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      // The size the keynote is shown at.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1
      }
    }
  ]
});
