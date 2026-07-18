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
    await captureEvidence(page, 'HEP-SELECT-001', 'participant-detail');
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
    // with the composite option active.
    await expect(page.locator('.hep-view-option')).toHaveCount(2);
    await expect(page.locator('.hep-view-option.is-active')).toHaveText(/Composite/);
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
    await page.locator('.hep-view-option', { hasText: 'scatter' }).click();
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart !== null);
    await expect(page.locator('canvas.sv-chart')).toBeVisible();
    await expect(page.locator('.hep-view-option.is-active')).toHaveText(/scatter/);
    const compositeHidden = await page.evaluate(
      () => window.__safetyHepExplorerInstance.compositeWrap.style.display === 'none'
    );
    expect(compositeHidden).toBe(true);
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

    // Clicking empty plot space clears the whole selection.
    const cleared = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[0];
      chart.options.onClick({}, [], chart);
      return {
        selected: instance.compositeSelectedIds.slice(),
        header: instance.compositeHeaderEl.textContent
      };
    });
    expect(cleared.selected).toEqual([]);
    expect(cleared.header).toMatch(/Hover a point to trace/);
  });
});
