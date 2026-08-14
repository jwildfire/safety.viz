import { describe, it, expect } from 'vitest';
import { kmEstimate } from '../../../src/time-to-event/km.js';
import {
  bandRects,
  censorTooltip,
  curveVertices,
  GROUP_COLORS,
  GROUP_DASHES,
  groupStyle,
  pointTooltip,
  riskRows,
  riskTableHeight
} from '../../../src/time-to-event/getPlugins.js';

// Pure geometry and text behind the time-to-event plugins (#128, design §6): the
// step-curve vertices, the CI-band rectangles, the risk-table strips, and the group
// styling. The canvas drawing itself is browser-tested. TTE-CURV-*, TTE-RISK-*.

const estimate = kmEstimate([
  { time: 2, event: true, id: 'a' },
  { time: 4, event: false, id: 'b' },
  { time: 5, event: true, id: 'c' },
  { time: 9, event: false, id: 'd' }
]);
// S: 1 → 3/4 (t=2: 1 of 4) → 3/8 (t=5: 1 of the 2 still at risk after the day-4
// censoring); censored at 4 and 9; curve extends flat to 9.

describe('groupStyle', () => {
  it('assigns colors and dash patterns in fixed order — identity, never rank (TTE-CURV-006, #128)', () => {
    expect(groupStyle(0)).toEqual({ color: GROUP_COLORS[0], dash: GROUP_DASHES[0] });
    expect(groupStyle(1).color).toBe(GROUP_COLORS[1]);
    expect(GROUP_COLORS.length).toBeGreaterThanOrEqual(6);
    expect(GROUP_DASHES.length).toBe(GROUP_COLORS.length);
    // The first curve is solid; every later slot carries a distinct dash as the
    // secondary (non-color) encoding.
    expect(GROUP_DASHES[0]).toEqual([]);
    expect(GROUP_DASHES[1].length).toBeGreaterThan(0);
  });
});

describe('curveVertices', () => {
  it('starts at (0, origin), steps at each event, and extends flat to the largest observed time (#128)', () => {
    const vertices = curveVertices(estimate, 'survival');
    expect(vertices.map((v) => [v.x, v.y, v.kind])).toEqual([
      [0, 1, 'origin'],
      [2, 0.75, 'event'],
      [5, 0.375, 'event'],
      [9, 0.375, 'terminal']
    ]);
    expect(vertices[1].point.ids).toEqual(['a']);
  });

  it('flips the y values in incidence orientation (D2, #128)', () => {
    const vertices = curveVertices(estimate, 'incidence');
    expect(vertices.map((v) => v.y)).toEqual([0, 0.25, 0.625, 0.625]);
  });

  it('omits the terminal vertex when the last event is the largest time (#128)', () => {
    const closed = kmEstimate([
      { time: 1, event: true, id: 'a' },
      { time: 3, event: true, id: 'b' }
    ]);
    const vertices = curveVertices(closed, 'survival');
    expect(vertices[vertices.length - 1].kind).toBe('event');
  });
});

describe('bandRects', () => {
  it('builds one step rectangle per defined interval, extending the last to the curve end (#128)', () => {
    const rects = bandRects(estimate, 'survival');
    // Both event points have defined bounds; intervals [2,5) and [5,9].
    expect(rects).toHaveLength(2);
    expect(rects[0].x0).toBe(2);
    expect(rects[0].x1).toBe(5);
    expect(rects[0].lo).toBeCloseTo(estimate.points[0].lo, 12);
    expect(rects[0].hi).toBeCloseTo(estimate.points[0].hi, 12);
    expect(rects[1].x0).toBe(5);
    expect(rects[1].x1).toBe(9);
  });

  it('flips the band in incidence orientation (#128)', () => {
    const rects = bandRects(estimate, 'incidence');
    expect(rects[0].lo).toBeCloseTo(1 - estimate.points[0].hi, 12);
    expect(rects[0].hi).toBeCloseTo(1 - estimate.points[0].lo, 12);
  });

  it('skips points with undefined bounds rather than extrapolating (#128)', () => {
    const exhausted = kmEstimate([
      { time: 1, event: true, id: 'a' },
      { time: 2, event: true, id: 'b' }
    ]);
    // Second point reaches S = 0: no bound there, so only [1,2) is banded.
    const rects = bandRects(exhausted, 'survival');
    expect(rects).toHaveLength(1);
    expect(rects[0].x1).toBe(2);
  });
});

describe('riskRows', () => {
  it('assembles the at-risk and cumulative-events strips from the estimates (TTE-RISK-001, #128)', () => {
    const groups = [{ name: 'Placebo', estimate }];
    const strips = riskRows(groups, [0, 2, 4, 6, 8]);
    expect(strips).toHaveLength(2);
    expect(strips[0].label).toBe('No. at risk');
    expect(strips[0].groups[0].counts).toEqual([4, 4, 3, 1, 1]);
    expect(strips[1].label).toBe('Cumulative events');
    expect(strips[1].groups[0].counts).toEqual([0, 1, 1, 2, 2]);
  });
});

describe('riskTableHeight', () => {
  it('grows with the group count and is never zero (#128)', () => {
    expect(riskTableHeight(1)).toBeGreaterThan(0);
    expect(riskTableHeight(3)).toBeGreaterThan(riskTableHeight(1));
  });
});

describe('tooltips', () => {
  it('an event tooltip names the time, the step, and the interval as pointwise (TTE-USER-005, #128)', () => {
    const lines = pointTooltip(estimate.points[0], {
      groupName: 'Placebo',
      direction: 'incidence',
      timeUnit: 'day'
    });
    const text = lines.join(' ');
    expect(text).toContain('Day 2');
    expect(text).toContain('Placebo');
    expect(text).toMatch(/25\.0%/); // 1 − 0.75
    expect(text).toMatch(/pointwise/i);
    expect(text).toMatch(/1 of 4 at risk|1 event/i);
  });

  it('a censor tooltip names the count and the reason (TTE-USER-006, #128)', () => {
    const lines = censorTooltip(estimate.censorTimes[0], {
      groupName: 'Placebo',
      timeUnit: 'day',
      censorDescs: ['END OF STUDY']
    });
    const text = lines.join(' ');
    expect(text).toContain('Day 4');
    expect(text).toMatch(/1 participant censored/i);
    expect(text).toContain('END OF STUDY');
  });
});
