import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the outlier-explorer module (#24). Test names are keyed
// to requirement IDs from the safety.agent safety-outlier-explorer matrix per
// the traceability convention in CONTRIBUTING.md; see
// docs/outlier-explorer-coverage.md for the requirement-ID -> matrix-row -> test
// map. The fixture carries explicit visit / study-day columns so the x-axis
// toggle, normal-range methods, grouping, and selection assert deterministically.

test.describe('safety.viz outlier-explorer module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._oeErrors = errors;
    await page.goto('/tests/e2e/fixtures/outlier-explorer.html');
    await page.waitForFunction(
      () => window.__safetyOutlierExplorerInstance && window.__safetyOutlierExplorerInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._oeErrors).toEqual([]);
  });

  test('SOE-FUNC-001/SOE-FUNC-002/SOE-FUNC-004/SOE-FUNC-005/SOE-FUNC-006/SOE-FUNC-007: renders the full control panel (#24)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Measure',
        'Sex',
        'Treatment Group',
        'Plot by',
        'Lower',
        'Upper',
        'Method',
        'Group by'
      ])
    );
    await expect(page.locator('.oe-reset')).toHaveText('Reset Limits');
    await captureEvidence(page, 'SOE-FUNC-001', 'control-panel');
  });

  test('SOE-FUNC-003/SOE-REG-001/SOE-REG-002: participant note reports N and % and updates on filter (#24)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes')).toContainText('4 of 4 participants shown (100.0%)');
    await page
      .locator('.sv-controls .sv-control', { has: page.locator('label:text-is("Sex")') })
      .locator('select')
      .selectOption('F');
    await expect(page.locator('.sv-notes')).toContainText('2 of 4 participants shown (50.0%)');
  });

  test('SOE-REG-037/SOE-REG-038: missing and non-numeric results are dropped with a reported count and note (#24)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      '2 missing or non-numeric results removed.'
    );
    await captureEvidence(page, 'SOE-REG-037', 'invalid-data-note');
  });

  test('SOE-FUNC-010/SOE-FUNC-012/SOE-REG-013/SOE-REG-014/SOE-REG-016: clicking a point highlights the participant and opens a linked listing (#24)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    });
    await expect(page.locator('.sv-listing table')).toBeVisible();
    const headers = await page.locator('.sv-listing th').allTextContents();
    expect(headers.join(',')).toContain('Participant ID');
    expect(headers.join(',')).toContain('Result');
    expect(headers.join(',')).toContain('Age');
    expect(headers.join(',')).toContain('Sex');
    expect(headers.join(',')).toContain('Race');
    await expect(page.locator('.sv-footnote')).toContainText(/Selected participant/);

    const state = await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      return {
        selectedId: instance.state.selectedId,
        overlayCount: instance.chart.data.datasets[1].data.length
      };
    });
    expect(state.selectedId).toBeTruthy();
    expect(state.overlayCount).toBeGreaterThan(0);
    await captureEvidence(page, 'SOE-FUNC-010', 'participant-detail');
  });

  test('SOE-FUNC-010/SOE-REG-020: clicking the background clears the selection and listing (#24)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    });
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await page.evaluate(() => {
      window.__safetyOutlierExplorerInstance.chart.options.onClick({}, []);
    });
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
    expect(
      await page.evaluate(() => window.__safetyOutlierExplorerInstance.state.selectedId)
    ).toBeNull();
  });

  test('SOE-FUNC-007/SOE-REG-025/SOE-REG-026/SOE-REG-027: normal-range methods drive the band and conditional inputs (#24)', async ({
    page
  }) => {
    const methodSelect = page.locator('.sv-control', { hasText: 'Method' }).locator('select');

    // LLN-ULN (default): band present between the median limits.
    await page.waitForFunction(
      () => window.__safetyOutlierExplorerInstance.chart.$oeNormalRangeOverlay
    );
    const llnBand = await page.evaluate(
      () => window.__safetyOutlierExplorerInstance.chart.$oeNormalRangeOverlay
    );
    expect(llnBand.low).toBe(35);
    expect(llnBand.high).toBe(50);
    expect(llnBand.height).toBeGreaterThan(0);
    await captureEvidence(page, 'SOE-FUNC-007', 'normal-range-band');

    // None: band removed.
    await methodSelect.selectOption('None');
    await page.waitForFunction(
      () => window.__safetyOutlierExplorerInstance.chart.$oeNormalRangeOverlay === null
    );

    // Standard Deviation: band returns and the # Std. Dev. input appears.
    await methodSelect.selectOption('Standard Deviation');
    await expect(page.locator('.sv-control', { hasText: '# Std. Dev.' })).toBeVisible();
    await page.waitForFunction(
      () => window.__safetyOutlierExplorerInstance.chart.$oeNormalRangeOverlay
    );

    // Quantiles: two quantile inputs appear in the Normal Range section.
    await methodSelect.selectOption('Quantiles');
    const nrSection = page.locator('.sv-control-section', { hasText: 'Normal Range' });
    await expect(nrSection.locator('.sv-control-row input')).toHaveCount(2);
  });

  test('SOE-FUNC-005/SOE-FUNC-006/SOE-REG-004/SOE-REG-005/SOE-REG-006: y-axis limits redraw, normalize, and reset (#24)', async ({
    page
  }) => {
    const lower = page.locator('.sv-control', { hasText: 'Lower' }).locator('input');
    const upper = page.locator('.sv-control', { hasText: 'Upper' }).locator('input');
    await lower.fill('40');
    await lower.dispatchEvent('change');
    await upper.fill('20');
    await upper.dispatchEvent('change');
    // Inverted limits are swapped, and the y-scale reflects them.
    const domain = await page.evaluate(() => {
      const chart = window.__safetyOutlierExplorerInstance.chart;
      return [chart.scales.y.min, chart.scales.y.max];
    });
    expect(domain).toEqual([20, 40]);

    await page.locator('.oe-reset').click();
    const reset = await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      return [instance.state.lower, instance.state.upper];
    });
    expect(reset).toEqual([null, null]);
  });

  test('SOE-AXIS-001/SOE-AXIS-002/SOE-AXIS-003: y-limit inputs load pre-filled with the drawn axis, follow the measure, and Reset restores them (#85)', async ({
    page
  }) => {
    const measure = page.locator('.sv-control', { hasText: 'Measure' }).locator('select');
    const lower = page.locator('.sv-control', { hasText: 'Lower' }).locator('input');
    const upper = page.locator('.sv-control', { hasText: 'Upper' }).locator('input');
    const drawn = () =>
      page.evaluate(() => {
        const scale = window.__safetyOutlierExplorerInstance.chart.scales.y;
        return [scale.min, scale.max];
      });

    // Loaded pre-filled with the padded axis the chart actually drew (AXIS-1).
    const domain = await drawn();
    const tolerance = (domain[1] - domain[0]) / 500;
    expect(await lower.inputValue()).not.toBe('');
    expect(await upper.inputValue()).not.toBe('');
    expect(Math.abs(Number(await lower.inputValue()) - domain[0])).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(Number(await upper.inputValue()) - domain[1])).toBeLessThanOrEqual(tolerance);

    // Untouched limits still follow the data across a measure change (AXIS-2).
    await measure.selectOption('Sodium (mmol/L)');
    const sodium = await drawn();
    expect(sodium).not.toEqual(domain);
    expect(Math.abs(Number(await lower.inputValue()) - sodium[0])).toBeLessThanOrEqual(
      (sodium[1] - sodium[0]) / 500
    );

    // An edit is respected, and Reset Limits puts the derived values back
    // (AXIS-3) instead of blanking the boxes.
    await lower.fill(String(Math.round(sodium[0]) + 2));
    await lower.dispatchEvent('change');
    expect(await page.evaluate(() => window.__safetyOutlierExplorerInstance.state.lower)).toBe(
      Math.round(sodium[0]) + 2
    );
    await page.locator('.oe-reset').click();
    expect(
      await page.evaluate(() => window.__safetyOutlierExplorerInstance.state.lower)
    ).toBeNull();
    expect(await lower.inputValue()).not.toBe('');
    expect(Math.abs(Number(await lower.inputValue()) - sodium[0])).toBeLessThanOrEqual(
      (sodium[1] - sodium[0]) / 500
    );
    await captureEvidence(page, 'SOE-AXIS-001', 'y-limits-prefilled');
  });

  test('SOE-REG-048/SOE-REG-049/SOE-REG-050: grouping colors the marks and renders a legend (#24)', async ({
    page
  }) => {
    await expect(page.locator('.oe-legend .oe-legend-item')).toHaveCount(0);
    await page
      .locator('.sv-control', { hasText: 'Group by' })
      .locator('select')
      .selectOption('ARM');
    await expect(page.locator('.oe-legend .oe-legend-item')).toHaveCount(2);
    await expect(page.locator('.oe-legend')).toContainText('Placebo');
    await expect(page.locator('.oe-legend')).toContainText('Drug');
    await captureEvidence(page, 'SOE-REG-049', 'color-by-group');
  });

  test('SOE-FUNC-004/SOE-REG-003: the x-axis toggle switches between the visit and study-day axes (#24)', async ({
    page
  }) => {
    expect(
      await page.evaluate(() => window.__safetyOutlierExplorerInstance.chart.scales.x.type)
    ).toBe('category');
    await page
      .locator('.sv-control', { hasText: 'Plot by' })
      .locator('select')
      .selectOption({ label: 'Study Day' });
    expect(
      await page.evaluate(() => window.__safetyOutlierExplorerInstance.chart.scales.x.type)
    ).toBe('linear');
  });

  test('SOE-REG-011: point tooltips list participant, result, and time (#24)', async ({ page }) => {
    const lines = await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      return instance.chart.options.plugins.tooltip.callbacks.label({
        datasetIndex: 0,
        dataIndex: 0
      });
    });
    expect(lines[0]).toMatch(/^SUBJ-/);
    expect(lines[1]).toContain('Albumin');
    expect(lines[2]).toContain('Time:');
  });

  test('SOE-API-003: participantsSelected fires on select and clear (#24)', async ({ page }) => {
    const events = await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      const seen = [];
      instance.root.addEventListener('participantsSelected', (event) =>
        seen.push(event.detail.data.slice())
      );
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
      instance.chart.options.onClick({}, []);
      return seen;
    });
    expect(events.length).toBe(2);
    expect(events[0].length).toBe(1);
    expect(events[1].length).toBe(0);
  });

  test('SOE-REG-051/SOE-REG-052/SOE-REG-053: a filter with a start value initializes filtered and offers no All option (#24)', async ({
    page
  }) => {
    await page.evaluate(() => {
      window.__safetyOutlierExplorerInstance.setSettings({
        filters: [{ value_col: 'ARM', label: 'Treatment Group', start: 'Placebo' }]
      });
    });
    const armSelect = page
      .locator('.sv-controls .sv-control', {
        has: page.locator('label:text-is("Treatment Group")')
      })
      .locator('select');
    const options = await armSelect.locator('option').allTextContents();
    expect(options).not.toContain('All');
    await expect(armSelect).toHaveValue('Placebo');
    await expect(page.locator('.sv-notes')).toContainText('2 of 4 participants shown');
  });

  test('SOE-API-001: lifecycle API supports init, setData, setSettings, render, resize, and destroy (#24)', async ({
    page
  }) => {
    const result = await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      const methods = ['init', 'setData', 'setSettings', 'render', 'resize', 'destroy'];
      const hasMethods = methods.every((method) => typeof instance[method] === 'function');
      const setSettingsReturnsInstance = instance.setSettings({ group_by: 'oe_none' }) === instance;
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

  test('PPRF-OE-001/PPRF-OE-002: clicking a point opens the docked profile ALONGSIDE the linked listing (#99)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    });
    // Full docked profile: header id + configured profile_details.
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText('Participant SUBJ-001');
    await expect(page.locator('.sv-profile .sv-profile-header')).toContainText('Placebo');
    // Single-select gesture: never a stepper.
    await expect(page.locator('.sv-profile .sv-profile-step-count')).toHaveCount(0);
    // The fixture's measures are non-key labs — they sit behind the module's
    // "show N additional measures" toggle; revealing them fills the table and
    // the spaghetti (the module-default key-measure map matches no fixture
    // TEST value).
    await expect(page.locator('.sv-profile .sv-profile-extras')).toContainText(
      'Show 2 additional measures'
    );
    await page.locator('.sv-profile .sv-profile-extras input').check();
    await expect(page.locator('.sv-profile .sv-profile-measure-row:visible')).toHaveCount(2);
    await expect(page.locator('.sv-profile .sv-profile-spaghetti canvas')).toBeVisible();
    // The linked listing STAYS beside the dock (PPRF-11: records vs story).
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await captureEvidence(page, 'PPRF-OE-002', 'docked-profile');
  });

  test('PPRF-OE-003: background click and control changes empty the dock (#99)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    });
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText('Participant SUBJ-001');

    // Background click → the shared clear path → the dock empties and the
    // shell's :empty rule hides the slot.
    await page.evaluate(() => {
      window.__safetyOutlierExplorerInstance.chart.options.onClick({}, []);
    });
    await expect(page.locator('.sv-profile > *')).toHaveCount(0);
    await expect(page.locator('.sv-profile')).toBeHidden();

    // Re-select, then drive a control change: the render preamble resets the
    // selection AND the dock.
    await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    });
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText('Participant SUBJ-001');
    await page
      .locator('.sv-controls .sv-control', { has: page.locator('label:text-is("Sex")') })
      .locator('select')
      .selectOption('F');
    await expect(page.locator('.sv-profile > *')).toHaveCount(0);
  });

  test('PPRF-OE-002: the dock Clear affordance routes through the host clear path (#99)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyOutlierExplorerInstance;
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    });
    await page.locator('.sv-profile .sv-profile-clear').click();
    await expect(page.locator('.sv-profile > *')).toHaveCount(0);
    const state = await page.evaluate(() => ({
      selectedId: window.__safetyOutlierExplorerInstance.state.selectedId,
      listing: document.querySelectorAll('.sv-listing table').length
    }));
    expect(state.selectedId).toBeNull();
    expect(state.listing).toBe(0);
  });
});
