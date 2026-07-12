import { describe, it, expect } from 'vitest';
import { buildScales, dayDomain } from '../../../src/ae-timelines/getScales.js';

// Scale construction for the ae-timelines module (#26): a shared study-day
// domain across the bottom and mirrored top x-axes (the original's
// addTopXaxis/drawTopXaxis), and a category y-axis in the sorted subject order.

const events = [
  { subject: 'SUBJ-02', start: 2, end: 30 },
  { subject: 'SUBJ-01', start: 5, end: 12 },
  { subject: 'SUBJ-03', start: 8, end: 8 }
];

describe('ae-timelines getScales', () => {
  it('AET-FUNC-008: the study-day domain spans the earliest start to the latest stop day (#26)', () => {
    expect(dayDomain(events)).toEqual([2, 30]);
    expect(dayDomain([])).toEqual([0, 1]);
  });

  it('AET-REG-001: the y-axis lists subjects in the supplied order and the x-axes share the domain (#26)', () => {
    const scales = buildScales({ domain: [2, 30], subjects: ['SUBJ-02', 'SUBJ-01', 'SUBJ-03'] });
    expect(scales.y.type).toBe('category');
    expect(scales.y.labels).toEqual(['SUBJ-02', 'SUBJ-01', 'SUBJ-03']);
    expect(scales.y.ticks.autoSkip).toBe(false);
    expect(scales.x.min).toBe(2);
    expect(scales.x.max).toBe(30);
    expect(scales.x.position).toBe('bottom');
    // Mirrored top axis (the original renderer's second x-axis).
    expect(scales.x2.min).toBe(2);
    expect(scales.x2.max).toBe(30);
    expect(scales.x2.position).toBe('top');
    expect(scales.x2.grid.drawOnChartArea).toBe(false);
  });
});
