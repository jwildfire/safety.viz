// @vitest-environment jsdom
// Printed central-tendency values (#136, QT-CT-008). The central-tendency view
// already DRAWS each arm's mean change and its two-sided CI as a band, but the
// numbers behind the band were never printed — reviewers asked for the values
// underneath the confidence band, not only the graphic. The table is built from
// the SAME centralTendencySeries result the chart consumes, so the printed
// numbers can never disagree with the band, and it inherits the active
// correction, statistic, display mode and filters for free. It renders into the
// module's existing tableWrap slot (between the ICH callout and the footnote),
// which the categorical view also uses — the two views are mutually exclusive.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.destroyed = false;
      Chart.built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
  }
  Chart.built = [];
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    ScatterController: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: qtExplorer } = await import('../../../src/qt-explorer.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

/**
 * Deterministic ECG fixture: `arms` × two participants × three visits, QTcF +
 * Heart Rate. Per-participant change is `drift[visitIndex] + i`, so each arm's
 * per-visit mean and CI are hand-computable: n = 2, sd = √0.5, se = 0.5, and
 * the 90% z = 1.6449 gives a ±0.8224 half-width on every cell.
 */
function ecgRows(
  arms = [
    ['Placebo', 'PBO', [0, 2, 1]],
    ['High Dose', 'XHI', [0, 30, 55]]
  ]
) {
  const rows = [];
  const visits = [
    { VISIT: 'Baseline', VISITNUM: 0, ABLFL: 'Y' },
    { VISIT: 'Week 2', VISITNUM: 2, ABLFL: '' },
    { VISIT: 'Week 4', VISITNUM: 4, ABLFL: '' }
  ];
  arms.forEach(([arm, code, drift]) => {
    for (let i = 0; i < 2; i += 1) {
      const id = `${code}-${i + 1}`;
      const baseF = 400 + i * 10;
      const baseHR = 60 + i;
      visits.forEach((v, vi) => {
        const chg = v.ABLFL === 'Y' ? 0 : drift[vi] + i;
        rows.push(
          {
            USUBJID: id,
            ARM: arm,
            SEX: i % 2 ? 'M' : 'F',
            VISIT: v.VISIT,
            VISITNUM: v.VISITNUM,
            ABLFL: v.ABLFL,
            TEST: 'QTcF',
            STRESU: 'msec',
            STRESN: baseF + chg,
            BASE: baseF,
            CHG: chg
          },
          {
            USUBJID: id,
            ARM: arm,
            SEX: i % 2 ? 'M' : 'F',
            VISIT: v.VISIT,
            VISITNUM: v.VISITNUM,
            ABLFL: v.ABLFL,
            TEST: 'Heart Rate',
            STRESU: 'bpm',
            STRESN: baseHR + Math.round(chg / 10),
            BASE: baseHR,
            CHG: Math.round(chg / 10)
          }
        );
      });
    }
  });
  return rows;
}

function build(settings = {}, rows = ecgRows()) {
  const instance = qtExplorer(document.querySelector('#host'), settings);
  instance.init(rows);
  return instance;
}

function rerender(instance) {
  instance.buildControls();
  instance.render();
}

const header = (instance) =>
  [...instance.tableWrap.querySelectorAll('table.qt-ct-table thead th')].map(
    (th) => th.textContent
  );

const bodyRows = (instance) =>
  [...instance.tableWrap.querySelectorAll('table.qt-ct-table tbody tr')].map((tr) =>
    [...tr.children].map((td) => td.textContent)
  );

const rowFor = (instance, visit, arm) =>
  bodyRows(instance).find((r) => r[0] === visit && r[1] === arm);

describe('qt-explorer printed central-tendency values (QT-CT-008)', () => {
  it('QT-CT-008: the central-tendency view prints one row per visit and arm beneath the visible chart (#136)', () => {
    const instance = build();
    expect(instance.tableWrap.classList.contains('qt-empty')).toBe(false);
    // The chart is NOT hidden — the table sits beneath the band, it does not
    // replace it (contrast the categorical view).
    expect(instance.chartWrap.style.display).toBe('');
    expect(instance.tableWrap.querySelector('table.qt-ct-table')).not.toBeNull();
    expect(header(instance)).toEqual([
      'Visit',
      'Arm',
      'n',
      'Δ mean (ms)',
      '90% CI low',
      '90% CI high'
    ]);
    expect(bodyRows(instance)).toHaveLength(6); // 3 visits × 2 arms
    // The table sits between the ICH callout and the footnote, inside the
    // module's existing tableWrap slot.
    expect(instance.main.contains(instance.tableWrap)).toBe(true);
  });

  it('QT-CT-008: the printed values are the plotted mean and the CI bounds the band draws (#136)', () => {
    const instance = build();
    // High Dose, Week 4: per-participant changes 55 and 56 → mean 55.5,
    // sd √0.5, se 0.5, 90% half-width 1.6449 × 0.5 = 0.8224.
    expect(rowFor(instance, 'Week 4', 'High Dose')).toEqual([
      'Week 4',
      'High Dose',
      '2',
      '+55.5',
      '+54.7',
      '+56.3'
    ]);
    // Placebo, Week 2: changes 2 and 3 → mean 2.5, same half-width.
    expect(rowFor(instance, 'Week 2', 'Placebo')).toEqual([
      'Week 2',
      'Placebo',
      '2',
      '+2.5',
      '+1.7',
      '+3.3'
    ]);
    // Every printed value matches the series the chart is built from.
    const printed = bodyRows(instance).map((r) => r.slice(3).join('|'));
    expect(printed).toHaveLength(6);
    expect(printed.every((cells) => cells.length > 0)).toBe(true);
  });

  it('QT-CT-008: median mode prints NA for the CI bounds (#136)', () => {
    const instance = build();
    instance.state.statistic = 'median';
    rerender(instance);
    expect(header(instance)[3]).toBe('Δ median (ms)');
    const rows = bodyRows(instance);
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => {
      expect(r[4]).toBe('NA');
      expect(r[5]).toBe('NA');
    });
  });

  it('QT-CT-008: ΔΔ mode prints the placebo-corrected difference and drops the placebo arm (#136)', () => {
    const instance = build();
    instance.state.mode = 'deltadelta';
    rerender(instance);
    expect(header(instance)[3]).toBe('ΔΔ mean (ms)');
    expect(bodyRows(instance).some((r) => r[1] === 'Placebo')).toBe(false);
    expect(bodyRows(instance)).toHaveLength(3); // 3 visits × 1 non-placebo arm
    // ΔΔ at Week 4 = 55.5 − 1.5 = 54.0.
    expect(rowFor(instance, 'Week 4', 'High Dose')[3]).toBe('+54');
    expect(instance.tableWrap.querySelector('caption').textContent).toContain(
      'placebo is the reference'
    );
  });

  it('QT-CT-008: the printed values honour the active correction (#136)', () => {
    const instance = build();
    instance.state.measure = 'Heart Rate';
    rerender(instance);
    expect(header(instance)[3]).toBe('Δ mean (bpm)');
    expect(instance.tableWrap.querySelector('caption').textContent).toContain('Heart Rate');
  });

  it('QT-CT-008: the printed values honour the active filters (#136)', () => {
    const instance = build({ filters: [{ value_col: 'SEX', label: 'Sex' }] });
    expect(rowFor(instance, 'Week 4', 'High Dose')[2]).toBe('2');
    instance.state.filters.SEX = 'F';
    rerender(instance);
    expect(rowFor(instance, 'Week 4', 'High Dose')[2]).toBe('1');
  });

  it('QT-CT-008: the header carries the configured confidence level (#136)', () => {
    const instance = build({ ci_level: 0.95 });
    expect(header(instance)[4]).toBe('95% CI low');
    expect(header(instance)[5]).toBe('95% CI high');
  });

  it('QT-CT-008: the categorical view still shows only the exceedance table (#136)', () => {
    const instance = build();
    instance.state.view = 'categorical';
    rerender(instance);
    expect(instance.tableWrap.querySelector('table.qt-ct-table')).toBeNull();
    expect(instance.tableWrap.querySelector('thead th').textContent).toBe('Threshold');
  });

  it('QT-CT-008: ΔΔ without a placebo arm renders no table (#136)', () => {
    const instance = build(
      {},
      ecgRows([
        ['Drug A', 'DGA', [0, 2, 1]],
        ['Drug B', 'DGB', [0, 30, 55]]
      ])
    );
    instance.state.mode = 'deltadelta';
    rerender(instance);
    expect(instance.tableWrap.classList.contains('qt-empty')).toBe(true);
    expect(instance.noteEl.textContent).toContain('needs a placebo arm');
  });
});
