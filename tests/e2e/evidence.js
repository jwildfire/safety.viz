import { expect } from '@playwright/test';

// Evidence capture (#5). On the canonical rendering environment (the Linux CI
// runner) each capture is a visual-regression assertion against the committed
// baseline in docs/evidence/<module>/ — one PNG is evidence artifact, baseline,
// and site image at once. Elsewhere (local macOS dev) it writes a plain
// preview screenshot so cross-platform pixel noise never fails a local run.
// Playwright stabilizes toHaveScreenshot by waiting for two consecutive
// identical frames, which also absorbs Chart.js draw animations.

export const CANONICAL = process.platform === 'linux';

export async function captureEvidence(page, requirementId, slug) {
  const name = `${requirementId}_${slug}.png`;
  if (CANONICAL) {
    await expect(page).toHaveScreenshot(name);
  } else {
    await page.screenshot({ path: `test-results/evidence-preview/${name}` });
  }
}
