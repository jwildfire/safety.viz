// @vitest-environment jsdom
// Delta-delta has no time axis: each point compares a participant's chosen
// baseline and comparison visits (#374, obot.roadmap#436). It has no record
// listing of its own — the docked profile replaced the measure table — so the
// participant's record is the point's tooltip, and that names the visits and,
// when `studyday_col` is configured, the study days: "Visit: Baseline →
// Week 24" and "Study day: -7 → 169".
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('chart.js', () => {
  class Chart {
    constructor(ctx, config) {
      this.ctx = ctx;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      Chart.built.push(this);
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {}
  }
  Chart.built = [];
  Chart.register = () => {};
  const stub = () => ({});
  return {
    Chart,
    ScatterController: stub(),
    LineController: stub(),
    PointElement: stub(),
    LineElement: stub(),
    LinearScale: stub(),
    LogarithmicScale: stub(),
    CategoryScale: stub(),
    Tooltip: stub(),
    Legend: stub()
  };
});

const { Chart } = await import('chart.js');
const { default: deltaDelta } = await import('../../../src/delta-delta.js');

const row = (id, test, visit, visitnum, value, day) => ({
  USUBJID: id,
  TEST: test,
  STRESU: 'U/L',
  STRESN: String(value),
  STNRLO: '0',
  STNRHI: '40',
  VISIT: visit,
  VISITNUM: String(visitnum),
  DY: day === null ? '' : String(day)
});

const rows = [
  row('P1', 'ALT', 'Baseline', 0, 20, -7),
  row('P1', 'AST', 'Baseline', 0, 22, -7),
  row('P1', 'ALT', 'Week 24', 24, 30, 169),
  row('P1', 'AST', 'Week 24', 24, 25, 169),
  row('P2', 'ALT', 'Baseline', 0, 21, -2),
  row('P2', 'AST', 'Baseline', 0, 23, -2),
  row('P2', 'ALT', 'Week 24', 24, 31, null),
  row('P2', 'AST', 'Week 24', 24, 26, null)
];

/** The tooltip lines the rendered scatter shows for one participant. */
function tooltip(settings, id) {
  document.body.innerHTML = '<div id="host"></div>';
  Chart.built.length = 0;
  const instance = deltaDelta(document.querySelector('#host'), {
    measure_x: 'ALT',
    measure_y: 'AST',
    baseline_visits: ['Baseline'],
    comparison_visits: ['Week 24'],
    profile: false,
    ...settings
  });
  instance.init(rows);
  const chart = Chart.built.at(-1);
  const dataIndex = chart.$ddPoints.findIndex((point) => point.id === id);
  return chart.options.plugins.tooltip.callbacks.afterLabel({ dataIndex }).split('\n');
}

beforeEach(() => {
  Chart.built.length = 0;
});

describe('delta-delta names the visits and study days each point compares', () => {
  it('SDD-XAX-001: the point tooltip shows the Visit and, when configured, the Study day of the baseline and comparison (#374)', () => {
    const p1 = tooltip({ studyday_col: 'DY' }, 'P1');
    expect(p1).toContain('Visit: Baseline → Week 24');
    expect(p1).toContain('Study day: -7 → 169');
    // A blank day says so.
    expect(tooltip({ studyday_col: 'DY' }, 'P2')).toContain('Study day: -2 → —');
    // No study-day column configured: the visits alone.
    const visitOnly = tooltip({}, 'P1');
    expect(visitOnly).toContain('Visit: Baseline → Week 24');
    expect(visitOnly.some((line) => line.startsWith('Study day'))).toBe(false);
  });
});
