import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the time-to-event module (#128). Test names are keyed to
// the TTE-* requirement IDs per the traceability convention in CONTRIBUTING.md;
// see docs/time-to-event-coverage.md for the requirement-ID → test map.
//
// The fixture (fixtures/time-to-event.html) feeds the events + population
// contract with hand-computed expectations: with every event qualifying,
// Placebo steps to 0.75 then 0.625 (a censoring shares day 10 with the third
// event and stays in its risk set); Study Drug steps 5/6 → 2/3 → 4/9 and
// extends flat to day 30. Filtering to serious events only leaves one Placebo
// event and an entirely-censored study-drug group (the flat-line honesty case),
// and unusable rows in both datasets exercise the counted-drop lanes.

const INSTANCE = 'window.__safetyTimeToEventInstance';

async function selectByLabel(page, label, value) {
  const select = page
    .locator('.sv-control', { has: page.locator(`label:text-is("${label}")`) })
    .locator('select');
  await select.selectOption(value);
}

// Toggle one value inside a labeled multiselect (opening it first — the
// checkbox list is a collapsed <details>).
async function setMultiValue(page, label, value, checked) {
  const control = page.locator('.sv-control', {
    has: page.locator(`label:text-is("${label}")`)
  });
  const details = control.locator('details.sv-multiselect');
  if (!(await details.evaluate((node) => node.open))) await details.locator('summary').click();
  const box = details.locator(`.sv-ms-option:not(.sv-ms-all) input[value="${value}"]`);
  await box.setChecked(checked);
}

test.describe('safety.viz time-to-event module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._tteErrors = errors;
    await page.goto('/tests/e2e/fixtures/time-to-event.html');
    await page.waitForFunction(
      () => window.__safetyTimeToEventInstance && window.__safetyTimeToEventInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._tteErrors).toEqual([]);
  });

  test('TTE-CURV-001/TTE-CURV-005/TTE-STAT-001/TTE-DERIV-001: the step curves carry the hand-computed product-limit values from each participant’s first qualifying event and extend flat to the last observed time (#128)', async ({
    page
  }) => {
    const vertices = await page.evaluate(() =>
      window.__safetyTimeToEventInstance.chart.data.datasets
        .filter((dataset) => dataset.$tteKind === 'curve')
        .map((dataset) => ({
          group: dataset.$tteGroupName,
          steps: dataset.$tteVertices.map((vertex) => [vertex.x, vertex.y, vertex.kind])
        }))
    );
    // Incidence orientation (the default): y = 1 − S. P-1's later same-day-40
    // repeat and day-12 serious event never displace the day-5 first event.
    expect(vertices[0].group).toBe('Placebo');
    expect(vertices[0].steps).toEqual([
      [0, 0, 'origin'],
      [5, 0.25, 'event'],
      [10, 0.375, 'event'],
      [25, 0.375, 'terminal']
    ]);
    expect(vertices[1].group).toBe('Study Drug');
    const drug = vertices[1].steps;
    expect(drug[1][1]).toBeCloseTo(1 - 5 / 6, 10);
    expect(drug[2][1]).toBeCloseTo(1 - 2 / 3, 10);
    expect(drug[3][1]).toBeCloseTo(1 - 4 / 9, 10);
    // The curve extends flat to the largest censored time (TTE-CURV-005).
    expect(drug[4]).toEqual([30, drug[3][1], 'terminal']);
    await captureEvidence(page, 'TTE-CURV-001', 'km-curves-incidence');
  });

  test('TTE-CURV-002/TTE-DERIV-002: censor tick marks sit on the curve at each follow-up-end time (#128)', async ({
    page
  }) => {
    const marks = await page.evaluate(() =>
      window.__safetyTimeToEventInstance.chart.data.datasets
        .filter((dataset) => dataset.$tteKind === 'censor')
        .map((dataset) => ({
          group: dataset.$tteGroupName,
          times: dataset.$tteMarks.map((mark) => mark.time)
        }))
    );
    expect(marks[0]).toEqual({ group: 'Placebo', times: [10, 15, 20, 25] });
    expect(marks[1]).toEqual({ group: 'Study Drug', times: [12, 30] });
    // The censoring description comes from the population row (TTE-DERIV-002).
    const withdrew = await page.evaluate(() => {
      const group = window.__safetyTimeToEventInstance.structured.groups[1];
      return group.observations.find((observation) => observation.id === 'D-3').censorDesc;
    });
    expect(withdrew).toBe('WITHDREW CONSENT');
  });

  test('TTE-CURV-003/TTE-STAT-004: the pointwise band is drawn from the same estimate and gaps where undefined (#128)', async ({
    page
  }) => {
    const band = await page.evaluate(() => window.__safetyTimeToEventInstance.chart.$tteBand);
    // One rectangle per defined inter-event interval: Placebo [5,10) and
    // [10,25]; Study Drug [3,8), [8,18), [18,30].
    const placebo = band.filter((rect) => rect.group === 'Placebo');
    expect(placebo.map((rect) => [rect.x0, rect.x1])).toEqual([
      [5, 10],
      [10, 25]
    ]);
    const drug = band.filter((rect) => rect.group === 'Study Drug');
    expect(drug.map((rect) => [rect.x0, rect.x1])).toEqual([
      [3, 8],
      [8, 18],
      [18, 30]
    ]);
    // The band values come from the module's own km estimate (one derivation).
    const expected = await page.evaluate(() => {
      const group = window.__safetyTimeToEventInstance.structured.groups[0];
      return group.estimate.points.map((point) => [1 - point.hi, 1 - point.lo]);
    });
    placebo.forEach((rect, i) => {
      expect(rect.lo).toBeCloseTo(expected[i][0], 10);
      expect(rect.hi).toBeCloseTo(expected[i][1], 10);
    });
  });

  test('TTE-ANIM-001: the chart renders without intro animation, so the curves, band and risk table always share one truthful frame (#128, sv#131 review)', async ({
    page
  }) => {
    const animation = await page.evaluate(
      () => window.__safetyTimeToEventInstance.chart.options.animation
    );
    expect(animation).toBe(false);
  });

  test('TTE-USER-003: the CI toggle removes the band (#128)', async ({ page }) => {
    const checkbox = page
      .locator('.sv-control', { has: page.locator('label:text-is("Pointwise 95% CI band")') })
      .locator('input[type=checkbox]');
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await page.waitForFunction(
      () => (window.__safetyTimeToEventInstance.chart.$tteBand || []).length === 0
    );
    await captureEvidence(page, 'TTE-USER-003', 'ci-band-off');
  });

  test('TTE-CURV-004/TTE-USER-002: the axis names the estimator and the orientation toggle flips the curves (#128)', async ({
    page
  }) => {
    const incidenceTitle = await page.evaluate(
      () => window.__safetyTimeToEventInstance.chart.options.scales.y.title.text
    );
    expect(incidenceTitle).toBe('Cumulative incidence (1 − KM)');
    await selectByLabel(page, 'Orientation', 'survival');
    await page.waitForFunction(
      () =>
        window.__safetyTimeToEventInstance.chart.options.scales.y.title.text ===
        'Event-free probability (KM)'
    );
    const firstStep = await page.evaluate(() => {
      const dataset = window.__safetyTimeToEventInstance.chart.data.datasets[0];
      return dataset.$tteVertices[1].y;
    });
    expect(firstStep).toBeCloseTo(0.75, 10); // S(5), no longer 1 − S
    await captureEvidence(page, 'TTE-CURV-004', 'survival-orientation');
  });

  test('TTE-RISK-001/TTE-RISK-002: the strip table shows at-risk and cumulative events at the axis ticks (#128)', async ({
    page
  }) => {
    const table = await page.evaluate(() => window.__safetyTimeToEventInstance.chart.$tteRiskTable);
    const at = (strip, group, time) =>
      table.find((row) => row.strip === strip && row.group === group && row.time === time)?.count;
    // Ticks are 0,5,10,15,20,25,30 (step 5 over maxTime 30).
    expect(at('No. at risk', 'Placebo', 0)).toBe(8);
    expect(at('No. at risk', 'Placebo', 10)).toBe(6);
    expect(at('No. at risk', 'Placebo', 25)).toBe(2);
    expect(at('No. at risk', 'Study Drug', 15)).toBe(3);
    expect(at('Cumulative events', 'Placebo', 5)).toBe(2);
    expect(at('Cumulative events', 'Placebo', 30)).toBe(3);
    expect(at('Cumulative events', 'Study Drug', 20)).toBe(3);
    await captureEvidence(page, 'TTE-RISK-001', 'risk-table');
  });

  test('TTE-RISK-003: hiding a group via the legend drops its curve, marks, band and rows together (#128)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const chart = window.__safetyTimeToEventInstance.chart;
      const item = chart.legend.legendItems.find((entry) => entry.text === 'Study Drug');
      chart.options.plugins.legend.onClick(null, item, chart.legend);
    });
    await page.waitForFunction(() => {
      const chart = window.__safetyTimeToEventInstance.chart;
      return (chart.$tteRiskTable || []).every((row) => row.group !== 'Study Drug');
    });
    const state = await page.evaluate(() => {
      const chart = window.__safetyTimeToEventInstance.chart;
      const group = chart.$tteGroups.find((entry) => entry.name === 'Study Drug');
      return {
        curveVisible: chart.isDatasetVisible(group.curveIndex),
        censorVisible: chart.isDatasetVisible(group.censorIndex),
        bandGroups: [...new Set(chart.$tteBand.map((rect) => rect.group))]
      };
    });
    expect(state.curveVisible).toBe(false);
    expect(state.censorVisible).toBe(false);
    expect(state.bandGroups).toEqual(['Placebo']);
  });

  test('TTE-FILT-001: a multiselect event filter recomposes the endpoint live, including an all-censored group drawn flat (#128, sv#131 review)', async ({
    page
  }) => {
    // Serious events only: deselect N, keep Y.
    await setMultiValue(page, 'Serious', 'N', false);
    await page.waitForFunction(() => {
      const structured = window.__safetyTimeToEventInstance.structured;
      const events = structured.groups.reduce(
        (n, group) => n + group.estimate.points.reduce((a, p) => a + p.events, 0),
        0
      );
      return events === 1;
    });
    const groups = await page.evaluate(() =>
      window.__safetyTimeToEventInstance.structured.groups.map((group) => ({
        name: group.name,
        events: group.estimate.points.length,
        total: group.estimate.total
      }))
    );
    // The whole population stays the denominator: participants whose only
    // events no longer qualify censor at their follow-up day.
    expect(groups).toEqual([
      { name: 'Placebo', events: 1, total: 8 },
      { name: 'Study Drug', events: 0, total: 6 }
    ]);
    const placeboStep = await page.evaluate(() => {
      const group = window.__safetyTimeToEventInstance.structured.groups[0];
      return group.estimate.points.map((point) => [point.time, point.surv]);
    });
    expect(placeboStep).toHaveLength(1);
    expect(placeboStep[0][0]).toBe(12);
    expect(placeboStep[0][1]).toBeCloseTo(6 / 7, 12);
    await expect(page.locator('.sv-notes')).toContainText('1 event, 13 censored');
    await captureEvidence(page, 'TTE-FILT-001', 'serious-only-composed-endpoint');
  });

  test('TTE-FILT-002: no active selection qualifies every event; an empty selection draws the honest all-censored display (#128)', async ({
    page
  }) => {
    // Deselect everything via the All master row.
    const details = page
      .locator('.sv-control', { has: page.locator('label:text-is("Serious")') })
      .locator('details.sv-multiselect');
    await details.locator('summary').click();
    const all = details.locator('.sv-ms-all input');
    await all.setChecked(false);
    await page.waitForFunction(() => {
      const structured = window.__safetyTimeToEventInstance.structured;
      const events = structured.groups.reduce(
        (n, group) => n + group.estimate.points.reduce((a, p) => a + p.events, 0),
        0
      );
      return events === 0 && structured.total === 14;
    });
    const hasChart = await page.evaluate(() => !!window.__safetyTimeToEventInstance.chart);
    expect(hasChart).toBe(true);
    await expect(page.locator('.sv-notes')).toContainText('0 events, 14 censored');
    // Back to everything: the default endpoint returns.
    await all.setChecked(true);
    await page.waitForFunction(() => {
      const structured = window.__safetyTimeToEventInstance.structured;
      const events = structured.groups.reduce(
        (n, group) => n + group.estimate.points.reduce((a, p) => a + p.events, 0),
        0
      );
      return events === 6;
    });
  });

  test('TTE-FILT-003: the notes name the composed endpoint and the active filter selection (#128)', async ({
    page
  }) => {
    const notes = page.locator('.sv-notes');
    await expect(notes).toContainText('Time to first qualifying event');
    await expect(notes).toContainText('All recorded events qualify.');
    await setMultiValue(page, 'Serious', 'N', false);
    await expect(notes).toContainText('Qualifying events — Serious: 1 of 2 values.');
  });

  test('TTE-USER-004: a configured population filter constrains the denominator (#128)', async ({
    page
  }) => {
    await selectByLabel(page, 'Sex', 'F');
    await page.waitForFunction(() => window.__safetyTimeToEventInstance.structured.total === 7);
    const groups = await page.evaluate(() =>
      window.__safetyTimeToEventInstance.structured.groups.map((group) => group.estimate.total)
    );
    expect(groups).toEqual([4, 3]); // P-1,3,5,7 and D-1,3,5
  });

  test('TTE-DATA-002/TTE-DATA-003: unusable rows in both datasets are counted with exportable record lists (#128)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes')).toContainText('2 unusable event rows');
    await expect(page.locator('.sv-notes')).toContainText('2 excluded participant rows');
    await expect(page.locator('.sv-notes a').first()).toContainText('Download records');
    const reasons = await page.evaluate(() => {
      const structured = window.__safetyTimeToEventInstance.structured;
      return {
        events: structured.droppedEvents.map((row) => row.__tte_dropReason),
        population: structured.droppedPopulation.map((row) => row.__tte_dropReason)
      };
    });
    expect(reasons.events.join(' ')).toMatch(/non-numeric event day/);
    expect(reasons.events.join(' ')).toMatch(/not in the population/);
    expect(reasons.population.join(' ')).toMatch(/duplicate/);
    expect(reasons.population.join(' ')).toMatch(/follow-up/);
  });

  test('TTE-GUIDE-001: the notes state the derivation rule, the pointwise bands and the 1 − KM competing-risks limitation (#128)', async ({
    page
  }) => {
    const notes = page.locator('.sv-notes');
    await expect(notes).toContainText('censored at end of follow-up');
    await expect(notes).toContainText('pointwise 95% CIs');
    await expect(notes).toContainText('not simultaneous');
    await expect(notes).toContainText('overestimate absolute risk when competing events');
  });

  test("TTE-USER-008: clicking an event step dispatches participantsSelected with that step's ids (#128)", async ({
    page
  }) => {
    const clickPoint = await page.evaluate(() => {
      const chart = window.__safetyTimeToEventInstance.chart;
      const root = window.__safetyTimeToEventInstance.root;
      window.__tteSelections = [];
      root.addEventListener('participantsSelected', (event) =>
        window.__tteSelections.push(event.detail.data)
      );
      // The Placebo day-5 event vertex (index 1 of dataset 0).
      const meta = chart.getDatasetMeta(0);
      const element = meta.data[1];
      const rect = chart.canvas.getBoundingClientRect();
      return { x: rect.left + element.x, y: rect.top + element.y };
    });
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await page.waitForFunction(() => (window.__tteSelections || []).length > 0);
    const selections = await page.evaluate(() => window.__tteSelections);
    expect(selections[0].sort()).toEqual(['P-1', 'P-2']);
    await expect(page.locator('.sv-footnote')).toContainText('2 participants with an event');
  });

  test('TTE-USER-007: an all-unusable selection renders the empty state, not an empty confident chart (#128)', async ({
    page
  }) => {
    // The Sex filter has no third value, so drive the empty state through the
    // instance API the controls call: an impossible filter selection.
    await page.evaluate(() => {
      const instance = window.__safetyTimeToEventInstance;
      instance.state.filters.SEX = '__none__';
      instance.render();
    });
    await expect(page.locator('.sv-main-annotation')).toContainText(
      'No usable time-to-event observations'
    );
    const hasChart = await page.evaluate(() => !!window.__safetyTimeToEventInstance.chart);
    expect(hasChart).toBe(false);
  });
});

test.describe('safety.viz time-to-event demo page', () => {
  test('TTE-DEMO-001: the built demo composes the endpoint from the vendored adae + adsl extracts (#128)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/_site/time-to-event/index.html');
    await page.waitForFunction(
      () => window.__safetyTimeToEventInstance && window.__safetyTimeToEventInstance.chart
    );
    const summary = await page.evaluate(() => {
      const structured = window.__safetyTimeToEventInstance.structured;
      return {
        total: structured.total,
        events: structured.groups.reduce(
          (n, group) => n + group.estimate.points.reduce((a, p) => a + p.events, 0),
          0
        ),
        groups: structured.groups.map((group) => group.name)
      };
    });
    // The full safety population; with every event qualifying this is time to
    // first TEAE — matching the retired build-time derivation exactly.
    expect(summary.total).toBe(254);
    expect(summary.events).toBe(217);
    // Data order from the vendored adsl.csv (adsl input order).
    expect(summary.groups).toEqual(['Placebo', 'Xanomeline High Dose', 'Xanomeline Low Dose']);
    // The endpoint composer renders one multiselect per configured column.
    await expect(
      page
        .locator('.sv-control', { has: page.locator('label:text-is("Body System")') })
        .locator('details.sv-multiselect')
    ).toBeVisible();
    expect(errors).toEqual([]);
    await captureEvidence(page, 'TTE-DEMO-001', 'demo-page');
  });

  test("TTE-GUIDE-002: the built clinical guide states the estimator's limits (#128)", async ({
    page
  }) => {
    await page.goto('/_site/time-to-event/guide.html');
    const body = page.locator('body');
    await expect(body).toContainText('overestimate');
    await expect(body).toContainText('Aalen–Johansen');
    await expect(body).toContainText('uninformative');
    await expect(body).toContainText('pointwise');
    await expect(body).toContainText('does not establish absolute risk');
  });
});
