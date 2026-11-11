// @vitest-environment jsdom
// The participant profile follows the x-axis toggle (safety.viz#369,
// obot.roadmap#436): an "X-axis" control with Visit and Study day, opening on
// Visit. Visit view spaces visits evenly in visit-number order, labelled by
// visit name; Study day view is linear in days, pre-dose records at negative
// days, with a day-1 line. The axis titles, the tooltips and the measure
// table's time column name the view; adverse events are drawn as a track only
// on the day axis and listed otherwise; with neither column a message replaces
// the labs chart.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Chart.js is replaced with a recording stub (the house render-test idiom):
// jsdom has no canvas, and what this suite pins is the chart configuration.
const built = [];

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins || [];
      this.destroyed = false;
      built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {
      this.destroyed = true;
    }
  }
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { default: participantProfile, profileRail } =
  await import('../../../src/participant-profile.js');
const { dayOnePlugin } = await import('../../../src/participant-profile/spaghetti.js');
const { NO_TIME_AXIS } = await import('../../../src/x-axis.js');
const { syncSettings } = await import('../../../src/participant-profile/configure.js');
const rowsActual = await import('../../../src/hep-core/rows.js');

const ALT = 'Aminotransferase, alanine (ALT)';
const TB = 'Total Bilirubin';

// One participant's schedule, in the demo data's numbering: Screening before
// the first dose, Baseline on day 1, Week N = N, and an unscheduled visit
// (VISITNUM 8.1) after Week 8. Rows are deliberately out of order.
const SCHEDULE = [
  ['Week 8', 8, 57],
  ['Screening', -1, -14],
  ['Baseline', 0, 1],
  ['Week 12', 12, 85],
  ['Unscheduled', 8.1, 66],
  ['Week 2', 2, 15]
];

function labRows({ visit = true, day = true } = {}) {
  const rows = [];
  [
    [ALT, 40],
    [TB, 1]
  ].forEach(([test, uln]) => {
    SCHEDULE.forEach(([name, number, studyDay], index) => {
      const row = {
        USUBJID: 'S1',
        TEST: test,
        STRESN: uln * (1 + index * 0.5),
        STRESU: 'U/L',
        STNRLO: 0,
        STNRHI: uln
      };
      if (visit) {
        row.VISIT = name;
        row.VISITNUM = number;
      }
      if (day) row.DY = studyDay;
      rows.push(row);
    });
  });
  return rows;
}

const AE = [
  {
    USUBJID: 'S1',
    AEDECOD: 'nausea',
    AETERM: 'NAUSEA',
    AEBODSYS: 'Gastrointestinal disorders',
    AESEV: 'MILD',
    AESER: 'N',
    ASTDY: 50,
    AENDY: 70
  },
  {
    USUBJID: 'S1',
    AEDECOD: 'alt increased',
    AETERM: 'ALT INCREASED',
    AEBODSYS: 'Investigations',
    AESEV: 'MODERATE',
    AESER: 'N',
    ASTDY: 60,
    AENDY: 92
  }
];

const X_AXIS = {
  options: [
    { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
    { key: 'day', col: 'DY', type: 'linear', title: 'Study day' }
  ],
  default: 'visit'
};

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '<div id="host"></div>';
});

function mount(settings = {}, rows = labRows()) {
  const profile = participantProfile('#host', rows, { x_axis: X_AXIS, ...settings });
  profile.setSelected(['S1']);
  return profile;
}

function xAxisButtons() {
  return [...document.querySelectorAll('#host .sv-xaxis-control button')];
}

function choose(label) {
  const button = xAxisButtons().find((node) => node.textContent === label);
  button.click();
}

function altDataset(profile) {
  return profile.spaghettiChart.data.datasets.find((dataset) => dataset.svKey === 'ALT');
}

function tickLabels(scale) {
  return scale.__ticks.map((tick) => scale.ticks.callback(tick.value));
}

// Run the scale's afterBuildTicks hook the way Chart.js does, so the visit
// ticks the profile sets can be read back.
function buildTicks(scale) {
  const target = { ticks: [] };
  if (scale.afterBuildTicks) scale.afterBuildTicks(target);
  scale.__ticks = target.ticks;
  return scale;
}

function spaghettiTitle(profile, dataIndex) {
  const dataset = altDataset(profile);
  const { title } = profile.spaghettiChart.options.plugins.tooltip.callbacks;
  const lines = title([{ dataset, dataIndex, parsed: { x: 0, y: 0 } }]);
  return Array.isArray(lines) ? lines[0] : lines;
}

describe('the X-axis control (PPRF-XAX-001)', () => {
  it('PPRF-XAX-001: the profile shows an X-axis control with Visit and Study day and opens on Visit (#369)', () => {
    const profile = mount();
    const control = document.querySelector('#host .sv-controls .sv-xaxis-control');
    expect(control).not.toBeNull();
    expect(control.querySelector('label').textContent).toBe('X-axis');
    expect(xAxisButtons().map((button) => button.textContent)).toEqual(['Visit', 'Study day']);
    expect(xAxisButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false'
    ]);
    expect(profile.spaghettiChart.options.scales.x.title.text).toBe('Visit');
  });

  it('PPRF-XAX-001: x_axis.default picks the view the profile opens on (#369)', () => {
    const profile = mount({ x_axis: { ...X_AXIS, default: 'day' } });
    expect(profile.spaghettiChart.options.scales.x.title.text).toBe('Study day');
  });

  it('PPRF-XAX-001: without x_axis the setting is built from studyday_col, visit_col and visitn_col, so a host that passes only those still works (#369)', () => {
    const settings = syncSettings({
      studyday_col: 'DY',
      visit_col: 'VISIT',
      visitn_col: 'VISITNUM'
    });
    const { rows } = rowsActual.cleanData(labRows(), settings);
    rowsActual.deriveBaseline(rows, settings);
    document.body.innerHTML =
      '<div class="sv-root"><aside class="sv-rail" id="rail"></aside></div>';
    const rail = profileRail(document.querySelector('#rail'), {
      studyday_col: 'DY',
      visit_col: 'VISIT',
      visitn_col: 'VISITNUM'
    });
    rail.show(['S1'], rows);
    const buttons = [...document.querySelectorAll('#rail .sv-xaxis-control button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Visit', 'Study day']);
    expect(rail.spaghettiChart.options.scales.x.title.text).toBe('Visit');
    buttons[1].click();
    expect(rail.spaghettiChart.options.scales.x.title.text).toBe('Study day');
  });

  it('PPRF-XAX-001: switching the X-axis redraws the labs chart and the table in the chosen view and dispatches no selection event (#369)', () => {
    const heard = [];
    const listener = (event) => heard.push(event);
    document.addEventListener('participantsSelected', listener);
    const onStep = vi.fn();
    const onClear = vi.fn();
    const profile = mount({ on_step: onStep, on_clear: onClear });
    const before = profile.spaghettiChart;
    choose('Study day');
    expect(before.destroyed).toBe(true);
    expect(profile.spaghettiChart.options.scales.x.title.text).toBe('Study day');
    expect(xAxisButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true'
    ]);
    expect(document.querySelector('#host .sv-profile-id').textContent).toBe('Participant S1');
    expect(heard).toEqual([]);
    expect(onStep).not.toHaveBeenCalled();
    expect(onClear).not.toHaveBeenCalled();
    document.removeEventListener('participantsSelected', listener);
  });
});

describe('Visit view (PPRF-XAX-002)', () => {
  it('PPRF-XAX-002: Visit view spaces visits evenly in visit-number order, labels the ticks by visit name and titles the axis "Visit" (#369)', () => {
    const profile = mount();
    const x = buildTicks(profile.spaghettiChart.options.scales.x);
    expect(x.title.text).toBe('Visit');
    // Six visits at positions 0..5, so the axis runs from -0.5 to 5.5.
    expect(altDataset(profile).data.map((point) => point.x)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(x.min).toBe(-0.5);
    expect(x.max).toBe(5.5);
    expect(tickLabels(x)).toEqual([
      'Screening',
      'Baseline',
      'Week 2',
      'Week 8',
      'Unscheduled',
      'Week 12'
    ]);
  });

  it('PPRF-XAX-002: an unscheduled visit sits right after the visit it follows (#369)', () => {
    const profile = mount();
    const points = altDataset(profile).svPoints;
    const names = points.map((point) => point.visit);
    expect(names.indexOf('Unscheduled')).toBe(names.indexOf('Week 8') + 1);
  });
});

describe('Study day view (PPRF-XAX-003)', () => {
  it('PPRF-XAX-003: Study day view plots each record at its study day on a linear axis titled "Study day", pre-dose records at negative days (#369)', () => {
    const profile = mount();
    choose('Study day');
    const x = profile.spaghettiChart.options.scales.x;
    expect(x.type).toBe('linear');
    expect(x.title.text).toBe('Study day');
    expect(altDataset(profile).data.map((point) => point.x)).toEqual([-14, 1, 15, 57, 66, 85]);
  });
});

describe('the day-1 line (PPRF-XAX-004)', () => {
  function fakeChart(min, max) {
    const calls = [];
    const ctx = new Proxy(
      {},
      {
        get(target, prop) {
          if (prop === 'calls') return calls;
          return (...args) => calls.push([prop, ...args]);
        },
        set(target, prop, value) {
          calls.push([`set:${String(prop)}`, value]);
          return true;
        }
      }
    );
    return {
      scales: { x: { min, max, getPixelForValue: (value) => 100 + value } },
      chartArea: { left: 50, right: 400, top: 10, bottom: 200 },
      ctx,
      calls
    };
  }

  it('PPRF-XAX-004: Study day view draws a vertical day-1 line marked "Day 1"; Visit view draws none (#369)', () => {
    const profile = mount();
    const ids = (chart) => chart.plugins.map((plugin) => plugin.id);
    expect(ids(profile.spaghettiChart)).not.toContain('sv-profile-day-one');
    choose('Study day');
    expect(ids(profile.spaghettiChart)).toContain('sv-profile-day-one');

    const chart = fakeChart(-14, 85);
    dayOnePlugin().afterDatasetsDraw(chart);
    expect(chart.calls).toContainEqual(['moveTo', 101, 10]);
    expect(chart.calls).toContainEqual(['lineTo', 101, 200]);
    expect(chart.calls.some(([name, text]) => name === 'fillText' && text === 'Day 1')).toBe(true);
  });

  it('PPRF-XAX-004: the day-1 line is not drawn when day 1 is off the axis (#369)', () => {
    const chart = fakeChart(10, 85);
    dayOnePlugin().afterDatasetsDraw(chart);
    expect(chart.calls.filter(([name]) => name === 'fillText')).toEqual([]);
  });
});

describe('tooltips name both (PPRF-XAX-005)', () => {
  it('PPRF-XAX-005: the tooltip first line reads "Week 8 · Day 57" in Visit view and in Study day view (#369)', () => {
    const profile = mount();
    expect(spaghettiTitle(profile, 3)).toBe('Week 8 · Day 57');
    choose('Study day');
    expect(spaghettiTitle(profile, 3)).toBe('Week 8 · Day 57');
  });

  it('PPRF-XAX-005: the tooltip uses whatever of the two a row has, and never pairs "Study day" with "Visit" (#369)', () => {
    const noDay = labRows({ day: false });
    let profile = mount({}, noDay);
    expect(spaghettiTitle(profile, 0)).toBe('Screening');
    profile.destroy();
    document.body.innerHTML = '<div id="host"></div>';
    profile = mount({}, labRows({ visit: false }));
    expect(spaghettiTitle(profile, 0)).toBe('Day -14');
  });

  it('PPRF-XAX-005: the expanded inset carries the same tooltip line and its axis follows the view (#369)', () => {
    const profile = mount();
    document.querySelector('#host .sv-profile-measure-row[data-key="ALT"] button').click();
    let inset = built[built.length - 1];
    expect(inset.options.scales.x.title.text).toBe('Visit');
    const lines = inset.options.plugins.tooltip.callbacks.title([
      { dataIndex: 3, parsed: { x: 3, y: 0 } }
    ]);
    expect(Array.isArray(lines) ? lines[0] : lines).toBe('Week 8 · Day 57');
    choose('Study day');
    document.querySelector('#host .sv-profile-measure-row[data-key="ALT"] button').click();
    inset = built[built.length - 1];
    expect(inset.options.scales.x.title.text).toBe('Study day');
    expect(profile.tableController.open.size).toBe(1);
  });
});

describe('the measure table names the view (PPRF-XAX-006)', () => {
  function headers() {
    return [...document.querySelectorAll('#host .sv-profile-measure-table thead th')].map(
      (th) => th.textContent
    );
  }

  it('PPRF-XAX-006: the measure table time column header names the active view (#369)', () => {
    mount();
    expect(headers()).toEqual(['Measure', 'N', 'Min', 'Median', 'Max', 'By visit']);
    choose('Study day');
    expect(headers()).toEqual(['Measure', 'N', 'Min', 'Median', 'Max', 'By study day']);
  });
});

describe('adverse events follow the view (PPRF-XAX-007)', () => {
  it('PPRF-XAX-007: Study day view draws the adverse-event track on the labs chart day axis (#369)', () => {
    const profile = mount({ ae: { data: AE } });
    choose('Study day');
    const section = document.querySelector('#host .sv-profile-ae');
    expect(section.querySelector('.sv-profile-ae-timeline')).not.toBeNull();
    expect(section.querySelectorAll('.sv-profile-ae-bar')).toHaveLength(2);
    expect(section.querySelector('.sv-profile-ae-list')).toBeNull();
    // The shared domain spans the pre-dose labs and the last event's end.
    expect(profile.spaghettiChart.options.scales.x.min).toBe(-14);
    expect(profile.spaghettiChart.options.scales.x.max).toBe(92);
  });

  it('PPRF-XAX-007: Visit view lists the adverse events with their study days under a line saying why, and draws no track (#369)', () => {
    mount({ ae: { data: AE } });
    const section = document.querySelector('#host .sv-profile-ae');
    expect(section.querySelector('.sv-profile-ae-timeline')).toBeNull();
    expect(section.querySelector('.sv-profile-ae-list-note').textContent).toContain(
      'a visit axis has no days to draw them on'
    );
    const items = [...section.querySelectorAll('.sv-profile-ae-list li')].map(
      (li) => li.textContent
    );
    expect(items).toEqual(['alt increased: study days 60 to 92', 'nausea: study days 50 to 70']);
    // Still directly under the labs chart (PPRF-AE-004).
    const root = document.querySelector('#host .sv-profile-root');
    const order = [...root.children].map((node) => node.className);
    const labs = order.findIndex((name) => name.includes('sv-profile-spaghetti'));
    expect(order[labs + 1]).toContain('sv-profile-ae');
  });
});

describe('neither column, or one missing (PPRF-XAX-008)', () => {
  it('PPRF-XAX-008: with neither a visit nor a study day the profile shows the no-time-axis message in place of the labs chart, without an error (#369)', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let profile;
    expect(() => {
      profile = mount({}, labRows({ visit: false, day: false }));
    }).not.toThrow();
    const message = document.querySelector('#host .sv-profile-root .sv-no-time-axis');
    expect(message).not.toBeNull();
    expect(message.textContent).toBe(NO_TIME_AXIS);
    expect(document.querySelector('#host .sv-profile-spaghetti')).toBeNull();
    expect(profile.spaghettiChart).toBeNull();
    // The rest of the profile still renders.
    expect(document.querySelector('#host .sv-profile-measure-table')).not.toBeNull();
    expect(xAxisButtons().every((button) => button.disabled)).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('PPRF-XAX-008: an option the data lacks is greyed out with its reason (#369)', () => {
    const profile = mount({}, labRows({ day: false }));
    const [visit, day] = xAxisButtons();
    expect(visit.disabled).toBe(false);
    expect(day.disabled).toBe(true);
    expect(day.title).toBe('No study day in this data');
    expect(profile.spaghettiChart.options.scales.x.title.text).toBe('Visit');
  });
});
