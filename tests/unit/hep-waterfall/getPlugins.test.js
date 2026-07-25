import { describe, it, expect } from 'vitest';
import { ARM_SIDE_COLORS, JAUNDICE_COLOR } from '../../../src/hep-core/arms.js';
import {
  BOX_ANATOMY,
  BOX_PANEL_NOTE,
  JAUNDICE_PRECEDENCE,
  armDividerPlugin,
  barColor,
  barColors,
  boxHitTest,
  boxHoverPlugin,
  boxPanelDescription,
  boxSlotLabels,
  boxTooltip,
  legendItems,
  ulnBandPlugin,
  ulnLabel,
  ulnRange,
  waterfallTooltip
} from '../../../src/hep-waterfall/getPlugins.js';

// Colour, the arm divider, the reference-range band and the tooltip for the
// modified ALT waterfall (#93). Requirement groups HWF-COLOR-*, HWF-AXIS-004
// and HWF-SELECT-001.

// A recording 2d context: every draw call and style assignment is captured so
// the plugins can be asserted without a real canvas.
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
    fillText: record('fillText'),
    setLineDash: record('setLineDash'),
    measureText: () => ({ width: 40 })
  };
  ['fillStyle', 'strokeStyle', 'lineWidth', 'font', 'textAlign', 'textBaseline'].forEach((key) => {
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

function fakeChart(ctx, { count = 6 } = {}) {
  return {
    ctx,
    chartArea: { left: 100, right: 700, top: 20, bottom: 420 },
    scales: {
      x: { getPixelForValue: (value) => 100 + (600 * (value + 0.5)) / count },
      y: { getPixelForValue: (value) => 420 - (value / 500) * 400 }
    }
  };
}

const subject = (over = {}) => ({
  id: 'P1',
  arm: 'Placebo',
  side: 'placebo',
  baseline: 50,
  peak: 80,
  peakDay: 30,
  uln: 40,
  newOnsetJaundice: false,
  peakBiliULN: 0.5,
  ...over
});

describe('hep-waterfall getPlugins colour', () => {
  it('HWF-COLOR-001: placebo bars are blue and active bars are bronze (#93)', () => {
    expect(barColor(subject({ side: 'placebo' }))).toBe(ARM_SIDE_COLORS.placebo);
    expect(barColor(subject({ side: 'active' }))).toBe(ARM_SIDE_COLORS.active);
    expect(ARM_SIDE_COLORS.placebo).toBe('#1f78b4');
    expect(ARM_SIDE_COLORS.active).toBe('#b5651d');
    expect(barColors([subject({ side: 'placebo' }), subject({ side: 'active' })])).toEqual([
      ARM_SIDE_COLORS.placebo,
      ARM_SIDE_COLORS.active
    ]);
  });

  it('HWF-COLOR-002: new-onset jaundice is green in EITHER arm (#93)', () => {
    expect(barColor(subject({ side: 'placebo', newOnsetJaundice: true }))).toBe(JAUNDICE_COLOR);
    expect(barColor(subject({ side: 'active', newOnsetJaundice: true }))).toBe(JAUNDICE_COLOR);
    expect(JAUNDICE_COLOR).not.toBe(ARM_SIDE_COLORS.placebo);
    expect(JAUNDICE_COLOR).not.toBe(ARM_SIDE_COLORS.active);
  });

  it('HWF-COLOR-004: the legend states that jaundice outranks the arm colour (#93)', () => {
    const items = legendItems({
      placeboLabel: 'ABL: Placebo',
      activeLabel: 'ABL: Study Drug',
      jaundiceCount: 7
    });
    expect(items.map((item) => item.color)).toEqual([
      ARM_SIDE_COLORS.placebo,
      ARM_SIDE_COLORS.active,
      JAUNDICE_COLOR
    ]);
    expect(items[0].label).toContain('ABL: Placebo');
    expect(items[2].label).toContain('new-onset jaundice');
    expect(items[2].label).toMatch(/either arm/i);
    expect(JAUNDICE_PRECEDENCE).toMatch(/precedence|overrides/i);
  });
});

describe('hep-waterfall getPlugins.armDividerPlugin', () => {
  const instance = {
    state: { ulnDisplay: 'band' },
    waterfall: {
      ordered: [1, 2, 3, 4, 5, 6],
      placebo: [1, 2, 3],
      active: [4, 5, 6],
      placeboLabel: 'Placebo',
      activeLabel: 'Study Drug',
      uln: { min: 40, max: 40, single: true, values: [40] },
      unit: 'U/L'
    }
  };

  it('HWF-COLOR-003: a vertical rule marks the seam and each half is labelled with its n (#93)', () => {
    const ctx = recorder();
    const chart = fakeChart(ctx, { count: 6 });
    armDividerPlugin(instance).afterDatasetsDraw(chart);
    const texts = ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    expect(texts.some((text) => text === 'Placebo (n=3)')).toBe(true);
    expect(texts.some((text) => text === 'Study Drug (n=3)')).toBe(true);
    // The rule is a full-height vertical line at the boundary between the last
    // placebo bar and the first active bar.
    const seam = (chart.scales.x.getPixelForValue(2) + chart.scales.x.getPixelForValue(3)) / 2;
    const moves = ctx.calls.filter(([name]) => name === 'moveTo');
    const lines = ctx.calls.filter(([name]) => name === 'lineTo');
    expect(moves.some(([, x, y]) => x === seam && y === chart.chartArea.top)).toBe(true);
    expect(lines.some(([, x, y]) => x === seam && y === chart.chartArea.bottom)).toBe(true);
  });

  it('HWF-COLOR-003: a one-sided cohort draws no rule but still labels its arm (#93)', () => {
    const ctx = recorder();
    const oneSided = {
      state: { ulnDisplay: 'band' },
      waterfall: { ...instance.waterfall, ordered: [1, 2, 3], placebo: [1, 2, 3], active: [] }
    };
    armDividerPlugin(oneSided).afterDatasetsDraw(fakeChart(ctx, { count: 3 }));
    const texts = ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    expect(texts).toContain('Placebo (n=3)');
    expect(texts.some((text) => /Study Drug/.test(text))).toBe(false);
    expect(ctx.calls.some(([name]) => name === 'lineTo')).toBe(false);
  });
});

describe('hep-waterfall getPlugins.ulnBandPlugin', () => {
  const withUln = (uln, ulnDisplay = 'band', ordered = []) => ({
    state: { ulnDisplay },
    waterfall: {
      ordered,
      placebo: [],
      active: [],
      placeboLabel: 'Placebo',
      activeLabel: 'Drug',
      uln,
      unit: 'U/L'
    }
  });

  it('HWF-AXIS-004: one cohort-wide reference range renders as a single labelled line (#93)', () => {
    const ctx = recorder();
    const range = ulnRange([{ uln: 40 }, { uln: 40 }]);
    expect(range).toMatchObject({ min: 40, max: 40, single: true });
    ulnBandPlugin(withUln(range)).beforeDatasetsDraw(fakeChart(ctx));
    expect(ctx.calls.some(([name]) => name === 'fillRect')).toBe(false);
    expect(ctx.calls.some(([name]) => name === 'lineTo')).toBe(true);
    const texts = ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    expect(texts).toContain('ULN (40 U/L)');
    expect(ulnLabel(range, 'U/L')).toBe('ULN (40 U/L)');
  });

  it('HWF-AXIS-004: a varying reference range renders as a band labelled with its range (#93)', () => {
    const ctx = recorder();
    const range = ulnRange([{ uln: 32 }, { uln: 43 }, { uln: 40 }]);
    expect(range).toMatchObject({ min: 32, max: 43, single: false });
    ulnBandPlugin(withUln(range)).beforeDatasetsDraw(fakeChart(ctx));
    const rects = ctx.calls.filter(([name]) => name === 'fillRect');
    expect(rects).toHaveLength(1);
    const [, , top, , height] = rects[0];
    expect(top).toBeCloseTo(420 - (43 / 500) * 400, 6);
    expect(height).toBeCloseTo(((43 - 32) / 500) * 400, 6);
    const texts = ctx.calls.filter(([name]) => name === 'fillText').map(([, text]) => text);
    expect(texts).toContain('ULN range (32–43 U/L)');
    expect(ulnLabel(range, 'U/L')).toBe('ULN range (32–43 U/L)');
  });

  it('HWF-AXIS-004: per_subject traces each participant reference range and none draws nothing (#93)', () => {
    const ordered = [{ uln: 32 }, { uln: 40 }, { uln: 43 }];
    const perSubject = recorder();
    ulnBandPlugin(withUln(ulnRange(ordered), 'per_subject', ordered)).beforeDatasetsDraw(
      fakeChart(perSubject, { count: 3 })
    );
    expect(perSubject.calls.filter(([name]) => name === 'lineTo').length).toBeGreaterThanOrEqual(3);
    const none = recorder();
    ulnBandPlugin(withUln(ulnRange(ordered), 'none', ordered)).beforeDatasetsDraw(
      fakeChart(none, { count: 3 })
    );
    expect(none.calls).toHaveLength(0);
  });

  it('HWF-AXIS-004: an unusable reference range draws nothing rather than a phantom line (#93)', () => {
    const ctx = recorder();
    const range = ulnRange([{ uln: NaN }, {}]);
    expect(range.single).toBe(false);
    expect(Number.isFinite(range.min)).toBe(false);
    ulnBandPlugin(withUln(range)).beforeDatasetsDraw(fakeChart(ctx));
    expect(ctx.calls).toHaveLength(0);
  });
});

describe('hep-waterfall getPlugins.waterfallTooltip', () => {
  it('HWF-SELECT-001: the tooltip names the participant, arm, both values and the change (#93)', () => {
    const lines = waterfallTooltip(
      subject({
        id: 'ABL-0007',
        arm: 'ABL: Study Drug',
        side: 'active',
        baseline: 200,
        peak: 400,
        peakDay: 57,
        peakBiliULN: 2.6,
        newOnsetJaundice: true
      }),
      { measure: 'ALT', unit: 'U/L' }
    );
    const text = lines.join(' | ');
    expect(lines[0]).toContain('ABL-0007');
    expect(text).toContain('ABL: Study Drug');
    expect(text).toContain('200');
    expect(text).toContain('400');
    expect(text).toMatch(/day 57/i);
    expect(text).toContain('+200');
    expect(text).toMatch(/2×baseline|2 ×baseline|×baseline/i);
    expect(text).toMatch(/2\.6/);
    expect(text).toMatch(/jaundice/i);
  });

  it('HWF-SELECT-001: a decline reads as a signed fall and no jaundice line (#93)', () => {
    const lines = waterfallTooltip(subject({ baseline: 100, peak: 60, peakDay: 30 }), {
      measure: 'ALT',
      unit: 'U/L'
    });
    const text = lines.join(' | ');
    expect(text).toContain('-40');
    expect(text).not.toMatch(/new-onset jaundice/i);
  });
});

// The flanking box-and-whisker panels' hover and labelling (obot.roadmap#83).
// Requirement groups HWF-BOX-005 (hover), HWF-BOX-006 (labelling) and
// HWF-BOX-007 (the accessible description).

const boxSpec = (over = {}) => ({
  label: 'Baseline',
  color: ARM_SIDE_COLORS.placebo,
  x: 0,
  halfWidth: 0.3,
  stats: { n: 4, min: 40, q5: 43, q25: 55, median: 80, q75: 110, q95: 138, max: 140, mean: 85 },
  ...over
});

// A flank panel's geometry: two 0/1 box slots across 110 css px, a 0-500 value
// axis over 300 px. Mirrors flankScales(domain, 2).
const flankChart = () => ({
  chartArea: { left: 10, right: 100, top: 5, bottom: 305 },
  scales: {
    x: { getPixelForValue: (value) => 10 + ((value + 0.5) / 2) * 90 },
    y: { getPixelForValue: (value) => 305 - (value / 500) * 300 }
  }
});

describe('hep-waterfall flanking-panel hover (HWF-BOX-005)', () => {
  it('HWF-BOX-005: the hit test resolves the box under the pointer and nothing outside one (#83)', () => {
    const chart = flankChart();
    const specs = [boxSpec(), boxSpec({ label: 'Peak', x: 1 })];
    const centre = (spec) => ({
      x: chart.scales.x.getPixelForValue(spec.x),
      y: chart.scales.y.getPixelForValue(spec.stats.median)
    });

    const first = centre(specs[0]);
    expect(boxHitTest(chart, specs, first.x, first.y)).toBe(0);
    const second = centre(specs[1]);
    expect(boxHitTest(chart, specs, second.x, second.y)).toBe(1);

    // Between the two slots, and above the 95th-percentile cap, is nothing.
    const between = (first.x + second.x) / 2;
    expect(boxHitTest(chart, specs, between, first.y)).toBe(-1);
    expect(boxHitTest(chart, specs, first.x, chart.scales.y.getPixelForValue(300))).toBe(-1);

    // The whisker caps are part of the target: 5th and 95th percentiles hit.
    expect(boxHitTest(chart, specs, first.x, chart.scales.y.getPixelForValue(43))).toBe(0);
    expect(boxHitTest(chart, specs, first.x, chart.scales.y.getPixelForValue(138))).toBe(0);

    // An empty box is not a target, and neither is an empty panel.
    const empty = [boxSpec({ stats: { n: 0 } })];
    expect(boxHitTest(chart, empty, first.x, first.y)).toBe(-1);
    expect(boxHitTest(chart, [], first.x, first.y)).toBe(-1);
  });

  it('HWF-BOX-005: the tooltip names the arm, the box and every drawn statistic (#83)', () => {
    const lines = boxTooltip(boxSpec(), {
      arm: 'ABL: Placebo',
      measure: 'ALT',
      unit: 'U/L'
    });
    const text = lines.join(' | ');
    expect(lines[0]).toContain('ABL: Placebo');
    expect(lines[0]).toMatch(/baseline/i);
    expect(text).toMatch(/n\s*=?\s*4/i);
    // Every mark the shared renderer draws is readable as a number.
    expect(text).toMatch(/95th percentile.*138/);
    expect(text).toMatch(/(Q3|third quartile).*110/i);
    expect(text).toMatch(/median.*80/i);
    expect(text).toMatch(/mean.*85/i);
    expect(text).toMatch(/(Q1|first quartile).*55/i);
    expect(text).toMatch(/5th percentile.*43/);
    expect(text).toContain('U/L');
    // The 'Peak' spec is spelled out as maximum on-treatment, not 'Peak'.
    const peak = boxTooltip(boxSpec({ label: 'Peak' }), { arm: 'Drug', measure: 'ALT' });
    expect(peak[0]).toMatch(/maximum on-treatment/i);
  });

  it('HWF-BOX-005: a missing or empty box yields no tooltip (#83)', () => {
    expect(boxTooltip(null, {})).toEqual([]);
    expect(boxTooltip(boxSpec({ stats: { n: 0 } }), {})).toEqual([]);
  });

  it('HWF-BOX-005: the hover plugin backs the active box only, under the marks (#83)', () => {
    const ctx = recorder();
    const chart = { ...flankChart(), ctx };
    const specs = [boxSpec(), boxSpec({ label: 'Peak', x: 1 })];
    const state = { index: -1 };
    const plugin = boxHoverPlugin(
      () => specs,
      () => state.index
    );

    // The highlight is drawn BEFORE the datasets so it can never repaint the
    // shipped box-and-whisker marks (box-whisker.js draws afterDatasetsDraw).
    expect(typeof plugin.beforeDatasetsDraw).toBe('function');
    expect(plugin.afterDatasetsDraw).toBeUndefined();

    plugin.beforeDatasetsDraw(chart);
    expect(ctx.calls.filter(([name]) => name === 'fillRect')).toHaveLength(0);

    state.index = 1;
    plugin.beforeDatasetsDraw(chart);
    const rects = ctx.calls.filter(([name]) => name === 'fillRect');
    expect(rects).toHaveLength(1);
    // It brackets the second slot's whisker span, not the first.
    const [, x, y, width, height] = rects[0];
    expect(x).toBeGreaterThan(chart.scales.x.getPixelForValue(0.5));
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    expect(y).toBeLessThan(chart.scales.y.getPixelForValue(138) + 1);
  });
});

describe('hep-waterfall flanking-panel labelling (HWF-BOX-006, HWF-BOX-007)', () => {
  it('HWF-BOX-006: the anatomy key names every mark the panels draw (#83)', () => {
    expect(BOX_ANATOMY).toMatch(/interquartile|Q1/i);
    expect(BOX_ANATOMY).toMatch(/median/i);
    expect(BOX_ANATOMY).toMatch(/5th/);
    expect(BOX_ANATOMY).toMatch(/95th/);
    expect(BOX_ANATOMY).toMatch(/mean/i);
  });

  it('HWF-BOX-006: the slot labels distinguish baseline from maximum on-treatment (#83)', () => {
    expect(boxSlotLabels('baseline_peak')).toEqual(['Baseline', 'Max on-tx']);
    expect(boxSlotLabels('peak')).toEqual(['Max on-tx']);
    // The legend spells the abbreviation out so 'Max on-tx' is never a guess.
    expect(BOX_PANEL_NOTE).toMatch(/maximum on-treatment/i);
    expect(BOX_PANEL_NOTE).toMatch(/baseline/i);
  });

  it('HWF-BOX-007: the panel description reads the arm and both boxes as numbers (#83)', () => {
    const description = boxPanelDescription([boxSpec(), boxSpec({ label: 'Peak', x: 1 })], {
      arm: 'ABL: Placebo',
      measure: 'ALT',
      unit: 'U/L'
    });
    expect(description).toContain('ABL: Placebo');
    expect(description).toMatch(/baseline/i);
    expect(description).toMatch(/maximum on-treatment/i);
    expect(description).toContain('80');
    expect(description).toContain('U/L');
    expect(boxPanelDescription([], { arm: 'ABL: Placebo' })).toMatch(/no /i);
  });
});
