import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import {
  PLOT_GUTTER_LEFT,
  PLOT_GUTTER_RIGHT,
  axisTicks,
  buildScales,
  dateDiffDays,
  dayToDate,
  formatTick,
  isFullDate,
  laneLayout,
  referenceDate,
  resolveEventDate,
  toElapsed,
  toStudyDay
} from '../../../src/patient-journey-explorer/getScales.js';

// Scales for the patient-journey-explorer module (#142, design §5.9, §6.2,
// D7, D22): the shared elapsed-day domain every lane draws over, the tick
// generator behind the one pinned axis strip, and calendar-date mode as a
// labelling concern only. PJE-TIME-* and PJE-LANE-004.

describe('elapsed-day space (D22)', () => {
  it('PJE-ANCH-005: toElapsed and toStudyDay round-trip every non-zero day and skip day 0 (#142)', () => {
    for (const day of [-30, -5, -1, 1, 5, 30]) {
      expect(toStudyDay(toElapsed(day)), String(day)).toBe(day);
    }
    expect(toElapsed(1)).toBe(0);
    expect(toElapsed(2)).toBe(1);
    expect(toElapsed(-1)).toBe(-1);
    expect(toElapsed(0)).toBeNull();
    expect(toElapsed(null)).toBeNull();
    expect(toElapsed('x')).toBeNull();
    expect(toStudyDay(0)).toBe(1);
    expect(toStudyDay(-1)).toBe(-1);
    expect(toStudyDay(0.5)).toBe(1.5);
  });
});

describe('dayToDate / isFullDate', () => {
  it('PJE-TIME-002: day 1 is the reference date, day 2 the next day, day -1 the day before, and day 0 is null (#142)', () => {
    expect(dayToDate(1, '2013-12-16')).toBe('2013-12-16');
    expect(dayToDate(2, '2013-12-16')).toBe('2013-12-17');
    expect(dayToDate(-1, '2013-12-16')).toBe('2013-12-15');
    expect(dayToDate(0, '2013-12-16')).toBeNull();
    expect(dayToDate(30, '2013-12-16')).toBe('2014-01-14');
    expect(dayToDate(-9894, '2013-12-16')).toBe('1986-11-14');
    expect(dayToDate(1, null)).toBeNull();
    expect(dayToDate(1, '2013-12')).toBeNull();
    expect(dayToDate('x', '2013-12-16')).toBeNull();
    expect(dayToDate(NaN, '2013-12-16')).toBeNull();
  });

  it('PJE-TIME-003: isFullDate accepts YYYY-MM-DD (with an optional time part) and rejects partial or impossible dates (#142)', () => {
    expect(isFullDate('2014-01-14')).toBe(true);
    expect(isFullDate('2014-01-14T09:30')).toBe(true);
    expect(isFullDate('2011')).toBe(false);
    expect(isFullDate('2014-01')).toBe(false);
    expect(isFullDate('2014-13-40')).toBe(false);
    expect(isFullDate('')).toBe(false);
    expect(isFullDate(null)).toBe(false);
    expect(isFullDate(20140114)).toBe(false);
  });

  it('dateDiffDays is the calendar-day difference between two ISO dates (#142)', () => {
    expect(dateDiffDays('2014-01-14', '2013-12-16')).toBe(29);
    expect(dateDiffDays('2013-12-15', '2013-12-16')).toBe(-1);
    expect(dateDiffDays('2014-03-01', '2014-02-28')).toBe(1);
    expect(dateDiffDays('2014-01', '2013-12-16')).toBeNull();
  });
});

describe('referenceDate', () => {
  const settings = syncSettings({});
  const event = (source, day = 1) => ({
    day,
    start: day,
    placeable: Number.isFinite(day),
    rawDate: source.DTC || '',
    source
  });

  it('PJE-TIME-002: picks the first full ref_date_col cell and reports the rule (#142)', () => {
    const events = [
      event({ TRTSDT: '2013-12' }),
      event({ TRTSDT: '2013-12-16' }),
      event({ TRTSDT: '2014-01-01' })
    ];
    expect(referenceDate(events, settings)).toEqual({ date: '2013-12-16', rule: 'ref_col' });
  });

  it('derives the reference from the earliest row with both a full date and a finite day when no ref column resolves (#142)', () => {
    const events = [
      event({ DTC: '2014-01-14' }, 30),
      event({ DTC: '2013-12-09' }, -7),
      event({ DTC: '2012' }, -400),
      event({ DTC: '2014-02-01' }, null)
    ];
    expect(referenceDate(events, settings)).toEqual({ date: '2013-12-16', rule: 'derived' });
  });

  it('returns null with no usable reference at all (#142)', () => {
    expect(referenceDate([event({ DTC: '2012' }, 3), event({}, 4)], settings)).toBeNull();
    expect(referenceDate([], settings)).toBeNull();
    expect(referenceDate(null, settings)).toBeNull();
  });
});

describe('resolveEventDate', () => {
  it('PJE-TIME-004: a full recorded date that disagrees with the study day is overridden by the day and flagged (#142)', () => {
    const event = {
      day: 30,
      start: 30,
      end: 40,
      endState: 'closed',
      placeable: true,
      rawDate: '2014-01-20'
    };
    const resolved = resolveEventDate(event, '2013-12-16');
    expect(resolved).not.toBe(event);
    expect(resolved).toMatchObject({
      date: '2014-01-14',
      endDate: '2014-01-24',
      rawDate: '2014-01-20',
      dateConflict: true
    });
    expect(event).not.toHaveProperty('date');
  });

  it('a full recorded date that agrees with the day is kept without a conflict (#142)', () => {
    const resolved = resolveEventDate(
      {
        day: 30,
        start: 30,
        end: null,
        endState: 'unrecorded',
        placeable: true,
        rawDate: '2014-01-14'
      },
      '2013-12-16'
    );
    expect(resolved).toMatchObject({ date: '2014-01-14', endDate: null, dateConflict: false });
  });

  it('PJE-TIME-003: a partial recorded date never positions and never labels; the day does, when a reference exists (#142)', () => {
    expect(
      resolveEventDate(
        { day: 30, start: 30, end: null, placeable: true, rawDate: '2014-01' },
        '2013-12-16'
      )
    ).toMatchObject({ date: '2014-01-14', dateConflict: false });
    expect(
      resolveEventDate({ day: 30, start: 30, end: null, placeable: true, rawDate: '2014-01' }, null)
    ).toMatchObject({ date: null, dateConflict: false });
    expect(
      resolveEventDate(
        { day: null, start: null, end: null, placeable: false, rawDate: '2014-01-14' },
        '2013-12-16'
      )
    ).toMatchObject({ date: '2014-01-14', dateConflict: false });
  });
});

describe('formatTick', () => {
  it('PJE-TIME-001: day mode prints the study day and date mode the ISO date, falling back to the day when no date resolves (#142)', () => {
    expect(formatTick(-1, { mode: 'day' })).toBe('-1');
    expect(formatTick(30, { mode: 'day', refDate: '2013-12-16' })).toBe('30');
    expect(formatTick(30, { mode: 'date', refDate: '2013-12-16' })).toBe('2014-01-14');
    expect(formatTick(-1, { mode: 'date', refDate: '2013-12-16' })).toBe('2013-12-15');
    expect(formatTick(30, { mode: 'date', refDate: null })).toBe('30');
  });

  it('PJE-ANCH-004: with an anchor day the tick is a signed elapsed offset and the anchor reads 0 (#142)', () => {
    expect(formatTick(30, { mode: 'day', anchorDay: 30 })).toBe('0');
    expect(formatTick(60, { mode: 'day', anchorDay: 30 })).toBe('+30');
    expect(formatTick(-1, { mode: 'day', anchorDay: 30 })).toBe('-30');
    expect(formatTick(1, { mode: 'day', anchorDay: -1 })).toBe('+1');
  });
});

describe('axisTicks', () => {
  it('returns at most 8 round study days covering the domain, positioned as percentages of the elapsed domain (#142)', () => {
    const domain = [toElapsed(-14), toElapsed(184)];
    const ticks = axisTicks(domain);
    expect(ticks.length).toBeLessThanOrEqual(8);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    for (const tick of ticks) {
      expect(tick.position).toBeGreaterThanOrEqual(0);
      expect(tick.position).toBeLessThanOrEqual(100);
      expect(tick.elapsed).toBe(toElapsed(tick.value));
      expect(Number.isInteger(tick.value)).toBe(true);
      expect(tick.value).not.toBe(0);
    }
    expect(ticks.map((tick) => tick.value)).toContain(1);
    expect(ticks.every((tick) => tick.value === 1 || tick.value % 30 === 0)).toBe(true);
    const positions = ticks.map((tick) => tick.position);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('the ticks labelled -1 and 1 are one unit apart in elapsed space (#142)', () => {
    const ticks = axisTicks([toElapsed(-3), toElapsed(4)], 8);
    const at = (value) => ticks.find((tick) => tick.value === value);
    expect(at(-1)).toBeDefined();
    expect(at(1)).toBeDefined();
    expect(at(1).elapsed - at(-1).elapsed).toBe(1);
    expect(ticks.some((tick) => tick.value === 0)).toBe(false);
  });

  it('degrades to the endpoints for an unusable domain (#142)', () => {
    expect(axisTicks(null)).toEqual([]);
    expect(axisTicks([5, 5])).toEqual([{ value: 6, elapsed: 5, position: 0 }]);
  });
});

describe('buildScales / laneLayout', () => {
  it('PJE-LANE-004: every lane gets identical x.min/x.max, a hidden x axis and the same pinned y width (#142)', () => {
    const domain = [toElapsed(-14), toElapsed(184)];
    const lanes = [
      buildScales({ lane: 'exposure', domain, rows: ['XAN'] }),
      buildScales({ lane: 'adverseEvents', domain, rows: ['AE-0', 'AE-1'] }),
      buildScales({ lane: 'labs', domain, valueDomain: [5, 40] }),
      buildScales({ lane: 'disposition', domain, rows: ['DS'] })
    ];
    for (const scales of lanes) {
      expect(scales.x).toMatchObject({
        type: 'linear',
        min: domain[0],
        max: domain[1],
        display: false
      });
      const scale = { width: 0 };
      scales.y.afterFit(scale);
      expect(scale.width).toBe(PLOT_GUTTER_LEFT);
      expect(scales.y.grid.display).toBe(false);
      expect(scales.y.ticks.display).toBe(false);
    }
    expect(lanes[0].y.type).toBe('category');
    expect(lanes[0].y.labels).toEqual(['XAN']);
    expect(lanes[1].y.labels).toEqual(['AE-0', 'AE-1']);
    expect(lanes[2].y.type).toBe('linear');
    expect(lanes[2].y.min).toBe(5);
    expect(lanes[2].y.max).toBe(40);
    expect(laneLayout()).toEqual({
      padding: { left: 0, right: PLOT_GUTTER_RIGHT, top: 2, bottom: 2 }
    });
    expect(PLOT_GUTTER_LEFT).toBe(132);
    expect(PLOT_GUTTER_RIGHT).toBe(16);
  });

  it('a lab lane without a value domain and a lane with no rows still return a well-formed scale pair (#142)', () => {
    const labs = buildScales({ lane: 'labs', domain: [0, 10] });
    expect(labs.y.type).toBe('linear');
    expect(labs.y.min).toBe(0);
    expect(labs.y.max).toBe(1);
    const empty = buildScales({ lane: 'conMeds', domain: [0, 10] });
    expect(empty.y.labels).toEqual([]);
    const none = buildScales({ lane: 'conMeds', domain: null });
    expect(none.x.min).toBe(0);
    expect(none.x.max).toBe(1);
  });
});
