import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import { normalizeDomain } from '../../../src/patient-journey-explorer/normalize.js';
import { dateDiffDays, dayToDate } from '../../../src/patient-journey-explorer/getScales.js';
import {
  ANCHOR_AXIS_TITLE,
  inWindow,
  relativeDay,
  toElapsed,
  toStudyDay,
  windowBounds
} from '../../../src/patient-journey-explorer/anchor.js';

// Anchor math for the patient-journey-explorer module (#142, design §5.6,
// D22): everything runs in elapsed-day space with no day 0, so a ±N window
// spans N elapsed days on each side and "days from anchor" equals the
// calendar difference for every pair of days. PJE-ANCH-002/004/005.

const settings = syncSettings({});
const REF = '2013-12-16';
const DAYS = [-30, -5, -1, 1, 5, 30];

const ae = (extra) =>
  normalizeDomain(
    [{ USUBJID: 'P1', AETERM: 'X', ASTDY: 30, AENDY: 40, AEOUT: 'RECOVERED/RESOLVED', ...extra }],
    'AE',
    settings
  ).events[0];
const lbPoint = (day) =>
  normalizeDomain([{ USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 1, LBDY: day }], 'LB', settings)
    .events[0];

describe('elapsed helpers (re-exported from getScales.js)', () => {
  it('PJE-ANCH-005: toElapsed and toStudyDay round-trip every day in {-30,-5,-1,1,5,30} and skip day 0 (#142)', () => {
    for (const day of DAYS) {
      expect(toStudyDay(toElapsed(day)), String(day)).toBe(day);
    }
    expect(toElapsed(0)).toBeNull();
    expect(toElapsed(1)).toBe(0);
    expect(toElapsed(-1)).toBe(-1);
    expect(toStudyDay(0)).toBe(1);
  });
});

describe('relativeDay (PJE-ANCH-004, PJE-ANCH-005)', () => {
  it('PJE-ANCH-004: the anchor itself is day 0, the axis title is "Days from anchor", and the offset is a plain count across first dose (#142)', () => {
    expect(relativeDay(30, 30)).toBe(0);
    expect(relativeDay(31, 30)).toBe(1);
    expect(relativeDay(29, 30)).toBe(-1);
    expect(relativeDay(1, -1)).toBe(1);
    expect(relativeDay(-1, 1)).toBe(-1);
    expect(relativeDay(-5, 10)).toBe(-14);
    expect(ANCHOR_AXIS_TITLE).toBe('Days from anchor');
  });

  it('PJE-ANCH-004: null in, null out (#142)', () => {
    expect(relativeDay(null, 30)).toBeNull();
    expect(relativeDay(30, null)).toBeNull();
    expect(relativeDay(0, 30)).toBeNull();
    expect(relativeDay('x', 30)).toBeNull();
  });

  it('PJE-ANCH-005: relativeDay(a, b) equals the calendar-day difference between dayToDate(a) and dayToDate(b) for all 30 ordered pairs, including every pair straddling first dose (#142)', () => {
    let pairs = 0;
    let straddling = 0;
    for (const a of DAYS) {
      for (const b of DAYS) {
        if (a === b) continue;
        pairs += 1;
        if (Math.sign(a) !== Math.sign(b)) straddling += 1;
        const expected = dateDiffDays(dayToDate(a, REF), dayToDate(b, REF));
        expect(relativeDay(a, b), `relativeDay(${a}, ${b})`).toBe(expected);
      }
    }
    expect(pairs).toBe(30);
    expect(straddling).toBe(18);
  });
});

describe('windowBounds (PJE-ANCH-002)', () => {
  it('PJE-ANCH-002: windowBounds(30, 30) spans 30 elapsed days each side, labelled in study days (#142)', () => {
    expect(windowBounds(30, 30)).toEqual({
      elapsedStart: -1,
      elapsedEnd: 59,
      startDay: -1,
      endDay: 60
    });
  });

  it('PJE-ANCH-005: windowBounds(10, 30) is symmetric across first dose: {-21, 39} in elapsed space, {-21, 40} as study days (#142)', () => {
    const bounds = windowBounds(10, 30);
    expect(bounds).toEqual({ elapsedStart: -21, elapsedEnd: 39, startDay: -21, endDay: 40 });
    expect(bounds.elapsedEnd - bounds.elapsedStart).toBe(60);
    expect(dateDiffDays(dayToDate(bounds.endDay, REF), dayToDate(bounds.startDay, REF))).toBe(60);
  });

  it('PJE-ANCH-002: windowBounds(5, 0) is a zero-width window at the anchor (#142)', () => {
    expect(windowBounds(5, 0)).toEqual({ elapsedStart: 4, elapsedEnd: 4, startDay: 5, endDay: 5 });
  });

  it('PJE-ANCH-002: an unusable anchor day, or non-finite days, yields null (#142)', () => {
    expect(windowBounds(0, 30)).toBeNull();
    expect(windowBounds(null, 30)).toBeNull();
    expect(windowBounds(30, 'x')).toBeNull();
    expect(windowBounds(30, -5)).toEqual(windowBounds(30, 0));
  });
});

describe('inWindow (PJE-ANCH-002)', () => {
  const bounds = windowBounds(30, 10); // elapsed [19, 39] == study days 20..40

  it('PJE-ANCH-002: an interval matches by overlap, inclusive at both edges (#142)', () => {
    expect(inWindow(ae({ ASTDY: 5, AENDY: 20 }), bounds, settings)).toBe(true);
    expect(inWindow(ae({ ASTDY: 5, AENDY: 19 }), bounds, settings)).toBe(false);
    expect(inWindow(ae({ ASTDY: 40, AENDY: 50 }), bounds, settings)).toBe(true);
    expect(inWindow(ae({ ASTDY: 41, AENDY: 50 }), bounds, settings)).toBe(false);
    expect(inWindow(ae({ ASTDY: 25, AENDY: 26 }), bounds, settings)).toBe(true);
    expect(inWindow(ae({ ASTDY: 5, AENDY: 60 }), bounds, settings)).toBe(true);
  });

  it('PJE-ANCH-002: ongoing and end-not-recorded intervals both run past their start, and a closed one stops at its end (#142)', () => {
    const ongoing = ae({ ASTDY: 5, AENDY: '', AEOUT: 'NOT RECOVERED/NOT RESOLVED' });
    expect(ongoing.endState).toBe('ongoing');
    expect(inWindow(ongoing, bounds, settings)).toBe(true);
    const unrecorded = ae({ ASTDY: 5, AENDY: '', AEOUT: '' });
    expect(unrecorded.endState).toBe('unrecorded');
    expect(inWindow(unrecorded, bounds, settings)).toBe(true);
    const closed = ae({ ASTDY: 5, AENDY: 10 });
    expect(closed.endState).toBe('closed');
    expect(inWindow(closed, bounds, settings)).toBe(false);
    const flagged = ae({ ASTDY: 25, AENDY: 3 });
    expect(flagged.endState).toBe('unrecorded');
    expect(inWindow(flagged, bounds, settings)).toBe(true);
  });

  it('PJE-ANCH-002: a point exactly on either bound matches, and one just outside does not (#142)', () => {
    expect(inWindow(lbPoint(20), bounds, settings)).toBe(true);
    expect(inWindow(lbPoint(40), bounds, settings)).toBe(true);
    expect(inWindow(lbPoint(19), bounds, settings)).toBe(false);
    expect(inWindow(lbPoint(41), bounds, settings)).toBe(false);
    expect(inWindow(lbPoint(30), bounds, settings)).toBe(true);
  });

  it('PJE-ANCH-002: an unplaceable event never matches, and a clipped-start con-med uses its true start (#142)', () => {
    const unplaceable = ae({ ASTDY: '', AENDY: '' });
    expect(unplaceable.placeable).toBe(false);
    expect(inWindow(unplaceable, bounds, settings)).toBe(false);
    expect(inWindow(lbPoint(''), bounds, settings)).toBe(false);
    const clipped = { ...ae({ ASTDY: -9894, AENDY: '' }), clippedStart: true };
    expect(inWindow(clipped, bounds, settings)).toBe(true);
    const clippedClosed = { ...ae({ ASTDY: -9894, AENDY: -9000 }), clippedStart: true };
    expect(inWindow(clippedClosed, bounds, settings)).toBe(false);
    expect(inWindow(null, bounds, settings)).toBe(false);
    expect(inWindow(lbPoint(30), null, settings)).toBe(false);
  });

  it('PJE-ANCH-002: with a zero-day window only the anchor day matches (#142)', () => {
    const zero = windowBounds(30, 0);
    expect(inWindow(lbPoint(30), zero, settings)).toBe(true);
    expect(inWindow(lbPoint(31), zero, settings)).toBe(false);
    expect(inWindow(ae({ ASTDY: 10, AENDY: 30 }), zero, settings)).toBe(true);
    expect(inWindow(ae({ ASTDY: 10, AENDY: 29 }), zero, settings)).toBe(false);
  });
});
