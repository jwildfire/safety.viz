// @vitest-environment jsdom
// The whole-chart reset control on qt-explorer (#136, QT-CTRL-004). The
// library shipped "Reset Limits", which resets an axis and nothing else; nine
// issues across seven of the retired renderer trackers asked for a way back to
// the starting view. qt-explorer's reset is deliberately a WHOLE-chart reset:
// state.view lives in the same seed literal as the correction and the
// statistic, so Reset returns the reader to the central-tendency view, the
// hep-waterfall semantic rather than hep-explorer's keep-the-view one. The
// correction is also data-derived — validateAndCleanData pins it to the first
// AVAILABLE measure — so a re-seed that skips that pin can strand the chart on
// a correction the bound data does not carry.
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

const { Chart } = await import('chart.js');
const { default: qtExplorer } = await import('../../../src/qt-explorer.js');
const { TIMEPOINT_MAX } = await import('../../../src/qt-explorer/configure.js');
const { ALL_VALUE } = await import('../../../src/filters.js');

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
  Chart.built.length = 0;
});

/**
 * Deterministic ECG fixture: two arms × two participants, three visits,
 * QTcF + Heart Rate — no QTcB anywhere, which is what makes the
 * available-measure pin observable.
 */
function ecgRows() {
  const rows = [];
  const arms = [
    ['Placebo', 'PBO', [0, 2, 1]],
    ['High Dose', 'XHI', [0, 30, 55]]
  ];
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

function build(settings = {}) {
  const instance = qtExplorer(document.querySelector('#host'), {
    filters: [{ value_col: 'SEX', label: 'Sex' }],
    ...settings
  });
  instance.init(ecgRows());
  return instance;
}

/** The `.sv-control` wrapper whose label reads `label`. */
const control = (instance, label) =>
  [...instance.controls.querySelectorAll('.sv-control')].find(
    (wrap) => wrap.querySelector('label')?.textContent === label
  );

const resetButton = (instance) => instance.controls.querySelector('.sv-reset');

/** Click the named view option through the shared view selector. */
function chooseView(instance, label) {
  [...instance.controls.querySelectorAll('.sv-view-option')]
    .find((button) => button.textContent === label)
    .onclick();
}

/** Set a select's value and fire its handler — jsdom fires nothing for us. */
function choose(instance, label, value) {
  const select = control(instance, label).querySelector('select');
  select.value = value;
  select.onchange();
}

describe('qt-explorer reset control (QT-CTRL-004)', () => {
  it('QT-CTRL-004: a full-width reset control sits at the foot of the control panel (#136)', () => {
    const instance = build();
    const reset = resetButton(instance);
    expect(reset).toBeTruthy();
    expect(reset.tagName).toBe('BUTTON');
    expect(reset.type).toBe('button');
    expect(reset.textContent).toBe('Reset chart');
    // Below the View, Display and Filters sections, not tucked inside one.
    expect(instance.controls.lastElementChild).toBe(reset);
    expect(reset.parentElement).toBe(instance.controls);
  });

  it('QT-CTRL-004: reset restores the correction, statistic, display type and filters (#136)', () => {
    const instance = build();
    choose(instance, 'Correction', 'Heart Rate');
    choose(instance, 'Statistic', 'median');
    choose(instance, 'Display type', 'deltadelta');
    choose(instance, 'Sex', 'M');
    expect(instance.state.measure).toBe('Heart Rate');
    expect(instance.state.statistic).toBe('median');
    expect(instance.state.mode).toBe('deltadelta');
    expect(instance.state.filters.SEX).toBe('M');

    resetButton(instance).onclick();

    expect(instance.state.measure).toBe('QTcF');
    expect(instance.state.statistic).toBe('mean');
    expect(instance.state.mode).toBe('delta');
    expect(instance.state.filters).toEqual({ SEX: null });
    // Controls are rebuilt, so what is rendered agrees with the state.
    expect(control(instance, 'Statistic').querySelector('select').value).toBe('mean');
    expect(control(instance, 'Sex').querySelector('select').value).toBe(ALL_VALUE);
  });

  it('QT-CTRL-004: reset returns the reader to the central-tendency view and the default timepoint (#136)', () => {
    const instance = build();
    chooseView(instance, 'Outlier scatter');
    choose(instance, 'Timepoint', 'Week 2');
    expect(instance.state.view).toBe('outlier');
    expect(instance.state.timepoint).toBe('Week 2');

    resetButton(instance).onclick();

    // The view is in the seed literal, so a whole-chart reset restores it —
    // deliberately unlike hep-explorer's partial reset, which keeps the view.
    expect(instance.state.view).toBe('central');
    expect(instance.state.timepoint).toBe(TIMEPOINT_MAX);
    expect(
      [...instance.controls.querySelectorAll('.sv-view-option.is-active')].map(
        (button) => button.textContent
      )
    ).toEqual(['Central tendency']);
    // The central-tendency controls are back and the outlier-only one is gone.
    expect(control(instance, 'Statistic')).toBeTruthy();
    expect(control(instance, 'Timepoint')).toBeUndefined();
  });

  it('QT-CTRL-004: reset re-pins the correction to one the data carries, not the configured start (#136)', () => {
    // start_measure names a correction absent from the bound data, so the
    // opening selection comes from validateAndCleanData's available-measure
    // pin — which the reset must re-run rather than restore the setting.
    const instance = build({ start_measure: 'QTcB' });
    expect(instance.settings.start_measure).toBe('QTcB');
    expect(instance.availableMeasures).not.toContain('QTcB');
    const opening = instance.state.measure;
    expect(opening).toBe('QTcF');

    choose(instance, 'Correction', 'Heart Rate');
    resetButton(instance).onclick();

    expect(instance.state.measure).toBe(opening);
    expect(instance.availableMeasures).toContain(instance.state.measure);
    // Not blank: the central-tendency chart is drawn for the pinned correction.
    expect(instance.charts.length).toBeGreaterThan(0);
  });

  it('QT-CTRL-004: reset clears the scatter selection, the docked profile, and the live charts (#136)', () => {
    const instance = build();
    chooseView(instance, 'Outlier scatter');
    instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    expect(instance.state.selectedId).toBeTruthy();
    expect(instance.railWrap.querySelector('.sv-profile-id')).not.toBeNull();

    const before = Chart.built.filter((chart) => !chart.destroyed);
    expect(before.length).toBeGreaterThan(0);
    resetButton(instance).onclick();

    expect(instance.state.selectedId).toBeNull();
    expect(instance.participantsSelected).toEqual([]);
    expect(instance.railWrap.querySelector('.sv-profile-id')).toBeNull();
    before.forEach((chart) => expect(chart.destroyed).toBe(true));
  });

  it('QT-CTRL-004: reset leaves the standing cautions and the central-tendency CI table intact (#136)', () => {
    const instance = build();
    choose(instance, 'Statistic', 'median');
    resetButton(instance).onclick();

    // QT-CAUTION-001 is permanent chrome; QT-CAUTION-002 is live here because
    // the fixture carries two arms. Neither is state, so neither resets away.
    expect(instance.cautionEl.textContent).not.toBe('');
    expect(instance.unblindingEl.hidden).toBe(false);
    expect(instance.unblindingEl.textContent).not.toBe('');
    // The central-tendency summary table (QT-CT-*) is re-rendered, not dropped.
    expect(instance.tableWrap.classList.contains('qt-empty')).toBe(false);
    expect(instance.tableWrap.querySelector('table')).not.toBeNull();
  });
});
