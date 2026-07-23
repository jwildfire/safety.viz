import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the shift-plot module (#14): the second full renderer,
// built on the framework proven by the histogram (#2). Test names are keyed to
// requirement IDs per the traceability convention in CONTRIBUTING.md; see
// docs/shift-plot-coverage.md for the requirement-ID → matrix-row → test map.
// Brush selection is exercised through the module's programmatic
// brushValues()/clearSelection() entry points — the same code path the mouse
// handlers drive — so the assertions stay deterministic without synthesizing
// drag gestures.

const control = (page, label) =>
  page
    .locator('.sv-controls .sv-control', { has: page.locator(`label:text-is("${label}")`) })
    .locator('select');

test.describe('safety.viz shift-plot module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._sspErrors = errors;
    await page.goto('/tests/e2e/fixtures/shift-plot.html');
    await page.waitForFunction(
      () => window.__safetyShiftPlotInstance && window.__safetyShiftPlotInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._sspErrors).toEqual([]);
  });

  test('SSP-CTRL-001/SSP-REQ-002/SSP-CTRL-002/SSP-CTRL-003: renders measure, baseline/comparison visit, and filter controls (#14)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Measure',
        'Baseline visit(s)',
        'Comparison visit(s)',
        'Site ID',
        'Sex',
        'Race',
        'Treatment Group'
      ])
    );
    // Default selection: first visit as baseline, the rest as comparison.
    const selection = await page.evaluate(() => {
      const state = window.__safetyShiftPlotInstance.state;
      return { baseline: state.baselineVisits, comparison: state.comparisonVisits };
    });
    expect(selection.baseline).toEqual(['Baseline']);
    expect(selection.comparison).toEqual(['Week 12']);
    await captureEvidence(page, 'SSP-CTRL-001', 'baseline-scatter');
  });

  test('SSP-CHART-002: the identity line spans a domain shared by both axes (#14)', async ({
    page
  }) => {
    const axes = await page.evaluate(() => {
      const chart = window.__safetyShiftPlotInstance.chart;
      return {
        xMin: chart.scales.x.min,
        xMax: chart.scales.x.max,
        yMin: chart.scales.y.min,
        yMax: chart.scales.y.max,
        domain: window.__safetyShiftPlotInstance.state.domain
      };
    });
    expect(axes.xMin).toBe(axes.yMin);
    expect(axes.xMax).toBe(axes.yMax);
    expect(axes.domain[0]).toBe(axes.xMin);
    expect(axes.domain[1]).toBe(axes.xMax);
  });

  test('SSP-COUNT-001/SSP-REG-005: the participant note reports shown-of-total participants (#14)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes')).toContainText('12 of 15 participants shown (80.0%)');
    await captureEvidence(page, 'SSP-COUNT-001', 'participant-count');
  });

  test('SSP-REG-020: missing and non-numeric results are dropped with a reported count and note (#14)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      '2 missing or non-numeric results removed.'
    );
    await captureEvidence(page, 'SSP-REG-020', 'invalid-data-note');
  });

  test('SSP-REG-001: changing the measure re-pairs the scatter (#14)', async ({ page }) => {
    await expect(page.locator('.sv-notes')).toContainText('12 of 15');
    await control(page, 'Measure').selectOption('Pulse');
    const points = await page.evaluate(
      () => window.__safetyShiftPlotInstance.chart.data.datasets[0].data.length
    );
    expect(points).toBe(3);
    await expect(page.locator('.sv-notes')).toContainText('3 of 15');
  });

  test('SSP-REG-002/SSP-REG-003: changing baseline and comparison visits swaps the axes (#14)', async ({
    page
  }) => {
    await control(page, 'Baseline visit(s)').selectOption(['Week 12']);
    await control(page, 'Comparison visit(s)').selectOption(['Baseline']);
    const first = await page.evaluate(
      () => window.__safetyShiftPlotInstance.chart.data.datasets[0].data[0]
    );
    // S01: baseline 10, Week 12 = 12 — with the axes swapped the first point
    // now reads (Week 12, Baseline) = (12, 10).
    expect(first).toEqual({ x: 12, y: 10 });
  });

  test('SSP-CTRL-003: applying a filter updates the participant note (#14)', async ({ page }) => {
    await control(page, 'Sex').selectOption('F');
    await expect(page.locator('.sv-notes')).toContainText('6 of 15 participants shown (40.0%)');
  });

  test('SSP-REG-006: the point tooltip reports id, baseline, comparison, change, and percent change (#14)', async ({
    page
  }) => {
    const lines = await page.evaluate(() =>
      window.__safetyShiftPlotInstance.chart.options.plugins.tooltip.callbacks.label({
        dataIndex: 0
      })
    );
    expect(lines).toEqual([
      'Subject ID: S01',
      'Baseline: 10',
      'Comparison: 12',
      'Change: 2',
      'Percent Change: 20.0%'
    ]);
  });

  test('SSP-REQ-003/SSP-REQ-006/SSP-REQ-007/SSP-REG-004/SSP-REG-012: brushing opens the listing, boxes the selection, and de-emphasizes the rest (#14)', async ({
    page
  }) => {
    // The listing is not shown until the chart is brushed (SSP-REG-012).
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
    const result = await page.evaluate(() => {
      const instance = window.__safetyShiftPlotInstance;
      instance.brushValues(9.5, 13.5, 9.5, 16);
      const dataset = instance.chart.data.datasets[0];
      return {
        selected: instance.currentTableData.map((row) => row.USUBJID),
        brush: instance.chart.$sspBrush,
        isArray: Array.isArray(dataset.backgroundColor),
        colors: Array.isArray(dataset.backgroundColor) ? dataset.backgroundColor : []
      };
    });
    expect(result.selected).toEqual(['S01', 'S02', 'S03', 'S04']);
    expect(result.brush).not.toBeNull();
    expect(result.isArray).toBe(true);
    // A de-emphasized point is more transparent than a selected one.
    expect(result.colors.filter((color) => color.includes('0.14')).length).toBe(8);
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await expect(page.locator('.sv-listing-actions')).toContainText('4 of 4 records');
    const headers = await page.locator('.sv-listing th').allTextContents();
    expect(headers.map((header) => header.replace(/[ ▲▼]+$/, ''))).toEqual([
      'Participant ID',
      'Baseline',
      'Comparison',
      'Change',
      'Percent Change'
    ]);
    await expect(page.locator('.sv-footnote')).toContainText('Selected 4 participant(s).');
    await captureEvidence(page, 'SSP-REQ-003', 'brushed-selection');
  });

  test('SSP-REG-011: clearing the selection resets the points and hides the listing (#14)', async ({
    page
  }) => {
    await page.evaluate(() => window.__safetyShiftPlotInstance.brushValues(9.5, 13.5, 9.5, 16));
    await expect(page.locator('.sv-listing table')).toBeVisible();
    const after = await page.evaluate(() => {
      const instance = window.__safetyShiftPlotInstance;
      instance.clearSelection();
      return {
        isArray: Array.isArray(instance.chart.data.datasets[0].backgroundColor),
        brush: instance.chart.$sspBrush,
        rows: instance.currentTableData.length
      };
    });
    expect(after.isArray).toBe(false);
    expect(after.brush).toBeNull();
    expect(after.rows).toBe(0);
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
  });

  test('SSP-REG-008/SSP-REG-009/SSP-REG-010: the listing searches, sorts, and exports to CSV (#14)', async ({
    page
  }) => {
    await page.evaluate(() => window.__safetyShiftPlotInstance.brushValues(9, 22, 9, 22));
    await expect(page.locator('.sv-listing-actions')).toContainText('12 of 12 records');

    await page.locator('.sv-listing-search').fill('S03');
    await expect(page.locator('.sv-listing tbody tr')).toHaveCount(1);
    await expect(page.locator('.sv-listing tbody')).toContainText('S03');
    await page.locator('.sv-listing-search').fill('');

    await page.locator('.sv-listing th', { hasText: 'Baseline' }).click();
    await expect(page.locator('.sv-listing th', { hasText: 'Baseline ▲' })).toBeVisible();
    await expect(page.locator('.sv-listing tbody tr').first()).toContainText('S01');
    await page.locator('.sv-listing th', { hasText: /Baseline/ }).click();
    await expect(page.locator('.sv-listing th', { hasText: 'Baseline ▼' })).toBeVisible();
    await expect(page.locator('.sv-listing tbody tr').first()).toContainText('S12');
    await captureEvidence(page, 'SSP-REG-008', 'linked-listing');

    const download = page.waitForEvent('download');
    await page.locator('.sv-listing-actions button', { hasText: 'Export: CSV' }).click();
    const csvDownload = await download;
    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);
    const csv = fs.readFileSync(await csvDownload.path(), 'utf8');
    expect(csv.split('\n')[0]).toBe('Participant ID,Baseline,Comparison,Change,Percent Change');
    expect(csv).toContain('S12');
  });

  test('SSP-API-003/PPRF-SSP-004: brushing dispatches participantsSelected on the shell root, bubbling to the element (#14, #99)', async ({
    page
  }) => {
    const events = await page.evaluate(() => {
      const instance = window.__safetyShiftPlotInstance;
      // The dispatch target moved to the shell root in the dock adoption
      // (#99, PPRF-SSP-004) so root-level listeners — the docked profile's
      // feed — hear every dispatch; the event still bubbles, so the original
      // element-level contract keeps working.
      const root = [];
      const element = [];
      instance.root.addEventListener('participantsSelected', (event) =>
        root.push(event.detail.data)
      );
      instance.element.addEventListener('participantsSelected', (event) =>
        element.push(event.detail.data)
      );
      instance.brushValues(9.5, 13.5, 9.5, 16);
      instance.clearSelection();
      return { root, element };
    });
    expect(events.root[0]).toEqual(['S01', 'S02', 'S03', 'S04']);
    expect(events.root[1]).toEqual([]);
    expect(events.element).toEqual(events.root);
  });

  test('PPRF-SSP-001: a multi-participant brush collapses the dock to a worst-first stepper whose steps emphasize the chart (#99)', async ({
    page
  }) => {
    await page.evaluate(() => window.__safetyShiftPlotInstance.brushValues(9.5, 13.5, 9.5, 16));
    // Worst-first: S03 has the highest peak ×ULN (15/20) of the brushed four.
    await expect(page.locator('.sv-profile .sv-profile-step-count')).toContainText('1 of 4');
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText('Participant S03');
    // Header demographics come from profile_details, not the host listing columns.
    await expect(page.locator('.sv-profile .sv-profile-header')).toContainText('Placebo');
    await captureEvidence(page, 'PPRF-SSP-001', 'docked-stepper');

    // Stepping renders the next-worst profile and border-emphasizes that
    // point on the chart without re-dispatching the selection.
    const stepped = await page.evaluate(() => {
      const instance = window.__safetyShiftPlotInstance;
      window.__sspHeard = [];
      instance.root.addEventListener('participantsSelected', (event) =>
        window.__sspHeard.push(event.detail.data)
      );
      return instance.currentTableData.length;
    });
    expect(stepped).toBe(4);
    await page.locator('.sv-profile .sv-profile-step-next').click();
    await expect(page.locator('.sv-profile .sv-profile-step-count')).toContainText('2 of 4');
    const emphasis = await page.evaluate(() => {
      const instance = window.__safetyShiftPlotInstance;
      const widths = instance.chart.data.datasets[0].borderWidth;
      const steppedId = instance.profile.state.ids[instance.profile.state.index];
      const index = instance.chartPairs.findIndex((pair) => pair.USUBJID === steppedId);
      return {
        heard: window.__sspHeard,
        width: widths[index],
        emphasized: widths.filter((w) => w > 1).length
      };
    });
    expect(emphasis.heard).toEqual([]);
    expect(emphasis.width).toBe(3);
    expect(emphasis.emphasized).toBe(1);
  });

  test('PPRF-SSP-002: a single-point brush shows the full docked profile with no stepper, beside the linked listing (#99)', async ({
    page
  }) => {
    // A tight rectangle around S01's point (baseline 10, comparison 12).
    await page.evaluate(() => window.__safetyShiftPlotInstance.brushValues(9.9, 10.1, 11.9, 12.1));
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText('Participant S01');
    await expect(page.locator('.sv-profile .sv-profile-step-count')).toHaveCount(0);
    await expect(page.locator('.sv-profile .sv-profile-spaghetti canvas')).toBeVisible();
    // Both fixture measures are key measures via measure_values, but only
    // Albumin has rows for S01.
    await expect(page.locator('.sv-profile .sv-profile-measure-row')).toHaveCount(1);
    // The linked listing stays — records vs story (PPRF-11).
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await captureEvidence(page, 'PPRF-SSP-002', 'docked-full-profile');
  });

  test('PPRF-SSP-003: clearing the selection and control-driven redraws empty the dock (#99)', async ({
    page
  }) => {
    await page.evaluate(() => window.__safetyShiftPlotInstance.brushValues(9.5, 13.5, 9.5, 16));
    await expect(page.locator('.sv-profile .sv-profile-step-count')).toContainText('1 of 4');
    // The tiny-click path (an empty click clears the brush).
    await page.evaluate(() => window.__safetyShiftPlotInstance.clearSelection());
    await expect(page.locator('.sv-profile')).toBeEmpty();
    await expect(page.locator('.sv-profile')).toBeHidden();

    // Re-brush, then clear through the dock's own Clear affordance: it routes
    // through the host clear path, so the listing empties too.
    await page.evaluate(() => window.__safetyShiftPlotInstance.brushValues(9.5, 13.5, 9.5, 16));
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await page.locator('.sv-profile .sv-profile-clear').click();
    await expect(page.locator('.sv-profile')).toBeEmpty();
    await expect(page.locator('.sv-listing table')).toHaveCount(0);

    // A control-driven render resets the selection silently — the dock must
    // empty in the same preamble.
    await page.evaluate(() => window.__safetyShiftPlotInstance.brushValues(9.5, 13.5, 9.5, 16));
    await control(page, 'Measure').selectOption('Pulse');
    await expect(page.locator('.sv-profile')).toBeEmpty();
  });

  test('SSP-API-001: lifecycle API supports init, setData, setSettings, render, resize, and destroy (#14)', async ({
    page
  }) => {
    const result = await page.evaluate(() => {
      const instance = window.__safetyShiftPlotInstance;
      const methods = ['init', 'setData', 'setSettings', 'render', 'resize', 'destroy'];
      const hasMethods = methods.every((method) => typeof instance[method] === 'function');
      const setSettingsReturnsInstance = instance.setSettings({ page_size: 5 }) === instance;
      const setDataReturnsInstance = instance.setData(instance.rawData) === instance;
      const renderReturns = instance.render();
      instance.resize();
      const hadChart = Boolean(instance.chart);
      instance.destroy();
      return {
        hasMethods,
        setSettingsReturnsInstance,
        setDataReturnsInstance,
        renderReturns,
        hadChart,
        containerText: document.querySelector('#container').textContent.trim()
      };
    });
    expect(result.hasMethods).toBe(true);
    expect(result.setSettingsReturnsInstance).toBe(true);
    expect(result.setDataReturnsInstance).toBe(true);
    expect(result.renderReturns).toBeUndefined();
    expect(result.hadChart).toBe(true);
    expect(result.containerText).toBe('');
  });
});
