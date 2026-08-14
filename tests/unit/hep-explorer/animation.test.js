import { describe, it, expect } from 'vitest';
import {
  ANIMATION_MAX_DURATION,
  animationDuration,
  buildAnimationFrames,
  pointsAtDay,
  studyDayRange,
  trailSegments
} from '../../../src/hep-explorer/animation.js';
import { cleanData, deriveBaseline } from '../../../src/hep-core/rows.js';
import { syncSettings } from '../../../src/hep-explorer/configure.js';

// Study-day animation for the eDISH scatter (#46): the play control advances
// every participant's point along its own lab trajectory, leaving a motion
// trail behind it. Ported in behaviour from the original renderer's
// initStudyDayControl/{initPlayButton,startAnimation,stopAnimation}.js — the
// day-position rule (last observation at or before the current day), the
// out-of-range shrink, the not-yet-enrolled fade, and the duration formula are
// all the original's. Requirement group HEP-ANIM-*.

const settings = syncSettings({
  id_col: 'ID',
  measure_col: 'TEST',
  value_col: 'VALUE',
  normal_col_high: 'ULN',
  studyday_col: 'DAY',
  visit_col: null,
  visitn_col: null,
  measure_values: { ALT: 'ALT', AST: 'AST', TB: 'TB', ALP: 'ALP' }
});

const state = {
  measureX: 'ALT',
  measureY: 'TB',
  display: 'relative_uln',
  visitWindow: 30,
  groupBy: 'hep_none'
};

// Two participants on deliberately different calendars so the enrolment fade
// and the out-of-range shrink separate: P1 is measured on days 0/30/60, P2
// only enrols on day 20 and leaves after day 40.
const RAW = [
  { ID: 'P1', TEST: 'ALT', VALUE: 40, ULN: 40, DAY: 0 },
  { ID: 'P1', TEST: 'ALT', VALUE: 120, ULN: 40, DAY: 30 },
  { ID: 'P1', TEST: 'ALT', VALUE: 80, ULN: 40, DAY: 60 },
  { ID: 'P1', TEST: 'TB', VALUE: 1.2, ULN: 1.2, DAY: 0 },
  { ID: 'P1', TEST: 'TB', VALUE: 3.6, ULN: 1.2, DAY: 30 },
  { ID: 'P1', TEST: 'TB', VALUE: 2.4, ULN: 1.2, DAY: 60 },
  { ID: 'P2', TEST: 'ALT', VALUE: 20, ULN: 40, DAY: 20 },
  { ID: 'P2', TEST: 'ALT', VALUE: 60, ULN: 40, DAY: 40 },
  { ID: 'P2', TEST: 'TB', VALUE: 0.6, ULN: 1.2, DAY: 20 },
  { ID: 'P2', TEST: 'TB', VALUE: 1.2, ULN: 1.2, DAY: 40 }
];

const rows = () => deriveBaseline(cleanData(RAW, settings).rows, settings);
const frames = () => buildAnimationFrames(rows(), settings, state);
const byId = (points, id) => points.find((point) => String(point.id) === id);

describe('hep-explorer animation — study-day range (HEP-ANIM-001)', () => {
  it('spans the smallest to largest study day carried by the plotted measures', () => {
    expect(studyDayRange(rows(), settings)).toEqual([0, 60]);
  });

  it('returns null when no row carries a usable study day', () => {
    const undated = rows().map((row) => ({ ...row, __hep_day: NaN }));
    expect(studyDayRange(undated, settings)).toBeNull();
  });
});

describe('hep-explorer animation — per-participant frames (HEP-ANIM-002)', () => {
  it('carries one ordered x/y series per participant plus that participant’s day range', () => {
    const built = frames();
    expect(built.map((frame) => String(frame.id)).sort()).toEqual(['P1', 'P2']);
    const p1 = byId(built, 'P1');
    expect(p1.x.map((point) => point.day)).toEqual([0, 30, 60]);
    // ×ULN standardization, same as the scatter's peak reduction.
    expect(p1.x.map((point) => point.value)).toEqual([1, 3, 2]);
    expect(p1.y.map((point) => point.value)).toEqual([1, 3, 2]);
    expect(p1.dayRange).toEqual([0, 60]);
    expect(byId(built, 'P2').dayRange).toEqual([20, 40]);
  });

  it('drops participants with no usable value on either plotted measure', () => {
    const partial = rows().filter((row) => !(row.ID === 'P2' && row.TEST === 'TB'));
    expect(buildAnimationFrames(partial, settings, state).map((frame) => String(frame.id))).toEqual(
      ['P1']
    );
  });
});

describe('hep-explorer animation — position at a day (HEP-ANIM-003)', () => {
  it('places each point at its most recent observation at or before the day', () => {
    const built = frames();
    const p1 = byId(pointsAtDay(built, 45, state), 'P1');
    // Day 45 falls between the day-30 and day-60 draws: the day-30 value holds.
    expect(p1.x).toBe(3);
    expect(p1.y).toBe(3);
  });

  it('holds a point at its first observation before that participant enrols', () => {
    const p2 = byId(pointsAtDay(frames(), 0, state), 'P2');
    expect(p2.x).toBe(0.5);
    expect(p2.enrolled).toBe(false);
  });

  it('marks a point out of range before its first and after its last measurement', () => {
    const built = frames();
    expect(byId(pointsAtDay(built, 10, state), 'P2').outOfRange).toBe(true);
    expect(byId(pointsAtDay(built, 30, state), 'P2').outOfRange).toBe(false);
    expect(byId(pointsAtDay(built, 50, state), 'P2').outOfRange).toBe(true);
    // P1 is measured across the whole range, so it is never out of range.
    expect(byId(pointsAtDay(built, 50, state), 'P1').outOfRange).toBe(false);
  });

  it('reports enrolment from the participant’s own first record, not the study range', () => {
    const built = frames();
    expect(byId(pointsAtDay(built, 19, state), 'P2').enrolled).toBe(false);
    expect(byId(pointsAtDay(built, 20, state), 'P2').enrolled).toBe(true);
    expect(byId(pointsAtDay(built, 0, state), 'P1').enrolled).toBe(true);
  });

  it('holds every point on its last observation once the study day runs past it', () => {
    const p1 = byId(pointsAtDay(frames(), 999, state), 'P1');
    expect(p1.x).toBe(2);
    expect(p1.y).toBe(2);
  });
});

describe('hep-explorer animation — motion trails (HEP-ANIM-004)', () => {
  it('joins each point’s previous position to its new one, and only for points that moved', () => {
    const built = frames();
    const before = pointsAtDay(built, 0, state);
    const after = pointsAtDay(built, 30, state);
    const segments = trailSegments(before, after);
    // P1 moved 1→3 on both axes. P2 did not: its day-20 values are also its
    // first values, which is where it was already being held on day 0.
    expect(segments.map((segment) => String(segment.id))).toEqual(['P1']);
    expect(segments[0]).toMatchObject({ x1: 1, y1: 1, x2: 3, y2: 3 });
  });

  it('emits nothing when no point moved between two days', () => {
    const built = frames();
    const held = pointsAtDay(built, 45, state);
    expect(trailSegments(held, pointsAtDay(built, 50, state))).toEqual([]);
  });

  it('ignores points that are not in both frames', () => {
    const built = frames();
    const after = pointsAtDay(built, 30, state);
    expect(trailSegments([], after)).toEqual([]);
  });
});

describe('hep-explorer animation — playback duration (HEP-ANIM-005)', () => {
  it('runs 100ms per remaining day for short studies (the original’s formula)', () => {
    expect(animationDuration(0, 60)).toBe(6000);
    expect(animationDuration(30, 60)).toBe(3000);
  });

  it('caps a long study at the 30-second ceiling', () => {
    expect(animationDuration(0, 400)).toBe(ANIMATION_MAX_DURATION);
    expect(ANIMATION_MAX_DURATION).toBe(30000);
  });

  it('never returns a non-positive duration', () => {
    expect(animationDuration(60, 60)).toBeGreaterThan(0);
    expect(animationDuration(90, 60)).toBeGreaterThan(0);
  });
});
