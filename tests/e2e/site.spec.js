import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';

// Docs-site smoke (#7): the built demo page must mount the histogram from the
// committed dist/ bundle with no console errors, served straight out of
// _site/ — proving the emitted relative URLs work at any mount path. The
// build runs here so every context that runs the browser suite (CI, the
// evidence-update workflow, local runs) exercises the current tree.

test.describe('docs site', () => {
  test.beforeAll(() => {
    execSync('npm run site', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('built demo page mounts the histogram with no console errors (#7)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/_site/index.html');
    await expect(page.locator('.card.status-available')).toHaveCount(1);

    await page.goto('/_site/histogram/index.html');
    await expect(page.locator('#container .sh-controls')).toBeVisible();
    await expect(page.locator('#container canvas').first()).toBeVisible();
    expect(errors).toEqual([]);
  });
});
