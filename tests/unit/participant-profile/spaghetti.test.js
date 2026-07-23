// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Chart.js is replaced with a recording stub (the house render-test idiom, see
// tests/unit/hep-waterfall/render.test.js): jsdom has no canvas, and what this
// suite pins is the dataset/option construction, not the drawn marks.
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
    Tooltip: stub(),
    Legend: stub()
  };
});

const { visibleSeries, spaghettiDatasets, cutLinePlugin, renderSpaghetti } =
  await import('../../../src/participant-profile/spaghetti.js');

const series = [
  {
    key: 'ALT',
    label: 'Aminotransferase, alanine (ALT)',
    isKey: true,
    color: '#1f78b4',
    cut: 3,
    points: [
      { day: 0, value: 0.875 },
      { day: 30, value: 4 },
      { day: 60, value: 2 }
    ]
  },
  {
    key: 'TB',
    label: 'Total Bilirubin',
    isKey: true,
    color: '#e31a1c',
    cut: 2,
    points: [
      { day: 0, value: 0.8 },
      { day: 30, value: 2.6 }
    ]
  },
  {
    key: 'Creatinine',
    label: 'Creatinine',
    isKey: false,
    color: '#33a02c',
    cut: 3,
    points: [{ day: 0, value: 0.75 }]
  }
];

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '<div id="host"></div>';
});

describe('visibleSeries — extras and lab subsetting (PPRF-3)', () => {
  it('shows key measures only by default', () => {
    expect(visibleSeries(series, {}).map((entry) => entry.key)).toEqual(['ALT', 'TB']);
  });

  it('includes non-key measures behind the extras toggle', () => {
    expect(visibleSeries(series, { showExtras: true }).map((entry) => entry.key)).toEqual([
      'ALT',
      'TB',
      'Creatinine'
    ]);
  });

  it('filters datasets through the lab subsetter', () => {
    expect(visibleSeries(series, { labs: ['TB'] }).map((entry) => entry.key)).toEqual(['TB']);
    expect(
      visibleSeries(series, { showExtras: true, labs: ['ALT', 'Creatinine'] }).map(
        (entry) => entry.key
      )
    ).toEqual(['ALT', 'Creatinine']);
  });
});

describe('spaghettiDatasets (PPRF-3)', () => {
  it('builds one line dataset per series with day x-values', () => {
    const datasets = spaghettiDatasets(series.slice(0, 2));
    expect(datasets).toHaveLength(2);
    expect(datasets[0].label).toBe('ALT');
    expect(datasets[0].data).toEqual([
      { x: 0, y: 0.875 },
      { x: 30, y: 4 },
      { x: 60, y: 2 }
    ]);
    expect(datasets[0].borderColor).toBe('#1f78b4');
    expect(datasets[0].showLine).toBe(true);
  });

  it('fills points at or above the cut and hollows points below it', () => {
    const [alt] = spaghettiDatasets(series);
    // 0.875 < 3 hollow, 4 >= 3 filled, 2 < 3 hollow.
    expect(alt.pointBackgroundColor({ dataIndex: 0 })).toBe('#fff');
    expect(alt.pointBackgroundColor({ dataIndex: 1 })).toBe('#1f78b4');
    expect(alt.pointBackgroundColor({ dataIndex: 2 })).toBe('#fff');
  });

  it('carries the cut on the dataset for the cut-line plugin', () => {
    const datasets = spaghettiDatasets(series);
    expect(datasets.map((dataset) => dataset.svCut)).toEqual([3, 2, 3]);
  });
});

describe('cutLinePlugin (PPRF-3)', () => {
  function fakeChart(active) {
    const calls = [];
    const ctx = new Proxy(
      {},
      {
        get(target, prop) {
          if (prop === 'calls') return calls;
          return (...args) => calls.push([prop, ...args]);
        },
        set() {
          return true;
        }
      }
    );
    return {
      getActiveElements: () => active,
      data: { datasets: spaghettiDatasets(series) },
      scales: { y: { getPixelForValue: (value) => 200 - value * 10 } },
      chartArea: { left: 10, right: 310 },
      ctx,
      calls
    };
  }

  it('draws the hovered dataset dashed cut line with a right-aligned 0.1f label', () => {
    const chart = fakeChart([{ datasetIndex: 0, index: 1 }]);
    cutLinePlugin().afterDatasetsDraw(chart);
    const names = chart.calls.map(([name]) => name);
    expect(names).toContain('setLineDash');
    expect(chart.calls).toContainEqual(['fillText', '3.0', 310, 168]);
  });

  it('draws nothing when no dataset is active', () => {
    const chart = fakeChart([]);
    cutLinePlugin().afterDatasetsDraw(chart);
    expect(chart.calls).toEqual([]);
  });
});

describe('renderSpaghetti (PPRF-3)', () => {
  const model = { series, yLabel: 'Standardized Result [xULN]', display: 'relative_uln' };

  it('mounts a line chart of the visible series with the display y-label', () => {
    const host = document.querySelector('#host');
    const chart = renderSpaghetti(host, model, {});
    expect(built).toHaveLength(1);
    expect(chart.config.type).toBe('line');
    expect(chart.data.datasets.map((dataset) => dataset.label)).toEqual(['ALT', 'TB']);
    expect(chart.options.scales.y.title.text).toBe('Standardized Result [xULN]');
    expect(chart.options.scales.x.title.text).toBe('Study Day');
    expect(host.querySelector('canvas')).not.toBeNull();
  });

  it("shows the original's filled-points footnote copy", () => {
    const host = document.querySelector('#host');
    renderSpaghetti(host, model, {});
    expect(host.textContent).toContain(
      'Points are filled for values above the current reference value. ' +
        'Mouseover a line to see the reference line for that lab.'
    );
  });

  it('re-renders extras when the state shows them', () => {
    const host = document.querySelector('#host');
    const chart = renderSpaghetti(host, model, { showExtras: true });
    expect(chart.data.datasets.map((dataset) => dataset.label)).toEqual([
      'ALT',
      'TB',
      'Creatinine'
    ]);
  });
});
