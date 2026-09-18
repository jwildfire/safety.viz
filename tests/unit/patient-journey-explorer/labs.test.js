import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import { normalizeDomain } from '../../../src/patient-journey-explorer/normalize.js';
import {
  buildLabSeries,
  isAbnormalByChange,
  isAbnormalByFlag,
  labBaseline,
  labTestOrder,
  matchesConfiguredTest,
  referenceRatio
} from '../../../src/patient-journey-explorer/labs.js';

// Lab series model for the patient-journey-explorer module (#142, design
// §4.2, §5.7, D17, D28): flag-first baseline resolution, the two abnormality
// rules, the direction-aware reference ratio, and the per-test series carrying
// the SHARED day domain. PJE-DERIV-002, PJE-CTX-002, PJE-LANE-005.

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

const settings = (overrides = {}) => syncSettings(overrides);

const lb = (extra = {}) => ({
  USUBJID: 'P1',
  LBTEST: 'Alanine Aminotransferase',
  LBTESTCD: 'ALT',
  LBSTRESN: 10,
  LBSTRESU: 'U/L',
  LBSTNRLO: 7,
  LBSTNRHI: 34,
  LBNRIND: 'NORMAL',
  LBDY: -7,
  ...extra
});

const events = (rows, overrides = {}) => normalizeDomain(rows, 'LB', settings(overrides)).events;

describe('labBaseline (PJE-DERIV-002, D17)', () => {
  it('PJE-DERIV-002: the ABLFL record is the baseline even when a later, closer-to-day-1 unflagged record exists (#142)', () => {
    const points = events([
      lb({ LBDY: -14, LBSTRESN: 10, ABLFL: 'Y' }),
      lb({ LBDY: -7, LBSTRESN: 12, ABLFL: '' }),
      lb({ LBDY: 1, LBSTRESN: 15, ABLFL: '' })
    ]);
    const baseline = labBaseline(points, settings());
    expect(baseline.rule).toBe('flag');
    expect(baseline.day).toBe(-14);
    expect(baseline.value).toBe(10);
    expect(baseline.event).toBe(points[0]);
  });

  it('PJE-DERIV-002: with several flagged records the latest day wins (#142)', () => {
    const points = events([
      lb({ LBDY: -14, LBSTRESN: 10, ABLFL: 'Y' }),
      lb({ LBDY: -7, LBSTRESN: 12, ABLFL: 'y' })
    ]);
    const baseline = labBaseline(points, settings());
    expect(baseline.rule).toBe('flag');
    expect(baseline.day).toBe(-7);
  });

  it('PJE-DERIV-002: falls back to the last value on or before the baseline day when no flag column resolves (#142)', () => {
    const points = events([
      lb({ LBDY: -14, LBSTRESN: 10 }),
      lb({ LBDY: -7, LBSTRESN: 12 }),
      lb({ LBDY: 1, LBSTRESN: 15 }),
      lb({ LBDY: 8, LBSTRESN: 30 })
    ]);
    const baseline = labBaseline(points, settings());
    expect(baseline.rule).toBe('day');
    expect(baseline.day).toBe(1);
    expect(baseline.value).toBe(15);
  });

  it('PJE-DERIV-002: the day rule honours a configured lb_baseline_day and a null flag column (#142)', () => {
    const s = settings({ lb_baseline_day: -5, lb_baseline_flag_col: null });
    const points = events(
      [
        lb({ LBDY: -14, LBSTRESN: 10, ABLFL: 'Y' }),
        lb({ LBDY: -7, LBSTRESN: 12 }),
        lb({ LBDY: 1 })
      ],
      { lb_baseline_day: -5, lb_baseline_flag_col: null }
    );
    const baseline = labBaseline(points, s);
    expect(baseline.rule).toBe('day');
    expect(baseline.day).toBe(-7);
  });

  it('PJE-DERIV-002: same-day ties break on the SMALLER sourceIndex at every level (#142)', () => {
    const flagged = events([
      lb({ LBDY: -7, LBSTRESN: 10, ABLFL: 'Y' }),
      lb({ LBDY: -7, LBSTRESN: 11, ABLFL: 'Y' })
    ]);
    expect(labBaseline(flagged, settings()).event.sourceIndex).toBe(0);
    const byDay = events([lb({ LBDY: 1, LBSTRESN: 10 }), lb({ LBDY: 1, LBSTRESN: 11 })]);
    expect(labBaseline(byDay, settings()).event.sourceIndex).toBe(0);
    const earliest = events([lb({ LBDY: 8, LBSTRESN: 10 }), lb({ LBDY: 8, LBSTRESN: 11 })]);
    expect(labBaseline(earliest, settings()).event.sourceIndex).toBe(0);
  });

  it('PJE-DERIV-002: falls back to the earliest value when every record is after the baseline day (#142)', () => {
    const points = events([lb({ LBDY: 15, LBSTRESN: 20 }), lb({ LBDY: 8, LBSTRESN: 30 })]);
    const baseline = labBaseline(points, settings());
    expect(baseline.rule).toBe('earliest');
    expect(baseline.day).toBe(8);
    expect(baseline.value).toBe(30);
  });

  it('PJE-DERIV-002: returns null when no usable point exists (#142)', () => {
    expect(labBaseline([], settings())).toBeNull();
    expect(labBaseline(null, settings())).toBeNull();
    const unplaceable = events([lb({ LBDY: '' })]);
    expect(unplaceable[0].placeable).toBe(false);
    expect(labBaseline(unplaceable, settings())).toBeNull();
  });

  it('PJE-DERIV-002: accepts LabSeries points ({ day, value, event }) as well as event records (#142)', () => {
    const [event] = events([lb({ LBDY: -7, LBSTRESN: 10, ABLFL: 'Y' })]);
    const baseline = labBaseline([{ day: -7, value: 10, event }], settings());
    expect(baseline.rule).toBe('flag');
    expect(baseline.event).toBe(event);
  });
});

describe('isAbnormalByFlag (PJE-CTX-002)', () => {
  it('PJE-CTX-002: HIGH, LOW, ABNORMAL, HH and LL are abnormal; NORMAL and blank are not (#142)', () => {
    const flagged = (LBNRIND) => events([lb({ LBNRIND })])[0];
    for (const value of ['HIGH', 'LOW', 'ABNORMAL', 'HH', 'LL', 'high', ' Low ']) {
      expect(isAbnormalByFlag(flagged(value), settings()), value).toBe(true);
    }
    expect(isAbnormalByFlag(flagged('NORMAL'), settings())).toBe(false);
    expect(isAbnormalByFlag(flagged('normal'), settings())).toBe(false);
    expect(isAbnormalByFlag(flagged(''), settings())).toBe(false);
    expect(isAbnormalByFlag(flagged('NA'), settings())).toBe(false);
    expect(isAbnormalByFlag(flagged(undefined), settings())).toBe(false);
    expect(isAbnormalByFlag(null, settings())).toBe(false);
  });

  it('PJE-CTX-002: the configured normal value is compared case-insensitively (#142)', () => {
    const s = settings({ lb_normal_value: 'wnl' });
    const event = events([lb({ LBNRIND: 'WNL' })], { lb_normal_value: 'wnl' })[0];
    expect(isAbnormalByFlag(event, s)).toBe(false);
    expect(isAbnormalByFlag(events([lb({ LBNRIND: 'NORMAL' })])[0], s)).toBe(true);
  });
});

describe('isAbnormalByChange (PJE-CTX-002, D28)', () => {
  const baseline = { day: -7, value: 10, event: null, rule: 'day' };
  const point = (value) => events([lb({ LBDY: 30, LBSTRESN: value })])[0];

  it('PJE-CTX-002: exactly 2x and exactly 0.5x the baseline are abnormal (inclusive on both arms) (#142)', () => {
    expect(isAbnormalByChange(point(20), baseline, settings())).toBe(true);
    expect(isAbnormalByChange(point(5), baseline, settings())).toBe(true);
    expect(isAbnormalByChange(point(40), baseline, settings())).toBe(true);
    expect(isAbnormalByChange(point(1), baseline, settings())).toBe(true);
  });

  it('PJE-CTX-002: values just inside both arms are not abnormal (#142)', () => {
    expect(isAbnormalByChange(point(19.99), baseline, settings())).toBe(false);
    expect(isAbnormalByChange(point(5.01), baseline, settings())).toBe(false);
    expect(isAbnormalByChange(point(10), baseline, settings())).toBe(false);
  });

  it('PJE-CTX-002: lb_change_factor configures both arms (#142)', () => {
    const s = settings({ lb_change_factor: 3 });
    expect(isAbnormalByChange(point(20), baseline, s)).toBe(false);
    expect(isAbnormalByChange(point(30), baseline, s)).toBe(true);
    expect(isAbnormalByChange(point(4), baseline, s)).toBe(false);
    expect(isAbnormalByChange(point(10 / 3), baseline, s)).toBe(true);
  });

  it('PJE-CTX-002: a missing, zero or negative baseline disables the change rule (#142)', () => {
    expect(isAbnormalByChange(point(40), null, settings())).toBe(false);
    expect(isAbnormalByChange(point(40), { value: 0 }, settings())).toBe(false);
    expect(isAbnormalByChange(point(40), { value: -5 }, settings())).toBe(false);
    expect(isAbnormalByChange(point(40), { value: NaN }, settings())).toBe(false);
    expect(isAbnormalByChange(null, baseline, settings())).toBe(false);
  });
});

describe('referenceRatio (PC-29)', () => {
  it('PJE-CTX-002: a HIGH flag or a value above ULN divides by ULN and says so (#142)', () => {
    const high = events([lb({ LBNRIND: 'HIGH', LBSTRESN: 137, LBSTNRHI: 34 })])[0];
    expect(referenceRatio(high)).toEqual({ ratio: 137 / 34, limit: 'ULN' });
    const unflagged = events([lb({ LBNRIND: '', LBSTRESN: 68, LBSTNRHI: 34 })])[0];
    expect(referenceRatio(unflagged)).toEqual({ ratio: 2, limit: 'ULN' });
    const hh = events([lb({ LBNRIND: 'HH', LBSTRESN: 340, LBSTNRHI: 34 })])[0];
    expect(referenceRatio(hh).limit).toBe('ULN');
  });

  it('PJE-CTX-002: a LOW flag or a value below LLN divides by LLN, never by ULN (#142)', () => {
    const low = events([lb({ LBNRIND: 'LOW', LBSTRESN: 4.27, LBSTNRLO: 7 })])[0];
    expect(referenceRatio(low)).toEqual({ ratio: 4.27 / 7, limit: 'LLN' });
    const unflagged = events([lb({ LBNRIND: '', LBSTRESN: 3.5, LBSTNRLO: 7 })])[0];
    expect(referenceRatio(unflagged)).toEqual({ ratio: 0.5, limit: 'LLN' });
    const ll = events([lb({ LBNRIND: 'LL', LBSTRESN: 1, LBSTNRLO: 7 })])[0];
    expect(referenceRatio(ll).limit).toBe('LLN');
  });

  it('PJE-CTX-002: no ratio when the relevant limit is missing or when the point is in range (#142)', () => {
    expect(referenceRatio(events([lb({ LBNRIND: 'HIGH', LBSTNRHI: '' })])[0])).toBeNull();
    expect(referenceRatio(events([lb({ LBNRIND: 'LOW', LBSTNRLO: '' })])[0])).toBeNull();
    expect(referenceRatio(events([lb({ LBNRIND: 'HIGH', LBSTNRHI: 0 })])[0])).toBeNull();
    expect(referenceRatio(events([lb({ LBNRIND: 'NORMAL', LBSTRESN: 20 })])[0])).toBeNull();
    expect(referenceRatio(events([lb({ LBNRIND: 'ABNORMAL', LBSTRESN: 20 })])[0])).toBeNull();
    expect(referenceRatio(null)).toBeNull();
  });
});

describe('matchesConfiguredTest / labTestOrder', () => {
  it('PJE-LANE-005: lb_tests matches the test name OR the test code, case-insensitively, and an empty list matches every test (#142)', () => {
    const alt = events([lb()])[0];
    expect(matchesConfiguredTest(alt, settings())).toBe(true);
    expect(matchesConfiguredTest(alt, settings({ lb_tests: ['alt'] }))).toBe(true);
    expect(matchesConfiguredTest(alt, settings({ lb_tests: ['alanine aminotransferase'] }))).toBe(
      true
    );
    expect(matchesConfiguredTest(alt, settings({ lb_tests: ['AST'] }))).toBe(false);
    expect(matchesConfiguredTest(alt, settings({ lb_tests: [] }))).toBe(true);
    expect(matchesConfiguredTest(null, settings())).toBe(false);
  });

  it('PJE-LANE-005: the test order is the configured order, then first-seen order for unconfigured tests, naming configured tests with no records (#142)', () => {
    const rows = [
      lb({ LBTEST: 'Bilirubin', LBTESTCD: 'BILI' }),
      lb({ LBTEST: 'Alanine Aminotransferase', LBTESTCD: 'ALT' }),
      lb({ LBTEST: 'Glucose', LBTESTCD: 'GLUC' }),
      lb({ LBTEST: 'Sodium', LBTESTCD: 'SODIUM' })
    ];
    const configured = labTestOrder(events(rows), settings());
    expect(configured.tests).toEqual(['Alanine Aminotransferase', 'Bilirubin']);
    expect(configured.missing).toEqual(['Aspartate Aminotransferase', 'Alkaline Phosphatase']);
    const everything = labTestOrder(events(rows), settings({ lb_tests: [] }));
    expect(everything.tests).toEqual([
      'Bilirubin',
      'Alanine Aminotransferase',
      'Glucose',
      'Sodium'
    ]);
    expect(everything.missing).toEqual([]);
    const byCode = labTestOrder(events(rows), settings({ lb_tests: ['GLUC', 'ALT'] }));
    expect(byCode.tests).toEqual(['Glucose', 'Alanine Aminotransferase']);
  });

  it('PJE-LANE-005: a configured list that matches nothing warns once and yields no tests (#142)', () => {
    const order = labTestOrder(events([lb()]), settings({ lb_tests: ['Troponin'] }));
    expect(order.tests).toEqual([]);
    expect(order.missing).toEqual(['Troponin']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('lb_tests');
  });
});

describe('buildLabSeries (PJE-LANE-005)', () => {
  const rows = [
    lb({ LBDY: -7, LBSTRESN: 10, ABLFL: 'Y' }),
    lb({ LBDY: 30, LBSTRESN: 36, LBNRIND: 'HIGH' }),
    lb({ LBDY: 60, LBSTRESN: 12 }),
    lb({
      LBTEST: 'Bilirubin',
      LBTESTCD: 'BILI',
      LBDY: -7,
      LBSTRESN: 0.5,
      LBSTNRLO: 0.1,
      LBSTNRHI: 1.2,
      LBSTRESU: 'mg/dL'
    }),
    lb({
      LBTEST: 'Bilirubin',
      LBTESTCD: 'BILI',
      LBDY: '',
      LBSTRESN: 0.7,
      LBSTNRLO: 0.1,
      LBSTNRHI: 1.2,
      LBSTRESU: 'mg/dL'
    })
  ];

  it('PJE-LANE-005: one series per configured test with records, in configured order, carrying the SHARED domain rather than the test’s own (#142)', () => {
    const series = buildLabSeries(events(rows), [-14, 183], settings());
    expect(series.map((s) => s.test)).toEqual(['Alanine Aminotransferase', 'Bilirubin']);
    for (const s of series) expect(s.domain).toEqual([-14, 183]);
    expect(series[0].unit).toBe('U/L');
    expect(series[1].unit).toBe('mg/dL');
  });

  it('PJE-LANE-005: points are the placeable records in day order with their limits, indicator and event (#142)', () => {
    const evs = events(rows);
    const [alt, bili] = buildLabSeries(evs, [-14, 183], settings());
    expect(alt.points.map((p) => p.day)).toEqual([-7, 30, 60]);
    expect(alt.points.map((p) => p.elapsed)).toEqual([-7, 29, 59]);
    expect(alt.points[1]).toMatchObject({ value: 36, lln: 7, uln: 34, nrind: 'HIGH' });
    expect(alt.points[1].event).toBe(evs[1]);
    expect(bili.points).toHaveLength(1);
    expect(alt.band).toEqual([
      { day: -7, lln: 7, uln: 34 },
      { day: 30, lln: 7, uln: 34 },
      { day: 60, lln: 7, uln: 34 }
    ]);
  });

  it('PJE-DERIV-002: each series carries its baseline with the rule that fired (#142)', () => {
    const [alt, bili] = buildLabSeries(events(rows), [-14, 183], settings());
    expect(alt.baseline).toMatchObject({ day: -7, value: 10, rule: 'flag' });
    expect(bili.baseline).toMatchObject({ day: -7, value: 0.5, rule: 'day' });
  });

  it('PJE-DERIV-002: baselines come from baselineEvents (the whole record) when the drawn points are filtered (#142)', () => {
    const all = events(rows);
    const abnormalOnly = all.filter((e) => e.flags.abnormal === 'HIGH');
    const [alt] = buildLabSeries(abnormalOnly, [-14, 183], settings(), { baselineEvents: all });
    expect(alt.points).toHaveLength(1);
    expect(alt.baseline).toMatchObject({ day: -7, value: 10, rule: 'flag' });
    const [altAlone] = buildLabSeries(abnormalOnly, [-14, 183], settings());
    expect(altAlone.baseline).toMatchObject({ day: 30, value: 36, rule: 'earliest' });
  });

  it('PJE-LANE-005: the value domain pads the values and the reference band, and a flat series still has height (#142)', () => {
    const [alt] = buildLabSeries(events(rows), [-14, 183], settings());
    expect(alt.valueDomain[0]).toBeLessThan(7);
    expect(alt.valueDomain[1]).toBeGreaterThan(36);
    const flat = buildLabSeries(
      events([lb({ LBSTRESN: 10, LBSTNRLO: 10, LBSTNRHI: 10 })]),
      [0, 1],
      settings()
    );
    expect(flat[0].valueDomain[0]).toBeLessThan(10);
    expect(flat[0].valueDomain[1]).toBeGreaterThan(10);
  });

  it('PJE-LANE-005: empty input yields no series, and unplaceable-only tests yield a series with no points and no baseline (#142)', () => {
    expect(buildLabSeries([], [0, 1], settings())).toEqual([]);
    expect(buildLabSeries(null, null, settings())).toEqual([]);
    const only = events([lb({ LBTEST: 'Bilirubin', LBTESTCD: 'BILI', LBDY: '' })]);
    const series = buildLabSeries(only, null, settings());
    expect(series).toHaveLength(1);
    expect(series[0].points).toEqual([]);
    expect(series[0].baseline).toBeNull();
    expect(series[0].domain).toBeNull();
  });
});
