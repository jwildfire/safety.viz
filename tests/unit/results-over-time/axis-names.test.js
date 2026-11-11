// @vitest-environment jsdom
// Results over time keeps its one axis, the visit, and says what the visit is
// in days (#374, obot.roadmap#436): each box's tooltip gains the median study
// day of the records that box summarizes, read from `studyday_col`. Only the
// median is computed, and a box whose records carry no day says nothing.
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
const { default: resultsOverTime } = await import('../../../src/results-over-time.js');
const { DEFAULT_SETTINGS } = await import('../../../src/results-over-time/configure.js');
const { summarizeVisitGroups } = await import('../../../src/results-over-time/structureData.js');
const { summaryTooltip } = await import('../../../src/results-over-time/getPlugins.js');

const row = (id, visit, visitnum, value, day) => ({
  USUBJID: id,
  TEST: 'Albumin',
  STRESU: 'g/L',
  STRESN: String(value),
  VISIT: visit,
  VISITNUM: String(visitnum),
  DY: day === null ? '' : String(day)
});

const rows = [
  row('P1', 'Baseline', 0, 38, -7),
  row('P2', 'Baseline', 0, 40, -3),
  row('P3', 'Baseline', 0, 41, null),
  row('P1', 'Week 8', 8, 39, 55),
  row('P2', 'Week 8', 8, 42, 57),
  row('P3', 'Week 8', 8, 44, 60),
  row('P1', 'Week 12', 12, 37, null),
  row('P2', 'Week 12', 12, 39, null)
];

/** The box tooltip the rendered chart shows for one visit. */
function boxTooltip(settings, visit) {
  document.body.innerHTML = '<div id="host"></div>';
  Chart.built.length = 0;
  const instance = resultsOverTime(document.querySelector('#host'), settings);
  instance.init(rows);
  const chart = Chart.built.at(-1);
  const point = chart.data.datasets
    .flatMap((dataset) => dataset.data)
    .find((datum) => datum.__box && datum.__box.visit === visit);
  return chart.options.plugins.tooltip.callbacks.label({ raw: point });
}

beforeEach(() => {
  Chart.built.length = 0;
});

describe('results over time names the study day of each visit', () => {
  it("SROT-XAX-001: the box tooltip gives the median study day of the visit's records, and nothing when none has a day (#374)", () => {
    expect(DEFAULT_SETTINGS.studyday_col).toBe('DY');

    // The median of the plotted records' days, blanks left out.
    const stats = summarizeVisitGroups(rows, {
      timeCol: 'VISIT',
      valueCol: 'STRESN',
      groupCol: null,
      dayCol: 'DY'
    });
    expect(stats['Week 8'].All.median_day).toBe(57);
    expect(stats.Baseline.All.median_day).toBe(-5);
    expect(stats['Week 12'].All.median_day).toBeNull();
    const precisions = { p0: 0, p1: 1, p2: 2 };
    expect(summaryTooltip('All', 'Week 8', stats['Week 8'].All, precisions)).toContain(
      'Median study day 57'
    );
    expect(summaryTooltip('All', 'Week 12', stats['Week 12'].All, precisions)).not.toContain(
      'study day'
    );

    // Through the rendered chart: the line follows the visit name.
    const week8 = boxTooltip({}, 'Week 8');
    expect(week8[0]).toBe('All at Week 8:');
    expect(week8[1]).toBe('Median study day 57');
    expect(boxTooltip({}, 'Week 12').join('\n')).not.toContain('study day');
    // No study-day column configured, or none in the data: no line.
    expect(boxTooltip({ studyday_col: null }, 'Week 8').join('\n')).not.toContain('study day');
    expect(boxTooltip({ studyday_col: 'ADY' }, 'Week 8').join('\n')).not.toContain('study day');
  });
});
