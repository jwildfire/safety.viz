// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// hep-explorer's time slider takes the x-axis toggle (#375, obot.roadmap#437):
// in Visit view the slider and the play-through step through the visits in
// visit-number order; in Study day view they step through the days, as they
// always have. The default view is Study day. Chart.js is stubbed the way the
// other jsdom module tests stub it.

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.canvas = ctx && ctx.canvas ? ctx.canvas : document.createElement('canvas');
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {}
    stop() {}
    getDatasetMeta() {
      return { data: [] };
    }
  }
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    BarController: stub(),
    BarElement: stub(),
    LineController: stub(),
    LineElement: stub(),
    PointElement: stub(),
    ScatterController: stub(),
    CategoryScale: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    TimeScale: stub(),
    Title: stub(),
    Tooltip: stub(),
    Legend: stub(),
    Filler: stub()
  };
});

const { default: hepExplorer } = await import('../../../src/hep-explorer.js');
const { X_AXIS_DEFAULT, syncSettings, timeAxis } =
  await import('../../../src/hep-explorer/configure.js');
const { animationTimeline, buildAnimationFrames, playbackSchedule, pointsAtDay, MS_PER_VISIT } =
  await import('../../../src/hep-explorer/animation.js');
const { cleanData, deriveBaseline } = await import('../../../src/hep-core/rows.js');
const { resolveXAxis, activeXAxis } = await import('../../../src/x-axis.js');

const MEASURES = { ALT: 'ALT', AST: 'AST', TB: 'TB', ALP: 'ALP' };
const BASE = {
  id_col: 'ID',
  measure_col: 'TEST',
  value_col: 'VALUE',
  normal_col_high: 'ULN',
  studyday_col: 'DAY',
  visit_col: 'VISIT',
  visitn_col: 'VISITNUM',
  measure_values: MEASURES
};
const settings = syncSettings(BASE);
const state = {
  measureX: 'ALT',
  measureY: 'TB',
  display: 'relative_uln',
  visitWindow: 30,
  groupBy: 'hep_none'
};

// P1 is measured at Baseline (day 1), Week 4 (day 29), an unscheduled visit
// numbered 4.1 (day 33) and Week 8 (day 57). P2 enrols at Week 4.
const rec = (id, test, value, uln, day, visit, visitnum) => ({
  ID: id,
  TEST: test,
  VALUE: value,
  ULN: uln,
  DAY: day,
  VISIT: visit,
  VISITNUM: visitnum
});
const RAW = [
  rec('P1', 'ALT', 40, 40, 1, 'Baseline', 0),
  rec('P1', 'ALT', 120, 40, 29, 'Week 4', 4),
  rec('P1', 'ALT', 200, 40, 33, 'Unscheduled', 4.1),
  rec('P1', 'ALT', 80, 40, 57, 'Week 8', 8),
  rec('P1', 'TB', 1, 1, 1, 'Baseline', 0),
  rec('P1', 'TB', 3, 1, 29, 'Week 4', 4),
  rec('P1', 'TB', 2, 1, 57, 'Week 8', 8),
  rec('P2', 'ALT', 20, 40, 29, 'Week 4', 4),
  rec('P2', 'ALT', 60, 40, 57, 'Week 8', 8),
  rec('P2', 'TB', 0.5, 1, 29, 'Week 4', 4),
  rec('P2', 'TB', 1, 1, 57, 'Week 8', 8)
];
const rows = () => deriveBaseline(cleanData(RAW, settings).rows, settings);
const option = (key) => timeAxis(settings).options.find((entry) => entry.key === key);
const byId = (list, id) => list.find((entry) => String(entry.id) === id);

describe('hep-explorer x-axis setting (HEP-XAX-001)', () => {
  it('HEP-XAX-001: without x_axis the slider offers Visit and Study day from the old settings and opens on Study day (#375)', () => {
    expect(X_AXIS_DEFAULT).toBe('day');
    const axis = timeAxis(settings);
    expect(axis.default).toBe('day');
    expect(axis.options.map((entry) => [entry.key, entry.col, entry.label_col])).toEqual([
      ['visit', 'VISITNUM', 'VISIT'],
      ['day', 'DAY', null]
    ]);
    expect(resolveXAxis(axis, rows()).active).toBe('day');
  });

  it('HEP-XAX-001: a given x_axis is read as given, and its day option names the study-day column (#375)', () => {
    const given = syncSettings({
      studyday_col: 'DY',
      x_axis: {
        options: [
          { key: 'visit', col: 'AVISITN', label_col: 'AVISIT' },
          { key: 'day', col: 'ADY' }
        ],
        default: 'visit'
      }
    });
    expect(given.studyday_col).toBe('ADY');
    const axis = timeAxis(given);
    expect(axis.default).toBe('visit');
    expect(axis.options.map((entry) => entry.title)).toEqual(['Visit', 'Study day']);
    // An x_axis with no day option leaves studyday_col standing.
    const visitOnly = syncSettings({
      studyday_col: 'DY',
      x_axis: { options: [{ key: 'visit', col: 'AVISITN' }] }
    });
    expect(visitOnly.studyday_col).toBe('DY');
  });
});

describe('hep-explorer slider timeline (HEP-XAX-002, HEP-XAX-003)', () => {
  it('HEP-XAX-002: in Study day view the slider spans the study days, one day a step, and frames sit on their days (#375)', () => {
    const timeline = animationTimeline(rows(), settings, option('day'));
    expect(timeline).toMatchObject({
      key: 'day',
      title: 'Study day',
      min: 1,
      max: 57,
      steps: null
    });
    expect(timeline.label(57)).toBe('Day 57');
    const frames = buildAnimationFrames(rows(), settings, state, timeline);
    expect(byId(frames, 'P1').x.map((entry) => entry.day)).toEqual([1, 29, 33, 57]);
    expect(byId(frames, 'P2').dayRange).toEqual([29, 57]);
    // Day 30 holds P1 on its day-29 draw: 120/40.
    expect(byId(pointsAtDay(frames, 30), 'P1').x).toBe(3);
  });

  it('HEP-XAX-002: a Study day play-through runs the ported duration at 20 frames a second, ending on the last day (#375)', () => {
    const timeline = animationTimeline(rows(), settings, option('day'));
    const { positions, interval } = playbackSchedule(timeline, 1);
    // 56 remaining days x 100ms = 5.6s = 112 frames at 20fps, plus the start.
    expect(interval).toBe(50);
    expect(positions).toHaveLength(113);
    expect(positions[0]).toBe(1);
    expect(positions[positions.length - 1]).toBe(57);
  });

  it('HEP-XAX-003: in Visit view the slider steps through the visits in visit-number order, an unscheduled visit after the one it follows (#375)', () => {
    const timeline = animationTimeline(rows(), settings, option('visit'));
    expect(timeline).toMatchObject({ key: 'visit', title: 'Visit', min: 0, max: 3 });
    expect(timeline.steps.map((step) => step.label)).toEqual([
      'Baseline',
      'Week 4',
      'Unscheduled',
      'Week 8'
    ]);
    const frames = buildAnimationFrames(rows(), settings, state, timeline);
    // Frames sit on visit steps, not days: P1's ALT at steps 0..3, P2 enrols at Week 4.
    expect(byId(frames, 'P1').x.map((entry) => entry.day)).toEqual([0, 1, 2, 3]);
    expect(byId(frames, 'P2').dayRange).toEqual([1, 3]);
    const atUnscheduled = pointsAtDay(frames, 2);
    expect(byId(atUnscheduled, 'P1').x).toBe(5);
    // P1 has no TB at the unscheduled visit, so its Week 4 bilirubin holds.
    expect(byId(atUnscheduled, 'P1').y).toBe(3);
    expect(byId(pointsAtDay(frames, 0), 'P2').enrolled).toBe(false);
  });

  it('HEP-XAX-003: a Visit play-through shows every visit once, in order, from where it starts (#375)', () => {
    const timeline = animationTimeline(rows(), settings, option('visit'));
    expect(playbackSchedule(timeline, 0)).toEqual({
      positions: [0, 1, 2, 3],
      interval: MS_PER_VISIT
    });
    expect(playbackSchedule(timeline, 2).positions).toEqual([2, 3]);
  });

  it('HEP-XAX-003: a visit column that is not numeric steps in the order the visits first appear (#375)', () => {
    const named = syncSettings({ ...BASE, visitn_col: null });
    const axis = timeAxis(named);
    const timeline = animationTimeline(
      rows(),
      named,
      activeXAxis(resolveXAxis(axis, rows(), 'visit'))
    );
    expect(timeline.steps.map((step) => step.label)).toEqual([
      'Baseline',
      'Week 4',
      'Unscheduled',
      'Week 8'
    ]);
  });
});

describe('hep-explorer slider in the chart (HEP-XAX-004, HEP-XAX-005)', () => {
  let element;
  beforeEach(() => {
    document.body.innerHTML = '';
    element = document.createElement('div');
    document.body.append(element);
    HTMLCanvasElement.prototype.getContext = function getContext() {
      return { canvas: this };
    };
  });
  const mount = (extra = {}) =>
    hepExplorer(element, { ...BASE, profile: false, ...extra }).init(RAW);
  const slider = () => element.querySelector('.hep-animation-slider');
  const readout = () => element.querySelector('.hep-animation-label').textContent;
  const scrub = (value) => {
    slider().value = String(value);
    slider().dispatchEvent(new Event('input'));
  };
  const option = (key) => element.querySelector(`.hep-animation-axis [data-key="${key}"]`);

  it('HEP-XAX-004: the slider opens on Study day, is named for it, and reads "Showing data from: Day 57" (#375)', () => {
    mount();
    expect(slider().getAttribute('aria-label')).toBe('Study day');
    expect([slider().min, slider().max]).toEqual(['1', '57']);
    expect(readout()).toBe('Showing peak values (all days)');
    scrub(57);
    expect(readout()).toBe('Showing data from: Day 57');
    expect(slider().getAttribute('aria-valuetext')).toBe('Day 57');
  });

  it('HEP-XAX-004: after a switch to Visit the slider is named Visit and reads "Showing data from: Week 8" (#375)', () => {
    mount();
    option('visit').click();
    expect(slider().getAttribute('aria-label')).toBe('Visit');
    expect([slider().min, slider().max]).toEqual(['0', '3']);
    expect(readout()).toBe('Showing peak values (all visits)');
    scrub(3);
    expect(readout()).toBe('Showing data from: Week 8');
    expect(slider().getAttribute('aria-valuetext')).toBe('Week 8');
  });

  it('HEP-XAX-005: the "Step by" control sits with the slider, marks the active view, and a switch returns the scatter to its peaks (#375)', () => {
    const instance = mount();
    const control = element.querySelector('.hep-animation .hep-animation-axis');
    expect(control.querySelector('label').textContent).toBe('Step by');
    expect(option('day').getAttribute('aria-pressed')).toBe('true');
    expect(option('visit').getAttribute('aria-pressed')).toBe('false');
    scrub(29);
    expect(instance.state.animation.day).toBe(29);
    option('visit').click();
    expect(instance.state.xAxis).toBe('visit');
    expect(instance.state.animation.day).toBeNull();
    expect(option('visit').getAttribute('aria-pressed')).toBe('true');
    // The control is not in the sidebar, where "X-axis Measure" names ALT.
    expect(instance.controls.querySelector('.sv-xaxis-control')).toBeNull();
  });

  it('HEP-XAX-005: x_axis can open the slider on Visit (#375)', () => {
    mount({
      x_axis: {
        options: [
          { key: 'visit', col: 'VISITNUM', label_col: 'VISIT' },
          { key: 'day', col: 'DAY' }
        ],
        default: 'visit'
      }
    });
    expect(slider().getAttribute('aria-label')).toBe('Visit');
  });
});
