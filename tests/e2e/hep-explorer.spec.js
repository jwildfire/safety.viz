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

  test('HEP-DISPLAY-006/HEP-CTRL-015/HEP-CTRL-016: the display offers only what the data supports, and the legend is ordered and coloured for it (#55)', async ({
    page
  }) => {
    // HEP-DISPLAY-006: this fixture supports both modes, so both are offered
    // and nothing is withdrawn.
    const display = page.locator('.sv-control', {
      has: page.locator('label:text-is("Display Type")')
    });
    await expect(display.locator('select option')).toHaveCount(2);

    const availability = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return {
        live: instance.displayAvailability,
        // The same rule against data with no derivable baseline: every record
        // is that participant's only record, so nothing has a prior value.
        noBaseline: instance.cleanRows.map((row) => ({ ...row, __hep_baseline: NaN })),
        noUln: instance.cleanRows.map((row) => ({ ...row, __hep_uln: NaN }))
      };
    });
    expect(availability.live.modes).toEqual(['relative_uln', 'relative_baseline']);
    expect(availability.live.note).toBe('');

    // HEP-CTRL-015: with a numeric companion column the arms follow the
    // protocol's order rather than the alphabet.
    await page
      .locator('.sv-control', { has: page.locator('label:text-is("Group")') })
      .locator('select')
      .selectOption('ARM');
    const alphabetical = await page.evaluate(() => window.__safetyHepExplorerInstance.groupValues);
    expect(alphabetical).toEqual(['Drug', 'Placebo']);

    const ordered = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      instance.setSettings({ group_order_col: 'ARMN' });
      return instance.groupValues;
    });
    // ARMN is 1 for Placebo and 2 for Drug in the fixture, so the control arm
    // now leads the legend.
    expect(ordered).toEqual(['Placebo', 'Drug']);

    // HEP-CTRL-016 (the palette past its base colours) is a pure function with
    // no browser surface of its own; it is pinned in availability.test.js. What
    // the browser proves is that the two groups it does have are still coloured
    // distinctly after the reorder.
    const colors = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return instance.groupValues.map((value) => instance.colorScale.get(value));
    });
    expect(new Set(colors).size).toBe(colors.length);
    await captureEvidence(page.locator('.sv-main'), 'HEP-CTRL-015', 'legend-order-and-palette');
  });

  test('HEP-DROP-001/HEP-DROP-002/HEP-DROP-003/HEP-IMPUTE-002: removed records are downloadable with a reason, and below-limit values are imputed (#50)', async ({
    page
  }) => {
    const notes = page.locator('.sv-notes');

    // HEP-DROP-003: the count that says data left the chart carries the export
    // that says which data and why.
    const link = notes.locator('a.hep-csv-link');
    await expect(link).toHaveCount(1);
    await expect(link).toContainText('Download the removed records');
    await expect(link).toHaveAttribute('download', /^hepExplorerDroppedRows.*\.csv$/);
    // The href is a placeholder: the CSV is serialized on click, not on render.
    await expect(link).toHaveAttribute('href', '#');

    // HEP-DROP-001/002: the export names the mapped column that failed, per
    // row, and carries the source columns beside it. The text is built through
    // the link's own builder rather than by downloading a file, so the assertion
    // is on what a click would produce.
    const csv = await page.evaluate(() =>
      document.querySelector('.sv-notes a.hep-csv-link').__hepCsv()
    );
    const lines = csv.split('\n');
    expect(lines[0]).toContain('"__hep_dropReason"');
    expect(lines[0]).toContain('"USUBJID"');
    // The renderer's own working stays out of the reviewer's file.
    expect(lines[0]).not.toContain('"__hep_value"');
    expect(lines).toHaveLength(3);
    // Quotes inside a cell are doubled, so the reason reads as the CSV escapes it.
    expect(csv).toContain('Result column (""STRESN"") is empty.');
    expect(csv).toContain('Result column (""STRESN"") is not numeric.');
    expect(csv).toContain('SUBJ-001');
    expect(csv).toContain('SUBJ-002');

    // HEP-IMPUTE-002: the recorded zero is imputed to half the smallest
    // positive ALT rather than plotted as a zero, and the chart says so.
    await expect(notes).toContainText('below the limit of quantitation imputed to half the limit');
    const imputation = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const imputed = instance.cleanRows.filter((row) => row.__hep_imputed);
      return {
        count: instance.imputedRecords,
        limits: instance.imputationLimits,
        values: imputed.map((row) => ({
          original: row.__hep_valueOriginal,
          value: row.__hep_value
        }))
      };
    });
    expect(imputation.count).toBe(1);
    expect(imputation.values[0].original).toBe(0);
    expect(imputation.values[0].value).toBe(imputation.limits.ALT / 2);
    expect(imputation.limits.ALT).toBeGreaterThan(0);
    await captureEvidence(page.locator('.sv-notes'), 'HEP-DROP-003', 'dropped-record-downloads');
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

  test('HEP-QUAD-007/HEP-QUAD-008/HEP-CTRL-013/HEP-CTRL-014/HEP-CAUTION-001: the labels, the legend and the caution say what the chart means (#54)', async ({
    page
  }) => {
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart.$hepQuadrants);

    // HEP-CAUTION-001: the widget travels without the clinical guide, so it
    // carries the guide's warning itself, in every view.
    const caution = page.locator('.safety-hep-explorer .hep-caution');
    await expect(caution).toBeVisible();
    await expect(caution).toContainText('not validated for clinical use');
    await page.locator('.sv-view-option', { hasText: 'Migration' }).click();
    await expect(caution).toBeVisible();
    await page.locator('.sv-view-option', { hasText: 'scatter' }).click();
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart?.$hepQuadrants);

    // HEP-QUAD-008: each quadrant row states what landing there means, beside
    // the count of who did.
    const hysLawRow = page
      .locator('.hep-quadrant-summary tbody tr', { hasText: "Possible Hy's Law Range" })
      .first();
    await expect(hysLawRow.locator('.hep-quadrant-meaning')).toContainText('not a diagnosis');
    await expect(
      page
        .locator('.hep-quadrant-summary tbody tr', { hasText: 'Hyperbilirubinemia' })
        .first()
        .locator('.hep-quadrant-meaning')
    ).toContainText('bilirubin');
    await expect(page.locator('.hep-quadrant-summary .hep-quadrant-meaning')).toHaveCount(4);

    // HEP-QUAD-007: the corner labels are guidance, not data, and can be turned
    // off — the cut-lines and the classification stay.
    const labels = page.locator('.sv-control', {
      has: page.locator('label:text-is("Quadrant Labels")')
    });
    await labels.locator('select').selectOption('hidden');
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance.state.quadrantLabels === 'hidden'
    );
    const stillClassified = await page.evaluate(
      () => window.__safetyHepExplorerInstance.chart.$hepQuadrants
    );
    expect(stillClassified.counts['upper-right']).toBe(1);
    await expect(hysLawRow).toContainText('20.0%');
    await labels.locator('select').selectOption('shown');

    // HEP-CTRL-013: the legend counts each group and states its share.
    await page
      .locator('.sv-control', { has: page.locator('label:text-is("Group")') })
      .locator('select')
      .selectOption('ARM');
    const legend = page.locator('.hep-legend');
    await expect(legend).toContainText(/Placebo \(n=\d+, \d+\.\d%\)/);
    await expect(legend).toContainText(/Drug \(n=\d+, \d+\.\d%\)/);

    // HEP-CTRL-014: point size is explained only when it encodes something.
    await expect(legend.locator('.hep-legend-note')).toHaveCount(0);
    const pointSize = page.locator('.sv-control', {
      has: page.locator('label:text-is("Point Size")')
    });
    await pointSize.locator('select').selectOption('rRatio');
    await expect(legend.locator('.hep-legend-note')).toContainText('R Ratio');
    // The whole main column: the legend counts sit above the plot and the
    // quadrant meanings and the caution below it, so a viewport shot would
    // always crop one end of the evidence.
    await captureEvidence(
      page.locator('.sv-main'),
      'HEP-QUAD-008',
      'quadrant-meanings-and-legend-counts'
    );
  });

  test('HEP-MARG-001/HEP-MARG-002/HEP-MARG-003: marginal box plots and axis rugs summarize each measure beside the cloud (#47)', async ({
    page
  }) => {
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart.$hepMarginals);
    const marginals = await page.evaluate(() => {
      const chart = window.__safetyHepExplorerInstance.chart;
      return {
        geometry: chart.$hepMarginals,
        padding: chart.options.layout.padding,
        // Both marginals must sit OUTSIDE the plot, or they would be read as
        // data: the strip is reserved by the layout padding.
        area: { top: chart.chartArea.top, right: chart.chartArea.right },
        canvas: { width: chart.width, height: chart.height }
      };
    });

    // HEP-MARG-001: one box per axis, over the five shown participants, with
    // the same R-7 quantiles the rest of the library uses.
    expect(marginals.geometry.mode).toBe('box_rug');
    expect(marginals.geometry.x.n).toBe(5);
    expect(marginals.geometry.y.n).toBe(5);
    expect(marginals.geometry.x.median).toBeCloseTo(1.5, 5);
    expect(marginals.geometry.y.median).toBeCloseTo(1, 5);
    // HEP-MARG-002: one rug tick per shown participant.
    expect(marginals.geometry.rug).toBe(5);

    expect(marginals.padding.top).toBeGreaterThan(6);
    expect(marginals.padding.right).toBeGreaterThan(6);
    expect(marginals.area.top).toBeGreaterThanOrEqual(marginals.padding.top);
    expect(marginals.area.right).toBeLessThan(marginals.canvas.width);
    await captureEvidence(page, 'HEP-MARG-001', 'marginal-box-plots-and-rugs');

    // HEP-MARG-003: the marginals follow the filters — they summarize what is
    // SHOWN, not the whole cohort.
    const control = page.locator('.sv-control', {
      has: page.locator('label:text-is("Marginal Distributions")')
    });
    await expect(control).toBeVisible();

    const rRatioMin = page
      .locator('.sv-control', { has: page.locator('label:text-is("R Ratio min")') })
      .locator('input');
    await rRatioMin.fill('3');
    await rRatioMin.dispatchEvent('change');
    await page.waitForFunction(() => {
      const geometry = window.__safetyHepExplorerInstance.chart.$hepMarginals;
      return geometry && geometry.rug < 5;
    });
    const shown = await page.evaluate(() => window.__safetyHepExplorerInstance.points.length);
    const filtered = await page.evaluate(
      () => window.__safetyHepExplorerInstance.chart.$hepMarginals
    );
    expect(filtered.x.n).toBe(shown);
    expect(filtered.rug).toBe(shown);
    await rRatioMin.fill('0');
    await rRatioMin.dispatchEvent('change');

    // Rugs alone give the strip back; hiding them draws nothing at all.
    await control.locator('select').selectOption('rug');
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance.chart.$hepMarginals.mode === 'rug'
    );
    expect(
      await page.evaluate(() => window.__safetyHepExplorerInstance.chart.options.layout.padding.top)
    ).toBe(6);

    await control.locator('select').selectOption('none');
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance.chart.$hepMarginals === null
    );
  });

  test('HEP-QUAD-006: the cut-lines can be dragged, reclassifying live and writing back to the inputs (#45)', async ({
    page
  }) => {
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.chart.$hepQuadrants);
    const canvas = page.locator('canvas.sv-chart').first();
    const bounds = await canvas.boundingBox();
    const cutInput = (measure) =>
      page
        .locator('.sv-control', { has: page.locator(`label:text-is("${measure} Reference Line")`) })
        .locator('input');

    // The pixel the vertical ALT line is drawn at, and the pixel 1.2xULN would
    // be drawn at — the same reclassification the number input drives above,
    // asked for with the pointer instead.
    const geometry = await page.evaluate(() => {
      const chart = window.__safetyHepExplorerInstance.chart;
      return {
        xPixel: chart.$hepQuadrants.xPixel,
        yPixel: chart.$hepQuadrants.yPixel,
        target: chart.scales.x.getPixelForValue(1.2),
        midY: (chart.chartArea.top + chart.chartArea.bottom) / 2
      };
    });

    // Grabbing the line puts a resize cursor on the canvas: a dashed rule has
    // no other affordance.
    await page.mouse.move(bounds.x + geometry.xPixel, bounds.y + geometry.midY);
    await expect(canvas).toHaveCSS('cursor', 'col-resize');

    await page.mouse.down();
    await page.mouse.move(bounds.x + geometry.target, bounds.y + geometry.midY, { steps: 8 });
    // Mid-drag, before the button is released, the classification has already
    // moved: that is the point of the gesture.
    const midDrag = await page.evaluate(
      () => window.__safetyHepExplorerInstance.chart.$hepQuadrants
    );
    expect(midDrag.xCut).toBeCloseTo(1.2, 1);
    expect(midDrag.counts['upper-right']).toBe(2);
    expect(midDrag.counts['upper-left']).toBe(0);
    await captureEvidence(page, 'HEP-QUAD-006', 'cut-line-drag');
    await page.mouse.up();

    // Either control updates the other: the drag wrote its value into the
    // Reference Line box, and the summary table followed.
    await expect(cutInput('ALT')).toHaveValue(/^1\.2/);
    const hysLawRow = page
      .locator('.hep-quadrant-summary tbody tr', { hasText: "Possible Hy's Law Range" })
      .first();
    await expect(hysLawRow).toContainText('40.0%');

    // The drag is not also a click on the plot background, so a selection made
    // before it survives.
    const state = await page.evaluate(() => ({
      selectedId: window.__safetyHepExplorerInstance.state.selectedId,
      xCut: window.__safetyHepExplorerInstance.state.xCut
    }));
    expect(state.xCut).toBeCloseTo(1.2, 1);
    expect(state.selectedId).toBeNull();

    // The horizontal line moves on its own axis, and only it moves.
    const yTarget = await page.evaluate(() =>
      window.__safetyHepExplorerInstance.chart.scales.y.getPixelForValue(1)
    );
    const midX = await page.evaluate(
      () =>
        (window.__safetyHepExplorerInstance.chart.chartArea.left +
          window.__safetyHepExplorerInstance.chart.chartArea.right) /
        2
    );
    await page.mouse.move(bounds.x + midX, bounds.y + geometry.yPixel);
    await expect(canvas).toHaveCSS('cursor', 'row-resize');
    await page.mouse.down();
    await page.mouse.move(bounds.x + midX, bounds.y + yTarget, { steps: 8 });
    await page.mouse.up();
    const after = await page.evaluate(() => window.__safetyHepExplorerInstance.chart.$hepQuadrants);
    expect(after.yCut).toBeCloseTo(1, 1);
    expect(after.xCut).toBeCloseTo(1.2, 1);
    await expect(cutInput('TB')).toHaveValue(/^1/);
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

  test('HEP-SELECT-001/HEP-SELECT-002/HEP-SELECT-003/HEP-SELECT-005/HEP-SELECT-006: clicking a point draws the visit path, railed profile, and linked listing (#43, #98)', async ({
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
    // The railed profile owns its own charts (#98, PPRF-7): this.charts holds
    // the scatter alone.
    expect(state.chartCount).toBe(1);

    // Participant drill-down: the railed profile module renders the header,
    // labs-over-time spaghetti, and measure table into the sv-profile slot
    // (#98, PPRF-7); the legacy .hep-detail panel is gone from the DOM.
    await expect(page.locator('.hep-detail')).toHaveCount(0);
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveText('Participant SUBJ-001');
    await expect(page.locator('.sv-rail .sv-profile-spaghetti canvas')).toBeVisible();
    await expect(page.locator('.sv-rail .sv-profile-measure-row')).toHaveCount(3);

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
    // collapses the railed profile to its cohort stepper (#98, PPRF-5); the
    // header counts them.
    const multi = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const select = instance.compositeSelectEl;
      [...select.options].forEach((o, k) => (o.selected = k < 2));
      select.dispatchEvent(new Event('change'));
      return {
        selected: instance.scatterSelectedIds.slice(),
        selectedId: instance.state.selectedId,
        stepper: Boolean(document.querySelector('.sv-rail .sv-profile-stepper')),
        header: instance.compositeHeaderEl.textContent
      };
    });
    expect(multi.selected).toHaveLength(2);
    expect(multi.selectedId).toBeNull();
    expect(multi.stepper).toBe(true);
    expect(multi.header).toBe('2 participants selected.');

    // Narrowing the control back to one participant reopens the full profile.
    const single = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const select = instance.compositeSelectEl;
      [...select.options].forEach((o) => (o.selected = o.value === 'SUBJ-001'));
      select.dispatchEvent(new Event('change'));
      return {
        selectedId: instance.state.selectedId,
        stepper: Boolean(document.querySelector('.sv-rail .sv-profile-stepper')),
        profileId: document.querySelector('.sv-rail .sv-profile-id')?.textContent
      };
    });
    expect(single.selectedId).toBe('SUBJ-001');
    expect(single.stepper).toBe(false);
    expect(single.profileId).toBe('Participant SUBJ-001');
  });

  test('HEP-SELECT-002: selecting a second participant without a background click re-renders the rail without leaking Chart.js instances (#43, #98)', async ({
    page
  }) => {
    // Select participant A directly on the scatter: the rail renders A and the
    // module's charts stay off this.charts (scatter only).
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });
    expect(await page.evaluate(() => window.__safetyHepExplorerInstance.charts.length)).toBe(1);
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveText('Participant SUBJ-001');

    // Select participant B without an intervening background click. The rail
    // re-renders for B, destroying the prior spaghetti chart rather than
    // leaking it: exactly one live canvas in the slot, and the previous
    // Chart.js instance reports destroyed.
    const leak = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const previous = instance.profile.spaghettiChart;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-003');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
      return {
        chartCount: instance.charts.length,
        selectedId: instance.state.selectedId,
        previousDestroyed: !previous.ctx && !previous.canvas,
        canvases: instance.railWrap.querySelectorAll('canvas').length
      };
    });
    expect(leak.chartCount).toBe(1);
    expect(leak.selectedId).toBe('SUBJ-003');
    expect(leak.previousDestroyed).toBe(true);
    expect(leak.canvases).toBe(1);
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveText('Participant SUBJ-003');

    // Clearing the selection empties the rail and leaves only the scatter.
    await page.evaluate(() => {
      window.__safetyHepExplorerInstance.chart.options.onClick({}, []);
    });
    expect(await page.evaluate(() => window.__safetyHepExplorerInstance.charts.length)).toBe(1);
    await expect(page.locator('.sv-rail .sv-profile-root')).toHaveCount(0);
  });

  test('HEP-SELECT-007: clicking the background clears the selection, railed profile, and listing (#43, #98)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });
    await expect(page.locator('.sv-listing table')).toBeVisible();
    await expect(page.locator('.sv-rail .sv-profile-id')).toBeVisible();

    await page.evaluate(() => {
      window.__safetyHepExplorerInstance.chart.options.onClick({}, []);
    });
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
    await expect(page.locator('.sv-rail .sv-profile-root')).toHaveCount(0);
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveCount(0);
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
    await expect(page.locator('.sv-rail .sv-profile-id')).toBeVisible();

    await page
      .locator('.sv-control', { has: page.locator('label:text-is("Display Type")') })
      .locator('select')
      .selectOption('relative_baseline');
    await page.waitForFunction(() =>
      window.__safetyHepExplorerInstance.chart.options.scales.x.title.text.includes('Baseline')
    );

    // The selection survives the redraw and every coordinated panel is rebuilt
    // in the mDISH (×Baseline) units — including the railed profile, whose
    // spaghetti follows the host's display mode on the re-dispatch (#98).
    const state = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const spaghetti = instance.profile.spaghettiChart;
      return {
        selectedId: instance.state.selectedId,
        overlayCount: instance.chart.data.datasets[1].data.length,
        chartCount: instance.charts.length,
        xCut: instance.state.xCut,
        yCut: instance.state.yCut,
        profileYTitle: spaghetti ? spaghetti.options.scales.y.title.text : null
      };
    });
    expect(state.selectedId).toBe('SUBJ-001');
    expect(state.overlayCount).toBe(3);
    expect(state.chartCount).toBe(1);
    expect(state.xCut).toBe(3.8);
    expect(state.yCut).toBe(4.8);
    expect(state.profileYTitle).toBe('Standardized Result [xBaseline]');
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveText('Participant SUBJ-001');
    await expect(page.locator('.sv-rail .sv-profile-measure-row')).toHaveCount(3);
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
    await expect(page.locator('.sv-rail .sv-profile-root')).toHaveCount(0);
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
  test('HEP-ANIM-001/HEP-ANIM-003/HEP-ANIM-006/HEP-ANIM-007: the study-day playback bar scrubs the cloud through time and resets back to the peaks (#46)', async ({
    page
  }) => {
    // The bar renders under the plot, spanning the study-day range the fixture
    // carries (day 1 through the day-112 record) (HEP-ANIM-001).
    const bar = page.locator('.hep-animation-bar');
    await expect(bar).toBeVisible();
    const slider = page.locator('.hep-animation-slider');
    await expect(slider).toHaveAttribute('min', '1');
    await expect(slider).toHaveAttribute('max', '112');
    await expect(page.locator('.hep-animation-label')).toHaveText('Showing peak values (all days)');

    // The static scatter is the peak-vs-peak reduction: SUBJ-001 sits at its
    // ALT peak of 4xULN.
    const peakX = await page.evaluate(() => {
      const chart = window.__safetyHepExplorerInstance.chart;
      const index = window.__safetyHepExplorerInstance.points.findIndex(
        (point) => String(point.id) === 'SUBJ-001'
      );
      return chart.data.datasets[0].data[index].x;
    });
    expect(peakX).toBeCloseTo(4, 5);

    // Scrub to day 1: every point falls back to its FIRST result, so SUBJ-001
    // shows its baseline ALT of 40/40 = 1xULN, not its peak (HEP-ANIM-003).
    await slider.fill('1');
    await slider.dispatchEvent('input');
    await expect(page.locator('.hep-animation-label')).toHaveText('Showing data from: Day 1');
    const dayOne = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => String(point.id) === 'SUBJ-001');
      return {
        x: instance.chart.data.datasets[0].data[index].x,
        y: instance.chart.data.datasets[0].data[index].y,
        day: instance.state.animation.day
      };
    });
    expect(dayOne.x).toBeCloseTo(1, 5);
    expect(dayOne.y).toBeCloseTo(1, 5);
    expect(dayOne.day).toBe(1);

    // Day 28 advances the same participant to its peak week-4 draw.
    await slider.fill('28');
    await slider.dispatchEvent('input');
    const dayTwentyEight = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => String(point.id) === 'SUBJ-001');
      return instance.chart.data.datasets[0].data[index];
    });
    expect(dayTwentyEight.x).toBeCloseTo(4, 5);
    expect(dayTwentyEight.y).toBeCloseTo(2.5, 5);

    await captureEvidence(page, 'HEP-ANIM-001', 'study-day-playback');

    // Reset returns to the peak-vs-peak scatter every other control describes
    // (HEP-ANIM-007), clearing the trails with it.
    await page.locator('.hep-animation-reset').click();
    await expect(page.locator('.hep-animation-label')).toHaveText('Showing peak values (all days)');
    const afterReset = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => String(point.id) === 'SUBJ-001');
      return {
        x: instance.chart.data.datasets[0].data[index].x,
        day: instance.state.animation.day,
        trails: instance.chart.data.datasets[2].data.length
      };
    });
    expect(afterReset.x).toBeCloseTo(4, 5);
    expect(afterReset.day).toBeNull();
    expect(afterReset.trails).toBe(0);
  });

  test('HEP-ANIM-004/HEP-ANIM-005: the play control runs the animation and leaves motion trails behind the moving points (#46)', async ({
    page
  }) => {
    const play = page.locator('.hep-animation-play');
    await expect(play).toHaveAttribute('aria-pressed', 'false');
    await play.click();
    await expect(play).toHaveAttribute('aria-pressed', 'true');
    await expect(play).toHaveText('■');

    // Points move, and the segments they travelled accumulate in the trail
    // dataset (HEP-ANIM-004).
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance.chart.data.datasets[2].data.length > 0
    );
    // While playing, the quadrant percents — which describe the PEAK
    // classification, not the moving cloud — are suppressed (HEP-ANIM-006).
    expect(
      await page.evaluate(() => window.__safetyHepExplorerInstance.state.animation.playing)
    ).toBe(true);

    // Stopping leaves the cloud where it stopped and restores the button.
    await play.click();
    await expect(play).toHaveAttribute('aria-pressed', 'false');
    await expect(play).toHaveText('▶');
    const stopped = await page.evaluate(() => window.__safetyHepExplorerInstance.state.animation);
    expect(stopped.playing).toBe(false);
    expect(stopped.day).toBeGreaterThan(0);

    // A play-through left running across a redraw would write into a destroyed
    // chart: changing a control stops it (HEP-ANIM-005).
    await play.click();
    await page
      .locator('.sv-controls .sv-control', { has: page.locator('label:text-is("Axis Type")') })
      .locator('select')
      .selectOption('log');
    await expect(page.locator('.hep-animation-play')).toHaveAttribute('aria-pressed', 'false');
    expect(
      await page.evaluate(() => window.__safetyHepExplorerInstance.state.animation.day)
    ).toBeNull();
  });

  test('HEP-PALT-001/HEP-PALT-003: the opted-in P_ALT estimate is shown in the profile header with the arithmetic behind it (#49)', async ({
    page
  }) => {
    // Off by default: no client-side estimate appears unless the caller asks
    // for one (HEP-PALT-002 — the estimate carries unit and sampling
    // assumptions only the data owner can confirm).
    await page.evaluate(() => window.__safetyHepExplorerInstance.selectParticipant('SUBJ-001'));
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveText('Participant SUBJ-001');
    await expect(page.locator('.sv-rail .sv-profile-palt')).toHaveCount(0);

    await page.evaluate(() =>
      window.__safetyHepExplorerInstance.setSettings({ calculate_palt: true })
    );
    await page.evaluate(() => window.__safetyHepExplorerInstance.selectParticipant('SUBJ-001'));
    const palt = page.locator('.sv-rail .sv-profile-palt');
    await expect(palt).toHaveCount(1);
    await expect(palt).toContainText(/\d+\.\d{2}/);

    // Clicking the figure shows the arithmetic that produced it, not just the
    // number (HEP-PALT-003).
    await palt.locator('.sv-profile-detail-value').click();
    const footnote = page.locator('.sv-rail .sv-profile-footnote');
    await expect(footnote).toContainText('ALT AUC');
    await expect(footnote).toContainText('IU/L');
    await expect(footnote.locator('a')).toHaveAttribute(
      'href',
      'https://pubmed.ncbi.nlm.nih.gov/30303523/'
    );

    await captureEvidence(page, 'HEP-PALT-001', 'palt-estimate');
  });

  test('HEP-SELECT-008: the selected participant’s measure table draws a sparkline per row and expands it into a full chart (#48)', async ({
    page
  }) => {
    await page.evaluate(() => window.__safetyHepExplorerInstance.selectParticipant('SUBJ-001'));
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveText('Participant SUBJ-001');

    // One sparkline per measure row, each with plotted geometry rather than an
    // empty frame (#48 — the original's lab summary table with spark lines).
    const rows = page.locator('.sv-rail .sv-profile-measure-row');
    await expect(rows).toHaveCount(3);
    await expect(page.locator('.sv-rail .sv-profile-spark svg')).toHaveCount(3);
    const sparkPaths = await page.evaluate(() =>
      [...document.querySelectorAll('.sv-rail .sv-profile-spark svg')].map(
        (svg) => svg.querySelectorAll('path, polyline, circle').length
      )
    );
    expect(sparkPaths.every((count) => count > 0)).toBe(true);

    // Clicking a sparkline expands that measure into a full drill-down chart
    // beneath its row, and clicking again collapses it.
    const toggle = page.locator('.sv-rail .sv-profile-spark-toggle').first();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.sv-rail .sv-profile-inset-row canvas')).toHaveCount(1);

    await captureEvidence(page, 'HEP-SELECT-008', 'measure-sparkline-drilldown');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.sv-rail .sv-profile-inset-row')).toHaveCount(0);
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
    // mirroring them, and the railed profile shows its cohort stepper rather
    // than a single-participant profile (#98, PPRF-5).
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
        profileStepper: Boolean(document.querySelector('.sv-rail .sv-profile-stepper'))
      };
    });
    expect([...carriedBack.selected].sort()).toEqual([...compositeMulti].map(String).sort());
    expect(carriedBack.selectedId).toBeNull();
    expect([...carriedBack.dropdownSelected].sort()).toEqual(
      [...compositeMulti].map(String).sort()
    );
    expect(carriedBack.header).toBe('2 participants selected.');
    expect(carriedBack.profileStepper).toBe(true);
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
