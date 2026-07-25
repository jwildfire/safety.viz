import { describe, it, expect } from 'vitest';
import {
  CUT_GRAB_PX,
  cutHandleAt,
  cutValueFor,
  roundCut
} from '../../../src/hep-explorer/cutDrag.js';

// Direct manipulation of the Hy's-Law cut-lines (#45): which line the pointer
// has hold of, and what value a drag to a given pixel means. The geometry is
// pure so the rules can be pinned without a canvas; the wiring — the live
// reclassification and the two-way sync with the number inputs — is asserted in
// the browser suite. Requirement group HEP-QUAD-006.

// A 400x300 plot: x 0-10 across 400px, y 0-20 up 300px.
const chart = ({ log = false } = {}) => ({
  chartArea: { left: 50, right: 450, top: 20, bottom: 320 },
  scales: {
    x: {
      min: log ? 0.1 : 0,
      max: 10,
      getPixelForValue: (value) => 50 + (value / 10) * 400,
      getValueForPixel: (pixel) => ((pixel - 50) / 400) * 10
    },
    y: {
      min: log ? 0.1 : 0,
      max: 20,
      getPixelForValue: (value) => 320 - (value / 20) * 300,
      getValueForPixel: (pixel) => ((320 - pixel) / 300) * 20
    }
  }
});

const CUTS = { xCut: 3, yCut: 2 };

describe('hep-explorer cut-line drag geometry (HEP-QUAD-006)', () => {
  it('HEP-QUAD-006: the pointer takes hold of whichever cut-line it is on (#45)', () => {
    const plot = chart();
    const xPixel = plot.scales.x.getPixelForValue(CUTS.xCut); // 170
    const yPixel = plot.scales.y.getPixelForValue(CUTS.yCut); // 290

    // On the vertical line, away from the horizontal one.
    expect(cutHandleAt(plot, CUTS, xPixel, 100)).toBe('x');
    expect(cutHandleAt(plot, CUTS, xPixel + CUT_GRAB_PX - 1, 100)).toBe('x');
    expect(cutHandleAt(plot, CUTS, xPixel + CUT_GRAB_PX + 2, 100)).toBe(null);

    // On the horizontal line, away from the vertical one.
    expect(cutHandleAt(plot, CUTS, 300, yPixel)).toBe('y');
    expect(cutHandleAt(plot, CUTS, 300, yPixel - CUT_GRAB_PX + 1)).toBe('y');
    expect(cutHandleAt(plot, CUTS, 300, yPixel - CUT_GRAB_PX - 2)).toBe(null);

    // At the crossing the nearer line wins, so one gesture never moves both.
    expect(cutHandleAt(plot, CUTS, xPixel, yPixel - 3)).toBe('x');
    expect(cutHandleAt(plot, CUTS, xPixel + 3, yPixel)).toBe('y');
    expect(cutHandleAt(plot, CUTS, xPixel - 1, yPixel - 4)).toBe('x');
  });

  it('HEP-QUAD-006: nothing is grabbable outside the plot or without cuts (#45)', () => {
    const plot = chart();
    const xPixel = plot.scales.x.getPixelForValue(CUTS.xCut);
    // Above the plot area — the axis titles are not a drag handle.
    expect(cutHandleAt(plot, CUTS, xPixel, 5)).toBe(null);
    expect(cutHandleAt(plot, CUTS, 10, 100)).toBe(null);
    // A view with no cutpoints has no lines to take hold of.
    expect(cutHandleAt(plot, { xCut: null, yCut: null }, xPixel, 100)).toBe(null);
    expect(cutHandleAt(plot, {}, xPixel, 100)).toBe(null);
  });

  it('HEP-QUAD-006: a drag reads the axis value under the pointer, clamped to the plot (#45)', () => {
    const plot = chart();
    expect(cutValueFor(plot, 'x', plot.scales.x.getPixelForValue(6.5))).toBe(6.5);
    expect(cutValueFor(plot, 'y', plot.scales.y.getPixelForValue(12.25))).toBe(12.25);

    // Dragging past either end pins the cut to the axis rather than off it, so
    // a line can never be lost outside the plot.
    expect(cutValueFor(plot, 'x', 1000)).toBe(10);
    expect(cutValueFor(plot, 'x', -50)).toBe(0);
    expect(cutValueFor(plot, 'y', 1000)).toBe(0);
    expect(cutValueFor(plot, 'y', -50)).toBe(20);

    // A log axis has no zero: the floor is the axis minimum, not 0.
    const logPlot = chart({ log: true });
    expect(cutValueFor(logPlot, 'x', -50)).toBe(0.1);
  });

  it('HEP-QUAD-006: dragged values are rounded to what the number input can hold (#45)', () => {
    expect(roundCut(3.14159)).toBe(3.14);
    expect(roundCut(2.005)).toBe(2.01);
    expect(roundCut(10)).toBe(10);
    expect(roundCut(0)).toBe(0);
    expect(roundCut(NaN)).toBeNaN();
  });
});
