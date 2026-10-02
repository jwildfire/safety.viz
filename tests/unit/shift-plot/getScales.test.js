import { describe, it, expect } from 'vitest';
import { buildScales } from '../../../src/shift-plot/getScales.js';

// Axis assembly for the shift-plot module (#14, #136). Requirement keys
// reference the matrix via docs/shift-plot-coverage.md. The module has ONE
// domain shared by both axes — that is what keeps the identity line at y = x —
// so the scale type is a per-chart choice, never a per-axis one.

describe('shift-plot getScales', () => {
  it('SSP-CHART-002: both axes take the same domain and the linear type by default (#136)', () => {
    const scales = buildScales([0, 10], 'Albumin');
    expect(scales.x.type).toBe('linear');
    expect(scales.y.type).toBe('linear');
    expect([scales.x.min, scales.x.max]).toEqual([0, 10]);
    expect([scales.y.min, scales.y.max]).toEqual([scales.x.min, scales.x.max]);
    expect(scales.x.title.text).toBe('Baseline Value — Albumin');
    expect(scales.y.title.text).toBe('Comparison Value — Albumin');
  });

  it('SSP-SCALE-001: the log axis type applies to both axes together, never to one alone (#136)', () => {
    const scales = buildScales([1, 100], 'Albumin', 'log');
    expect(scales.x.type).toBe('logarithmic');
    expect(scales.y.type).toBe('logarithmic');
    expect(scales.x.min).toBe(scales.y.min);
    expect(scales.x.max).toBe(scales.y.max);
    expect(scales.x.title.text).toBe('Baseline Value — Albumin');
  });

  it('SSP-SCALE-001: an unrecognized axis type falls back to linear (#136)', () => {
    const scales = buildScales([1, 100], 'Albumin', 'sqrt');
    expect(scales.x.type).toBe('linear');
    expect(scales.y.type).toBe('linear');
  });
});
