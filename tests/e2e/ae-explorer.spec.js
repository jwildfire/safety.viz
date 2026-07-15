import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the ae-explorer module (#60): a dependency-free
// DOM/SVG reimplementation of RhoInc/aeexplorer matching the original
// renderer's behavior. Test names are keyed to AE- requirement IDs per the
// traceability convention in CONTRIBUTING.md; see
// docs/ae-explorer-coverage.md for the requirement-ID → matrix-row → test
// map.
//
// Fixture data (fixtures/ae-explorer.csv, hand-computed): three arms with
// placeholder rows for AE-free participants — A: 4 participants (1
// placeholder), B: 3 (1 placeholder, R-style 'NA'), C: 2 (1 placeholder).
// Cardiac disorders runs 50.0 / 33.3 / 0.0 percent across A/B/C in
// participant mode; the arm A palpitations pair on one participant makes
// participant vs event mode observable (25.0 vs 50.0).

async function selectFilter(page, label, value) {
  await page
    .locator('.sv-controls .sv-control', { has: page.locator(`label:has-text("${label}")`) })
    .locator('select')
    .selectOption(value);
}

const majorRow = (page, key) =>
  page.locator('tr.ae-major', { has: page.locator(`.ae-label:has-text("${key}")`) });

test.describe('safety.viz ae-explorer module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._aeErrors = errors;
    await page.goto('/tests/e2e/fixtures/ae-explorer.html');
    await page.waitForFunction(
      () => window.__aeExplorerInstance && window.__aeExplorerInstance.table
    );
    await page.waitForSelector('.ae-table');
  });

  test.afterEach(async ({ page }) => {
    expect(page._aeErrors).toEqual([]);
  });

  test('AE-DATA-003/AE-API-001: default-column data renders the hierarchical summary table from the factory with an empty settings object (#60)', async ({
    page
  }) => {
    await expect(page.locator('.ae-table')).toBeVisible();
    await expect(page.locator('tr.ae-major')).toHaveCount(2);
    // Sorted by descending peak prevalence: Cardiac (50.0 in arm A) first.
    await expect(page.locator('tr.ae-major').first()).toContainText('Cardiac disorders');
    await expect(page.locator('tfoot tr.ae-overall')).toContainText('Any adverse event');
    await captureEvidence(page, 'AE-DATA-003', 'default-table');
  });

  test('AE-DATA-001: placeholder rows keep AE-free participants in the group denominators (#60)', async ({
    page
  }) => {
    // Arm A has 3 participants with AEs plus one blank placeholder; arm B's
    // placeholder uses the R-style 'NA' spelling.
    await expect(page.locator('th', { hasText: 'A (n=4)' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'B (n=3)' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'C (n=2)' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Total (n=9)' })).toBeVisible();
  });

  test('AE-USER-014/AE-USER-015/AE-REG-001/AE-REG-002: the category toggle expands and collapses the nested preferred terms (#60)', async ({
    page
  }) => {
    const cardiacMinors = page
      .locator('tbody', { hasText: 'Cardiac disorders' })
      .locator('tr.ae-minor');
    await expect(cardiacMinors.first()).toBeHidden();
    await majorRow(page, 'Cardiac disorders').locator('.ae-toggle').click();
    await expect(page.locator('tr.ae-minor:visible')).toHaveCount(2);
    await expect(majorRow(page, 'Cardiac disorders').locator('.ae-toggle')).toHaveText('−');
    await majorRow(page, 'Cardiac disorders').locator('.ae-toggle').click();
    await expect(page.locator('tr.ae-minor:visible')).toHaveCount(0);
  });

  test('AE-REG-008: participant mode counts each participant once — arm A palpitations reads 25.0 despite two records (#60)', async ({
    page
  }) => {
    await majorRow(page, 'Cardiac disorders').locator('.ae-toggle').click();
    const palpitations = page.locator('tr.ae-minor', { hasText: 'Palpitations' });
    await expect(palpitations.locator('td.ae-value').first()).toContainText('25.0');
    await expect(palpitations.locator('td.ae-value').first()).toHaveAttribute('title', '1/4');
  });

  test('AE-USER-006/AE-REG-009/AE-REG-033/AE-REG-035: the summarize-by toggle switches both numerators and denominators to the event basis (#60)', async ({
    page
  }) => {
    const cardiacA = majorRow(page, 'Cardiac disorders').locator('td.ae-value').first();
    await expect(cardiacA).toContainText('50.0'); // participant default
    await selectFilter(page, 'Summarize by', 'event');
    await expect(cardiacA).toContainText('75.0'); // 3 of arm A's 4 events
    await expect(cardiacA).toHaveAttribute('title', '3/4');
    await selectFilter(page, 'Summarize by', 'participant');
    await expect(cardiacA).toContainText('50.0');
  });

  test('AE-USER-001/AE-REG-007/AE-REG-012/AE-REG-013: the numeric prevalence filter hides rows below the threshold as it is typed (#60)', async ({
    page
  }) => {
    const input = page.locator('input.ae-prevalence');
    await expect(input).toHaveAttribute('type', 'number'); // letters rejected by the control
    await majorRow(page, 'Cardiac disorders').locator('.ae-toggle').click();
    await expect(page.locator('tr.ae-minor:visible')).toHaveCount(2);
    await input.fill('40'); // every minor peaks below 40%; both majors peak at 50%
    await expect(page.locator('tr.ae-minor:visible')).toHaveCount(0);
    await expect(page.locator('tr.ae-major:visible')).toHaveCount(2);
    await input.fill('60');
    await expect(page.locator('tr.ae-major:visible')).toHaveCount(0);
    await input.fill('0');
    await expect(page.locator('tr.ae-major:visible')).toHaveCount(2);
  });

  test('AE-USER-007/AE-REG-003/AE-REG-004: search shows only matching categories, highlighted, with a match count (#60)', async ({
    page
  }) => {
    await page.locator('input.ae-search').fill('nausea');
    await expect(page.locator('.ae-search-note')).toHaveText('1 category found.');
    await expect(page.locator('tr.ae-major:visible')).toHaveCount(1);
    await expect(page.locator('tr.ae-major:visible')).toContainText('Gastrointestinal disorders');
    await expect(page.locator('tr.ae-minor:visible .ae-search-match')).toHaveText('Nausea');
    await captureEvidence(page, 'AE-REG-003', 'search-highlight');
  });

  test('AE-USER-008/AE-REG-005: clearing the search resets the table, and a no-match term leaves it unchanged (#60)', async ({
    page
  }) => {
    await page.locator('input.ae-search').fill('zzz-no-such-term');
    await expect(page.locator('.ae-search-note')).toHaveText(
      'No categories found with a matching search term.'
    );
    await expect(page.locator('tr.ae-major:visible')).toHaveCount(2); // table unchanged
    await page.locator('input.ae-search').fill('');
    await expect(page.locator('.ae-search-note')).toHaveText('');
    await expect(page.locator('tr.ae-major:visible')).toHaveCount(2);
  });

  test('AE-REG-006/AE-USER-002/AE-USER-003/AE-USER-018/AE-REG-018: event filters narrow the counted events without changing denominators, and carry explanatory badges (#60)', async ({
    page
  }) => {
    await expect(page.locator('sup.ae-filter-type').first()).toHaveAttribute(
      'title',
      /Event filter/
    );
    await selectFilter(page, 'Severity', 'MILD');
    // Numerator drops (only A1's mild palpitation), denominator holds at 4.
    const cardiacA = majorRow(page, 'Cardiac disorders').locator('td.ae-value').first();
    await expect(cardiacA).toContainText('25.0');
    await expect(cardiacA).toHaveAttribute('title', '1/4');
    await expect(page.locator('th', { hasText: 'A (n=4)' })).toBeVisible();
  });

  test('AE-REG-014: filters with no matching events show the exact no-results error (#60)', async ({
    page
  }) => {
    await selectFilter(page, 'Severity', 'SEVERE');
    await selectFilter(page, 'Relationship', 'PROBABLY RELATED');
    await expect(page.locator('.ae-error')).toHaveText(
      'Error: No AEs found for the current filters. Update the filters to see results.'
    );
  });

  test('AE-USER-016/AE-REG-019/AE-REG-022: clicking a category opens the details listing with the record count in the header (#60)', async ({
    page
  }) => {
    await majorRow(page, 'Gastrointestinal disorders').locator('.ae-label').click();
    await expect(page.locator('.sv-detail strong')).toHaveText(
      'Details for 3 Gastrointestinal disorders records'
    );
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await expect(page.locator('.sv-listing tbody tr')).toHaveCount(3);
    await captureEvidence(page, 'AE-USER-016', 'details-view');
  });

  test('AE-USER-017/AE-REG-020/AE-REG-021: the details view reports the active filters and Return to the Summary View restores the table (#60)', async ({
    page
  }) => {
    await selectFilter(page, 'Severity', 'MILD');
    await majorRow(page, 'Gastrointestinal disorders').locator('.ae-label').click();
    await expect(page.locator('.ae-detail-note')).toHaveText(
      'The listing is filtered as shown: Severity = MILD.'
    );
    await expect(page.locator('.sv-listing tbody tr')).toHaveCount(2); // B3's moderate nausea filtered out
    await page.locator('button', { hasText: 'Return to the Summary View' }).click();
    await expect(page.locator('.ae-table')).toBeVisible();
    await expect(page.locator('.sv-detail')).toBeHidden();
  });

  test('AE-USER-012/AE-REG-016: the rate plot draws one group-colored dot per group with the percentage on hover (#60)', async ({
    page
  }) => {
    const dots = majorRow(page, 'Cardiac disorders').locator('.ae-prevplot circle');
    await expect(dots).toHaveCount(3);
    await expect(dots.first().locator('title')).toHaveText('A: 50.0%');
  });

  test('AE-USER-013/AE-USER-011/AE-REG-017: difference diamonds compare each group pair, revealing intervals and cell counts on hover (#60)', async ({
    page
  }) => {
    const row = majorRow(page, 'Cardiac disorders');
    await expect(row.locator('.ae-diffplot path.ae-diamond')).toHaveCount(3); // A–B, A–C, B–C
    await expect(row.locator('.ae-diffplot path.ae-diamond').first().locator('title')).toHaveText(
      'A: 50.0% (2/4) vs B: 33.3% (1/3) — difference 16.7%'
    );
    // Three groups: interval lines hide until the difference cell is hovered.
    await expect(row.locator('line.ae-ci-hidden').first()).toBeAttached();
    await row.locator('td.ae-diffplot').hover();
    await expect(row).toHaveClass(/ae-show-ci/);
    await expect(row.locator('.ae-cell-count').first()).toBeVisible();
    await captureEvidence(page, 'AE-REG-017', 'diff-hover');
  });

  test('AE-USER-019/AE-REG-037/AE-REG-039: group configuration drives the Total and Difference columns (#60)', async ({
    page
  }) => {
    // A single shown group hides Total and Difference (AE-REG-039).
    await page.evaluate(() => window.__aeExplorerInstance.setSettings({ groups: ['A'] }));
    await expect(page.locator('th', { hasText: 'A (n=4)' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Total' })).toHaveCount(0);
    await expect(page.locator('th', { hasText: 'Difference' })).toHaveCount(0);
    // Total-only mode (AE-REG-037): group columns off keeps Total, drops Difference.
    await page.evaluate(() =>
      window.__aeExplorerInstance.setSettings({ groups: null, group_cols: false })
    );
    await expect(page.locator('th', { hasText: 'Total (n=9)' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'A (n=4)' })).toHaveCount(0);
    await expect(page.locator('th', { hasText: 'Difference' })).toHaveCount(0);
  });

  test('AE-CFG-004/AE-REG-041/AE-REG-043/AE-REG-044: the group re-mapping control offers the current column and redraws on change (#60)', async ({
    page
  }) => {
    const control = page.locator('select[data-variable="group"]');
    await expect(control).toBeVisible();
    // ARM is offered even though variable_options only lists SEX (AE-REG-044).
    await expect(control.locator('option')).toHaveText(['ARM', 'SEX']);
    await control.selectOption('SEX');
    await expect(page.locator('th', { hasText: 'F (n=5)' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'M (n=4)' })).toBeVisible();
    // The re-mapped control still works after filtering (AE-REG-043).
    await selectFilter(page, 'Severity', 'MILD');
    await expect(page.locator('th', { hasText: 'F (n=5)' })).toBeVisible();
    await control.selectOption('ARM');
    await expect(page.locator('th', { hasText: 'A (n=4)' })).toBeVisible();
  });

  test('AE-USER-020/AE-CFG-009/AE-REG-026/AE-REG-027/AE-REG-028/AE-REG-029/AE-REG-030: validation mode offers the summarized CSV named major-minor-basis with the filtered data (#60)', async ({
    page
  }) => {
    await expect(page.locator('button.ae-download')).toBeVisible();
    const participant = await page.evaluate(() => window.__aeExplorerInstance.buildValidationCsv());
    expect(participant.name).toBe('AEBODSYS-AEDECOD-participant.csv');
    expect(participant.csv).toContain('major,minor,group,n,total,percent');
    expect(participant.csv).toContain('"Cardiac disorders","","A",2,4,50');
    await selectFilter(page, 'Summarize by', 'event');
    await selectFilter(page, 'Severity', 'MILD');
    const event = await page.evaluate(() => window.__aeExplorerInstance.buildValidationCsv());
    expect(event.name).toBe('AEBODSYS-AEDECOD-event.csv');
    expect(event.csv).toContain('"Cardiac disorders","","A",1,'); // filtered numerator
  });
});
