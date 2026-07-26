import { describe, it, expect } from 'vitest';
import {
  MARGINAL_MODES,
  MARGIN_STRIP,
  marginalPlugin,
  marginalSummary,
  scatterPadding,
  showsBoxes,
  showsRug
} from '../../../src/hep-explorer/marginals.js';

// Marginal box plots and axis rugs for the eDISH scatter (#47): the two
// one-dimensional summaries the original renderer draws beside the cloud, so a
// reviewer can read each measure's distribution without reading it off the
// scatter. Requirement group HEP-MARG-*.

function recorder() {
  const calls = [];
  const record =
    (name) =>
    (...args) =>
      calls.push([name, ...args]);
  const ctx = {
    calls,
    save: record('save'),
    restore: record('restore'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    fill: record('fill'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    arc: record('arc'),
    closePath: record('closePath')
  };
  ['fillStyle', 'strokeStyle', 'lineWidth'].forEach((key) => {
    let value = null;
    Object.defineProperty(ctx, key, {
      get: () => value,
      set: (next) => {
        value = next;
        calls.push([`set:${key}`, next]);
      }
    });
  });
  return ctx;
}

const chartWith = (ctx) => ({
  ctx,
  chartArea: { left: 60, right: 460, top: 40, bottom: 340 },
  scales: {
    x: { getPixelForValue: (value) => 60 + (value / 10) * 400 },
    y: { getPixelForValue: (value) => 340 - (value / 10) * 300 }
  }
});

const host = (over = {}) => ({
  state: { marginals: 'box_rug', ...(over.state || {}) },
  points: over.points || [
    { x: 1, y: 2 },
    { x: 2, y: 3 },
    { x: 3, y: 4 },
    { x: 8, y: 9 }
  ]
});

describe('hep-explorer marginal distributions (HEP-MARG-*)', () => {
  it('HEP-MARG-003: the mode enum spans both marks and their combinations (#47)', () => {
    expect(MARGINAL_MODES.map((mode) => mode.value)).toEqual(['box_rug', 'box', 'rug', 'none']);
    MARGINAL_MODES.forEach((mode) => expect(mode.label).toBeTruthy());

    expect(showsBoxes('box_rug')).toBe(true);
    expect(showsBoxes('box')).toBe(true);
    expect(showsBoxes('rug')).toBe(false);
    expect(showsBoxes('none')).toBe(false);
    expect(showsRug('box_rug')).toBe(true);
    expect(showsRug('rug')).toBe(true);
    expect(showsRug('box')).toBe(false);
    expect(showsRug('none')).toBe(false);
    // An unrecognized mode draws the default pair rather than nothing.
    expect(showsBoxes(undefined)).toBe(true);
    expect(showsRug(undefined)).toBe(true);
  });

  it('HEP-MARG-001: the strip is reserved only when boxes are drawn (#47)', () => {
    expect(scatterPadding('box_rug')).toEqual({
      top: MARGIN_STRIP,
      right: MARGIN_STRIP,
      bottom: 6,
      left: 6
    });
    expect(scatterPadding('box')).toEqual({
      top: MARGIN_STRIP,
      right: MARGIN_STRIP,
      bottom: 6,
      left: 6
    });
    // Rugs live inside the plot, so they cost no margin.
    expect(scatterPadding('rug')).toEqual({ top: 6, right: 6, bottom: 6, left: 6 });
    expect(scatterPadding('none')).toEqual({ top: 6, right: 6, bottom: 6, left: 6 });
  });

  it('HEP-MARG-001: the summary is the shown points, per axis, with R-7 quantiles (#47)', () => {
    const summary = marginalSummary(host().points);
    expect(summary.x.n).toBe(4);
    expect(summary.y.n).toBe(4);
    expect(summary.x.median).toBe(2.5);
    expect(summary.y.median).toBe(3.5);
    expect(summary.x.q25).toBe(1.75);
    expect(summary.x.max).toBe(8);

    // Non-numeric coordinates are dropped rather than poisoning the quantiles.
    const mixed = marginalSummary([
      { x: 1, y: undefined },
      { x: 'NA', y: 4 },
      { x: 3, y: 6 }
    ]);
    expect(mixed.x.n).toBe(2);
    expect(mixed.y.n).toBe(2);
    expect(marginalSummary([]).x.n).toBe(0);
  });

  it('HEP-MARG-001/HEP-MARG-002: the plugin draws both marginals and stashes their geometry (#47)', () => {
    const ctx = recorder();
    const chart = chartWith(ctx);
    const instance = host();
    marginalPlugin(instance).afterDatasetsDraw(chart);

    // The geometry goes on the chart as numbers, the same convention
    // $hepQuadrants sets, so browser evidence asserts values not pixels.
    expect(chart.$hepMarginals.mode).toBe('box_rug');
    expect(chart.$hepMarginals.x.n).toBe(4);
    expect(chart.$hepMarginals.y.median).toBe(3.5);
    expect(chart.$hepMarginals.rug).toBe(4);

    // Two boxes drawn — one per axis — above and to the right of the plot.
    const boxes = ctx.calls.filter(([name]) => name === 'fillRect');
    expect(boxes).toHaveLength(2);
    const [, , xBoxTop] = boxes[0];
    expect(xBoxTop).toBeLessThan(chart.chartArea.top);
    const [, yBoxLeft] = boxes[1];
    expect(yBoxLeft).toBeGreaterThan(chart.chartArea.right);
  });

  it('HEP-MARG-002: rug ticks are one per shown point per axis (#47)', () => {
    const ctx = recorder();
    const chart = chartWith(ctx);
    marginalPlugin(host({ state: { marginals: 'rug' } })).afterDatasetsDraw(chart);
    expect(chart.$hepMarginals.rug).toBe(4);
    expect(ctx.calls.filter(([name]) => name === 'fillRect')).toHaveLength(0);
    // One moveTo/lineTo pair per point per axis: four points, two axes.
    expect(ctx.calls.filter(([name]) => name === 'moveTo')).toHaveLength(8);
  });

  it('HEP-MARG-003: nothing is drawn when the marginals are off or there is no data (#47)', () => {
    const ctx = recorder();
    const chart = chartWith(ctx);
    marginalPlugin(host({ state: { marginals: 'none' } })).afterDatasetsDraw(chart);
    expect(ctx.calls).toHaveLength(0);
    expect(chart.$hepMarginals).toBeNull();

    const empty = chartWith(recorder());
    marginalPlugin(host({ points: [] })).afterDatasetsDraw(empty);
    expect(empty.$hepMarginals).toBeNull();
  });
});
