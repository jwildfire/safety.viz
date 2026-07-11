import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the histogram module (#2), ported from the safety-histogram
// pilot's 10 Playwright specs (dev @ a3ff9f7) and extended to the remaining
// browser-evidence rows of the safety.agent matrix. Test names are keyed to
// requirement IDs per the traceability convention in CONTRIBUTING.md; see
// docs/histogram-coverage.md for the requirement-ID → matrix-row → test map.

async function setHarnessSettings(page, settings = {}) {
  await page.evaluate((overrides) => {
    window.__safetyHistogramInstance.setSettings({
      page_size: 5,
      group_by: 'sh_none',
      compare_distributions: false,
      test_normality: true,
      display_normal_range: true,
      annotate_bin_boundaries: true,
      ...overrides
    });
  }, settings);
}

async function showFullListing(page) {
  await page.evaluate(() => {
    const instance = window.__safetyHistogramInstance;
    const rows = instance.currentFilteredData();
    instance.showListing(rows, { records: rows, lower: 1, upper: 30 }, 0);
  });
  await expect(page.locator('.sh-listing table')).toBeVisible();
}

async function selectFirstPopulatedCanvasBar(page) {
  await page.evaluate(() => {
    const instance = window.__safetyHistogramInstance;
    const chart = instance.chart;
    const index = chart.$shBins.findIndex((bin) => bin.records.length > 0);
    chart.options.onClick({}, [{ index }]);
  });
  await expect(page.locator('.sh-listing table')).toBeVisible();
}

test.describe('safety.viz histogram module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._shErrors = errors;
    await page.goto('/tests/e2e/fixtures/histogram.html');
    await page.waitForFunction(
      () => window.__safetyHistogramInstance && window.__safetyHistogramInstance.chart
    );
    await page.waitForSelector('canvas.sh-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._shErrors).toEqual([]);
  });

  test('SH-CTRL-001/SH-CTRL-002/SH-CTRL-006: renders measure, filter, axis, bin, and group controls (#2)', async ({
    page
  }) => {
    const labels = await page.locator('.sh-control label').allTextContents();
    await expect(labels).toEqual(
      expect.arrayContaining([
        'Measure',
        'Site ID',
        'Sex',
        'Race',
        'Treatment Group',
        'Participant ID',
        'Group charts by',
        'Lower',
        'Upper',
        'Algorithm',
        'Quantity',
        'Width',
        'Normal Range',
        'X-axis Ticks'
      ])
    );
    await captureEvidence(page, 'SH-CTRL-001', 'control-panel');
  });

  test('SH-CTRL-003: participant note updates when a filter is applied (#2)', async ({ page }) => {
    const before = await page.locator('.sh-notes').innerText();
    // label:text-is keeps this unambiguous: the Group charts by select also
    // offers a "Sex" option, and both controls now live in .sh-controls (#15).
    await page
      .locator('.sh-controls .sh-control', { has: page.locator('label:text-is("Sex")') })
      .locator('select')
      .selectOption({ index: 1 });
    const after = await page.locator('.sh-notes').innerText();
    expect(after).not.toBe(before);
  });

  test('SH-DATA-002: missing and non-numeric results are dropped with a reported count and visible note (#2)', async ({
    page
  }) => {
    await expect(page.locator('.sh-notes .sh-warning')).toContainText(
      '2 missing or non-numeric results removed.'
    );
    await captureEvidence(page, 'SH-DATA-002', 'invalid-data-note');
  });

  test('SH-CHART-003/SH-FUNC-010/SH-FUNC-012: selecting a canvas bar opens a linked listing with record details and count (#2)', async ({
    page
  }) => {
    await setHarnessSettings(page);
    await selectFirstPopulatedCanvasBar(page);
    await expect(page.locator('.sh-listing-actions')).toContainText('records');
    await expect(page.locator('.sh-listing-actions')).toContainText('Export: CSV');
    const headers = await page.locator('.sh-listing th').allTextContents();
    expect(headers.join(',')).toContain('Participant ID');
    expect(headers.join(',')).toContain('Result');
    expect(headers.join(',')).toContain('Lower Limit of Normal');
    expect(headers.join(',')).toContain('Upper Limit of Normal');
    await expect(page.locator('.sh-footnote')).toContainText(/Selected: \d+ records/);
    await captureEvidence(page, 'SH-FUNC-010', 'linked-listing');
  });

  test('SH-FUNC-011: selecting a bar de-emphasizes the bars outside the linked listing (#2)', async ({
    page
  }) => {
    await setHarnessSettings(page);
    await selectFirstPopulatedCanvasBar(page);
    const colors = await page.evaluate(() => {
      const chart = window.__safetyHistogramInstance.chart;
      const selected = chart.$shSelectedBin;
      const background = chart.data.datasets[0].backgroundColor;
      const other = chart.$shBins.findIndex(
        (bin, index) => index !== selected && bin.records.length > 0
      );
      return {
        isArray: Array.isArray(background),
        selectedColor: background[selected],
        otherColor: background[other]
      };
    });
    expect(colors.isArray).toBe(true);
    expect(colors.selectedColor).not.toBe(colors.otherColor);
    await captureEvidence(page, 'SH-FUNC-011', 'bar-de-emphasis');

    // A re-render clears the selection back to uniform bar colors.
    await page.evaluate(() => window.__safetyHistogramInstance.render());
    const background = await page.evaluate(
      () => window.__safetyHistogramInstance.chart.data.datasets[0].backgroundColor
    );
    expect(Array.isArray(background)).toBe(false);
  });

  test('SH-LIST-001/SH-LIST-002/SH-LIST-003/SH-LIST-004: listing supports pagination, search, sorting, and CSV export (#2)', async ({
    page
  }) => {
    await setHarnessSettings(page);
    await showFullListing(page);

    await expect(page.locator('.sh-listing tbody tr')).toHaveCount(5);
    await page.getByRole('button', { name: '>', exact: true }).click();
    await expect(page.locator('.sh-listing tbody')).toContainText('SUBJ-006');
    await page.getByRole('button', { name: '>>' }).click();
    await expect(page.locator('.sh-listing tbody')).toContainText('SUBJ-026');
    await page.getByRole('button', { name: '<', exact: true }).click();
    await expect(page.locator('.sh-listing tbody')).toContainText('SUBJ-021');
    await page.getByRole('button', { name: '<<' }).click();
    await expect(page.locator('.sh-listing tbody')).toContainText('SUBJ-001');

    await page.locator('.sh-listing-search').fill('SUBJ-012');
    await expect(page.locator('.sh-listing tbody tr')).toHaveCount(1);
    await expect(page.locator('.sh-listing tbody')).toContainText('SUBJ-012');

    await page.locator('.sh-listing-search').fill('');
    await page.locator('.sh-listing th', { hasText: 'Result' }).click();
    await expect(page.locator('.sh-listing th', { hasText: 'Result ▲' })).toBeVisible();
    await expect(page.locator('.sh-listing tbody tr').first()).toContainText('SUBJ-001');
    await page.locator('.sh-listing th', { hasText: /Result/ }).click();
    await expect(page.locator('.sh-listing th', { hasText: 'Result ▼' })).toBeVisible();
    await expect(page.locator('.sh-listing tbody tr').first()).toContainText('SUBJ-030');
    await captureEvidence(page, 'SH-LIST-004', 'search-sort-paginate');

    const download = page.waitForEvent('download');
    await page.locator('.sh-listing-actions button', { hasText: 'Export: CSV' }).click();
    const csvDownload = await download;
    expect(csvDownload.suggestedFilename()).toBe('safety-histogram-listing.csv');
    const csv = fs.readFileSync(await csvDownload.path(), 'utf8');
    expect(csv.split('\n')[0]).toBe(
      'Participant ID,Site ID,Sex,Race,Treatment Group,Participant ID,Result,Lower Limit of Normal,Upper Limit of Normal,Unit'
    );
    expect(csv).toContain('SUBJ-030');
  });

  test('SH-CTRL-004/SH-FUNC-004A/SH-FUNC-004B: normal range checkbox toggles a stable overlay region (#2)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyHistogramInstance;
      instance.state.displayNormalRange = true;
      instance.render();
    });
    await page.waitForFunction(() => window.__safetyHistogramInstance.chart.$shNormalRangeOverlay);
    const overlay = await page.evaluate(
      () => window.__safetyHistogramInstance.chart.$shNormalRangeOverlay
    );
    expect(overlay.low).toBe(10);
    expect(overlay.high).toBe(20);
    expect(overlay.width).toBeGreaterThan(0);
    expect(overlay.left).toBeGreaterThanOrEqual(0);
    expect(overlay.right).toBeGreaterThan(overlay.left);
    await captureEvidence(page, 'SH-CTRL-004', 'normal-range-overlay');

    await page.evaluate(() => {
      const instance = window.__safetyHistogramInstance;
      instance.state.displayNormalRange = false;
      instance.render();
    });
    await page.waitForFunction(
      () => window.__safetyHistogramInstance.chart.$shNormalRangeOverlay === null
    );
    expect(
      await page.evaluate(() => window.__safetyHistogramInstance.chart.$shNormalRangeOverlay)
    ).toBeNull();
  });

  test('SH-FUNC-004C: normal range control is hidden when the measure has no normal range data (#2)', async ({
    page
  }) => {
    const measureSelect = page.locator('.sh-control', { hasText: 'Measure' }).locator('select');
    const normalRangeControl = page.locator('.sh-control', { hasText: 'Normal Range' });

    await expect(normalRangeControl).toBeVisible();
    await measureSelect.selectOption('Pulse (bpm)');
    await expect(normalRangeControl).toBeHidden();
    await captureEvidence(page, 'SH-FUNC-004C', 'control-hidden-for-pulse');
    await measureSelect.selectOption('Albumin (g/dL)');
    await expect(normalRangeControl).toBeVisible();
  });

  test('SH-CTRL-005/SH-FUNC-005A/SH-FUNC-005B/SH-FUNC-005D: x-axis limit inputs redraw and normalize invalid ranges (#2)', async ({
    page
  }) => {
    await setHarnessSettings(page);
    await page.locator('.sh-control', { hasText: 'Lower' }).locator('input').fill('25');
    await page
      .locator('.sh-control', { hasText: 'Lower' })
      .locator('input')
      .dispatchEvent('change');
    await page.locator('.sh-control', { hasText: 'Upper' }).locator('input').fill('5');
    await page
      .locator('.sh-control', { hasText: 'Upper' })
      .locator('input')
      .dispatchEvent('change');
    const domain = await page.evaluate(() => [
      window.__safetyHistogramInstance.state.lower,
      window.__safetyHistogramInstance.state.upper,
      window.__safetyHistogramInstance.chart.$shBins[0].lower,
      window.__safetyHistogramInstance.chart.$shBins.at(-1).upper
    ]);
    expect(domain).toEqual([5, 25, 5, 25]);
    await captureEvidence(page, 'SH-CTRL-005', 'axis-limits');
  });

  test('SH-FUNC-005C: x-axis limit inputs support stepper increments of 1 (#2)', async ({
    page
  }) => {
    await setHarnessSettings(page);
    const lower = page.locator('.sh-control', { hasText: 'Lower' }).locator('input');
    await lower.fill('5');
    await lower.dispatchEvent('change');
    await lower.focus();
    await lower.press('ArrowUp');
    await expect(lower).toHaveValue('6');
    await lower.press('ArrowDown');
    await expect(lower).toHaveValue('5');
  });

  test('SH-CTRL-007: x-axis tick mode switches labels between centers and bin boundaries (#2)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyHistogramInstance;
      instance.state.annotateBoundaries = false;
      instance.render();
    });
    const midpointLabels = await page.evaluate(
      () => window.__safetyHistogramInstance.chart.data.labels
    );
    expect(midpointLabels.some((label) => label.includes('–'))).toBe(false);

    await page
      .locator('.sh-control', { hasText: 'X-axis Ticks' })
      .locator('select')
      .selectOption('boundaries');
    const boundaryLabels = await page.evaluate(
      () => window.__safetyHistogramInstance.chart.data.labels
    );
    expect(boundaryLabels.some((label) => label.includes('–'))).toBe(true);
    await captureEvidence(page, 'SH-CTRL-007', 'boundary-ticks');
  });

  test('SH-CHART-005: p-value annotations display the approximation and validation disclaimer (#2)', async ({
    page
  }) => {
    await setHarnessSettings(page, { group_by: 'ARM', compare_distributions: true });
    await expect(page.locator('.sh-main-annotation')).toContainText(/Normality: p=/);
    await expect(page.locator('.sh-main-annotation .sh-info')).toHaveAttribute(
      'title',
      /not validated/
    );
    await expect(page.locator('.sh-multiple .sh-annotation').first()).toContainText(
      /Group comparison: p=/
    );
    await expect(page.locator('.sh-multiple .sh-info').first()).toHaveAttribute(
      'title',
      /not validated/
    );
    await captureEvidence(page, 'SH-CHART-005', 'pvalue-disclaimer');
  });

  test('SH-CHART-004: group-by renders grouped histograms (#2)', async ({ page }) => {
    await page
      .locator('.sh-control', { hasText: 'Group charts by' })
      .locator('select')
      .selectOption('SEX');
    await expect(page.locator('.sh-multiple').first()).toBeVisible();
    await captureEvidence(page, 'SH-CHART-004', 'grouped-multiples');
  });

  test('SH-API-001: lifecycle API supports init, setData, setSettings, render, resize, and destroy (#2)', async ({
    page
  }) => {
    const result = await page.evaluate(() => {
      const instance = window.__safetyHistogramInstance;
      const methods = ['init', 'setData', 'setSettings', 'render', 'resize', 'destroy'];
      const hasMethods = methods.every((method) => typeof instance[method] === 'function');
      const setSettingsReturnsInstance =
        instance.setSettings({ page_size: 4, group_by: 'sh_none' }) === instance;
      const setDataReturnsInstance = instance.setData(instance.rawData.slice(0, 12)) === instance;
      const renderReturns = instance.render();
      instance.resize();
      const chartCountBeforeDestroy = instance.charts.length;
      instance.destroy();
      return {
        hasMethods,
        setSettingsReturnsInstance,
        setDataReturnsInstance,
        renderReturns,
        chartCountBeforeDestroy,
        containerText: document.querySelector('#container').textContent.trim()
      };
    });
    expect(result.hasMethods).toBe(true);
    expect(result.setSettingsReturnsInstance).toBe(true);
    expect(result.setDataReturnsInstance).toBe(true);
    expect(result.renderReturns).toBeUndefined();
    expect(result.chartCountBeforeDestroy).toBeGreaterThan(0);
    expect(result.containerText).toBe('');
  });
});
