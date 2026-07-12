import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the delta-delta module (#25). Test names are keyed to
// requirement IDs from the safety.agent matrix per the traceability convention
// in CONTRIBUTING.md; see docs/delta-delta-coverage.md for the requirement-ID →
// matrix-row → test map. Interactions are driven through the instance API (as
// in the histogram spec) so assertions stay independent of canvas geometry.

async function selectPoint(page, index) {
  await page.evaluate((i) => {
    const instance = window.__safetyDeltaDeltaInstance;
    instance.chart.options.onClick({}, [{ index: i }]);
  }, index);
  await expect(page.locator('.sdd-measure-table')).toBeVisible();
}

test.describe('safety.viz delta-delta module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._sddErrors = errors;
    await page.goto('/tests/e2e/fixtures/delta-delta.html');
    await page.waitForFunction(
      () => window.__safetyDeltaDeltaInstance && window.__safetyDeltaDeltaInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._sddErrors).toEqual([]);
  });

  test('SDD-FUNC-001/SDD-FUNC-002/SDD-FUNC-003: renders visit, measure, filter, and display controls (#25)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Baseline visit(s)',
        'Comparison visit(s)',
        'X Measure',
        'Y Measure',
        'Site',
        'Sex',
        'Treatment Group',
        'Regression Line'
      ])
    );
    await captureEvidence(page, 'SDD-FUNC-001', 'control-panel');
  });

  test('SDD-FUNC-002/SDD-REG-003: defaults to the first/second measure and first/last visit, plotting one point per participant (#25)', async ({
    page
  }) => {
    const state = await page.evaluate(() => {
      const instance = window.__safetyDeltaDeltaInstance;
      return {
        measureX: instance.state.measureX,
        measureY: instance.state.measureY,
        baseline: instance.state.baseline,
        comparison: instance.state.comparison,
        points: instance.chart.$ddPoints.length,
        firstDelta: [instance.chart.$ddPoints[0].delta_x, instance.chart.$ddPoints[0].delta_y]
      };
    });
    expect(state.measureX).toBe('Albumin');
    expect(state.measureY).toBe('Bilirubin');
    expect(state.baseline).toEqual(['Screening']);
    expect(state.comparison).toEqual(['Week 4']);
    // 8 fully-populated participants plot; SUBJ-09 has a removed comparison result.
    expect(state.points).toBe(8);
    // SUBJ-01 Albumin 41→38 = −3; Bilirubin 1.00→0.70 = −0.30.
    expect(state.firstDelta[0]).toBeCloseTo(-3, 6);
    expect(state.firstDelta[1]).toBeCloseTo(-0.3, 6);
    await captureEvidence(page, 'SDD-FUNC-002', 'baseline-scatter');
  });

  test('SDD-FUNC-004: the participant-count note reports the total and percentage shown (#25)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes')).toContainText('8 of 9 participants shown (88.9%).');
  });

  test('SDD-REG-008: missing/non-numeric results are dropped with a reported count and visible note (#25)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      '1 missing or non-numeric results removed.'
    );
    await captureEvidence(page, 'SDD-REG-008', 'invalid-data-note');
  });

  test('SDD-REG-001: changing the Y measure changes the plotted distribution (#25)', async ({
    page
  }) => {
    const before = await page.evaluate(() =>
      window.__safetyDeltaDeltaInstance.chart.data.datasets[0].data.map((d) => d.y)
    );
    await page
      .locator('.sv-control', { hasText: 'Y Measure' })
      .locator('select')
      .selectOption('Calcium');
    const after = await page.evaluate(() =>
      window.__safetyDeltaDeltaInstance.chart.data.datasets[0].data.map((d) => d.y)
    );
    expect(after).not.toEqual(before);
    // All participants have Calcium 9.0→9.2 = +0.20.
    expect(after.every((y) => Math.abs(y - 0.2) < 1e-6)).toBe(true);
  });

  test('SDD-REG-002: changing the comparison visit changes the plotted distribution (#25)', async ({
    page
  }) => {
    const before = await page.evaluate(() =>
      window.__safetyDeltaDeltaInstance.chart.data.datasets[0].data.map((d) => d.x)
    );
    await page.evaluate(() => {
      const instance = window.__safetyDeltaDeltaInstance;
      instance.state.comparison = ['Week 2'];
      instance.render();
    });
    const after = await page.evaluate(() =>
      window.__safetyDeltaDeltaInstance.chart.data.datasets[0].data.map((d) => d.x)
    );
    expect(after).not.toEqual(before);
  });

  test('SDD-REG-006/SDD-REG-005: a filter narrows the plotted points and updates the count (#25)', async ({
    page
  }) => {
    await page.locator('.sv-control', { hasText: 'Site' }).locator('select').selectOption('North');
    const result = await page.evaluate(() => ({
      points: window.__safetyDeltaDeltaInstance.chart.$ddPoints.length,
      notes: document.querySelector('.sv-notes').innerText
    }));
    // SUBJ-01..04 are North and all plottable.
    expect(result.points).toBe(4);
    expect(result.notes).toContain('4 of 9 participants shown');
  });

  test('SDD-FUNC-005: the tooltip reports the participant ID and both change values (#25)', async ({
    page
  }) => {
    const tip = await page.evaluate(() => {
      const chart = window.__safetyDeltaDeltaInstance.chart;
      const { label, afterLabel } = chart.options.plugins.tooltip.callbacks;
      return { label: label({ dataIndex: 0 }), afterLabel: afterLabel({ dataIndex: 0 }) };
    });
    expect(tip.label).toBe('Participant: SUBJ-01');
    expect(tip.afterLabel).toContain('Change in Albumin: -3.00');
    expect(tip.afterLabel).toContain('Change in Bilirubin: -0.30');
  });

  test('SDD-FUNC-006/SDD-REG-011/SDD-REG-016/SDD-REG-018/SDD-REG-019/SDD-REG-020/SDD-REG-024: clicking a point opens the linked measure table (#25)', async ({
    page
  }) => {
    await selectPoint(page, 0);
    // Detail header carries the participant ID (SDD-REG-016).
    await expect(page.locator('.sdd-detail-header')).toContainText('SUBJ-01');
    // Headers: Measure + Change over Time (SDD-REG-018).
    const headers = await page.locator('.sdd-measure-table th').allTextContents();
    expect(headers).toContain('Measure');
    expect(headers).toContain('Change over Time');
    // One row per measure collected for the participant (SDD-REG-019).
    await expect(page.locator('.sdd-measure-table tbody tr')).toHaveCount(3);
    // Each row has a sparkline (SDD-REG-020).
    await expect(page.locator('.sdd-measure-table tbody tr svg.sdd-sparkline')).toHaveCount(3);
    // Color-key footnote (SDD-REG-024).
    await expect(page.locator('.sdd-table-footnote')).toContainText(
      'baseline visits are filled blue'
    );
    await captureEvidence(page, 'SDD-FUNC-006', 'measure-table');
  });

  test('SDD-REG-021/SDD-REG-022/SDD-REG-025: change values are signed and colored, with axis tags (#25)', async ({
    page
  }) => {
    await selectPoint(page, 0);
    const rows = await page.evaluate(() => {
      const trs = [...document.querySelectorAll('.sdd-measure-table tbody tr')];
      return trs.map((tr) => {
        const name = tr.querySelector('.sdd-measure-name').textContent;
        const tag = tr.querySelector('.sdd-axis-tag')?.textContent ?? '';
        const deltaCell = tr.querySelector('.sdd-delta');
        return { name, tag, text: deltaCell.textContent, color: getComputedStyle(deltaCell).color };
      });
    });
    // Albumin: X-axis tag, −3.00, red.
    expect(rows[0].tag).toBe('X-axis');
    expect(rows[0].text).toBe('-3.00');
    expect(rows[0].color).toBe('rgb(220, 38, 38)');
    // Bilirubin: Y-axis tag, −0.30, red.
    expect(rows[1].tag).toBe('Y-axis');
    expect(rows[1].color).toBe('rgb(220, 38, 38)');
    // Calcium: no axis tag, +0.20, green.
    expect(rows[2].tag).toBe('');
    expect(rows[2].text).toBe('+0.20');
    expect(rows[2].color).toBe('rgb(22, 163, 74)');
  });

  test('SDD-REG-012/SDD-REG-013: the clicked point is highlighted and clicking another redraws the table (#25)', async ({
    page
  }) => {
    await selectPoint(page, 0);
    const first = await page.evaluate(() => {
      const dataset = window.__safetyDeltaDeltaInstance.chart.data.datasets[0];
      return { width: dataset.pointBorderWidth[0], color: dataset.pointBorderColor[0] };
    });
    expect(first.width).toBe(3);
    expect(first.color).toBe('#111827');
    await captureEvidence(page, 'SDD-REG-012', 'point-selected');

    await selectPoint(page, 1);
    await expect(page.locator('.sdd-detail-header')).toContainText('SUBJ-02');
    const second = await page.evaluate(() => {
      const dataset = window.__safetyDeltaDeltaInstance.chart.data.datasets[0];
      return { w0: dataset.pointBorderWidth[0], w1: dataset.pointBorderWidth[1] };
    });
    expect(second.w0).toBe(0.5);
    expect(second.w1).toBe(3);
  });

  test('SDD-REG-014: changing a control removes the detail table (#25)', async ({ page }) => {
    await selectPoint(page, 0);
    await page
      .locator('.sv-control', { hasText: 'X Measure' })
      .locator('select')
      .selectOption('Calcium');
    await expect(page.locator('.sdd-measure-table')).toHaveCount(0);
  });

  test('SDD-REG-026: the regression line toggles with an equation and R² note (#25)', async ({
    page
  }) => {
    await expect(page.locator('.sv-footnote')).toContainText('simple linear regression');
    await expect(page.locator('.sv-footnote')).toContainText('R² =');
    const on = await page.evaluate(() => window.__safetyDeltaDeltaInstance.regression !== null);
    expect(on).toBe(true);
    await captureEvidence(page, 'SDD-REG-026', 'regression-line');

    await page.locator('.sv-control', { hasText: 'Regression Line' }).locator('input').uncheck();
    const off = await page.evaluate(() => window.__safetyDeltaDeltaInstance.regression);
    expect(off).toBeNull();
    await expect(page.locator('.sv-footnote')).not.toContainText('simple linear regression');
  });

  test('SDD-REG-007: a filter for a non-existent variable logs a console warning (#25)', async ({
    page
  }) => {
    const warning = await page.evaluate(() => {
      const warnings = [];
      const original = console.warn;
      console.warn = (msg) => warnings.push(msg);
      const div = document.createElement('div');
      document.body.append(div);
      SafetyViz.deltaDelta(div, { filters: [{ value_col: 'SOTE', label: 'Sote' }] }).init(
        window.__safetyDeltaDeltaInstance.rawData
      );
      console.warn = original;
      return warnings.join('\n');
    });
    expect(warning).toContain(
      'The [ Sote ] filter has been removed because the variable does not exist.'
    );
  });

  test('SDD-REG-010: a non-existent required column errors into the container and tears the chart down (#25)', async ({
    page
  }) => {
    const container = await page.evaluate(() => {
      const div = document.createElement('div');
      div.id = 'sdd-error-target';
      document.body.append(div);
      try {
        SafetyViz.deltaDelta(div, { measure_col: 'NOPE' }).init(
          window.__safetyDeltaDeltaInstance.rawData
        );
      } catch (error) {
        return { text: div.textContent, message: error.message };
      }
      return { text: div.textContent, message: null };
    });
    expect(container.text).toContain('Required variable(s) missing: NOPE');
    expect(container.message).toContain('Required variable(s) missing: NOPE');
  });

  test('SDD-API-001: lifecycle API supports init, setData, setSettings, render, resize, and destroy (#25)', async ({
    page
  }) => {
    const result = await page.evaluate(() => {
      const instance = window.__safetyDeltaDeltaInstance;
      const methods = ['init', 'setData', 'setSettings', 'render', 'resize', 'destroy'];
      const hasMethods = methods.every((method) => typeof instance[method] === 'function');
      const setSettingsReturnsInstance =
        instance.setSettings({ add_regression_line: false }) === instance;
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
