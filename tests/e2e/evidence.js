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

/**
 * `target` is normally the page, giving the familiar viewport shot. Pass a
 * Locator instead when the evidence is a detail the viewport would crop — the
 * hep-waterfall flank panels' slot labels sit below the fold on a default
 * viewport, and a screenshot that cuts off the label is not evidence that the
 * label exists. Both Page and Locator answer screenshot() and toHaveScreenshot().
 */
export async function captureEvidence(target, requirementId, slug) {
  const module = path.basename(test.info().file).replace(/\.spec\.js$/, '');
  const name = `${requirementId}-${slug}.png`;
  if (CANONICAL) {
    // Path segments + the config's snapshotPathTemplate ('docs/evidence/
    // {arg}{ext}') put the baseline in the module's evidence directory.
    await expect(target).toHaveScreenshot([module, name]);
  } else {
    await target.screenshot({ path: `test-results/evidence-preview/${module}/${name}` });
  }
}
