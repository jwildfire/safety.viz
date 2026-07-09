import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    // Evidence baselines (#5): thresholds absorb canvas antialiasing noise;
    // animations are disabled for stable captures.
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled' }
  },
  // Dual-purpose evidence screenshots live with the module's evidence set —
  // no platform suffix: baselines are canonical to the Linux CI runner (see
  // tests/e2e/evidence.js and scripts/evidence.mjs).
  snapshotPathTemplate: 'docs/evidence/histogram/{arg}{ext}',
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
  projects: [
    {
      name: 'chromium',
      // Fixed capture conditions per the #21 design: 1280×800, scale 1.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1
      }
    }
  ]
});
