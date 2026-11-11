// @vitest-environment jsdom
// The x-axis toggle shared by every chart that shows change over time (#368,
// obot.roadmap#436): one setting, `x_axis`, with a Visit and a Study day option.
import { describe, expect, it } from 'vitest';
import {
  NO_TIME_AXIS,
  normalizeXAxis,
  renderXAxisControl,
  resolveXAxis,
  xAxisTick,
  xAxisValue
} from '../../../src/x-axis.js';

const both = [
  { VISIT: 'Baseline', VISITNUM: '0', DY: '-3' },
  { VISIT: 'Week 2', VISITNUM: '2', DY: '15' }
];
const visitsOnly = both.map(({ VISIT, VISITNUM }) => ({ VISIT, VISITNUM }));
const daysOnly = both.map(({ DY }) => ({ DY }));
const neither = [{ TEST: 'ALT' }];

const SETTING = {
  options: [
    { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
    { key: 'day', col: 'DY', type: 'linear', title: 'Study day' }
  ],
  default: 'visit'
};

// The setting as normalizeXAxis returns it: every option has every field.
const NORMAL = {
  ...SETTING,
  options: [SETTING.options[0], { ...SETTING.options[1], label_col: null }]
};

describe('normalizeXAxis', () => {
  it('KIT-XAX-001: x_axis is read as given, each option filled from its key (#368)', () => {
    const axis = normalizeXAxis({
      x_axis: { options: [{ key: 'day', col: 'ADY' }], default: 'day' }
    });
    expect(axis.default).toBe('day');
    expect(axis.options).toEqual([
      { key: 'day', col: 'ADY', label_col: null, type: 'linear', title: 'Study day' }
    ]);
    expect(normalizeXAxis({ x_axis: SETTING })).toEqual(NORMAL);
  });

  it('KIT-XAX-002: without x_axis it is built from visitn_col, visit_col and studyday_col (#368)', () => {
    expect(
      normalizeXAxis({ visitn_col: 'VISITNUM', visit_col: 'VISIT', studyday_col: 'DY' })
    ).toEqual(NORMAL);
    // A chart's own default view, when the setting names none.
    expect(normalizeXAxis({ studyday_col: 'DY' }, { fallback: 'day' }).default).toBe('day');
    // A visit label alone orders the visit option by its label.
    expect(normalizeXAxis({ visit_col: 'VISIT' }).options[0]).toMatchObject({
      col: 'VISIT',
      label_col: 'VISIT'
    });
  });
});

describe('resolveXAxis', () => {
  const axis = normalizeXAxis({ x_axis: SETTING });

  it('KIT-XAX-003: with both columns both options are available and the default is active (#368)', () => {
    const resolved = resolveXAxis(axis, both);
    expect(resolved.active).toBe('visit');
    expect(resolved.options.map((o) => [o.key, o.available, o.reason])).toEqual([
      ['visit', true, null],
      ['day', true, null]
    ]);
    expect(resolveXAxis(axis, both, 'day').active).toBe('day');
  });

  it('KIT-XAX-004: a missing column greys its option out and says why (#368)', () => {
    const noDay = resolveXAxis(axis, visitsOnly);
    expect(noDay.options[1]).toMatchObject({
      available: false,
      reason: 'No study day in this data'
    });
    const noVisit = resolveXAxis(axis, daysOnly);
    expect(noVisit.options[0]).toMatchObject({ available: false, reason: 'No visit in this data' });
  });

  it('KIT-XAX-005: a default naming an unavailable option falls back to the available one (#368)', () => {
    expect(resolveXAxis(axis, visitsOnly, 'day').active).toBe('visit');
    expect(resolveXAxis({ ...axis, default: 'day' }, visitsOnly).active).toBe('visit');
    expect(resolveXAxis(axis, daysOnly).active).toBe('day');
  });

  it('KIT-XAX-006: with neither column no option is active and the message says why (#368)', () => {
    const resolved = resolveXAxis(axis, neither);
    expect(resolved.active).toBeNull();
    expect(resolved.message).toBe(NO_TIME_AXIS);
    expect(NO_TIME_AXIS).toBe(
      'This data has no visit or study day, so there is no time axis to plot.'
    );
    expect(resolveXAxis(axis, both).message).toBeNull();
  });
});

describe('values and ticks', () => {
  const [visit, day] = normalizeXAxis({ x_axis: SETTING }).options;
  it('KIT-XAX-007: a row reads as its visit number or its study day, labelled by visit name or day (#368)', () => {
    expect(xAxisValue(visit, both[1])).toBe(2);
    expect(xAxisValue(day, both[1])).toBe(15);
    expect(Number.isNaN(xAxisValue(day, { DY: '' }))).toBe(true);
    expect(xAxisTick(visit, both[1])).toBe('Week 2');
    expect(xAxisTick(day, both[0])).toBe('Day -3');
  });
});

describe('renderXAxisControl', () => {
  it('KIT-XAX-008: the X-axis control offers Visit and Study day, greys out an unavailable one with its reason, and reports a switch (#368)', () => {
    const parent = document.createElement('div');
    const chosen = [];
    const resolved = resolveXAxis(normalizeXAxis({ x_axis: SETTING }), visitsOnly);
    const control = renderXAxisControl(parent, { resolved, onChange: (key) => chosen.push(key) });
    expect(parent.contains(control)).toBe(true);
    expect(control.querySelector('label').textContent).toBe('X-axis');
    const buttons = [...control.querySelectorAll('button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Visit', 'Study day']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    expect(buttons[1].disabled).toBe(true);
    expect(buttons[1].title).toBe('No study day in this data');
    expect(control.querySelector('[role=group]').getAttribute('aria-label')).toBe('X-axis');
    buttons[1].click();
    buttons[0].click();
    expect(chosen).toEqual([]);
    const live = resolveXAxis(normalizeXAxis({ x_axis: SETTING }), both);
    const second = renderXAxisControl(parent, {
      resolved: live,
      onChange: (key) => chosen.push(key)
    });
    second.querySelectorAll('button')[1].click();
    expect(chosen).toEqual(['day']);
  });
});
