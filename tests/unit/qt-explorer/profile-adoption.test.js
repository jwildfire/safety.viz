// @vitest-environment jsdom
// qt-explorer adopts the participant-profile dock (#99, PPRF-10/11): the only
// per-participant surface is the outlier scatter, which gains a point-click
// selection (NEW minimal host state: state.selectedId) dispatching the house
// participantsSelected event on the shell root. The profile's lab contract is
// mapped for interval (ECG) measures: a synthesized unit-ULN column
// (__qt_profile_uln = 1) makes the spaghetti plot OBSERVED milliseconds, the
// identity measure_values map makes the ECG parameters the KEY measures, and
// per-QTc cuts carry the first absolute threshold (450 ms) while Heart Rate
// stays cut-free. Central/categorical views have no participant marks — the
// dock idles and every view switch clears it (render-preamble rule).
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
 * Deterministic ECG fixture: two arms × two participants, three visits,
 * QTcF + Heart Rate. High Dose participants drift upward so per-participant
 * values are distinct and post-baseline maxima are unambiguous.
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
  const instance = qtExplorer(document.querySelector('#host'), settings);
  instance.init(ecgRows());
  return instance;
}

function toOutlierView(instance) {
  instance.state.view = 'outlier';
  instance.buildControls();
  instance.render();
}

function clickFirstPoint(instance) {
  instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
  return instance.chart.data.datasets[0].data[0].__point.id;
}

describe('qt-explorer participant-profile adoption (PPRF-QT-001)', () => {
  it('PPRF-QT-001: mounts the dock by default (config-on) into the shell profile slot', () => {
    const instance = build();
    expect(instance.profile).toBeTruthy();
    expect(instance.profileWrap.children).toHaveLength(0); // idle until a selection
  });

  it('PPRF-QT-001: profile: false leaves the slot empty and mounts no dock', () => {
    const instance = build({ profile: false });
    expect(instance.profile).toBeNull();
    toOutlierView(instance);
    instance.selectParticipant('PBO-1');
    expect(instance.profileWrap.children).toHaveLength(0);
  });

  it('PPRF-QT-001: clicking an outlier-scatter point feeds the dock the full profile via the shell root', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    toOutlierView(instance);
    const id = clickFirstPoint(instance);
    expect(instance.state.selectedId).toBe(id);
    expect(heard).toEqual([[id]]);
    // Full profile, never a stepper (single-select gesture).
    expect(instance.profileWrap.querySelector('.sv-profile-id').textContent).toBe(
      `Participant ${id}`
    );
    expect(instance.profileWrap.querySelector('.sv-profile-step-count')).toBeNull();
    // The ECG parameters are the KEY measures — both render without an extras toggle.
    expect(instance.profileWrap.querySelector('.sv-profile-measure-table')).not.toBeNull();
    expect(instance.profileWrap.querySelector('.sv-profile-extras')).toBeNull();
  });

  it('PPRF-QT-004: no listing is added — the dock is the only drill-down surface', () => {
    const instance = build();
    toOutlierView(instance);
    clickFirstPoint(instance);
    expect(instance.listingWrap.children).toHaveLength(0);
  });
});

describe('qt-explorer interval-measure mapping (PPRF-QT-002)', () => {
  it('PPRF-QT-002: feed rows survive the unit-ULN synthesis — observed ms on the ULN scale, nothing drops', () => {
    const instance = build();
    expect(instance.profileRows.length).toBe(instance.rawData.length);
    instance.profileRows.forEach((row) => {
      expect(row.__hep_uln).toBe(1);
      expect(row.__hep_relative_uln).toBe(row.__hep_value);
    });
    // The synthesized column never leaks onto the host's retained raw data.
    expect(instance.rawData.every((row) => row.__qt_profile_uln === undefined)).toBe(true);
  });

  it('PPRF-QT-002: maps the profile settings for interval measures — identity keys, per-QTc cuts, observed-ms labels', () => {
    const instance = build();
    const settings = instance.profile.settings;
    expect(settings.measure_values.QTcF).toBe('QTcF');
    expect(settings.measure_values.QTcB).toBe('QTcB');
    expect(settings.measure_values['Heart Rate']).toBe('Heart Rate');
    // Per-QTc-measure absolute cut (the first absolute threshold, 450 ms);
    // the defaults entry is NaN so Heart Rate renders cut-free.
    expect(settings.cuts.QTcF.relative_uln).toBe(450);
    expect(settings.cuts.QTcB.relative_uln).toBe(450);
    expect(Number.isNaN(settings.cuts.defaults.relative_uln)).toBe(true);
    expect(settings.display_options[0]).toEqual({ value: 'relative_uln', label: 'Observed (ms)' });
    // Mapping details: unit ULN column, VISITNUM as the day axis (adeg carries
    // no DY), and NO baseline flag column — the host's BASE is a VALUE column,
    // not the profile's flag contract; deriveBaseline's earliest-visit rule
    // lands on the baseline visit instead.
    expect(settings.normal_col_high).toBe('__qt_profile_uln');
    expect(settings.normal_col_low).toBeNull();
    expect(settings.studyday_col).toBe('VISITNUM');
    expect(settings.baseline_col).toBeNull();
  });

  it('PPRF-QT-002: the docked spaghetti carries the 450 ms cut on QTc series and no cut on Heart Rate', () => {
    const instance = build();
    toOutlierView(instance);
    clickFirstPoint(instance);
    const series = instance.profile.model.spaghetti.series;
    const qtcf = series.find((entry) => entry.key === 'QTcF');
    const hr = series.find((entry) => entry.key === 'Heart Rate');
    expect(qtcf.cut).toBe(450);
    expect(qtcf.points.every((point) => point.value > 300)).toBe(true); // observed ms, not ×ULN
    expect(Number.isNaN(hr.cut)).toBe(true);
  });
});

describe('qt-explorer dock clear paths (PPRF-QT-003, PPRF-11)', () => {
  it('PPRF-QT-003: an empty-canvas click clears the selection and empties the dock', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    toOutlierView(instance);
    clickFirstPoint(instance);
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    instance.chart.options.onClick({}, []);
    expect(instance.state.selectedId).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-QT-003: a view switch clears the selection and the dock (render preamble); non-scatter views idle', () => {
    const instance = build();
    toOutlierView(instance);
    clickFirstPoint(instance);
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    instance.state.view = 'central';
    instance.buildControls();
    instance.render();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    // The central chart offers no point selection — the dock idles, mounted.
    expect(instance.chart.options.onClick).toBeUndefined();
    expect(instance.profile).toBeTruthy();
  });

  it('PPRF-QT-003: the dock Clear affordance routes through the host clear path', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    toOutlierView(instance);
    clickFirstPoint(instance);
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-QT-003: dock Clear empties an externally-fed cohort the host never selected (PPRF-11)', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', {
        detail: { data: ['PBO-1', 'XHI-1'] },
        bubbles: true
      })
    );
    expect(instance.profileWrap.children.length).toBeGreaterThan(0);
    expect(instance.state.selectedId).toBeNull();
    instance.profileWrap.querySelector('.sv-profile-clear').click();
    expect(instance.profileWrap.children).toHaveLength(0);
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-QT-004: stepping an externally-fed cohort emphasizes the stepped point without re-dispatching', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    toOutlierView(instance);
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', {
        detail: { data: ['PBO-1', 'XHI-1'] },
        bubbles: true
      })
    );
    expect(instance.profileWrap.querySelector('.sv-profile-step-count').textContent).toContain(
      '1 of 2'
    );
    const heardBefore = heard.length;
    instance.profileWrap.querySelector('.sv-profile-step-next').click();
    // The stepped point is emphasized on the scatter (per-point radius arrays)…
    const emphasized = instance.chart.data.datasets.some((dataset) =>
      Array.isArray(dataset.pointRadius)
    );
    expect(emphasized).toBe(true);
    // …without a host selection or a re-dispatch.
    expect(instance.state.selectedId).toBeNull();
    expect(heard).toHaveLength(heardBefore);
  });

  it('PPRF-QT-001: setSettings({profile: false}) unmounts a live dock; re-enabling remounts it', () => {
    const instance = build();
    toOutlierView(instance);
    clickFirstPoint(instance);
    instance.setSettings({ profile: false });
    expect(instance.profile).toBeNull();
    expect(instance.profileWrap.children).toHaveLength(0);
    instance.setSettings({ profile: true });
    expect(instance.profile).toBeTruthy();
  });

  it('PPRF-QT-001: destroy tears the dock down with the instance', () => {
    const instance = build();
    toOutlierView(instance);
    clickFirstPoint(instance);
    instance.destroy();
    expect(document.querySelector('#host').textContent.trim()).toBe('');
    expect(instance.profile).toBeNull();
  });
});
