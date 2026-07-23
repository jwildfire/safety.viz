import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the hep-waterfall module (#93) — the modified ALT
// waterfall of Amirzadegan et al., Drug Safety 2025;48(5):443-453, Figure 5.
// Test names are keyed to the HWF-* requirement IDs of the hep-waterfall
// matrix per the traceability convention in CONTRIBUTING.md; see
// docs/hep-waterfall-coverage.md for the requirement-ID -> test map.
//
// Assertions are on VALUES the module computed — the ordered cohort on
// instance.waterfall, the floating-bar dataset, the resolved scales, the staged
// box specs — rather than on pixels, mirroring the $hepQuadrants convention in
// hep-explorer.spec.js. The one thing a screenshot is the right evidence for is
// that the three panels draw at all, and that is what captureEvidence covers.
//
// The fixture cohort is engineered so each case appears exactly once: a bar
// dropping below the baseline trace in each arm, a bar rising above it, a
// new-onset-jaundice bar in EACH arm (so green-over-arm precedence is provable),
// one participant excluded by the paper's Table-1 baseline-bilirubin rule, one
// excluded for an undesignated arm, and two records dropped for a missing
// reference range. See tests/e2e/fixtures/hep-waterfall.html for the table.

// The plotted order the fixture is built to produce: placebo ascending by
// baseline, then active descending, so the highest baselines meet at the seam.
const ORDER = ['P-01', 'P-02', 'P-03', 'A-04', 'A-03', 'A-02', 'A-01'];
const BASELINES = [50, 80, 120, 200, 140, 100, 60];
const PEAKS = [46, 130, 110, 190, 130, 320, 52];

const PLACEBO_BLUE = '#1f78b4';
const ACTIVE_BRONZE = '#b5651d';
const JAUNDICE_GREEN = '#2e8b3d';

const control = (page, label) =>
  page.locator('.sv-controls .sv-control', { has: page.locator(`label:text-is("${label}")`) });

test.describe('safety.viz hep-waterfall module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._hwfErrors = errors;
    await page.goto('/tests/e2e/fixtures/hep-waterfall.html');
    await page.waitForFunction(
      () => window.__safetyHepWaterfallInstance && window.__safetyHepWaterfallInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._hwfErrors).toEqual([]);
  });

  test('HWF-CFG-001: the chart carries a prototype banner naming the v1.5 evaluation (#97)', async ({
    page
  }) => {
    const banner = page.locator('.sv-main .sv-prototype');
    await expect(banner).toHaveCount(1);
    await expect(banner).toContainText('Prototype');
    await expect(banner).toContainText('v1.5');
  });

  test('HWF-BAR-001/HWF-BAR-002/HWF-BAR-003/HWF-BAR-004/HWF-ORDER-001/HWF-ORDER-002/HWF-ORDER-003: one floating bar per participant from baseline to on-treatment maximum, under a continuous baseline trace (#93)', async ({
    page
  }) => {
    const chart = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      const [bars, trace] = instance.chart.data.datasets;
      return {
        labels: instance.chart.data.labels,
        ids: instance.waterfall.ordered.map((subject) => String(subject.id)),
        barType: bars.type,
        barData: bars.data,
        barOrder: bars.order,
        traceType: trace.type,
        traceData: trace.data,
        traceOrder: trace.order,
        traceColor: trace.borderColor,
        tracePointRadius: trace.pointRadius,
        barPercentage: bars.barPercentage,
        categoryPercentage: bars.categoryPercentage,
        placeboCount: instance.waterfall.placebo.length,
        activeCount: instance.waterfall.active.length
      };
    });

    // HWF-ORDER-001/002: placebo ascending left to right, then active
    // descending, so the two arms' highest baselines meet at the seam.
    expect(chart.ids).toEqual(ORDER);
    expect(chart.labels).toEqual(ORDER);
    expect(chart.placeboCount).toBe(3);
    expect(chart.activeCount).toBe(4);

    // HWF-BAR-001: exactly one floating [base, top] bar per participant, with
    // no gap between adjacent bars so the cohort reads as one profile.
    expect(chart.barType).toBe('bar');
    expect(chart.barData).toHaveLength(ORDER.length);
    expect(chart.barData).toEqual(BASELINES.map((baseline, i) => [baseline, PEAKS[i]]));
    expect(chart.barPercentage).toBe(1);
    expect(chart.categoryPercentage).toBe(1);

    // HWF-BAR-002: direction alone separates a rise from a fall. P-02 and A-02
    // rise; the other five fall — including P-01 and A-01, whose highest
    // recorded value IS their baseline, which can only read as a fall when the
    // on-treatment maximum excludes the baseline record by identity.
    const direction = chart.barData.map(([base, top]) => Math.sign(top - base));
    expect(direction).toEqual([-1, 1, -1, -1, -1, 1, -1]);

    // HWF-BAR-003: one continuous black line traces every baseline, no markers.
    expect(chart.traceType).toBe('line');
    expect(chart.traceData).toEqual(BASELINES);
    expect(chart.traceColor).toBe('#111827');
    expect(chart.tracePointRadius).toBe(0);

    // HWF-BAR-004: Chart.js draws its order-sorted datasets in reverse, so the
    // LOWER order is painted last and therefore on top — the trace stays
    // visible wherever a bar crosses it.
    expect(chart.traceOrder).toBeLessThan(chart.barOrder);

    // HWF-ORDER-003: the baseline series is non-decreasing across the placebo
    // span and non-increasing across the active span, so the trace is unimodal
    // with its single mode at the arm boundary.
    const boundary = chart.placeboCount;
    for (let i = 1; i < boundary; i += 1) {
      expect(chart.traceData[i]).toBeGreaterThanOrEqual(chart.traceData[i - 1]);
    }
    for (let i = boundary + 1; i < chart.traceData.length; i += 1) {
      expect(chart.traceData[i]).toBeLessThanOrEqual(chart.traceData[i - 1]);
    }
    expect(Math.max(...chart.traceData)).toBe(chart.traceData[boundary]);

    await captureEvidence(page, 'HWF-BAR-001', 'waterfall-default');
  });

  test('HWF-COLOR-001/HWF-COLOR-002/HWF-COLOR-004: blue placebo, bronze active, green for new-onset jaundice in either arm, with the precedence stated (#93)', async ({
    page
  }) => {
    const colors = await page.evaluate(() =>
      window.__safetyHepWaterfallInstance.chart.data.datasets[0].backgroundColor.slice()
    );
    // Fixed semantic palette, not the index-cycling group scale: blue placebo,
    // bronze active, green overriding BOTH for new-onset jaundice (P-02 is a
    // jaundiced placebo participant, A-02 a jaundiced active one).
    expect(colors).toEqual([
      PLACEBO_BLUE,
      JAUNDICE_GREEN,
      PLACEBO_BLUE,
      ACTIVE_BRONZE,
      ACTIVE_BRONZE,
      JAUNDICE_GREEN,
      ACTIVE_BRONZE
    ]);

    // HWF-COLOR-004: the legend names both arms, counts the jaundice cases, and
    // states the precedence out loud — a reader who does not know green wins
    // would otherwise miscount each arm.
    const legend = page.locator('.hwf-legend');
    await expect(legend.locator('.hwf-legend-item')).toHaveCount(3);
    await expect(legend).toContainText('Placebo');
    await expect(legend).toContainText('Study Drug');
    await expect(legend).toContainText('Developed new-onset jaundice (either arm, n=2)');
    await expect(legend.locator('.hwf-legend-note')).toContainText(
      'Green takes precedence over the arm colour'
    );
    const swatches = await legend
      .locator('.hwf-legend-swatch')
      .evaluateAll((nodes) => nodes.map((node) => node.style.background));
    expect(swatches).toEqual(['rgb(31, 120, 180)', 'rgb(181, 101, 29)', 'rgb(46, 139, 61)']);
    await captureEvidence(page, 'HWF-COLOR-002', 'jaundice-precedence');
  });

  test('HWF-COLOR-003: the arm divider splits the plot at the seam and captions each half with its arm and n (#93)', async ({
    page
  }) => {
    // The divider is a canvas plugin, so its inputs are the assertable
    // contract: the plugin is registered, and the seam it draws at is the
    // placebo/active boundary the ordering produced.
    const divider = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      return {
        pluginIds: instance.chart.config.plugins.map((plugin) => plugin.id),
        placeboLabel: instance.waterfall.placeboLabel,
        activeLabel: instance.waterfall.activeLabel,
        placeboCount: instance.waterfall.placebo.length,
        activeCount: instance.waterfall.active.length,
        seamIndex: instance.waterfall.ordered.findIndex((subject) => subject.side === 'active')
      };
    });
    expect(divider.pluginIds).toContain('hwf-arm-divider');
    expect(divider.placeboLabel).toBe('Placebo');
    expect(divider.activeLabel).toBe('Study Drug');
    expect(divider.placeboCount).toBe(3);
    expect(divider.activeCount).toBe(4);
    expect(divider.seamIndex).toBe(divider.placeboCount);
  });

  test('HWF-AXIS-002/HWF-AXIS-003/HWF-AXIS-004: mirrored absolute-unit axes and a single-value reference line (#93)', async ({
    page
  }) => {
    const axes = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      const chart = instance.chart;
      return {
        yMin: chart.scales.y.min,
        yMax: chart.scales.y.max,
        y1Min: chart.scales.y1.min,
        y1Max: chart.scales.y1.max,
        yPosition: chart.scales.y.position,
        y1Position: chart.scales.y1.position,
        yTitle: chart.options.scales.y.title.text,
        y1Title: chart.options.scales.y1.title.text,
        xTitle: chart.options.scales.x.title.text,
        y1Datasets: chart.data.datasets.filter((dataset) => dataset.yAxisID === 'y1').length,
        uln: instance.waterfall.uln,
        unit: instance.waterfall.unit,
        pluginIds: chart.config.plugins.map((plugin) => plugin.id)
      };
    });

    // HWF-AXIS-002: both axes take their min and max from ONE domain call, and
    // nothing is plotted against the right-hand axis. A mirrored axis that is
    // not identical is a lie no screenshot would ever reveal.
    expect(axes.yPosition).toBe('left');
    expect(axes.y1Position).toBe('right');
    expect(axes.y1Min).toBe(axes.yMin);
    expect(axes.y1Max).toBe(axes.yMax);
    expect(axes.y1Datasets).toBe(0);

    // HWF-AXIS-003: absolute reporting units, named on both flanks.
    expect(axes.unit).toBe('U/L');
    expect(axes.yTitle).toBe('ALT (U/L)');
    expect(axes.y1Title).toBe('ALT (U/L)');
    expect(axes.xTitle).toContain('Participants ranked by baseline ALT');
    expect(axes.xTitle).toContain('Placebo');
    expect(axes.xTitle).toContain('Study Drug');
    // The domain covers every plotted value and keeps the reference range in
    // view; values are absolute U/L, never multiples of ULN or of baseline.
    expect(axes.yMin).toBeLessThanOrEqual(40);
    expect(axes.yMax).toBeGreaterThan(320);

    // HWF-AXIS-004: one cohort-wide reference range collapses to a single line.
    expect(axes.uln.values).toEqual([40]);
    expect(axes.uln.single).toBe(true);
    expect(axes.pluginIds).toContain('hwf-uln-band');
  });

  test('HWF-BOX-001/HWF-BOX-002/HWF-BOX-003: a summary panel flanks each arm, pinned to the main chart domain (#93)', async ({
    page
  }) => {
    // HWF-BOX-001: placebo panel left of the waterfall, active panel right.
    await expect(page.locator('.hwf-layout canvas.hwf-box-left')).toBeVisible();
    await expect(page.locator('.hwf-layout canvas.sv-chart')).toBeVisible();
    await expect(page.locator('.hwf-layout canvas.hwf-box-right')).toBeVisible();

    const panels = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      const spec = (side) =>
        instance.boxSpecs[side].map((box) => ({
          label: box.label,
          color: box.color,
          n: box.stats.n,
          median: box.stats.median
        }));
      return {
        left: spec('left'),
        right: spec('right'),
        domain: instance.domain,
        flankDomains: instance.flankCharts.map((chart) => [chart.scales.y.min, chart.scales.y.max]),
        mainDomain: [instance.chart.scales.y.min, instance.chart.scales.y.max]
      };
    });

    // HWF-BOX-003: two boxes per panel by default — baseline and maximum
    // on-treatment — so the panel summarizes the SHIFT the bars show one
    // participant at a time.
    expect(panels.left.map((box) => box.label)).toEqual(['Baseline', 'Peak']);
    expect(panels.right.map((box) => box.label)).toEqual(['Baseline', 'Peak']);
    expect(panels.left.every((box) => box.color === PLACEBO_BLUE)).toBe(true);
    expect(panels.right.every((box) => box.color === ACTIVE_BRONZE)).toBe(true);
    expect(panels.left.map((box) => box.n)).toEqual([3, 3]);
    expect(panels.right.map((box) => box.n)).toEqual([4, 4]);
    // Placebo baselines 50/80/120 -> median 80; active baselines 60/100/140/200
    // -> median 120.
    expect(panels.left[0].median).toBe(80);
    expect(panels.right[0].median).toBe(120);

    // HWF-BOX-002: both flanks are pinned to the main chart's domain, so the
    // three panels are vertically registered and directly comparable.
    panels.flankDomains.forEach((domain) => expect(domain).toEqual(panels.mainDomain));

    // The single-box reading is one control away.
    await control(page, 'Arm summary').locator('select').selectOption('peak');
    await page.waitForFunction(
      () => window.__safetyHepWaterfallInstance.boxSpecs.left.length === 1
    );
    const peakOnly = await page.evaluate(() =>
      window.__safetyHepWaterfallInstance.boxSpecs.left.map((box) => box.label)
    );
    expect(peakOnly).toEqual(['Peak']);
    await captureEvidence(page, 'HWF-BOX-001', 'flanking-summary-panels');
  });

  test('HWF-DATA-003/HWF-DATA-005/HWF-DATA-008: both cohort exclusions and the dropped records are reported separately in the notes (#93)', async ({
    page
  }) => {
    const notes = page.locator('.sv-notes');
    await expect(notes).toContainText('7 participants plotted (Placebo n=3, Study Drug n=4).');
    // HWF-DATA-003: the paper's Table-1 baseline-bilirubin exclusion, named.
    await expect(notes).toContainText(
      '1 participant excluded: abnormal baseline bilirubin (paper Table 1).'
    );
    // HWF-DATA-005: the arm exclusion is a SEPARATE count, so the applicability
    // rule is demonstrable evidence rather than a claim.
    await expect(notes).toContainText(
      '1 participant excluded: arm not designated placebo or active.'
    );
    // HWF-DATA-008: records dropped for an unusable reference range are
    // reported, not dropped silently.
    await expect(notes).toContainText(
      '2 records removed: missing result or missing/non-positive reference range.'
    );
    const excluded = await page.evaluate(
      () => window.__safetyHepWaterfallInstance.waterfall.excluded
    );
    expect(excluded.bilirubin).toBe(1);
    expect(excluded.arm).toBe(1);
    await captureEvidence(page, 'HWF-DATA-003', 'cohort-exclusion-notes');
  });

  test('HWF-DATA-003: turning the Table-1 cohort rule off admits the excluded participants and says so (#93)', async ({
    page
  }) => {
    await page.locator('#hwf-cohort').uncheck();
    await page.waitForFunction(
      () => window.__safetyHepWaterfallInstance.waterfall.ordered.length === 8
    );
    const ids = await page.evaluate(() =>
      window.__safetyHepWaterfallInstance.waterfall.ordered.map((subject) => String(subject.id))
    );
    expect(ids).toContain('X-01');
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      "The paper's Table-1 baseline-bilirubin exclusion is off"
    );
    // The arm exclusion is untouched by the bilirubin toggle — U-01 stays out.
    expect(ids).not.toContain('U-01');
  });

  test('HWF-DATA-007: two units for the plotted measure suppress the chart with a warning naming them (#93)', async ({
    page
  }) => {
    await page.evaluate(() =>
      window.__safetyHepWaterfallInstance.setData(window.__hwfMixedUnitData)
    );
    const warning = page.locator('.sv-notes .sv-warning');
    await expect(warning).toContainText('more than one unit in this data');
    await expect(warning).toContainText('U/L');
    await expect(warning).toContainText('IU/L');
    // An absolute axis cannot mix units, so the chart is withheld rather than
    // rendered harder.
    await expect(page.locator('.sv-chart-wrap')).toBeHidden();
    await captureEvidence(page, 'HWF-DATA-007', 'mixed-unit-warning');
  });

  test('HWF-CTRL-001/HWF-CTRL-002: the control panel exposes the display settings and the arm mapping (#93)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-controls .sv-control label').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Measure',
        'Jaundice threshold (×ULN)',
        'Reference range',
        'Arm summary',
        'Placebo arm',
        'Active arm',
        'Sex',
        'Race'
      ])
    );
    await expect(page.locator('label[for="hwf-cohort"]')).toContainText(
      'Exclude baseline bilirubin > 1×ULN'
    );

    // HWF-CTRL-002: every arm value present in the data is offerable as either
    // side — auto-detection is a convenience, not a contract, and this is the
    // recovery path when it gets the comparator wrong.
    const armOptions = await control(page, 'Placebo arm').locator('option').allTextContents();
    expect(armOptions).toEqual(['Auto-detect', 'Open-label Extension', 'Placebo', 'Study Drug']);
    await expect(page.locator('.hwf-reset')).toHaveText('Reset chart');
    await captureEvidence(page, 'HWF-CTRL-001', 'control-panel');
  });

  test('HWF-CTRL-001: changing the plotted measure redraws in that measure and its own units (#93)', async ({
    page
  }) => {
    await control(page, 'Measure').locator('select').selectOption('TB');
    await page.waitForFunction(
      () => window.__safetyHepWaterfallInstance.chart.options.scales.y.title.text === 'TB (mg/dL)'
    );
    const tb = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      return {
        yTitle: instance.chart.options.scales.y.title.text,
        y1Title: instance.chart.options.scales.y1.title.text,
        bars: instance.chart.data.datasets[0].data,
        ids: instance.waterfall.ordered.map((subject) => String(subject.id))
      };
    });
    expect(tb.y1Title).toBe('TB (mg/dL)');
    // The ranking follows the PLOTTED measure, not ALT: the cohort re-sorts by
    // baseline bilirubin — placebo ascending (0.6, 0.6, 0.7 with the 0.6 tie
    // broken on participant id) then active descending (0.8, 0.7, 0.6, 0.6) —
    // so the mountain is still a mountain in the new analyte.
    expect(tb.ids).toEqual(['P-01', 'P-02', 'P-03', 'A-04', 'A-03', 'A-01', 'A-02']);
    // Bars and the trace are re-valued in mg/dL, the measure's own units.
    expect(tb.bars[1]).toEqual([0.6, 2.6]);
    expect(tb.bars[6]).toEqual([0.6, 3.6]);
  });

  test('HWF-CTRL-001: the jaundice threshold reclassifies which bars are green (#93)', async ({
    page
  }) => {
    const input = control(page, 'Jaundice threshold (×ULN)').locator('input');
    // Raising the threshold above A-02's 3.0xULN peak bilirubin leaves only the
    // arm colours; P-02's 2.17xULN peak drops out first.
    await input.fill('3.5');
    await input.dispatchEvent('change');
    await page.waitForFunction(
      () => window.__safetyHepWaterfallInstance.waterfall.jaundiceCount === 0
    );
    const colors = await page.evaluate(() =>
      window.__safetyHepWaterfallInstance.chart.data.datasets[0].backgroundColor.slice()
    );
    expect(colors).toEqual([
      PLACEBO_BLUE,
      PLACEBO_BLUE,
      PLACEBO_BLUE,
      ACTIVE_BRONZE,
      ACTIVE_BRONZE,
      ACTIVE_BRONZE,
      ACTIVE_BRONZE
    ]);
  });

  test('HWF-CTRL-003: a filter restricts the plotted cohort and the counts follow it (#93)', async ({
    page
  }) => {
    await control(page, 'Sex').locator('select').selectOption('F');
    await page.waitForFunction(
      () => window.__safetyHepWaterfallInstance.waterfall.ordered.length === 4
    );
    const filtered = await page.evaluate(() =>
      window.__safetyHepWaterfallInstance.waterfall.ordered.map((subject) => String(subject.id))
    );
    expect(filtered).toEqual(['P-01', 'P-03', 'A-04', 'A-02']);
    await expect(page.locator('.sv-notes')).toContainText(
      '4 participants plotted (Placebo n=2, Study Drug n=2).'
    );
  });

  test('HWF-CTRL-004: reset restores every control-derived setting and redraws the full cohort (#93)', async ({
    page
  }) => {
    await control(page, 'Sex').locator('select').selectOption('F');
    await control(page, 'Arm summary').locator('select').selectOption('peak');
    await control(page, 'Reference range').locator('select').selectOption('none');
    await page.waitForFunction(
      () => window.__safetyHepWaterfallInstance.waterfall.ordered.length === 4
    );

    await page.locator('.hwf-reset').click();
    await page.waitForFunction(
      (expected) => window.__safetyHepWaterfallInstance.waterfall.ordered.length === expected,
      ORDER.length
    );
    const state = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      return {
        ids: instance.waterfall.ordered.map((subject) => String(subject.id)),
        summary: instance.state.summary,
        ulnDisplay: instance.state.ulnDisplay,
        filters: instance.state.filters,
        boxes: instance.boxSpecs.left.length
      };
    });
    expect(state.ids).toEqual(ORDER);
    expect(state.summary).toBe('baseline_peak');
    expect(state.ulnDisplay).toBe('band');
    expect(state.filters).toEqual({});
    expect(state.boxes).toBe(2);
  });

  test('HWF-SELECT-001: the bar tooltip names the participant, arm, both values, the change and the jaundice status (#93)', async ({
    page
  }) => {
    const lines = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      // A-02: the jaundiced active-arm participant with the largest rise.
      const index = instance.waterfall.ordered.findIndex((subject) => subject.id === 'A-02');
      return instance.chart.options.plugins.tooltip.callbacks.label({ dataIndex: index });
    });
    expect(lines[0]).toBe('A-02');
    expect(lines[1]).toBe('Arm: Study Drug');
    expect(lines[2]).toBe('Baseline ALT: 100 U/L');
    expect(lines[3]).toBe('Maximum on-treatment ALT: 320 U/L (day 56)');
    expect(lines[4]).toBe('Change: +220 U/L (3.2×baseline)');
    expect(lines[5]).toBe('Peak total bilirubin: 3×ULN');
    expect(lines[6]).toBe('Developed new-onset jaundice');

    // A falling bar reads as a signed decline and carries no jaundice line.
    const decline = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      const index = instance.waterfall.ordered.findIndex((subject) => subject.id === 'P-01');
      return instance.chart.options.plugins.tooltip.callbacks.label({ dataIndex: index });
    });
    expect(decline[4]).toContain('Change: -4 U/L');
    expect(decline.join(' ')).not.toContain('jaundice');
  });

  test('HWF-SELECT-002/HWF-SELECT-003: clicking a bar highlights the participant, opens the listing, and dispatches participantsSelected (#93)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      window.__hwfSelectionEvents = [];
      instance.root.addEventListener('participantsSelected', (event) =>
        window.__hwfSelectionEvents.push(event.detail.data.slice())
      );
    });

    await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      const index = instance.waterfall.ordered.findIndex((subject) => subject.id === 'A-02');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });

    // The selected bar is outlined against the rest of the cohort.
    const selected = await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      const dataset = instance.chart.data.datasets[0];
      return {
        ids: instance.state.selectedIds.slice(),
        widths: dataset.borderWidth.slice(),
        events: window.__hwfSelectionEvents.map((ids) => ids.slice())
      };
    });
    expect(selected.ids).toEqual(['A-02']);
    expect(selected.widths).toEqual([0, 0, 0, 0, 0, 2, 0]);
    expect(selected.events).toEqual([['A-02']]);

    // The linked listing opens on that participant's own records.
    await expect(page.locator('.sv-listing table')).toBeVisible();
    const headers = await page.locator('.sv-listing th').allTextContents();
    expect(headers.join(',')).toContain('Participant');
    expect(headers.join(',')).toContain('Measure');
    expect(headers.join(',')).toContain('Result');
    await expect(page.locator('.sv-main-annotation')).toHaveText('A-02');
    await captureEvidence(page, 'HWF-SELECT-002', 'participant-selection');

    // Clicking the same bar again clears the selection and closes the listing,
    // and listeners hear the empty selection.
    await page.evaluate(() => {
      const instance = window.__safetyHepWaterfallInstance;
      const index = instance.waterfall.ordered.findIndex((subject) => subject.id === 'A-02');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
    const cleared = await page.evaluate(() => ({
      ids: window.__safetyHepWaterfallInstance.state.selectedIds.slice(),
      events: window.__hwfSelectionEvents.map((ids) => ids.slice())
    }));
    expect(cleared.ids).toEqual([]);
    expect(cleared.events).toEqual([['A-02'], []]);
  });
});
