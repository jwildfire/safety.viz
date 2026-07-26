import { describe, it, expect } from 'vitest';
import { drawBoxWhisker, boxWhiskerPlugin, hexToRgba } from '../../../src/box-whisker.js';
import { boxWhiskerPlugin as srotBoxWhiskerPlugin } from '../../../src/results-over-time/getPlugins.js';

// The shared box-and-whisker drawing module (#91), promoted out of
// results-over-time/getPlugins.js so hep-waterfall's flanking summary panels
// can reuse it. HEP-CORE-010 is the regression guard: results-over-time has
// shipped evidence baselines, so the promoted implementation must reproduce
// the pre-promotion plugin's geometry exactly. Parity is proved against a
// frozen verbatim copy of the original drawing body (below), executed on a
// recording canvas-context stub so every draw call and style assignment is
// compared, in order, with its arguments.
//
// Filed under tests/unit/hep-explorer/ deliberately. scripts/evidence-lib.mjs
// routes test files to modules by directory name (tests/unit/<module>/**), and
// anything under a directory that is NOT a registered renderer module is treated
// as shared scaffold and DUPLICATED into every module's evidence.json. A
// tests/unit/box-whisker/ directory therefore stamped these six HEP-CORE-010
// records onto all nine renderers, so ae-explorer's verification record claimed
// box-whisker drawing tests as its own evidence. HEP-CORE-010 is a hep
// requirement; hep-explorer is where it belongs — same reasoning as the
// HEP-CORE-009 boxStats tests riding in subjects.test.js.

// ---------------------------------------------------------------------------
// Frozen reference: the results-over-time boxWhiskerPlugin drawing body as it
// shipped before the promotion (src/results-over-time/getPlugins.js@v1.4.1,
// lines 96-153), copied verbatim. Do not "fix" or modernize this copy — its
// whole value is that it is the pre-promotion pixel source of truth.
// ---------------------------------------------------------------------------
function referenceHexToRgba(hex, alpha) {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function referenceDraw(chart, boxes) {
  const { ctx, scales, chartArea } = chart;
  const yOf = (value) => scales.y.getPixelForValue(value);
  ctx.save();
  for (const box of boxes) {
    const { stats, color } = box;
    if (!stats || !stats.n) continue;
    const centerX = scales.x.getPixelForValue(box.x);
    const left = scales.x.getPixelForValue(box.x - box.halfWidth);
    const right = scales.x.getPixelForValue(box.x + box.halfWidth);
    const clamp = (y) => Math.max(chartArea.top, Math.min(chartArea.bottom, y));

    // Box: Q1–Q3.
    ctx.fillStyle = referenceHexToRgba(color, 0.35);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    const top = clamp(yOf(stats.q75));
    const bottom = clamp(yOf(stats.q25));
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.strokeRect(left, top, right - left, bottom - top);

    // Whiskers: q5→Q1 and Q3→q95, with caps at the 5th/95th percentiles.
    ctx.beginPath();
    ctx.moveTo(centerX, clamp(yOf(stats.q5)));
    ctx.lineTo(centerX, bottom);
    ctx.moveTo(centerX, top);
    ctx.lineTo(centerX, clamp(yOf(stats.q95)));
    ctx.moveTo(left, clamp(yOf(stats.q5)));
    ctx.lineTo(right, clamp(yOf(stats.q5)));
    ctx.moveTo(left, clamp(yOf(stats.q95)));
    ctx.lineTo(right, clamp(yOf(stats.q95)));
    ctx.stroke();

    // Median line.
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.moveTo(left, clamp(yOf(stats.median)));
    ctx.lineTo(right, clamp(yOf(stats.median)));
    ctx.stroke();

    // Mean: outer light circle + inner colored dot.
    const meanY = clamp(yOf(stats.mean));
    const radius = Math.min((right - left) / 6, 6);
    ctx.beginPath();
    ctx.fillStyle = '#eee';
    ctx.arc(centerX, meanY, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.arc(centerX, meanY, radius / 2, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Recording canvas-context stub: logs every method call (with arguments) and
// every style-property assignment as one ordered stream, so two drawing
// implementations can be compared call-for-call.
// ---------------------------------------------------------------------------
function recordingContext() {
  const log = [];
  const ctx = {};
  for (const method of [
    'save',
    'restore',
    'beginPath',
    'moveTo',
    'lineTo',
    'stroke',
    'fill',
    'fillRect',
    'strokeRect',
    'arc'
  ]) {
    ctx[method] = (...args) => log.push([method, ...args]);
  }
  for (const prop of ['fillStyle', 'strokeStyle', 'lineWidth']) {
    Object.defineProperty(ctx, prop, {
      set(value) {
        log.push(['set', prop, value]);
      },
      get() {
        return undefined;
      }
    });
  }
  return { ctx, log };
}

// Linear pixel projections plus a chart area chosen so the fixture stats below
// exercise the clamp paths (q95 of the first spec projects above chartArea.top;
// q5 of the second projects below chartArea.bottom).
function fakeChart(ctx) {
  return {
    ctx,
    scales: {
      x: { getPixelForValue: (value) => 40 + value * 12 },
      y: { getPixelForValue: (value) => 300 - value * 2 }
    },
    chartArea: { top: 25, bottom: 275, left: 40, right: 460 }
  };
}

// Fixture specs in the staged shape {stats, color, x, halfWidth}: two drawable
// boxes (one clamped at each end of the chart area) plus two skippable specs
// (missing stats, zero n) interleaved to prove skip parity too.
const SPECS = [
  {
    stats: { n: 12, q5: 3, q25: 5, median: 6.5, q75: 9, q95: 140, mean: 6.8 },
    color: '#2563eb',
    x: 2,
    halfWidth: 0.3
  },
  { stats: null, color: '#000000', x: 3, halfWidth: 0.2 },
  {
    stats: { n: 8, q5: -20, q25: 2, median: 3, q75: 4, q95: 6, mean: 3.2 },
    color: '#d97706',
    x: 5,
    halfWidth: 0.25
  },
  {
    stats: { n: 0, q5: 1, q25: 1, median: 1, q75: 1, q95: 1, mean: 1 },
    color: '#059669',
    x: 7,
    halfWidth: 0.25
  }
];

function referenceLog(specs) {
  const { ctx, log } = recordingContext();
  referenceDraw(fakeChart(ctx), specs);
  return log;
}

describe('box-whisker shared drawing module', () => {
  it('HEP-CORE-010: drawBoxWhisker renders identical geometry to the pre-promotion plugin (#91)', () => {
    const { ctx, log } = recordingContext();
    const chart = fakeChart(ctx);
    drawBoxWhisker(ctx, chart, SPECS);
    const expected = referenceLog(SPECS);
    // Guard against trivial empty-vs-empty parity: two drawn boxes produce a
    // substantial call stream (save + ~28 entries per box + restore).
    expect(expected.length).toBeGreaterThan(40);
    expect(log).toEqual(expected);
  });

  it('HEP-CORE-010: drawBoxWhisker skips specs with missing or empty stats (#91)', () => {
    const { ctx, log } = recordingContext();
    drawBoxWhisker(ctx, fakeChart(ctx), [SPECS[1], SPECS[3]]);
    expect(log).toEqual([['save'], ['restore']]);
  });

  it('HEP-CORE-010: boxWhiskerPlugin stamps the id prefix and draws the staged specs on afterDatasetsDraw (#91)', () => {
    const { ctx, log } = recordingContext();
    const chart = fakeChart(ctx);
    const plugin = boxWhiskerPlugin('hwf', () => SPECS);
    expect(plugin.id).toMatch(/^hwf-boxwhisker-/);
    plugin.afterDatasetsDraw(chart);
    expect(log).toEqual(referenceLog(SPECS));
  });

  it('HEP-CORE-010: boxWhiskerPlugin draws nothing when getSpecs yields no specs (#91)', () => {
    const { ctx, log } = recordingContext();
    const chart = fakeChart(ctx);
    boxWhiskerPlugin('hwf', () => []).afterDatasetsDraw(chart);
    boxWhiskerPlugin('hwf', () => null).afterDatasetsDraw(chart);
    expect(log).toEqual([]);
  });

  it('HEP-CORE-010: each boxWhiskerPlugin instance gets a unique id (#91)', () => {
    const getSpecs = () => [];
    expect(boxWhiskerPlugin('srot', getSpecs).id).not.toBe(boxWhiskerPlugin('srot', getSpecs).id);
  });

  it('HEP-CORE-010: hexToRgba converts hex colors at the given alpha exactly as before (#91)', () => {
    expect(hexToRgba('#2563eb', 0.35)).toBe(referenceHexToRgba('#2563eb', 0.35));
    expect(hexToRgba('#eeeeee', 1)).toBe('rgba(238, 238, 238, 1)');
  });
});

describe('results-over-time delegation to the shared module', () => {
  it('HEP-CORE-010: the results-over-time plugin keeps its srot id prefix (#91)', () => {
    const instance = { state: { boxplots: true }, boxSpecs: SPECS };
    expect(srotBoxWhiskerPlugin(instance).id).toMatch(/^srot-boxwhisker-/);
  });

  it('HEP-CORE-010: the results-over-time plugin draws identical geometry through the delegation (#91)', () => {
    const { ctx, log } = recordingContext();
    const chart = fakeChart(ctx);
    const instance = { state: { boxplots: true }, boxSpecs: SPECS };
    srotBoxWhiskerPlugin(instance).afterDatasetsDraw(chart);
    expect(log).toEqual(referenceLog(SPECS));
  });

  it('HEP-CORE-010: the results-over-time plugin still gates on state.boxplots and staged specs (#91)', () => {
    const { ctx, log } = recordingContext();
    const chart = fakeChart(ctx);
    srotBoxWhiskerPlugin({ state: { boxplots: false }, boxSpecs: SPECS }).afterDatasetsDraw(chart);
    srotBoxWhiskerPlugin({ state: { boxplots: true } }).afterDatasetsDraw(chart);
    expect(log).toEqual([]);
  });

  it('HEP-CORE-010: the results-over-time plugin reads boxSpecs live, not at construction time (#91)', () => {
    const { ctx, log } = recordingContext();
    const chart = fakeChart(ctx);
    const instance = { state: { boxplots: true }, boxSpecs: [] };
    const plugin = srotBoxWhiskerPlugin(instance);
    instance.boxSpecs = SPECS;
    plugin.afterDatasetsDraw(chart);
    expect(log).toEqual(referenceLog(SPECS));
  });
});
