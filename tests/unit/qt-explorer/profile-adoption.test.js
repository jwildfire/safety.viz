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
  it('PPRF-QT-001: mounts the rail by default (config-on) into the shell profile slot', () => {
    const instance = build();
    expect(instance.profile).toBeTruthy();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull(); // idle until a selection
  });

  it('PPRF-QT-001: profile: false leaves the slot empty and mounts no dock', () => {
    const instance = build({ profile: false });
    expect(instance.profile).toBeNull();
    toOutlierView(instance);
    instance.selectParticipant('PBO-1');
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
  });

  it('PPRF-QT-001: clicking an outlier-scatter point feeds the rail the full profile via the shell root', () => {
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
    expect(instance.railWrap.querySelector('.sv-profile-id').textContent).toBe(`Participant ${id}`);
    expect(instance.railWrap.querySelector('.sv-profile-step-count')).toBeNull();
    // The ECG parameters are the KEY measures — both render without an extras toggle.
    expect(instance.railWrap.querySelector('.sv-profile-measure-table')).not.toBeNull();
    expect(instance.railWrap.querySelector('.sv-profile-extras')).toBeNull();
  });

  it('PPRF-QT-004: no listing is added — the rail is the only drill-down surface', () => {
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
    // Mapping details: unit ULN column, the study day on DY and the visit as a
    // visit (#372), and the baseline FLAG column (ABLFL) as the profile's
    // baseline flag — never the host's BASE, which is a VALUE column.
    expect(settings.normal_col_high).toBe('__qt_profile_uln');
    expect(settings.normal_col_low).toBeNull();
    expect(settings.studyday_col).toBe('DY');
    expect(settings.visitn_col).toBe('VISITNUM');
    expect(settings.baseline_col).toBe('ABLFL');
    expect(settings.baseline_col).not.toBe(instance.settings.baseline_col);
  });

  it('PPRF-QT-002: the railed spaghetti carries the 450 ms cut on QTc series and no cut on Heart Rate', () => {
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

describe('qt-explorer rail clear paths (PPRF-QT-003, PPRF-11)', () => {
  it('PPRF-QT-003: an empty-canvas click clears the selection and empties the rail', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    toOutlierView(instance);
    clickFirstPoint(instance);
    expect(instance.railWrap.querySelector('.sv-profile-root')).not.toBeNull();
    instance.chart.options.onClick({}, []);
    expect(instance.state.selectedId).toBeNull();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
    expect(heard.at(-1)).toEqual([]);
  });

  it('PPRF-QT-003: a view switch clears the selection and the rail (render preamble); non-scatter views idle', () => {
    const instance = build();
    toOutlierView(instance);
    clickFirstPoint(instance);
    expect(instance.railWrap.querySelector('.sv-profile-root')).not.toBeNull();
    instance.state.view = 'central';
    instance.buildControls();
    instance.render();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
    // The central chart offers no point selection — the rail idles, mounted.
    expect(instance.chart.options.onClick).toBeUndefined();
    expect(instance.profile).toBeTruthy();
  });

  it('PPRF-QT-003: the rail Clear affordance routes through the host clear path', () => {
    const instance = build();
    const heard = [];
    instance.root.addEventListener('participantsSelected', (event) =>
      heard.push(event.detail.data)
    );
    toOutlierView(instance);
    clickFirstPoint(instance);
    instance.railWrap.querySelector('.sv-profile-clear').click();
    expect(instance.state.selectedId).toBeNull();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
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
    expect(instance.railWrap.querySelector('.sv-profile-root')).not.toBeNull();
    expect(instance.state.selectedId).toBeNull();
    instance.railWrap.querySelector('.sv-profile-clear').click();
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
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
    expect(instance.railWrap.querySelector('.sv-profile-step-count').textContent).toContain(
      '1 of 2'
    );
    const heardBefore = heard.length;
    instance.railWrap.querySelector('.sv-profile-step-next').click();
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
    expect(instance.railWrap.querySelector('.sv-profile-root')).toBeNull();
    instance.setSettings({ profile: true });
    expect(instance.profile).toBeTruthy();
  });

  it('PPRF-QT-001: destroy tears the rail down with the instance', () => {
    const instance = build();
    toOutlierView(instance);
    clickFirstPoint(instance);
    instance.destroy();
    expect(document.querySelector('#host').textContent.trim()).toBe('');
    expect(instance.profile).toBeNull();
  });
});

describe('qt-explorer side panel X-axis (PPRF-XAX-009)', () => {
  it('PPRF-XAX-009: the QT explorer, which has no toggle, opens its drill-down on Visit (#370)', () => {
    const instance = build();
    expect(instance.profile.settings.x_axis.default).toBe('visit');
    toOutlierView(instance);
    clickFirstPoint(instance);
    expect(instance.railWrap.querySelector('.sv-xaxis-option.is-active').textContent).toBe('Visit');
    expect(instance.profile.spaghettiChart.options.scales.x.title.text).toBe('Visit');
  });
});

describe('qt-explorer drill-down by visit or by study day (QT-XAX-001..003)', () => {
  // One participant's ECGs: Screening before the first dose, Baseline (the
  // ABLFL record) on day 1, Week 2 on day 15, and an unscheduled ECG taken on
  // the same day 15 (VISITNUM 2.1). Rows are deliberately out of order.
  const SCHEDULE = [
    ['Week 2', 2, 15, '', 412],
    ['Screening', -1, -14, '', 380],
    ['Unscheduled', 2.1, 15, '', 431],
    ['Baseline', 0, 1, 'Y', 400]
  ];
  function scheduleRows() {
    return SCHEDULE.flatMap(([VISIT, VISITNUM, DY, ABLFL, value]) =>
      ['Placebo', 'High Dose'].map((ARM, armIndex) => ({
        USUBJID: `S-${armIndex + 1}`,
        ARM,
        VISIT,
        VISITNUM,
        DY,
        ABLFL,
        TEST: 'QTcF',
        STRESU: 'msec',
        STRESN: value + armIndex,
        BASE: 400 + armIndex,
        CHG: value - 400
      }))
    );
  }
  function drill(settings = {}) {
    const instance = qtExplorer(document.querySelector('#host'), settings);
    instance.init(scheduleRows());
    instance.root.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ['S-1'] } })
    );
    return instance;
  }
  const qtcf = (instance) =>
    instance.profile.model.spaghetti.series.find((entry) => entry.key === 'QTcF');
  const choose = (instance, title) =>
    [...instance.railWrap.querySelectorAll('.sv-xaxis-option')]
      .find((button) => button.textContent === title)
      .click();

  it('QT-XAX-001: the drill-down offers Visit and Study day, the day on DY, and opens on Visit; the visit number is never the study day (#372)', () => {
    const instance = drill();
    expect(instance.settings.studyday_col).toBe('DY');
    const settings = instance.profile.settings;
    expect(settings.studyday_col).toBe('DY');
    expect(settings.x_axis.options.map(({ key, col }) => [key, col])).toEqual([
      ['visit', 'VISITNUM'],
      ['day', 'DY']
    ]);
    expect(settings.x_axis.default).toBe('visit');
    const buttons = [...instance.railWrap.querySelectorAll('.sv-xaxis-option')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Visit', 'Study day']);
    expect(buttons.every((button) => !button.disabled)).toBe(true);
    expect(instance.profile.spaghettiChart.options.scales.x.title.text).toBe('Visit');
    // The chart's own x_axis setting names the view it opens on.
    const byDay = drill({ x_axis: { default: 'day' } });
    expect(byDay.profile.spaghettiChart.options.scales.x.title.text).toBe('Study day');
  });

  it('QT-XAX-002: in Visit view Screening sorts before Baseline, and ECGs on one study day sit apart (#372)', () => {
    const instance = drill();
    expect(instance.profile.model.axis.ticks.map((tick) => tick.label)).toEqual([
      'Screening',
      'Baseline',
      'Week 2',
      'Unscheduled'
    ]);
    const points = qtcf(instance).points;
    expect(points.map((point) => point.visit)).toEqual([
      'Screening',
      'Baseline',
      'Week 2',
      'Unscheduled'
    ]);
    expect(points.map((point) => point.x)).toEqual([0, 1, 2, 3]);
  });

  it('QT-XAX-002: in Study day view the ECGs on one study day stack at that day (#372)', () => {
    const instance = drill();
    choose(instance, 'Study day');
    expect(instance.profile.spaghettiChart.options.scales.x.title.text).toBe('Study day');
    const points = qtcf(instance).points;
    expect(points.map((point) => point.x)).toEqual([-14, 1, 15, 15]);
    const sameDay = points.filter((point) => point.x === 15).map((point) => point.visit);
    expect(sameDay).toEqual(['Week 2', 'Unscheduled']);
  });

  it('QT-XAX-003: the drill-down ×Baseline reads the baseline-flag ECG, not the earlier Screening one (#372)', () => {
    const instance = drill();
    const baseline = instance.profileRows.filter(
      (row) => row.USUBJID === 'S-1' && row.TEST === 'QTcF'
    );
    expect(baseline.every((row) => row.__hep_baseline === 400)).toBe(true);
  });
});
