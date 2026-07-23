// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Chart.js is replaced with a recording stub (the house render-test idiom):
// jsdom has no canvas, and what this suite pins is the chart construction, the
// band/guide plugin geometry, and the expand/collapse lifecycle.
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

const { insetYDomain, bandGuidePlugin, renderInset } =
  await import('../../../src/participant-profile/inset.js');
const { renderMeasureTable } = await import('../../../src/participant-profile/measureTable.js');

const alt = {
  key: 'ALT',
  label: 'Aminotransferase, alanine (ALT)',
  isKey: true,
  color: '#e41a1c',
  n: 3,
  min: 35,
  median: 80,
  max: 160,
  populationExtent: [20, 200],
  spark: [
    { day: 0, value: 35, lln: 5, uln: 40, outlier: false },
    { day: 30, value: 160, lln: 5, uln: 40, outlier: true },
    { day: 60, value: 80, lln: 5, uln: 40, outlier: true }
  ]
};

const tb = {
  key: 'TB',
  label: 'Total Bilirubin',
  isKey: true,
  color: '#377eb8',
  n: 2,
  min: 0.8,
  median: 1.7,
  max: 2.6,
  populationExtent: [0.4, 3],
  spark: [
    { day: 0, value: 0.8, lln: 0.2, uln: 1, outlier: false },
    { day: 30, value: 2.6, lln: 0.2, uln: 1, outlier: true }
  ]
};

const settings = { measure_col: 'TEST' };

beforeEach(() => {
  built.length = 0;
  document.body.innerHTML = '<div id="host"></div>';
});

function host() {
  return document.querySelector('#host');
}

describe('insetYDomain (PPRF-4)', () => {
  it('pads the union of values, population extent, and normal-range limits', () => {
    // Pool: values 35/160/80 ∪ extent [20, 200] ∪ lln 5 / uln 40 → [5, 200].
    expect(insetYDomain(alt)).toEqual([5 * 0.99, 200 * 1.01]);
  });

  it('survives missing normal-range limits', () => {
    const noBand = {
      ...alt,
      spark: alt.spark.map((point) => ({ ...point, lln: NaN, uln: NaN }))
    };
    expect(insetYDomain(noBand)).toEqual([20 * 0.99, 200 * 1.01]);
  });
});

describe('bandGuidePlugin (PPRF-4)', () => {
  function fakeChart() {
    const calls = [];
    const ctx = new Proxy(
      {},
      {
        get(target, prop) {
          if (prop === 'calls') return calls;
          return (...args) => calls.push([prop, ...args]);
        },
        set(target, prop, value) {
          calls.push([`set:${prop}`, value]);
          return true;
        }
      }
    );
    return {
      scales: {
        x: { getPixelForValue: (value) => 10 + value * 2 },
        y: { getPixelForValue: (value) => 300 - value }
      },
      chartArea: { left: 10, right: 610 },
      ctx,
      calls
    };
  }

  it('draws the LLN–ULN band in chart space (beforeDatasetsDraw)', () => {
    const chart = fakeChart();
    bandGuidePlugin(alt).beforeDatasetsDraw(chart);
    expect(chart.calls).toContainEqual(['set:fillStyle', '#eee']);
    // ULN forward: first band vertex at (x(0), y(40)).
    expect(chart.calls).toContainEqual(['moveTo', 10, 260]);
    expect(chart.calls).toContainEqual(['lineTo', 130, 260]); // x(60), y(40)
    // LLN reversed ends at (x(0), y(5)).
    expect(chart.calls).toContainEqual(['lineTo', 10, 295]);
    expect(chart.calls.map(([name]) => name)).toContain('fill');
  });

  it('draws dashed guides across the chart area at the population extent', () => {
    const chart = fakeChart();
    bandGuidePlugin(alt).beforeDatasetsDraw(chart);
    expect(chart.calls).toContainEqual(['setLineDash', [2, 2]]);
    expect(chart.calls).toContainEqual(['set:strokeStyle', '#ccc']);
    // Guides at y(20) = 280 and y(200) = 100, spanning left → right.
    expect(chart.calls).toContainEqual(['moveTo', 10, 280]);
    expect(chart.calls).toContainEqual(['lineTo', 610, 280]);
    expect(chart.calls).toContainEqual(['moveTo', 10, 100]);
    expect(chart.calls).toContainEqual(['lineTo', 610, 100]);
  });

  it('draws no band when no normal-range limit is finite', () => {
    const chart = fakeChart();
    const noBand = {
      ...alt,
      spark: alt.spark.map((point) => ({ ...point, lln: NaN, uln: NaN }))
    };
    bandGuidePlugin(noBand).beforeDatasetsDraw(chart);
    expect(chart.calls).not.toContainEqual(['set:fillStyle', '#eee']);
  });
});

describe('renderInset (PPRF-4)', () => {
  it('mounts a line chart of absolute values by study day', () => {
    const chart = renderInset(host(), alt);
    expect(built).toHaveLength(1);
    expect(chart.config.type).toBe('line');
    const [dataset] = chart.data.datasets;
    expect(dataset.data).toEqual([
      { x: 0, y: 35 },
      { x: 30, y: 160 },
      { x: 60, y: 80 }
    ]);
    expect(dataset.borderColor).toBe('#e41a1c');
    expect(chart.options.scales.x.title.text).toBe('Study Day');
    expect(chart.options.scales.y.title.text).toBe('Aminotransferase, alanine (ALT)');
    // y-domain unioned with band + guides (parity setDomain).
    expect(chart.options.scales.y.min).toBeCloseTo(5 * 0.99, 6);
    expect(chart.options.scales.y.max).toBeCloseTo(200 * 1.01, 6);
    expect(host().querySelector('canvas')).not.toBeNull();
  });

  it('fills outlier points and hollows the rest', () => {
    const chart = renderInset(host(), alt);
    const [dataset] = chart.data.datasets;
    expect(dataset.pointBackgroundColor({ dataIndex: 0 })).toBe('#fff');
    expect(dataset.pointBackgroundColor({ dataIndex: 1 })).toBe('#e41a1c');
    expect(dataset.pointBackgroundColor({ dataIndex: 2 })).toBe('#e41a1c');
  });

  it('installs the band/guide plugin', () => {
    const chart = renderInset(host(), alt);
    expect(chart.plugins.map((plugin) => plugin.id)).toContain('sv-profile-inset-band');
  });
});

describe('measure-table inset lifecycle (PPRF-4)', () => {
  function toggleFor(key) {
    return host().querySelector(`tr[data-key="${key}"] .sv-profile-spark-toggle`);
  }

  it('expanding a spark inserts a full-width row under it hosting the inset', () => {
    renderMeasureTable(host(), [alt, tb], settings, {});
    const button = toggleFor('ALT');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    expect(built).toHaveLength(1);
    const row = host().querySelector('tr[data-key="ALT"]');
    const insetRow = row.nextElementSibling;
    expect(insetRow.classList.contains('sv-profile-inset-row')).toBe(true);
    expect(insetRow.querySelector('td').getAttribute('colspan')).toBe('6');
    expect(insetRow.querySelector('canvas')).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.textContent).toContain('Minimize Chart');
    // The sparkline hides while the inset is open (parity addSparkClick).
    expect(row.querySelector('svg').style.display).toBe('none');
  });

  it('collapsing destroys the chart and removes the row', () => {
    renderMeasureTable(host(), [alt, tb], settings, {});
    const button = toggleFor('ALT');
    button.click();
    const chart = built[0];
    button.click();
    expect(chart.destroyed).toBe(true);
    expect(host().querySelector('.sv-profile-inset-row')).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.textContent).toBe('▽');
    expect(host().querySelector('tr[data-key="ALT"] svg').style.display).not.toBe('none');
  });

  it('supports a second expand while one is open', () => {
    renderMeasureTable(host(), [alt, tb], settings, {});
    toggleFor('ALT').click();
    toggleFor('TB').click();
    expect(built).toHaveLength(2);
    expect(built.every((chart) => !chart.destroyed)).toBe(true);
    expect(host().querySelectorAll('.sv-profile-inset-row')).toHaveLength(2);
    expect(
      host()
        .querySelector('tr[data-key="TB"]')
        .nextElementSibling.classList.contains('sv-profile-inset-row')
    ).toBe(true);
  });

  it('destroy() tears every open inset down (re-render leaks none)', () => {
    const controller = renderMeasureTable(host(), [alt, tb], settings, {});
    toggleFor('ALT').click();
    toggleFor('TB').click();
    controller.destroy();
    expect(built.every((chart) => chart.destroyed)).toBe(true);
    expect(host().querySelector('.sv-profile-inset-row')).toBeNull();
    expect(controller.open.size).toBe(0);
  });
});
