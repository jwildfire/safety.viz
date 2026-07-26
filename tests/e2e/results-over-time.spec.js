import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the results-over-time module (#27): the box-and-whisker
// distribution of a measure at each visit, with grouping, an outlier overlay,
// y-limit/scale controls, and visit-display toggles. Test names are keyed to
// requirement IDs per the traceability convention in CONTRIBUTING.md; see
// docs/results-over-time-coverage.md for the requirement-ID → matrix-row → test
// map.

const control = (page, label) =>
  page.locator('.sv-control', { has: page.locator(`label:text-is("${label}")`) });

const instanceState = (page, pick) => page.evaluate(pick);

test.describe('safety.viz results-over-time module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._srotErrors = errors;
    await page.goto('/tests/e2e/fixtures/results-over-time.html');
    await page.waitForFunction(
      () => window.__safetyResultsOverTimeInstance && window.__safetyResultsOverTimeInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._srotErrors).toEqual([]);
  });

  test('SROT-FUNC-001/SROT-FUNC-002: renders measure, group, filter, y-axis, scale, and display controls (#27)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Measure',
        'Group by',
        'Sex',
        'Treatment Group',
        'Lower',
        'Upper',
        'Scale',
        'Box plots',
        'Outliers',
        'Visits without data',
        'Unscheduled visits'
      ])
    );
    await captureEvidence(page, 'SROT-FUNC-001', 'control-panel');
  });

  test('SROT-FUNC-003: participant note updates when a filter is applied (#27)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes')).toContainText('participants shown');
    const before = await page.locator('.sv-notes').innerText();
    await control(page, 'Sex').locator('select').selectOption({ index: 1 });
    const after = await page.locator('.sv-notes').innerText();
    expect(after).not.toBe(before);
    await captureEvidence(page, 'SROT-FUNC-003', 'participant-count');
  });

  test('SROT-DATA-002: missing and non-numeric results are dropped with a reported count and visible note (#27)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      '2 missing or non-numeric results removed.'
    );
    await captureEvidence(page, 'SROT-DATA-002', 'invalid-data-note');
  });

  test('SROT-FUNC-008: box-and-whisker marks render and toggle off with the Box plots control (#27)', async ({
    page
  }) => {
    expect(
      await instanceState(page, () => window.__safetyResultsOverTimeInstance.boxSpecs.length)
    ).toBeGreaterThan(0);
    await captureEvidence(page, 'SROT-FUNC-008', 'box-plots');

    await control(page, 'Box plots').locator('input').uncheck();
    expect(
      await instanceState(page, () => window.__safetyResultsOverTimeInstance.boxSpecs.length)
    ).toBe(0);

    await control(page, 'Box plots').locator('input').check();
    expect(
      await instanceState(page, () => window.__safetyResultsOverTimeInstance.boxSpecs.length)
    ).toBeGreaterThan(0);
  });

  test('SROT-REG-002/SROT-REG-003: grouping draws side-by-side boxes with a group-ordered legend (#27)', async ({
    page
  }) => {
    const grouped = await instanceState(page, () => ({
      labels: window.__safetyResultsOverTimeInstance.chart.data.datasets.map((d) => d.label),
      legend: window.__safetyResultsOverTimeInstance.chart.options.plugins.legend.display
    }));
    expect(grouped.labels).toEqual(['Drug', 'Placebo']);
    expect(grouped.legend).toBe(true);
    await captureEvidence(page, 'SROT-REG-002', 'grouped-box-plots');

    await control(page, 'Group by').locator('select').selectOption('srot_none');
    const ungrouped = await instanceState(page, () => ({
      count: window.__safetyResultsOverTimeInstance.chart.data.datasets.length,
      legend: window.__safetyResultsOverTimeInstance.chart.options.plugins.legend.display
    }));
    expect(ungrouped.count).toBe(1);
    expect(ungrouped.legend).toBe(false);
  });

  test('SROT-REG-010/SROT-REG-012: the outlier overlay shows and hides with the Outliers control (#27)', async ({
    page
  }) => {
    const outlierCount = () =>
      instanceState(page, () =>
        window.__safetyResultsOverTimeInstance.chart.data.datasets.reduce(
          (sum, ds) => sum + ds.data.filter((point) => point.__outlier).length,
          0
        )
      );
    expect(await outlierCount()).toBeGreaterThan(0);
    await captureEvidence(page, 'SROT-REG-010', 'outliers');

    await control(page, 'Outliers').locator('input').uncheck();
    expect(await outlierCount()).toBe(0);
  });

  test('SROT-REG-011: outlier points carry a larger hover radius than their resting radius (#27)', async ({
    page
  }) => {
    const radii = await instanceState(page, () => {
      const dataset = window.__safetyResultsOverTimeInstance.chart.data.datasets.find((ds) =>
        ds.data.some((point) => point.__outlier)
      );
      const point = dataset.data.find((p) => p.__outlier);
      const ctx = { raw: point };
      return { radius: dataset.pointRadius(ctx), hover: dataset.pointHoverRadius(ctx) };
    });
    expect(radii.hover).toBeGreaterThan(radii.radius);
  });

  test('SROT-REG-014/SROT-REG-015: hovering a box exposes the summary statistics tooltip (#27)', async ({
    page
  }) => {
    const lines = await instanceState(page, () => {
      const chart = window.__safetyResultsOverTimeInstance.chart;
      const dataset = chart.data.datasets.find((ds) => ds.data.some((point) => point.__box));
      const point = dataset.data.find((p) => p.__box);
      return chart.options.plugins.tooltip.callbacks.label({ raw: point });
    });
    const text = lines.join('\n');
    expect(text).toContain('N = ');
    expect(text).toContain('Median = ');
    expect(text).toContain('StDev = ');
    expect(text).toContain('95th % = ');
  });

  test('SROT-FUNC-004/SROT-REG-016/SROT-REG-017: y-limit inputs redraw and invert a crossed pair (#27)', async ({
    page
  }) => {
    await control(page, 'Lower').locator('input').fill('6');
    await control(page, 'Lower').locator('input').dispatchEvent('change');
    await control(page, 'Upper').locator('input').fill('3');
    await control(page, 'Upper').locator('input').dispatchEvent('change');
    const domain = await instanceState(page, () => ({
      lower: window.__safetyResultsOverTimeInstance.state.lower,
      upper: window.__safetyResultsOverTimeInstance.state.upper,
      min: window.__safetyResultsOverTimeInstance.chart.scales.y.min,
      max: window.__safetyResultsOverTimeInstance.chart.scales.y.max
    }));
    expect(domain).toEqual({ lower: 3, upper: 6, min: 3, max: 6 });
    await captureEvidence(page, 'SROT-FUNC-004', 'y-limits');
  });

  test('SROT-FUNC-005/SROT-REG-020: Reset Limits restores the data extent (#27)', async ({
    page
  }) => {
    await control(page, 'Lower').locator('input').fill('6');
    await control(page, 'Lower').locator('input').dispatchEvent('change');
    await page.locator('.sv-reset-limits').click();
    const state = await instanceState(page, () => ({
      lower: window.__safetyResultsOverTimeInstance.state.lower,
      upper: window.__safetyResultsOverTimeInstance.state.upper,
      lowerInput: window.__safetyResultsOverTimeInstance.lowerInput.value,
      derived: window.__safetyResultsOverTimeInstance.state.axisDomain
    }));
    expect(state.lower).toBeNull();
    expect(state.upper).toBeNull();
    // Since #85 Reset repopulates the box with the derived limit rather than
    // blanking it — blank is no longer how "auto" is expressed (AXIS-3).
    expect(state.lowerInput).not.toBe('');
    expect(Number(state.lowerInput)).toBeCloseTo(state.derived[0], 1);
  });

  test('SROT-AXIS-001/SROT-AXIS-002/SROT-AXIS-003: y-limit inputs load pre-filled with the drawn axis, follow the measure, and Reset restores them (#85)', async ({
    page
  }) => {
    const lower = control(page, 'Lower').locator('input');
    const upper = control(page, 'Upper').locator('input');
    const drawn = () =>
      instanceState(page, () => {
        const scale = window.__safetyResultsOverTimeInstance.chart.scales.y;
        return [scale.min, scale.max];
      });

    // Loaded pre-filled with the axis the chart actually drew (AXIS-1).
    const domain = await drawn();
    const tolerance = (domain[1] - domain[0]) / 500;
    expect(await lower.inputValue()).not.toBe('');
    expect(await upper.inputValue()).not.toBe('');
    expect(Math.abs(Number(await lower.inputValue()) - domain[0])).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(Number(await upper.inputValue()) - domain[1])).toBeLessThanOrEqual(tolerance);

    // Untouched limits still follow the data across a measure change (AXIS-2).
    await control(page, 'Measure').locator('select').selectOption('Pulse (beats/min)');
    const pulse = await drawn();
    expect(pulse).not.toEqual(domain);
    expect(Math.abs(Number(await lower.inputValue()) - pulse[0])).toBeLessThanOrEqual(
      (pulse[1] - pulse[0]) / 500
    );

    // An edit is respected, and Reset Limits puts the derived values back
    // (AXIS-3) instead of blanking the boxes.
    await lower.fill(String(pulse[0] + 1));
    await lower.dispatchEvent('change');
    expect(
      await instanceState(page, () => window.__safetyResultsOverTimeInstance.state.lower)
    ).toBe(pulse[0] + 1);
    await page.locator('.sv-reset-limits').click();
    expect(
      await instanceState(page, () => window.__safetyResultsOverTimeInstance.state.lower)
    ).toBeNull();
    expect(Math.abs(Number(await lower.inputValue()) - pulse[0])).toBeLessThanOrEqual(
      (pulse[1] - pulse[0]) / 500
    );
    await captureEvidence(page, 'SROT-AXIS-001', 'y-limits-prefilled');
  });

  test('SROT-REG-018: the Scale control switches the y-axis between linear and log (#27)', async ({
    page
  }) => {
    expect(
      await instanceState(page, () => window.__safetyResultsOverTimeInstance.chart.scales.y.type)
    ).toBe('linear');
    await control(page, 'Scale').locator('select').selectOption('log');
    expect(
      await instanceState(page, () => window.__safetyResultsOverTimeInstance.chart.scales.y.type)
    ).toBe('logarithmic');
    await captureEvidence(page, 'SROT-REG-018', 'log-scale');
  });

  test('SROT-FUNC-006/SROT-REG-004/SROT-REG-005: the Visits without data control adds empty timepoints (#27)', async ({
    page
  }) => {
    // Albumin has no Week 6 data (Pulse-only visit), so it is hidden by default.
    const before = await instanceState(
      page,
      () => window.__safetyResultsOverTimeInstance.currentVisits
    );
    expect(before).not.toContain('Week 6');

    await control(page, 'Visits without data').locator('input').check();
    const after = await instanceState(
      page,
      () => window.__safetyResultsOverTimeInstance.currentVisits
    );
    expect(after).toContain('Week 6');
    await captureEvidence(page, 'SROT-FUNC-006', 'visits-without-data');
  });

  test('SROT-FUNC-007/SROT-REG-006/SROT-REG-007: the Unscheduled visits control shows unscheduled timepoints (#27)', async ({
    page
  }) => {
    const before = await instanceState(
      page,
      () => window.__safetyResultsOverTimeInstance.currentVisits
    );
    expect(before).not.toContain('Unscheduled');

    await control(page, 'Unscheduled visits').locator('input').check();
    const after = await instanceState(
      page,
      () => window.__safetyResultsOverTimeInstance.currentVisits
    );
    expect(after).toContain('Unscheduled');
    await captureEvidence(page, 'SROT-FUNC-007', 'unscheduled-visits');
  });

  test('SROT-REG-023/SROT-REG-024: start_value selects the initial measure and falls back when absent (#27)', async ({
    page
  }) => {
    await page.evaluate(() =>
      window.__safetyResultsOverTimeInstance.setSettings({ start_value: 'Pulse (beats/min)' })
    );
    expect(
      await instanceState(page, () => window.__safetyResultsOverTimeInstance.state.measure)
    ).toBe('Pulse (beats/min)');

    await page.evaluate(() =>
      window.__safetyResultsOverTimeInstance.setSettings({ start_value: 'Nonexistent Measure' })
    );
    const measure = await instanceState(
      page,
      () => window.__safetyResultsOverTimeInstance.state.measure
    );
    expect(['Albumin (g/dL)', 'Pulse (beats/min)']).toContain(measure);
  });

  test('SROT-API: lifecycle API supports init, setData, setSettings, render, resize, and destroy (#27)', async ({
    page
  }) => {
    const result = await page.evaluate(() => {
      const instance = window.__safetyResultsOverTimeInstance;
      const methods = ['init', 'setData', 'setSettings', 'render', 'resize', 'destroy'];
      const hasMethods = methods.every((method) => typeof instance[method] === 'function');
      const setSettingsReturnsInstance =
        instance.setSettings({ group_by: 'srot_none' }) === instance;
      const setDataReturnsInstance = instance.setData(instance.rawData) === instance;
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
