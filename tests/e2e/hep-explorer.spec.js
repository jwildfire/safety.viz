import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the hep-explorer module (#43). Test names are keyed to
// the condensed HEP-* requirement IDs per the traceability convention in
// CONTRIBUTING.md; see docs/hep-explorer-coverage.md for the requirement-ID ->
// test map. The fixture dataset is engineered so the default cutpoints
// (ALT >= 3xULN, TB >= 2xULN) land exactly one participant in the Possible
// Hy's Law Range and populate every other quadrant, so the classification,
// display modes, and the coordinated participant drill-down views assert
// deterministically.

test.describe('safety.viz hep-explorer module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._hepErrors = errors;
    await page.goto('/tests/e2e/fixtures/hep-explorer.html');
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance && window.__safetyHepExplorerInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._hepErrors).toEqual([]);
  });

  test('HEP-CTRL-001/HEP-CTRL-002/HEP-QUAD-001/HEP-DISPLAY-001/HEP-CTRL-006/HEP-CTRL-007/HEP-CTRL-008/HEP-CTRL-009/HEP-CTRL-010/HEP-CTRL-011/HEP-CTRL-012: renders the full control panel (#43)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'X-axis Measure',
        'ALT Reference Line',
        'TB Reference Line',
        'Display Type',
        'Axis Type',
        'Point Size',
        'Highlight Points Based on Timing',
        'Group',
        'Sex',
        'Treatment Group',
        'R Ratio min',
        'R Ratio max'
      ])
    );
    // A single y_options entry drops the Y-axis Measure control (HEP-CTRL-002).
    expect(labels).not.toContain('Y-axis Measure');
    await expect(page.locator('.hep-reset')).toHaveText('Reset Chart');

    // The R-Ratio max input seeds from the data-derived maximum (largest
    // participant R-Ratio = SUBJ-001's 4 / 1.1 = 3.64), not 0 (HEP-CTRL-010).
    const rRatioMax = await page
      .locator('.sv-control', { has: page.locator('label:text-is("R Ratio max")') })
      .locator('input')
      .inputValue();
    expect(Number(rRatioMax)).toBeCloseTo(3.64, 2);

    await captureEvidence(page, 'HEP-CTRL-001', 'control-panel');
  });

  test('HEP-DATA-001/HEP-CTRL-011: participant note reports N and % and updates on filter (#43)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes')).toContainText('5 of 5 participants shown (100.0%)');
    await page
      .locator('.sv-controls .sv-control', { has: page.locator('label:text-is("Sex")') })
      .locator('select')
      .selectOption('F');
    await expect(page.locator('.sv-notes')).toContainText('2 of 5 participants shown (40.0%)');
  });

  test('HEP-DATA-003: missing and non-numeric results are dropped with a reported count and note (#43)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      '2 missing or non-numeric results removed.'
    );
    await captureEvidence(page, 'HEP-DATA-003', 'invalid-data-note');
  });

  test('HEP-QUAD-002/HEP-QUAD-003/HEP-QUAD-004/HEP-QUAD-005: quadrant cut-lines classify one participant per quadrant and drive the summary table (#43)', async ({
    page
  }) => {
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart.$hepQuadrants);
    const quadrants = await page.evaluate(
      () => window.__safetyHepExplorerInstance.chart.$hepQuadrants
    );
    // Default eDISH cutpoints: ALT 3xULN, TB 2xULN (HEP-QUAD-001).
    expect(quadrants.xCut).toBe(3);
    expect(quadrants.yCut).toBe(2);
    expect(Number.isFinite(quadrants.xPixel)).toBe(true);
    expect(Number.isFinite(quadrants.yPixel)).toBe(true);
    expect(quadrants.counts).toEqual({
      'upper-right': 1,
      'upper-left': 1,
      'lower-right': 1,
      'lower-left': 2
    });
    expect(quadrants.percents['upper-right']).toBeCloseTo(20);
    expect(quadrants.percents['lower-left']).toBeCloseTo(40);

    // Quadrant summary table: Quadrant | # | % (HEP-QUAD-005).
    const summary = page.locator('.hep-quadrant-summary table');
    await expect(summary).toBeVisible();
    await expect(summary.locator('tbody tr')).toHaveCount(4);
    const hysLawRow = summary.locator('tbody tr', { hasText: "Possible Hy's Law Range" });
    await expect(hysLawRow).toContainText('1');
    await expect(hysLawRow).toContainText('20.0%');
    const normalRow = summary.locator('tbody tr', { hasText: 'Normal Range' });
    await expect(normalRow).toContainText('2');
    await expect(normalRow).toContainText('40.0%');
    await captureEvidence(page, 'HEP-QUAD-002', 'quadrant-summary');
  });

  test('HEP-QUAD-001/HEP-QUAD-004: changing the x-axis reference line reclassifies the quadrants (#43)', async ({
    page
  }) => {
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart.$hepQuadrants);
    const cutInput = page
      .locator('.sv-control', { has: page.locator('label:text-is("ALT Reference Line")') })
      .locator('input');
    // Lowering the ALT cut below SUBJ-002's 1.5xULN peak moves that participant
    // from Hyperbilirubinemia into the Possible Hy's Law Range.
    await cutInput.fill('1.2');
    await cutInput.dispatchEvent('change');
    await page.waitForFunction(() => {
      const quadrants = window.__safetyHepExplorerInstance.chart.$hepQuadrants;
      return quadrants && quadrants.xCut === 1.2;
    });
    const quadrants = await page.evaluate(
      () => window.__safetyHepExplorerInstance.chart.$hepQuadrants
    );
    expect(quadrants.counts).toEqual({
      'upper-right': 2,
      'upper-left': 0,
      'lower-right': 1,
      'lower-left': 2
    });
    const hysLawRow = page
      .locator('.hep-quadrant-summary tbody tr', { hasText: "Possible Hy's Law Range" })
      .first();
    await expect(hysLawRow).toContainText('40.0%');
  });

  test('HEP-DISPLAY-001/HEP-DISPLAY-002/HEP-CHART-002: the display toggle switches eDISH and mDISH axis titles and cutpoints (#43)', async ({
    page
  }) => {
    const titles = await page.evaluate(() => {
      const chart = window.__safetyHepExplorerInstance.chart;
      return [chart.options.scales.x.title.text, chart.options.scales.y.title.text];
    });
    // Axes are titled with the full measure label from settings.measure_values.
    expect(titles[0]).toBe('Aminotransferase, alanine (ALT) [×ULN]');
    expect(titles[1]).toBe('Total Bilirubin [×ULN]');

    await page
      .locator('.sv-control', { has: page.locator('label:text-is("Display Type")') })
      .locator('select')
      .selectOption('relative_baseline');
    await page.waitForFunction(() =>
      window.__safetyHepExplorerInstance.chart.options.scales.x.title.text.includes('Baseline')
    );
    const mdish = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        xTitle: instance.chart.options.scales.x.title.text,
        yTitle: instance.chart.options.scales.y.title.text,
        xCut: instance.state.xCut,
        yCut: instance.state.yCut
      };
    });
    expect(mdish.xTitle).toBe('Aminotransferase, alanine (ALT) [×Baseline]');
    expect(mdish.yTitle).toBe('Total Bilirubin [×Baseline]');
    // mDISH cutpoint defaults: ALT (defaults) 3.8, TB 4.8 (HEP-QUAD-001).
    expect(mdish.xCut).toBe(3.8);
    expect(mdish.yCut).toBe(4.8);
    await captureEvidence(page, 'HEP-DISPLAY-001', 'mdish-display');
  });

  test('HEP-SELECT-001/HEP-SELECT-002/HEP-SELECT-003/HEP-SELECT-005/HEP-SELECT-006: clicking a point draws the visit path, detail panels, and linked listing (#43)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });

    // Visit-path overlay: one point per visit where both measures are present.
    const state = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        selectedId: instance.state.selectedId,
        overlayCount: instance.chart.data.datasets[1].data.length,
        chartCount: instance.charts.length
      };
    });
    expect(state.selectedId).toBe('SUBJ-001');
    expect(state.overlayCount).toBe(3);
    // The lab-over-time companion chart joins the scatter on this.charts.
    expect(state.chartCount).toBe(2);

    // Participant detail panels: lab-over-time chart + measure summary table.
    await expect(page.locator('.hep-detail')).toBeVisible();
    await expect(page.locator('.hep-detail')).toContainText('Standardized Lab Values by Study Day');
    await expect(page.locator('.hep-detail-canvas')).toBeVisible();
    await expect(page.locator('.hep-summary-table tbody tr')).toHaveCount(3);
    const summaryHeaders = await page.locator('.hep-summary-table th').allTextContents();
    expect(summaryHeaders).toEqual(['Measure', 'N', 'Min', 'Median', 'Max']);

    // Linked listing of the participant's raw lab records.
    await expect(page.locator('.sv-listing table')).toBeVisible();
    const headers = await page.locator('.sv-listing th').allTextContents();
    expect(headers.join(',')).toContain('Participant');
    expect(headers.join(',')).toContain('Measure');
    expect(headers.join(',')).toContain('Study Day');
    expect(headers.join(',')).toContain('Result');
    expect(headers.join(',')).toContain('ULN');
    await expect(page.locator('.sv-footnote')).toContainText('Participant SUBJ-001 selected.');

    // The shared trace header and the sidebar Participants control mirror the
    // selection in the scatter view too (HEP-SELECT-001, HEP-COMP-007).
    await expect(page.locator('.hep-composite-header')).toHaveText(
      'Participant SUBJ-001 selected.'
    );
    const control = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        dropdownSelected: [...instance.compositeSelectEl.selectedOptions].map((o) => o.value),
        clearEnabled: !instance.compositeClearBtn.disabled
      };
    });
    expect(control.dropdownSelected).toEqual(['SUBJ-001']);
    expect(control.clearEnabled).toBe(true);
    await captureEvidence(page, 'HEP-SELECT-001', 'participant-detail');

    // Selecting several via the control highlights them across the scatter and
    // closes the single-participant drill-down; the header counts them.
    const multi = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const select = instance.compositeSelectEl;
      [...select.options].forEach((o, k) => (o.selected = k < 2));
      select.dispatchEvent(new Event('change'));
      return {
        selected: instance.scatterSelectedIds.slice(),
        selectedId: instance.state.selectedId,
        detailHidden: instance.detailWrap.style.display === 'none',
        header: instance.compositeHeaderEl.textContent
      };
    });
    expect(multi.selected).toHaveLength(2);
    expect(multi.selectedId).toBeNull();
    expect(multi.detailHidden).toBe(true);
    expect(multi.header).toBe('2 participants selected.');

    // Narrowing the control back to one participant reopens the drill-down.
    const single = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const select = instance.compositeSelectEl;
      [...select.options].forEach((o) => (o.selected = o.value === 'SUBJ-001'));
      select.dispatchEvent(new Event('change'));
      return {
        selectedId: instance.state.selectedId,
        detailVisible: instance.detailWrap.style.display !== 'none'
      };
    });
    expect(single.selectedId).toBe('SUBJ-001');
    expect(single.detailVisible).toBe(true);
  });

  test('HEP-SELECT-002: selecting a second participant without a background click destroys the prior detail chart (no Chart.js leak) (#43)', async ({
    page
  }) => {
    // Select participant A directly on the scatter: scatter + one detail chart.
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });
    expect(await page.evaluate(() => window.__safetyHepExplorerInstance.charts.length)).toBe(2);

    // Select participant B without an intervening background click. The prior
    // detail chart must be destroyed, not leaked: charts stays at 2 (scatter +
    // one detail), never 3.
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-003');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });
    const after = await page.evaluate(() => ({
      length: window.__safetyHepExplorerInstance.charts.length,
      selectedId: window.__safetyHepExplorerInstance.state.selectedId
    }));
    expect(after.length).toBe(2);
    expect(after.selectedId).toBe('SUBJ-003');

    // Clearing the selection then leaves only the scatter alive.
    await page.evaluate(() => {
      window.__safetyHepExplorerInstance.chart.options.onClick({}, []);
    });
    expect(await page.evaluate(() => window.__safetyHepExplorerInstance.charts.length)).toBe(1);
  });

  test('HEP-SELECT-007: clicking the background clears the selection, detail panels, and listing (#43)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await expect(page.locator('.hep-detail')).toBeVisible();

    await page.evaluate(() => {
      window.__safetyHepExplorerInstance.chart.options.onClick({}, []);
    });
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
    await expect(page.locator('.hep-detail')).toBeHidden();
    const cleared = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        selectedId: instance.state.selectedId,
        overlayCount: instance.chart.data.datasets[1].data.length,
        chartCount: instance.charts.length
      };
    });
    expect(cleared.selectedId).toBeNull();
    expect(cleared.overlayCount).toBe(0);
    expect(cleared.chartCount).toBe(1);
  });

  test('HEP-SELECT-006: changing Display Type while a participant is selected re-renders the coordinated panels in the new units (#43)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });
    await expect(page.locator('.hep-detail')).toBeVisible();

    await page
      .locator('.sv-control', { has: page.locator('label:text-is("Display Type")') })
      .locator('select')
      .selectOption('relative_baseline');
    await page.waitForFunction(() =>
      window.__safetyHepExplorerInstance.chart.options.scales.x.title.text.includes('Baseline')
    );

    // The selection survives the redraw and every coordinated panel is rebuilt
    // in the mDISH (×Baseline) units.
    const state = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const detail = instance.charts[1];
      return {
        selectedId: instance.state.selectedId,
        overlayCount: instance.chart.data.datasets[1].data.length,
        chartCount: instance.charts.length,
        xCut: instance.state.xCut,
        yCut: instance.state.yCut,
        detailYTitle: detail ? detail.options.scales.y.title.text : null
      };
    });
    expect(state.selectedId).toBe('SUBJ-001');
    expect(state.overlayCount).toBe(3);
    expect(state.chartCount).toBe(2);
    expect(state.xCut).toBe(3.8);
    expect(state.yCut).toBe(4.8);
    expect(state.detailYTitle).toBe('Standardized value [×Baseline]');
    await expect(page.locator('.hep-detail')).toBeVisible();
    await expect(page.locator('.hep-summary-table tbody tr')).toHaveCount(3);
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await expect(page.locator('.sv-footnote')).toContainText('Participant SUBJ-001 selected.');

    // When a redraw removes the selected participant from the shown points —
    // here the Sex filter excludes SUBJ-001 (F) — the selection clears and
    // listeners hear an empty participantsSelected event.
    const events = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const seen = [];
      instance.root.addEventListener('participantsSelected', (event) =>
        seen.push(event.detail.data.slice())
      );
      window.__hepSelectionEvents = seen;
      return seen.length;
    });
    expect(events).toBe(0);
    await page
      .locator('.sv-control', { has: page.locator('label:text-is("Sex")') })
      .locator('select')
      .selectOption('M');
    await expect(page.locator('.hep-detail')).toBeHidden();
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
    const cleared = await page.evaluate(() => ({
      selectedId: window.__safetyHepExplorerInstance.state.selectedId,
      events: window.__hepSelectionEvents
    }));
    expect(cleared.selectedId).toBeNull();
    expect(cleared.events).toEqual([[]]);
  });

  test('HEP-CTRL-009: grouping colors the points and renders a legend (#43)', async ({ page }) => {
    await expect(page.locator('.hep-legend .hep-legend-item')).toHaveCount(0);
    await page
      .locator('.sv-control', { has: page.locator('label:text-is("Group")') })
      .locator('select')
      .selectOption('ARM');
    await expect(page.locator('.hep-legend .hep-legend-item')).toHaveCount(2);
    await expect(page.locator('.hep-legend')).toContainText('Treatment Group');
    await expect(page.locator('.hep-legend')).toContainText('Placebo');
    await expect(page.locator('.hep-legend')).toContainText('Drug');
    await captureEvidence(page, 'HEP-CTRL-009', 'color-by-group');
  });

  test('HEP-CTRL-006/HEP-CHART-003: the axis-type toggle switches both axes between linear and log (#43)', async ({
    page
  }) => {
    expect(await page.evaluate(() => window.__safetyHepExplorerInstance.chart.scales.x.type)).toBe(
      'linear'
    );
    await page
      .locator('.sv-control', { has: page.locator('label:text-is("Axis Type")') })
      .locator('select')
      .selectOption('log');
    const scales = await page.evaluate(() => {
      const chart = window.__safetyHepExplorerInstance.chart;
      return {
        xType: chart.scales.x.type,
        yType: chart.scales.y.type,
        xMin: chart.scales.x.min,
        yMin: chart.scales.y.min
      };
    });
    expect(scales.xType).toBe('logarithmic');
    expect(scales.yType).toBe('logarithmic');
    // A log domain runs from the smallest positive value, never 0 (HEP-CHART-003).
    expect(scales.xMin).toBeGreaterThan(0);
    expect(scales.yMin).toBeGreaterThan(0);
    await captureEvidence(page, 'HEP-CTRL-006', 'log-axes');
  });

  test('HEP-CHART-004: point tooltips list participant, R Ratio, peaks with days, and the day difference (#43)', async ({
    page
  }) => {
    const lines = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const dataIndex = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      return instance.chart.options.plugins.tooltip.callbacks.label({ datasetIndex: 0, dataIndex });
    });
    expect(lines[0]).toBe('Participant: SUBJ-001');
    // rRatio = peak ALT xULN / peak ALP xULN = 4 / 1.1.
    expect(lines[1]).toBe('R Ratio: 3.64');
    // Each measure is named with its full label from settings.measure_values.
    expect(lines[2]).toBe('Aminotransferase, alanine (ALT): 4 @ day 28');
    expect(lines[3]).toBe('Total Bilirubin: 2.5 @ day 28');
    expect(lines[4]).toBe('0 days apart');

    // The visit-path overlay (dataset 1) is excluded from the tooltip so
    // hovering the path line never pops an empty box (HEP-SELECT-003).
    const filtered = await page.evaluate(() => {
      const filter = window.__safetyHepExplorerInstance.chart.options.plugins.tooltip.filter;
      return { d0: filter({ datasetIndex: 0 }), d1: filter({ datasetIndex: 1 }) };
    });
    expect(filtered.d0).toBe(true);
    expect(filtered.d1).toBe(false);
  });

  test('HEP-API-003: participantsSelected fires on select and clear (#43)', async ({ page }) => {
    const events = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
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

  test('HEP-API-001: lifecycle API supports init, setData, setSettings, render, resize, and destroy (#43)', async ({
    page
  }) => {
    const result = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const methods = ['init', 'setData', 'setSettings', 'render', 'resize', 'destroy'];
      const hasMethods = methods.every((method) => typeof instance[method] === 'function');
      const setSettingsReturnsInstance =
        instance.setSettings({ group_by: 'hep_none' }) === instance;
      // The first 30 rows carry the ALT + TB records for every participant, so
      // the scatter still draws after the setData round trip.
      const setDataReturnsInstance = instance.setData(instance.rawData.slice(0, 30)) === instance;
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

// Composite plot (#67, HEP-COMP-*): the baseline-referenced composite view for
// subjects with abnormal baseline liver tests (Tesfaldet et al., Drug Safety
// 2024). Loads a dedicated fixture whose crafted chronic-liver cohort populates
// every pretreatment quadrant and every level of DILI concern, and opens on the
// composite view.
test.describe('safety.viz hep-explorer composite plot', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._hepErrors = errors;
    await page.goto('/tests/e2e/fixtures/hep-explorer-composite.html');
    await page.waitForFunction(
      () =>
        window.__safetyHepExplorerInstance &&
        document.querySelectorAll('.hep-composite-panels canvas').length === 4
    );
  });

  test.afterEach(async ({ page }) => {
    expect(page._hepErrors).toEqual([]);
  });

  test('HEP-COMP-006: opens on the composite view with a reduced control set (#67)', async ({
    page
  }) => {
    const view = await page.evaluate(() => window.__safetyHepExplorerInstance.state.view);
    expect(view).toBe('composite');
    // The View selector is its own section rendered as a visible option list,
    // with the composite option active. Three options since the migration
    // Sankey landed (#92): scatter → migration → composite, the paper's order.
    await expect(page.locator('.sv-view-option')).toHaveCount(3);
    await expect(page.locator('.sv-view-option.is-active')).toHaveText(/Composite/);
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toContain('Group');
    // Scatter-only controls are hidden in the composite view.
    expect(labels).not.toContain('X-axis Measure');
    expect(labels).not.toContain('Display Type');
    expect(labels).not.toContain('R Ratio min');
  });

  test('HEP-COMP-001/HEP-COMP-002/HEP-COMP-003: draws the eDISH panels, xBLN four-panel plot, and baseline-quadrant legend (#67)', async ({
    page
  }) => {
    // Two eDISH scatters (pretreatment + on-treatment) + four xBLN panels.
    await expect(page.locator('.hep-composite-edish canvas')).toHaveCount(2);
    await expect(page.locator('.hep-composite-panels canvas')).toHaveCount(4);
    const chartCount = await page.evaluate(() => window.__safetyHepExplorerInstance.charts.length);
    expect(chartCount).toBe(6);
    // Panels are labelled by on-treatment quadrant.
    const panelTitles = await page
      .locator('.hep-composite-panels .hep-composite-card h4')
      .allTextContents();
    expect(panelTitles.join(' ')).toContain('Cholestasis');
    expect(panelTitles.join(' ')).toContain("Hy's Law");
    expect(panelTitles.join(' ')).toContain('Normal & NN');
    expect(panelTitles.join(' ')).toContain("Temple's Corollary");
    // The baseline-quadrant legend names all four quadrants.
    const legend = await page.locator('.hep-composite-legend').textContent();
    expect(legend).toContain('Baseline quadrant');
    await captureEvidence(page, 'HEP-COMP-001', 'composite-plot');
  });

  test('HEP-COMP-004/HEP-COMP-005: migration table counts and by-arm concern summary (#67)', async ({
    page
  }) => {
    const tables = page.locator('.hep-composite .hep-migration table');
    await expect(tables).toHaveCount(2);
    // Migration table grand total (last cell of the last body row) = 8 subjects.
    const grandTotal = await tables
      .first()
      .locator('tbody tr:last-child td:last-child')
      .textContent();
    expect(grandTotal.trim()).toBe('8');
    // By-arm summary lists both arms.
    const armSummary = await tables.nth(1).textContent();
    expect(armSummary).toContain('Study Drug');
    expect(armSummary).toContain('Placebo');
    // Concern legend is present.
    await expect(page.locator('.hep-concern-legend')).toBeVisible();
    await captureEvidence(page, 'HEP-COMP-004', 'migration-table');
  });

  test('HEP-COMP-006: the View control toggles between the composite and scatter views (#67)', async ({
    page
  }) => {
    // Click the scatter option in the View list: the single scatter canvas
    // appears and the composite container is hidden.
    await page.locator('.sv-view-option', { hasText: 'scatter' }).click();
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart !== null);
    await expect(page.locator('canvas.sv-chart')).toBeVisible();
    await expect(page.locator('.sv-view-option.is-active')).toHaveText(/scatter/);
    const compositeHidden = await page.evaluate(
      () => window.__safetyHepExplorerInstance.compositeWrap.style.display === 'none'
    );
    expect(compositeHidden).toBe(true);

    // A participant selected in the scatter view carries into the composite
    // view: switching back arrives with that participant already selected in
    // the panels, dropdown, and header.
    const selectedId = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const id = instance.points[0].id;
      instance.selectParticipant(id);
      return id;
    });
    await page.locator('.sv-view-option', { hasText: 'Composite' }).click();
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance.compositeCharts.length === 6
    );
    const carried = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        selected: instance.compositeSelectedIds.slice(),
        dropdownSelected: [...instance.compositeSelectEl.selectedOptions].map((o) => o.value),
        header: instance.compositeHeaderEl.textContent,
        clearEnabled: !instance.compositeClearBtn.disabled
      };
    });
    expect(carried.selected).toEqual([String(selectedId)]);
    expect(carried.dropdownSelected).toEqual([String(selectedId)]);
    expect(carried.header).toBe(`Participant ${selectedId} selected.`);
    expect(carried.clearEnabled).toBe(true);

    // A composite multi-selection carries back into the scatter view: the
    // participants arrive highlighted with the control and shared header
    // mirroring them, and the single-participant drill-down stays closed.
    const compositeMulti = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[0];
      const carriedId = String(instance.compositeSelectedIds[0]);
      const addIndex = chart.$compositeSubjects.findIndex(
        (subject) => String(subject.id) !== carriedId
      );
      chart.options.onClick({}, [{ index: addIndex }], chart);
      return instance.compositeSelectedIds.slice();
    });
    expect(compositeMulti).toHaveLength(2);
    await page.locator('.sv-view-option', { hasText: 'scatter' }).click();
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart !== null);
    const carriedBack = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        selected: instance.scatterSelectedIds.slice(),
        selectedId: instance.state.selectedId,
        dropdownSelected: [...instance.compositeSelectEl.selectedOptions].map((o) => o.value),
        header: instance.compositeHeaderEl.textContent,
        detailHidden: instance.detailWrap.style.display === 'none'
      };
    });
    expect([...carriedBack.selected].sort()).toEqual([...compositeMulti].map(String).sort());
    expect(carriedBack.selectedId).toBeNull();
    expect([...carriedBack.dropdownSelected].sort()).toEqual(
      [...compositeMulti].map(String).sort()
    );
    expect(carriedBack.header).toBe('2 participants selected.');
    expect(carriedBack.detailHidden).toBe(true);
  });

  test('HEP-COMP-006: degrades gracefully when baseline or on-treatment values are absent (#67)', async ({
    page
  }) => {
    // Rebind to baseline-only records: no on-treatment peak, so no subject
    // qualifies and the composite shows an explanatory note instead of panels.
    const note = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const baselineOnly = instance.rawData.filter((row) => row.VISIT === 'Baseline');
      instance.setData(baselineOnly);
      return instance.compositeWrap.textContent;
    });
    expect(note).toContain('needs baseline and on-treatment ALT and total bilirubin');
    await expect(page.locator('.hep-composite-panels canvas')).toHaveCount(0);
  });

  test('HEP-COMP-007: hovering and clicking points traces + multi-selects participants across all panels (#67)', async ({
    page
  }) => {
    // The trace header starts on the idle hint, and the multi-select lists every
    // shown participant.
    await expect(page.locator('.hep-composite-header')).toHaveText(/Hover a point to trace/);
    await expect(page.locator('.hep-composite-select select option')).toHaveCount(8);

    // Hovering a point traces its participant (Chart.js passes the chart as the
    // THIRD handler argument; the element carries no chart reference), without a
    // sticky selection.
    const hover = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[1]; // peak on-treatment eDISH
      const id = chart.$compositeSubjects[0].id;
      chart.options.onHover({ native: { target: { style: {} } } }, [{ index: 0 }], chart);
      return {
        id,
        hoverId: instance.compositeHoverId,
        selected: instance.compositeSelectedIds.slice(),
        header: instance.compositeHeaderEl.textContent
      };
    });
    expect(hover.hoverId).toBe(hover.id);
    expect(hover.selected).toEqual([]); // hover does not stick
    expect(hover.header).toContain(`Participant ${hover.id}`);

    // Clicking two points multi-selects them; the header counts them and the
    // dropdown mirrors the selection.
    const clicked = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[0]; // pretreatment eDISH
      chart.options.onHover({ native: { target: { style: {} } } }, [], chart); // clear hover
      const idA = chart.$compositeSubjects[0].id;
      const idB = chart.$compositeSubjects[1].id;
      chart.options.onClick({}, [{ index: 0 }], chart);
      chart.options.onClick({}, [{ index: 1 }], chart);
      return {
        idA,
        idB,
        selected: instance.compositeSelectedIds.slice(),
        header: instance.compositeHeaderEl.textContent,
        dropdownSelected: [...instance.compositeSelectEl.selectedOptions].map((o) => o.value)
      };
    });
    expect(clicked.selected).toEqual([clicked.idA, clicked.idB]);
    expect(clicked.header).toBe('2 participants selected.');
    expect(clicked.dropdownSelected.sort()).toEqual([clicked.idA, clicked.idB].sort());
    await expect(page.locator('.hep-composite-header.is-active')).toBeVisible();
    await captureEvidence(page, 'HEP-COMP-007', 'participant-trace');

    // Clicking a selected point again toggles it off, leaving the other selected.
    const toggled = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[0];
      chart.options.onClick({}, [{ index: 0 }], chart);
      return {
        selected: instance.compositeSelectedIds.slice(),
        header: instance.compositeHeaderEl.textContent
      };
    });
    expect(toggled.selected).toEqual([clicked.idB]);
    expect(toggled.header).toBe(`Participant ${clicked.idB} selected.`);

    // Editing the dropdown drives the selection too.
    const viaDropdown = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const select = instance.compositeSelectEl;
      [...select.options].forEach((o, k) => (o.selected = k < 3));
      select.dispatchEvent(new Event('change'));
      return { selected: instance.compositeSelectedIds.slice() };
    });
    expect(viaDropdown.selected).toHaveLength(3);

    // The control's Clear selection button (a real click) resets the whole
    // selection, empties the dropdown, and disables itself.
    await expect(page.locator('.hep-composite-select .hep-composite-clear')).toBeEnabled();
    await page.click('.hep-composite-select .hep-composite-clear');
    const clearedByButton = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        selected: instance.compositeSelectedIds.slice(),
        dropdownSelected: [...instance.compositeSelectEl.selectedOptions].map((o) => o.value),
        disabled: instance.compositeClearBtn.disabled,
        header: instance.compositeHeaderEl.textContent
      };
    });
    expect(clearedByButton.selected).toEqual([]);
    expect(clearedByButton.dropdownSelected).toEqual([]);
    expect(clearedByButton.disabled).toBe(true);
    expect(clearedByButton.header).toMatch(/Hover a point to trace/);

    // Clicking empty plot space also clears the whole selection.
    const cleared = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[0];
      chart.options.onClick({}, [{ index: 0 }], chart); // re-select one
      chart.options.onClick({}, [], chart); // empty-space click
      return {
        selected: instance.compositeSelectedIds.slice(),
        header: instance.compositeHeaderEl.textContent
      };
    });
    expect(cleared.selected).toEqual([]);
    expect(cleared.header).toMatch(/Hover a point to trace/);
  });
});

// Migration view (#92, HEP-MIG-* / HEP-XTAB-* / HEP-STEP-* / HEP-ARM-* /
// HEP-ACC-*): Figure 3 of Amirzadegan et al., Drug Safety 2025;48:443-453 — the
// baseline → peak on-treatment Sankey mirrored about the baseline
// categorization, with one cross table per arm. Reuses the composite fixture,
// whose eight crafted subjects split four to the placebo arm and four to the
// study-drug arm and populate every level of DILI concern, including exactly
// one participant stuck in Hy's Law throughout:
//   CS-01 Study Drug  Normal & NN -> Hy's Law            (red)
//   CS-02 Placebo     Cholestasis -> Cholestasis         (gray, diagonal)
//   CS-03 Study Drug  Temple's Corollary -> Temple's     (gray, diagonal)
//   CS-04 Placebo     Hy's Law -> Normal & NN            (green)
//   CS-05 Study Drug  Cholestasis -> Temple's Corollary  (yellow)
//   CS-06 Placebo     Hy's Law -> Hy's Law               (gray, diagonal, STUCK)
//   CS-07 Study Drug  Normal & NN -> Temple's Corollary  (red)
//   CS-08 Placebo     Temple's Corollary -> Cholestasis  (yellow)
test.describe('safety.viz hep-explorer migration Sankey', () => {
  const HL = "Hy's Law";
  const CH = 'Cholestasis';
  const TC = "Temple's Corollary";
  const NN = 'Normal & NN';

  // Address a flow by what it MEANS, never by where it happens to be drawn.
  const flow = (page, side, pre, post) =>
    page.locator(`.hep-ribbon[data-side="${side}"][data-pre="${pre}"][data-post="${post}"]`);

  const cell = (page, side, pre, post) =>
    page.locator(`.hep-xtab-cell[data-side="${side}"][data-pre="${pre}"][data-post="${post}"]`);

  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._hepErrors = errors;
    await page.goto('/tests/e2e/fixtures/hep-explorer-composite.html');
    await page.waitForFunction(
      () =>
        window.__safetyHepExplorerInstance &&
        document.querySelectorAll('.hep-composite-panels canvas').length === 4
    );
    await page.locator('.sv-view-option', { hasText: 'Migration' }).click();
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.root.$hepSankey);
  });

  test.afterEach(async ({ page }) => {
    expect(page._hepErrors).toEqual([]);
  });

  test('HEP-MIG-001/HEP-MIG-014: the migration view renders BOTH an svg diagram and cross tables in the main column (#92)', async ({
    page
  }) => {
    // The shell contract (tests/e2e/site.spec.js:47) accepts a canvas OR a
    // table in .sv-main. This view ships real tables, so it passes — and this
    // assertion is what stops a future refactor dropping them silently.
    await expect(page.locator('.sv-main svg.hep-sankey')).toHaveCount(1);
    await expect(page.locator('.sv-main .hep-xtab table')).toHaveCount(2);
    await expect(page.locator('.sv-main svg.hep-sankey')).toBeVisible();
    await expect(page.locator('.sv-main .hep-xtab table').first()).toBeVisible();
    // Three node columns, baseline in the centre.
    const columns = await page.evaluate(() => {
      const nodes = window.__safetyHepExplorerInstance.root.$hepSankey.nodes;
      return [...new Set(nodes.map((node) => node.column))];
    });
    expect(columns.sort()).toEqual(['centre', 'left', 'right']);
    await expect(page.locator('.hep-sankey-col-label[data-column="centre"]')).toHaveText(
      'Baseline categorization'
    );
    // The scatter canvas and the composite panels are both put away.
    await expect(page.locator('.hep-composite-panels canvas')).toHaveCount(0);
    // Prototype marking (#97): the migration view carries a prototype banner,
    // scoped to this view — the scatter and composite views do not.
    await expect(page.locator('.hep-migration-view .sv-prototype')).toHaveCount(1);
    await expect(page.locator('.hep-migration-view .sv-prototype')).toContainText('prototype');
    await captureEvidence(page, 'HEP-MIG-001', 'migration-sankey');
  });

  test('HEP-MIG-001: the prototype banner is scoped to the migration view, not the stable scatter/composite views (#97)', async ({
    page
  }) => {
    await expect(page.locator('.sv-main .sv-prototype')).toHaveCount(1);
    await page.locator('.sv-view-option', { hasText: 'eDISH' }).click();
    await expect(page.locator('.sv-main .sv-prototype')).toHaveCount(0);
    await page.locator('.sv-view-option', { hasText: 'Composite' }).click();
    await expect(page.locator('.sv-main .sv-prototype')).toHaveCount(0);
    await page.locator('.sv-view-option', { hasText: 'Migration' }).click();
    await expect(page.locator('.sv-main .sv-prototype')).toHaveCount(1);
  });

  test("HEP-MIG-002/HEP-MIG-003/HEP-MIG-010/HEP-MIG-015: geometry is stashed on the root, placebo runs left, active runs right, Hy's Law on top (#92)", async ({
    page
  }) => {
    const geometry = await page.evaluate(() => window.__safetyHepExplorerInstance.root.$hepSankey);
    expect(geometry.nodes).toHaveLength(12);
    expect(geometry.ribbons).toHaveLength(8);
    expect(geometry.scale).toBeGreaterThan(0);

    // HEP-MIG-002: a placebo ribbon's outer anchor is left of the spine, an
    // active ribbon's right of it.
    geometry.ribbons.forEach((ribbon) => {
      if (ribbon.side === 'placebo') expect(ribbon.outer.x).toBeLessThan(ribbon.centre.x);
      else expect(ribbon.outer.x).toBeGreaterThan(ribbon.centre.x);
    });

    // HEP-MIG-003: severity order top to bottom in EVERY column.
    ['left', 'centre', 'right'].forEach((column) => {
      const stack = geometry.nodes
        .filter((node) => node.column === column)
        .sort((a, b) => a.y0 - b.y0)
        .map((node) => node.quadrant);
      expect(stack).toEqual([HL, CH, TC, NN]);
    });

    // HEP-MIG-010: node fills are the composite view's own quadrant hexes, so a
    // quadrant reads the same colour in Fig 3 and Fig 4.
    const fills = await page.evaluate(() =>
      [...document.querySelectorAll('.hep-sankey-node')].map((rect) => [
        rect.dataset.quadrant,
        rect.getAttribute('fill')
      ])
    );
    const expected = {
      "Hy's Law": '#e31a1c',
      Cholestasis: '#e6a000',
      "Temple's Corollary": '#1f78b4',
      'Normal & NN': '#33a02c'
    };
    fills.forEach(([quadrant, fill]) => expect(fill).toBe(expected[quadrant]));
  });

  test('HEP-ACC-001/HEP-ACC-002/HEP-ACC-003: ribbons are named, focusable buttons activated by Enter and Space (#92)', async ({
    page
  }) => {
    const svg = page.locator('svg.hep-sankey');
    await expect(svg).toHaveAttribute('role', 'img');
    const summary = await svg.getAttribute('aria-label');
    expect(summary).toContain('Placebo: 0 unfavourable and 1 favourable shifts');
    expect(summary).toContain('Active drug: 2 unfavourable and 0 favourable shifts');

    const unfavourable = flow(page, 'active', NN, HL);
    await expect(unfavourable).toHaveAttribute('role', 'button');
    await expect(unfavourable).toHaveAttribute('tabindex', '0');
    await expect(unfavourable).toHaveAttribute(
      'aria-label',
      `1 participant shifted from ${NN} to ${HL} on active drug — unfavourable`
    );

    // Enter activates a focused ribbon, exactly as role="button" promises.
    await unfavourable.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(() => page.evaluate(() => window.__safetyHepExplorerInstance.participantsSelected))
      .toEqual(['CS-01']);

    // So does Space, from a clean selection.
    await page.evaluate(() => window.__safetyHepExplorerInstance.selection.clear());
    await unfavourable.focus();
    await page.keyboard.press(' ');
    await expect
      .poll(() => page.evaluate(() => window.__safetyHepExplorerInstance.participantsSelected))
      .toEqual(['CS-01']);
    await captureEvidence(page, 'HEP-ACC-001', 'migration-ribbon-selected');
  });

  test('HEP-STEP-001/HEP-STEP-002/HEP-STEP-003: a ribbon click carries its participants into the composite plot (#92)', async ({
    page
  }) => {
    const events = [];
    await page.exposeFunction('__hepOnSelect', (ids) => events.push(ids));
    await page.evaluate(() =>
      window.__safetyHepExplorerInstance.root.addEventListener('participantsSelected', (event) =>
        window.__hepOnSelect(event.detail.data)
      )
    );

    await flow(page, 'active', NN, HL).click();
    // HEP-STEP-001: the flow's participants are selected, mirrored in the shared
    // Participants control, and announced.
    await expect.poll(() => events.at(-1)).toEqual(['CS-01']);
    const dropdown = await page.evaluate(() =>
      [...window.__safetyHepExplorerInstance.compositeSelectEl.selectedOptions].map((o) => o.value)
    );
    expect(dropdown).toEqual(['CS-01']);

    // HEP-STEP-002: the footnote states the shift, its arm and its count, and
    // offers the review control.
    const footnote = await page.locator('.sv-footnote').textContent();
    expect(footnote).toContain('1 participant');
    expect(footnote).toContain(`${NN} → ${HL}`);
    expect(footnote).toContain('active drug');
    await expect(page.locator('.sv-footnote .hep-step-btn')).toHaveText(
      'Review these 1 in the composite plot'
    );
    await captureEvidence(page, 'HEP-STEP-002', 'migration-handoff');

    // HEP-STEP-003: activating it lands in the composite plot with exactly that
    // participant restored and highlighted.
    await page.locator('.sv-footnote .hep-step-btn').click();
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance.compositeCharts.length === 6
    );
    const landed = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        view: instance.state.view,
        selected: instance.compositeSelectedIds.slice(),
        header: instance.compositeHeaderEl.textContent
      };
    });
    expect(landed.view).toBe('composite');
    expect(landed.selected).toEqual(['CS-01']);
    expect(landed.header).toBe('Participant CS-01 selected.');
    await expect(page.locator('.sv-view-option.is-active')).toHaveText(/Composite/);
  });

  test('HEP-MIG-007: clicking the centroid computed from $hepSankey selects that flow, so geometry and pointer agree (#92)', async ({
    page
  }) => {
    // Addressing the ribbon by selector proves the DATA is right; clicking the
    // pixel its own geometry names proves the PICTURE is right. A layout that
    // computed correct numbers but painted them elsewhere passes the first test
    // and fails this one.
    const point = await page.evaluate(() => {
      const svg = document.querySelector('svg.hep-sankey');
      const plot = svg.querySelector('g.hep-sankey-plot');
      const ribbon = window.__safetyHepExplorerInstance.root.$hepSankey.ribbons.find(
        (r) => r.side === 'active' && r.pre === 'Normal & NN' && r.post === "Hy's Law"
      );
      const origin = svg.createSVGPoint();
      origin.x = ribbon.centroid.x;
      origin.y = ribbon.centroid.y;
      const screen = origin.matrixTransform(plot.getScreenCTM());
      return { x: screen.x, y: screen.y, count: ribbon.count };
    });
    expect(point.count).toBe(1);
    await page.mouse.click(point.x, point.y);
    await expect
      .poll(() => page.evaluate(() => window.__safetyHepExplorerInstance.participantsSelected))
      .toEqual(['CS-01']);
  });

  test('HEP-XTAB-001/HEP-XTAB-002/HEP-XTAB-004/HEP-XTAB-005: per-arm cross tables agree with the ribbons and select the same participants (#92)', async ({
    page
  }) => {
    // One table per designated arm, rows/columns most severe first — the same
    // direction the diagram reads.
    const headers = await page
      .locator('.hep-xtab table[data-side="placebo"] thead th')
      .allTextContents();
    expect(headers).toEqual(['Baseline ↓ / On-treatment →', HL, CH, TC, NN, 'Total']);
    // The composite view's own pooled table keeps the FDA factor order
    // (HEP-XTAB-006): the two tables genuinely read differently.
    expect(headers.slice(1, -1)).not.toEqual([NN, CH, TC, HL]);

    // HEP-XTAB-002: grand totals are the two arms' participant counts.
    await expect(
      page.locator('.hep-xtab table[data-side="placebo"] tbody tr:last-child td:last-child')
    ).toHaveText('4');
    await expect(
      page.locator('.hep-xtab table[data-side="active"] tbody tr:last-child td:last-child')
    ).toHaveText('4');

    // HEP-XTAB-004: every cell count equals its ribbon's data-count.
    const parity = await page.evaluate(() =>
      [...document.querySelectorAll('.hep-ribbon')].map((path) => {
        const match = [...document.querySelectorAll('.hep-xtab-cell')].find(
          (td) => td.dataset.key === path.dataset.key
        );
        return [path.dataset.key, path.dataset.count, match ? match.textContent : null];
      })
    );
    expect(parity).toHaveLength(8);
    parity.forEach(([, count, cellText]) => expect(cellText).toBe(count));

    // HEP-XTAB-005: a cell click selects exactly what its ribbon click selects.
    await flow(page, 'placebo', TC, CH).click();
    const viaRibbon = await page.evaluate(
      () => window.__safetyHepExplorerInstance.participantsSelected
    );
    expect(viaRibbon).toEqual(['CS-08']);
    await page.evaluate(() => window.__safetyHepExplorerInstance.selection.clear());
    await cell(page, 'placebo', TC, CH).click();
    await expect
      .poll(() => page.evaluate(() => window.__safetyHepExplorerInstance.participantsSelected))
      .toEqual(viaRibbon);
    await captureEvidence(page, 'HEP-XTAB-001', 'migration-cross-tables');
  });

  test("HEP-STEP-005: the Hy's Law self-flow raises the caution the paper acknowledges (#92)", async ({
    page
  }) => {
    // A grey Hy's-Law → Hy's-Law band looks reassuring; it is exactly where the
    // paper's acknowledged limitation lives.
    await expect(flow(page, 'placebo', HL, HL)).toHaveCount(1);
    const caution = page.locator('.hep-sankey-caution');
    await expect(caution).toBeVisible();
    await expect(caution).toContainText("1 participant remained in Hy's Law throughout");
    await expect(caution).toContainText('cannot detect worsening within a category');
    await caution.locator('.hep-step-btn').click();
    await expect
      .poll(() => page.evaluate(() => window.__safetyHepExplorerInstance.participantsSelected))
      .toEqual(['CS-06']);
    await captureEvidence(page, 'HEP-STEP-005', 'migration-hys-law-caution');
  });

  test('HEP-MIG-013: the Hide unchanged control drops the diagonal ribbons and reports the hidden count (#92)', async ({
    page
  }) => {
    await expect(page.locator('.hep-ribbon')).toHaveCount(8);
    await page.locator('.hep-hide-unchanged').check();
    await page.waitForFunction(() => document.querySelectorAll('.hep-ribbon').length === 5);
    // Three diagonal flows (CS-02, CS-03, CS-06) are hidden, never dropped.
    await expect(
      page.locator('.hep-ribbon[data-pre="' + HL + '"][data-post="' + HL + '"]')
    ).toHaveCount(0);
    await expect(page.locator('.sv-notes')).toContainText(
      'Hide unchanged is on: 3 no-migration participants hidden'
    );
    await expect(cell(page, 'placebo', HL, HL)).toHaveText('1');
  });

  test('HEP-STEP-004: a selection made in any view survives a switch to either other view (#92)', async ({
    page
  }) => {
    const OPTION = {
      scatter: 'scatter',
      migration: 'Migration',
      composite: 'Composite'
    };
    const views = ['scatter', 'migration', 'composite'];
    // The 3x3 carry matrix: every ordered pair of distinct views. The carrier
    // is HEP-SELECT-006's participantsSelected payload, read once per render.
    for (const from of views) {
      for (const to of views) {
        if (from === to) continue;
        await page.locator('.sv-view-option', { hasText: OPTION[from] }).click();
        await page.waitForFunction(
          (view) => window.__safetyHepExplorerInstance.state.view === view,
          from
        );
        // Select through the shared Participants control, the one path all
        // three views share.
        await page.evaluate(() => window.__safetyHepExplorerInstance.selection.set(['CS-01']));
        await page.locator('.sv-view-option', { hasText: OPTION[to] }).click();
        await page.waitForFunction(
          (view) => window.__safetyHepExplorerInstance.state.view === view,
          to
        );
        const carried = await page.evaluate(
          () => window.__safetyHepExplorerInstance.participantsSelected
        );
        expect(carried.map(String), `${from} -> ${to}`).toEqual(['CS-01']);
        await page.evaluate(() => window.__safetyHepExplorerInstance.selection.clear());
      }
    }
  });

  test('HEP-ARM-004/HEP-ARM-005/HEP-DATA-012: the notes account for every participant the diagram cannot show (#92)', async ({
    page
  }) => {
    // Every fixture participant is designated and complete, so the plot shows
    // all eight and reports no exclusions.
    await expect(page.locator('.sv-notes')).toContainText(
      '8 of 8 participants shown in the migration plot.'
    );

    // Narrow the active side to an arm nobody is in: those participants are
    // EXCLUDED with a count (HEP-ARM-004), and the diagram degrades to one
    // direction with a warning rather than throwing (HEP-ARM-005).
    await page.evaluate(() =>
      window.__safetyHepExplorerInstance.setSettings({ active_arms: ['Not An Arm'] })
    );
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.root.$hepSankey);
    await expect(page.locator('.sv-notes')).toContainText(
      '4 participants excluded: arm not designated placebo or active.'
    );
    await expect(page.locator('.sv-notes')).toContainText('Only one treatment side is designated');
    const sides = await page.evaluate(() => [
      ...new Set([...document.querySelectorAll('.hep-ribbon')].map((path) => path.dataset.side))
    ]);
    expect(sides).toEqual(['placebo']);

    // HEP-DATA-012: a participant without a usable on-treatment measurement is
    // reported as excluded rather than silently missing.
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      instance.setSettings({ active_arms: null });
      instance.setData(
        instance.rawData.filter((row) => !(row.USUBJID === 'CS-01' && row.TEST === 'Bilirubin'))
      );
    });
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.root.$hepSankey);
    await expect(page.locator('.sv-notes')).toContainText(
      '1 participant excluded (missing baseline or on-treatment ALT/total bilirubin).'
    );
  });

  test('HEP-ARM-005: the Migration option is disabled with an explanation when no arm column is mapped (#92)', async ({
    page
  }) => {
    // A mirrored Sankey needs an arm to mirror about. With arm_col unmapped and
    // no auto-detectable candidate, the option is disabled rather than clickable
    // into an empty diagram.
    await page.evaluate(() =>
      window.__safetyHepExplorerInstance.setSettings({ view: 'scatter', arm_col: null })
    );
    const option = page.locator('.sv-view-option', { hasText: 'Migration' });
    await expect(option).toBeDisabled();
    await expect(option).toHaveAttribute('title', /needs a treatment-arm column/);
    // The other two views are unaffected — arm designation scopes this view
    // only (HEP-ARM-006).
    await expect(page.locator('.sv-view-option', { hasText: 'Composite' })).toBeEnabled();
    await expect(page.locator('.sv-view-option', { hasText: 'scatter' })).toBeEnabled();
  });

  test('HEP-MIG-017: hovering a ribbon highlights it with both endpoint nodes and opens an HTML tooltip (#92)', async ({
    page
  }) => {
    // CS-07: Study Drug, Normal & NN -> Hy's Law. One participant, unfavourable.
    const unfavourable = flow(page, 'active', NN, HL);
    const tip = page.locator('.hep-tip');
    await expect(tip).toBeHidden();

    await unfavourable.hover();

    // The tooltip is a real HTML element, not an svg <title> — so it is visible
    // to the DOM and to a screenshot, which is the whole point of the row.
    await expect(tip).toBeVisible();
    const text = await tip.textContent();
    expect(text).toContain('Active drug'); // its arm
    expect(text).toContain('1 participant'); // its participant count
    expect(text).toContain(`${NN} → ${HL}`); // its two quadrants
    expect(text).toContain('unfavourable');

    // The hovered ribbon is the active one and everything else dims.
    await expect(unfavourable).toHaveClass(/is-active/);
    await expect(flow(page, 'placebo', TC, CH)).toHaveClass(/is-dim/);

    // BOTH endpoint nodes light up — the centre (baseline) and the outer
    // (on-treatment) end of the flow, on the active side only.
    const activeNodes = await page.evaluate(() =>
      [...document.querySelectorAll('.hep-sankey-node.is-active')].map((rect) => rect.dataset.node)
    );
    expect(activeNodes).toHaveLength(2);
    const endpoints = await page.evaluate(() => {
      const path = document.querySelector(
        '.hep-ribbon[data-side="active"][data-pre="Normal & NN"][data-post="Hy\'s Law"]'
      );
      return [path.dataset.centreNode, path.dataset.outerNode];
    });
    expect(activeNodes.sort()).toEqual([...endpoints].sort());

    await captureEvidence(page, 'HEP-MIG-017', 'migration-ribbon-tooltip');

    // Leaving clears both the tooltip and the highlight.
    await page.locator('.hep-sankey-col-label[data-column="centre"]').hover();
    await expect(tip).toBeHidden();
    await expect(unfavourable).not.toHaveClass(/is-active/);
  });

  test('HEP-ARM-007: arm designation scopes the migration cohort only, not the scatter or composite views (#92)', async ({
    page
  }) => {
    // Narrow the active side to an arm nobody is in: the migration diagram
    // drops those four participants and says so.
    await page.evaluate(() =>
      window.__safetyHepExplorerInstance.setSettings({ active_arms: ['Not An Arm'] })
    );
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.root.$hepSankey);
    await expect(page.locator('.sv-notes')).toContainText(
      '4 participants excluded: arm not designated placebo or active.'
    );
    const sides = await page.evaluate(() => [
      ...new Set([...document.querySelectorAll('.hep-ribbon')].map((path) => path.dataset.side))
    ]);
    expect(sides).toEqual(['placebo']);

    // The composite view, with that SAME designation still in force, plots the
    // full cohort: its migration table grand total is still every participant.
    await page.locator('.sv-view-option', { hasText: 'Composite' }).click();
    await page.waitForFunction(
      () => document.querySelectorAll('.hep-composite-panels canvas').length === 4
    );
    const grandTotal = await page
      .locator('.hep-composite .hep-migration table')
      .first()
      .locator('tbody tr:last-child td:last-child')
      .textContent();
    expect(grandTotal.trim()).toBe('8');

    // And so does the scatter view.
    await page.locator('.sv-view-option', { hasText: 'scatter' }).click();
    await expect(page.locator('.sv-notes')).toContainText('8 of 8 participants shown');

    // Returning to Migration, the designation is still scoping that view alone.
    await page.locator('.sv-view-option', { hasText: 'Migration' }).click();
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.root.$hepSankey);
    await expect(page.locator('.sv-notes')).toContainText(
      '4 participants excluded: arm not designated placebo or active.'
    );
  });
});
