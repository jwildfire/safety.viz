import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Docs-site smoke (#7): every available renderer's built demo page must mount
// from the committed dist/ bundle with no console errors, served straight out
// of _site/ — proving the emitted relative URLs work at any mount path. The
// build runs here so every context that runs the browser suite (CI, the
// evidence-update workflow, local runs) exercises the current tree.
//
// The shared-shell assertions are the layout contract (#17): a renderer is
// not "available" unless its demo renders the shared control sidebar chrome
// from src/shell.js.

const config = JSON.parse(readFileSync(new URL('../../site/config.json', import.meta.url), 'utf8'));
const available = config.renderers.filter((renderer) => renderer.status === 'available');

test.describe('docs site', () => {
  test.beforeAll(() => {
    execSync('npm run site', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('gallery shows one card per available renderer (#7)', async ({ page }) => {
    await page.goto('/_site/index.html');
    await expect(page.locator('.card.status-available')).toHaveCount(available.length);
  });

  for (const renderer of available) {
    test(`built ${renderer.module} demo mounts the shared shell with no console errors (#7) (#17)`, async ({
      page
    }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(`/_site/${renderer.module}/index.html`);
      await expect(page.locator('#container .sv-sidebar .sv-controls')).toBeVisible();
      // Any visible chart canvas counts: the histogram opens on the
      // all-measures overview (#39), which hides the main-chart canvas in
      // favor of the per-measure panels. Table-first renderers (ae-explorer,
      // #60) satisfy the contract with a visible table in the main column
      // instead of a canvas.
      await expect(
        page
          .locator('#container .sv-main canvas:visible, #container .sv-main table:visible')
          .first()
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  // Gallery nav dropdown (#71): the top-nav "Gallery" item still navigates to
  // the gallery index, and its disclosure button reveals one link per available
  // renderer straight to that chart's demo. The list is data-driven, so its
  // count tracks the config; interaction is hover + click + full keyboard.
  test.describe('gallery nav dropdown (#71)', () => {
    test('lists one chart link per available renderer, closed by default (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      const menu = page.locator('.nav-group .nav-menu');
      await expect(menu.locator('a')).toHaveCount(available.length);
      await expect(menu).toBeHidden();
      await expect(page.locator('.nav-disclosure')).toHaveAttribute('aria-expanded', 'false');
    });

    test('opens on hover and the top link still points at the gallery index (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      await page.locator('.nav-group').hover();
      await expect(page.locator('.nav-group .nav-menu')).toBeVisible();
      await expect(page.locator('.nav-group > a').first()).toHaveAttribute('href', 'index.html');
    });

    test('is keyboard operable: ArrowDown opens and focuses, Escape closes (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      const button = page.locator('.nav-disclosure');
      const menu = page.locator('.nav-group .nav-menu');
      await button.focus();
      await page.keyboard.press('ArrowDown');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(menu).toBeVisible();
      // Focus lands on the first chart link, then arrows move down the list.
      await expect(menu.locator('a').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.locator('a').nth(1)).toBeFocused();
      // Escape closes and returns focus to the disclosure button.
      await page.keyboard.press('Escape');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(menu).toBeHidden();
      await expect(button).toBeFocused();
    });

    test('a chart link navigates straight to that renderer demo (#71)', async ({ page }) => {
      await page.goto('/_site/index.html');
      await page.locator('.nav-group').hover();
      await page.locator('.nav-menu a', { hasText: 'Safety Shift Plot' }).click();
      await expect(page).toHaveURL(/\/_site\/shift-plot\/index\.html$/);
      await expect(page.locator('#container .sv-sidebar .sv-controls')).toBeVisible();
    });

    test('marks the current chart inside the dropdown on a renderer sub-page (#71)', async ({
      page
    }) => {
      await page.goto('/_site/histogram/index.html');
      const current = page.locator('.nav-menu a.current');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText('Safety Histogram');
    });
  });
});
