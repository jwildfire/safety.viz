import { test, expect } from '@playwright/test';

test.describe('safety.viz scaffold', () => {
  test('demo page loads with no console errors (#1)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/tests/e2e/fixtures/');

    await expect(page.locator('#scaffold-heading')).toHaveText('safety.viz scaffold');
    expect(errors).toEqual([]);
  });
});
