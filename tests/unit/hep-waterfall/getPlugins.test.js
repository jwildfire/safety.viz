import { describe, it, expect } from 'vitest';
import { ARM_SIDE_COLORS, JAUNDICE_COLOR } from '../../../src/hep-core/arms.js';
import {
  JAUNDICE_PRECEDENCE,
  armDividerPlugin,
  barColor,
  barColors,
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
