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
  await expect(page.locator('.sv-listing table')).toBeVisible();
}

async function selectFirstPopulatedCanvasBar(page) {
  await page.evaluate(() => {
    const instance = window.__safetyHistogramInstance;
    const chart = instance.chart;
    const index = chart.$shBins.findIndex((bin) => bin.records.length > 0);
    chart.options.onClick({}, [{ index }]);
  });
  await expect(page.locator('.sv-listing table')).toBeVisible();
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
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._shErrors).toEqual([]);
  });

  test('SH-CTRL-001/SH-CTRL-002/SH-CTRL-006: renders measure, filter, axis, bin, and group controls (#2)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
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
    const before = await page.locator('.sv-notes').innerText();
    // label:text-is keeps this unambiguous: the Group charts by select also
    // offers a "Sex" option, and both controls now live in .sv-controls (#15).
    await page
      .locator('.sv-controls .sv-control', { has: page.locator('label:text-is("Sex")') })
      .locator('select')
      .selectOption({ index: 1 });
    const after = await page.locator('.sv-notes').innerText();
    expect(after).not.toBe(before);
  });

  test('SH-DATA-002: missing and non-numeric results are dropped with a reported count and visible note (#2)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      '2 missing or non-numeric results removed.'
    );
    await captureEvidence(page, 'SH-DATA-002', 'invalid-data-note');
  });

  test('SH-CHART-003/SH-FUNC-010/SH-FUNC-012: selecting a canvas bar opens a linked listing with record details and count (#2)', async ({
    page
  }) => {
    await setHarnessSettings(page);
    await selectFirstPopulatedCanvasBar(page);
    await expect(page.locator('.sv-listing-actions')).toContainText('records');
    await expect(page.locator('.sv-listing-actions')).toContainText('Export: CSV');
    const headers = await page.locator('.sv-listing th').allTextContents();
    expect(headers.join(',')).toContain('Participant ID');
    expect(headers.join(',')).toContain('Result');
    expect(headers.join(',')).toContain('Lower Limit of Normal');
    expect(headers.join(',')).toContain('Upper Limit of Normal');
    await expect(page.locator('.sv-footnote')).toContainText(/Selected: \d+ records/);
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

    await expect(page.locator('.sv-listing tbody tr')).toHaveCount(5);
    await page.getByRole('button', { name: '>', exact: true }).click();
    await expect(page.locator('.sv-listing tbody')).toContainText('SUBJ-006');
    await page.getByRole('button', { name: '>>' }).click();
    await expect(page.locator('.sv-listing tbody')).toContainText('SUBJ-026');
    await page.getByRole('button', { name: '<', exact: true }).click();
    await expect(page.locator('.sv-listing tbody')).toContainText('SUBJ-021');
    await page.getByRole('button', { name: '<<' }).click();
    await expect(page.locator('.sv-listing tbody')).toContainText('SUBJ-001');

    await page.locator('.sv-listing-search').fill('SUBJ-012');
    await expect(page.locator('.sv-listing tbody tr')).toHaveCount(1);
    await expect(page.locator('.sv-listing tbody')).toContainText('SUBJ-012');

    await page.locator('.sv-listing-search').fill('');
    await page.locator('.sv-listing th', { hasText: 'Result' }).click();
    await expect(page.locator('.sv-listing th', { hasText: 'Result ▲' })).toBeVisible();
    await expect(page.locator('.sv-listing tbody tr').first()).toContainText('SUBJ-001');
    await page.locator('.sv-listing th', { hasText: /Result/ }).click();
    await expect(page.locator('.sv-listing th', { hasText: 'Result ▼' })).toBeVisible();
    await expect(page.locator('.sv-listing tbody tr').first()).toContainText('SUBJ-030');
    await captureEvidence(page, 'SH-LIST-004', 'search-sort-paginate');

    const download = page.waitForEvent('download');
    await page.locator('.sv-listing-actions button', { hasText: 'Export: CSV' }).click();
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
    const measureSelect = page.locator('.sv-control', { hasText: 'Measure' }).locator('select');
    const normalRangeControl = page.locator('.sv-control', { hasText: 'Normal Range' });

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
    await page.locator('.sv-control', { hasText: 'Lower' }).locator('input').fill('25');
    await page
      .locator('.sv-control', { hasText: 'Lower' })
      .locator('input')
      .dispatchEvent('change');
    await page.locator('.sv-control', { hasText: 'Upper' }).locator('input').fill('5');
    await page
      .locator('.sv-control', { hasText: 'Upper' })
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

  test('SH-AXIS-001/SH-AXIS-002/SH-AXIS-003: x-axis limit inputs load pre-filled with the drawn domain, follow the measure, and Reset restores them (#85)', async ({
    page
  }) => {
    const measure = page.locator('.sv-control', { hasText: 'Measure' }).locator('select');
    const lower = page.locator('.sv-control', { hasText: 'Lower' }).locator('input');
    const upper = page.locator('.sv-control', { hasText: 'Upper' }).locator('input');
    const drawn = () =>
      page.evaluate(() => {
        const chart = window.__safetyHistogramInstance.chart;
        return [chart.$shBins[0].lower, chart.$shBins.at(-1).upper];
      });

    // Loaded pre-filled with the axis the chart actually drew (AXIS-1).
    const domain = await drawn();
    const tolerance = (domain[1] - domain[0]) / 500;
    expect(await lower.inputValue()).not.toBe('');
    expect(await upper.inputValue()).not.toBe('');
    expect(Math.abs(Number(await lower.inputValue()) - domain[0])).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(Number(await upper.inputValue()) - domain[1])).toBeLessThanOrEqual(tolerance);

    // Untouched limits still follow the data across a measure change (AXIS-2).
    await measure.selectOption('Pulse (bpm)');
    await page.waitForFunction(() => window.__safetyHistogramInstance.chart);
    const pulse = await drawn();
    expect(pulse).not.toEqual(domain);
    expect(Math.abs(Number(await lower.inputValue()) - pulse[0])).toBeLessThanOrEqual(
      (pulse[1] - pulse[0]) / 500
    );

    // An edit is respected, and Reset Limits puts the derived values back
    // (AXIS-3) instead of blanking the boxes.
    await lower.fill(String(pulse[0] + 2));
    await lower.dispatchEvent('change');
    expect(await page.evaluate(() => window.__safetyHistogramInstance.state.lower)).toBe(
      pulse[0] + 2
    );
    await page.locator('.sv-reset-limits').click();
    expect(await page.evaluate(() => window.__safetyHistogramInstance.state.lower)).toBeNull();
    expect(await lower.inputValue()).not.toBe('');
    expect(Math.abs(Number(await lower.inputValue()) - pulse[0])).toBeLessThanOrEqual(
      (pulse[1] - pulse[0]) / 500
    );
    await captureEvidence(page, 'SH-AXIS-001', 'axis-limits-prefilled');
  });

  test('SH-FUNC-005C: x-axis limit inputs support stepper increments of 1 (#2)', async ({
    page
  }) => {
    await setHarnessSettings(page);
    const lower = page.locator('.sv-control', { hasText: 'Lower' }).locator('input');
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
      .locator('.sv-control', { hasText: 'X-axis Ticks' })
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
    await expect(page.locator('.sv-main-annotation')).toContainText(/Normality: p=/);
    await expect(page.locator('.sv-main-annotation .sv-info')).toHaveAttribute(
      'title',
      /not validated/
    );
    await expect(page.locator('.sv-multiple .sv-annotation').first()).toContainText(
      /Group comparison: p=/
    );
    await expect(page.locator('.sv-multiple .sv-info').first()).toHaveAttribute(
      'title',
      /not validated/
    );
    await captureEvidence(page, 'SH-CHART-005', 'pvalue-disclaimer');
  });

  test("SH-CHART-004/SH-CTRL-006: grouped small multiples share the main chart's bin boundaries (#19)", async ({
    page
  }) => {
    // The original renderer clones x.bin and x.domain from the main chart
    // into the small multiples, so every group panel bins on the same edges.
    await setHarnessSettings(page, { group_by: 'ARM', compare_distributions: true });
    await expect(page.locator('.sv-multiple')).toHaveCount(2);
    const result = await page.evaluate(() => {
      const instance = window.__safetyHistogramInstance;
      const edges = (chart) => (chart.$shBins || []).map((bin) => [bin.lower, bin.upper]);
      const main = instance.chart;
      const multiples = instance.charts.filter((chart) => chart !== main);
      return {
        mainEdges: edges(main),
        multipleEdges: multiples.map(edges),
        multipleTotals: multiples.map((chart) =>
          (chart.$shBins || []).reduce((sum, bin) => sum + bin.records.length, 0)
        )
      };
    });
    // Albumin 1..30: Scott gives ceil(29/9.9163) = 3 raw bins, floored to the
    // original's 5-bin minimum → 5 shared bins of width 5.8 over [1, 30].
    expect(result.mainEdges).toHaveLength(5);
    expect(result.mainEdges[0][0]).toBe(1);
    expect(result.mainEdges.at(-1)[1]).toBe(30);
    for (const edges of result.multipleEdges) expect(edges).toEqual(result.mainEdges);
    // Placebo and Drug each hold 15 of the 30 Albumin results.
    expect(result.multipleTotals).toEqual([15, 15]);
    await captureEvidence(page, 'SH-CTRL-006', 'shared-bin-multiples');
  });

  test('SH-CTRL-006: bin boundaries anchor to the measure results, not the filtered subset (#19)', async ({
    page
  }) => {
    // In the original renderer, filters change bar heights but never the bin
    // edges: bin width/count are computed from the measure's full result set
    // while the x-domain is untouched.
    await setHarnessSettings(page);
    const edgesOf = () =>
      page.evaluate(() =>
        window.__safetyHistogramInstance.chart.$shBins.map((bin) => [bin.lower, bin.upper])
      );
    const before = await edgesOf();
    await page
      .locator('.sv-controls .sv-control', {
        has: page.locator('label:text-is("Treatment Group")')
      })
      .locator('select')
      .selectOption('Placebo');
    const after = await edgesOf();
    expect(after).toEqual(before);
    const total = await page.evaluate(() =>
      window.__safetyHistogramInstance.chart.$shBins.reduce(
        (sum, bin) => sum + bin.records.length,
        0
      )
    );
    expect(total).toBe(15);
  });

  test('SH-CTRL-008/SH-REG-024/SH-REG-025/SH-REG-026: bin quantity and width inputs reflect the resolved binning (#19)', async ({
    page
  }) => {
    // The original renderer writes the resolved bin count and width back into
    // the Bins inputs after every render (updateBinQuantity/updateBinWidth),
    // with the Width input disabled as a display of the resolved value.
    const quantity = page.locator('.sv-control', { hasText: 'Quantity' }).locator('input');
    const width = page.locator('.sv-control', { hasText: 'Width' }).locator('input');
    // Scott's rule (the default) resolves 5 bins of width 5.8 for the fixture measure.
    await expect(quantity).toHaveValue('5');
    await expect(width).toHaveValue('5.8');
    await expect(width).toBeDisabled();

    await page
      .locator('.sv-control', { hasText: 'Algorithm' })
      .locator('select')
      .selectOption("Shimazaki and Shinomoto's choice");
    await expect(quantity).toHaveValue('2');
    await expect(width).toHaveValue('14.5');
    const bars = await page.evaluate(() => window.__safetyHistogramInstance.chart.$shBins.length);
    expect(bars).toBe(2);
    await captureEvidence(page, 'SH-CTRL-008', 'bins-inputs-populated');
  });

  test('SH-CTRL-008/SH-REG-020: editing Quantity switches the algorithm to Custom and recomputes the width (#19)', async ({
    page
  }) => {
    const quantity = page.locator('.sv-control', { hasText: 'Quantity' }).locator('input');
    await quantity.fill('10');
    await quantity.dispatchEvent('change');
    await expect(
      page.locator('.sv-control', { hasText: 'Algorithm' }).locator('select')
    ).toHaveValue('Custom');
    await expect(page.locator('.sv-control', { hasText: 'Width' }).locator('input')).toHaveValue(
      '2.9'
    );
    const bars = await page.evaluate(() => window.__safetyHistogramInstance.chart.$shBins.length);
    expect(bars).toBe(10);
  });

  test('SH-CHART-004: group-by renders grouped histograms (#2)', async ({ page }) => {
    await page
      .locator('.sv-control', { hasText: 'Group charts by' })
      .locator('select')
      .selectOption('SEX');
    await expect(page.locator('.sv-multiple').first()).toBeVisible();
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

  test('PPRF-SH-001/PPRF-SH-002: clicking a listing row focuses the participant into the docked profile (#99)', async ({
    page
  }) => {
    await selectFirstPopulatedCanvasBar(page);
    const firstRow = page.locator('.sv-listing tbody tr').first();
    // Rows are keyboard-focusable buttons (opt-in affordance, PPRF-ACC-001 bar).
    await expect(firstRow).toHaveAttribute('role', 'button');
    await expect(firstRow).toHaveAttribute('tabindex', '0');
    const participantId = (await firstRow.locator('td').first().textContent()).trim();
    await firstRow.click();
    // Full docked profile: header id + configured profile_details.
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText(
      `Participant ${participantId}`
    );
    await expect(page.locator('.sv-profile .sv-profile-header')).toContainText('Sex');
    // Single-select gesture: never a stepper.
    await expect(page.locator('.sv-profile .sv-profile-step-count')).toHaveCount(0);
    // The fixture's measures are non-key labs — they sit behind the module's
    // "show N additional measures" toggle (the module-default key-measure map
    // matches no fixture TEST value).
    await expect(page.locator('.sv-profile .sv-profile-extras')).toContainText(
      /Show \d+ additional measure/
    );
    await page.locator('.sv-profile .sv-profile-extras input').check();
    await expect(page.locator('.sv-profile .sv-profile-spaghetti canvas')).toBeVisible();
    // The linked listing STAYS beside the dock (PPRF-11: records vs story),
    // with the focused participant's rows highlighted.
    await expect(page.locator('.sv-listing table')).toBeVisible();
    const highlighted = page.locator('.sv-listing tr.sv-listing-row-selected');
    await expect(highlighted.first()).toBeVisible();
    for (const text of await highlighted.locator('td:first-child').allTextContents()) {
      expect(text.trim()).toBe(participantId);
    }
    await captureEvidence(page, 'PPRF-SH-002', 'docked-profile-from-listing-row');
  });

  test('PPRF-SH-003: the dock Clear affordance un-highlights the row and keeps the listing (#99)', async ({
    page
  }) => {
    await selectFirstPopulatedCanvasBar(page);
    await page.locator('.sv-listing tbody tr').first().click();
    await expect(page.locator('.sv-profile .sv-profile-id')).toBeVisible();
    await page.locator('.sv-profile .sv-profile-clear').click();
    // Dock empties and the shell's :empty rule hides the slot.
    await expect(page.locator('.sv-profile > *')).toHaveCount(0);
    await expect(page.locator('.sv-profile')).toBeHidden();
    // The listing stays — Clear clears the focus, not the records.
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await expect(page.locator('.sv-listing tr.sv-listing-row-selected')).toHaveCount(0);
    const selectedId = await page.evaluate(() => window.__safetyHistogramInstance.state.selectedId);
    expect(selectedId).toBeNull();
  });

  test('PPRF-SH-003: a new bin click and control changes empty the dock (#99)', async ({
    page
  }) => {
    await selectFirstPopulatedCanvasBar(page);
    await page.locator('.sv-listing tbody tr').first().click();
    await expect(page.locator('.sv-profile .sv-profile-id')).toBeVisible();
    // A new bin click replaces the listing → the focused participant clears.
    await selectFirstPopulatedCanvasBar(page);
    await expect(page.locator('.sv-profile > *')).toHaveCount(0);
    // Re-focus, then drive a control change: the render preamble resets the
    // selection AND the dock.
    await page.locator('.sv-listing tbody tr').first().click();
    await expect(page.locator('.sv-profile .sv-profile-id')).toBeVisible();
    await page
      .locator('.sv-controls .sv-control', { has: page.locator('label:text-is("Sex")') })
      .locator('select')
      .selectOption('F');
    await expect(page.locator('.sv-profile > *')).toHaveCount(0);
  });

  test.describe('all-measures overview (#39)', () => {
    const measureSelect = (page) =>
      page.locator('.sv-control', { hasText: 'Measure' }).locator('select');

    async function selectAllMeasures(page) {
      await measureSelect(page).selectOption({ label: 'All Measures' });
      await expect(page.locator('#container .sv-overview-panel')).toHaveCount(3);
    }

    test('SH-OVW-001: the overview is the default view when start_value is not set (#39)', async ({
      page
    }) => {
      const result = await page.evaluate(() => {
        const mount = document.createElement('div');
        mount.id = 'default-container';
        document.body.append(mount);
        const instance = window.SafetyViz.histogram('#default-container', {});
        instance.init(window.__safetyHistogramData);
        const select = mount.querySelector('.sv-control select');
        return {
          selectedLabel: select.selectedOptions[0].textContent,
          panelCount: mount.querySelectorAll('.sv-overview-panel').length,
          mainChartHidden: mount.querySelector('.sv-chart-wrap').classList.contains('sv-hidden'),
          mainChart: instance.chart ?? null
        };
      });
      expect(result.selectedLabel).toBe('All Measures');
      expect(result.panelCount).toBe(3);
      expect(result.mainChartHidden).toBe(true);
      expect(result.mainChart).toBeNull();
    });

    test('SH-OVW-001: an unknown start_value warns and falls back to the overview (#39)', async ({
      page
    }) => {
      const result = await page.evaluate(() => {
        const warnings = [];
        const original = console.warn;
        console.warn = (message) => warnings.push(String(message));
        const mount = document.createElement('div');
        mount.id = 'unknown-container';
        document.body.append(mount);
        const instance = window.SafetyViz.histogram('#unknown-container', {
          start_value: 'Bogus Measure'
        });
        instance.init(window.__safetyHistogramData);
        console.warn = original;
        return {
          warnings,
          panelCount: mount.querySelectorAll('.sv-overview-panel').length
        };
      });
      expect(result.warnings.join(' ')).toContain('Bogus Measure');
      expect(result.panelCount).toBe(3);
    });

    test('SH-OVW-002: the overview renders one independently binned panel per measure (#39)', async ({
      page
    }) => {
      await selectAllMeasures(page);
      const titles = await page.locator('#container .sv-overview-panel h3').allTextContents();
      expect(titles.map((title) => title.replace(/ \(\d+ results\)$/, ''))).toEqual([
        'Albumin (g/dL)',
        'Bilirubin (mg/dL)',
        'Pulse (bpm)'
      ]);
      titles.forEach((title) => expect(title).toMatch(/ \(\d+ results\)$/));
      await expect(page.locator('#container .sv-overview-panel canvas')).toHaveCount(3);
      const binning = await page.evaluate(() =>
        window.__safetyHistogramInstance.charts.map((chart) => ({
          bins: chart.$shBins.length,
          lower: chart.$shBins[0].lower,
          upper: chart.$shBins.at(-1).upper
        }))
      );
      expect(binning).toHaveLength(3);
      const domains = new Set(binning.map((panel) => `${panel.lower}:${panel.upper}`));
      expect(domains.size).toBe(3);
      await captureEvidence(page, 'SH-OVW-002', 'overview-panels');
    });

    test('SH-OVW-003: clicking a small multiple opens that measure in the single-measure view (#39)', async ({
      page
    }) => {
      await selectAllMeasures(page);
      await expect(page.locator('#container .sv-footnote')).toHaveText(
        'Click a chart to view that measure.'
      );
      await page.locator('#container .sv-overview-panel', { hasText: 'Pulse (bpm)' }).click();
      await expect(measureSelect(page)).toHaveValue('Pulse (bpm)');
      await expect(page.locator('#container .sv-chart-wrap')).toBeVisible();
      await page.waitForFunction(() => window.__safetyHistogramInstance.chart);
      await expect(page.locator('#container .sv-overview-panel')).toHaveCount(0);
      await captureEvidence(page, 'SH-OVW-003', 'click-through-to-pulse');
    });

    test('SH-OVW-004: selecting All Measures returns from a single-measure view to the overview (#39)', async ({
      page
    }) => {
      await selectAllMeasures(page);
      await measureSelect(page).selectOption('Albumin (g/dL)');
      await page.waitForFunction(() => window.__safetyHistogramInstance.chart);
      await expect(page.locator('#container .sv-overview-panel')).toHaveCount(0);
      await selectAllMeasures(page);
      await expect(page.locator('#container .sv-chart-wrap')).toBeHidden();
    });

    test('SH-OVW-005: filters stay active in the overview and measure controls hide (#39)', async ({
      page
    }) => {
      await selectAllMeasures(page);
      for (const section of ['X-axis Limits', 'Bins', 'Display', 'Grouping']) {
        await expect(
          page.locator('#container .sv-control-section', { hasText: section })
        ).toBeHidden();
      }
      await expect(
        page.locator('#container .sv-control-section', { hasText: 'Filters' })
      ).toBeVisible();
      const albuminTitle = page.locator('#container .sv-overview-panel h3', {
        hasText: 'Albumin'
      });
      const before = await albuminTitle.textContent();
      const sexFilter = page.locator('.sv-control', { hasText: 'Sex' }).first().locator('select');
      await sexFilter.selectOption('F');
      await expect(page.locator('#container .sv-overview-panel')).toHaveCount(3);
      const after = await albuminTitle.textContent();
      expect(after).not.toBe(before);
      await captureEvidence(page, 'SH-OVW-005', 'overview-filtered');
      await measureSelect(page).selectOption('Albumin (g/dL)');
      for (const section of ['X-axis Limits', 'Bins', 'Display', 'Grouping']) {
        await expect(
          page.locator('#container .sv-control-section', { hasText: section })
        ).toBeVisible();
      }
    });
  });
});
