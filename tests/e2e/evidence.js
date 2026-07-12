import path from 'node:path';
import { test, expect } from '@playwright/test';

// Evidence capture (#5, multi-module #20). On the canonical rendering
// environment (the Linux CI runner) each capture is a visual-regression
// assertion against the committed baseline in docs/evidence/<module>/ — one
// PNG is evidence artifact, baseline, and site image at once. Elsewhere
// (local macOS dev) it writes a plain preview screenshot so cross-platform
// pixel noise never fails a local run. Playwright stabilizes toHaveScreenshot
// by waiting for two consecutive identical frames, which also absorbs
// Chart.js draw animations.
//
// The module is derived from the calling spec's file name —
// tests/e2e/<module>.spec.js → docs/evidence/<module>/ — so call sites stay
// module-free and sibling renderers plug in with zero pipeline edits.

export const CANONICAL = process.platform === 'linux';

export async function captureEvidence(page, requirementId, slug) {
  const module = path.basename(test.info().file).replace(/\.spec\.js$/, '');
  const name = `${requirementId}-${slug}.png`;
  if (CANONICAL) {
    // Path segments + the config's snapshotPathTemplate ('docs/evidence/
    // {arg}{ext}') put the baseline in the module's evidence directory.
    await expect(page).toHaveScreenshot([module, name]);
  } else {
    await page.screenshot({ path: `test-results/evidence-preview/${module}/${name}` });
  }
}
