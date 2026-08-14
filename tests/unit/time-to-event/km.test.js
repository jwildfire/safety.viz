import { describe, it, expect } from 'vitest';
import { kmEstimate } from '../../../src/time-to-event/km.js';

// The pure Kaplan–Meier estimation module (#128) — the normative implementation of
// design §3 (obot.roadmap requirements/design/161_design.html): product-limit survival,
// Greenwood variance, log-log pointwise 95% CI, and the risk-table numbers, all from
// one pass. Cross-validation against R survival::survfit lives in survfit.test.js;
// these tests pin the arithmetic to hand-computed values.

const obs = (pairs) => pairs.map(([time, event], i) => ({ time, event, id: `P${i + 1}` }));

describe('kmEstimate — tiny exact example', () => {
  // Three participants: event at day 2, censored at day 4, event at day 5.
  //   t=2: n=3, d=1 → S = 2/3.       Greenwood: Var = (2/3)² · 1/(3·2) = 4/54 → SE = √(2/27)
  //   t=4: censored (no step).
  //   t=5: n=1, d=1 → S = 0 (curve reaches zero; band ends).
  const result = kmEstimate(
    obs([
      [2, true],
      [4, false],
      [5, true]
    ])
  );

  it('computes the product-limit survival at each distinct event time (TTE-STAT-002, #128)', () => {
    expect(result.points.map((p) => p.time)).toEqual([2, 5]);
    expect(result.points[0].surv).toBeCloseTo(2 / 3, 12);
    expect(result.points[1].surv).toBeCloseTo(0, 12);
    expect(result.points[0].atRisk).toBe(3);
    expect(result.points[0].events).toBe(1);
    expect(result.points[1].atRisk).toBe(1);
  });

  it('computes the Greenwood standard error (TTE-STAT-003, #128)', () => {
    expect(result.points[0].se).toBeCloseTo(Math.sqrt(2 / 27), 12);
  });

  it('bounds are log-log and absent where the transform is undefined (S = 0) (TTE-STAT-003, #128)', () => {
    // θ = log(−log S), Var[θ] = Var[S]/(S·log S)², CI = S^exp(±1.959964·√Var[θ]).
    const s = 2 / 3;
    const varTheta = 2 / 27 / Math.pow(s * Math.log(s), 2);
    const z = 1.959963984540054;
    const lo = Math.pow(s, Math.exp(z * Math.sqrt(varTheta)));
    const hi = Math.pow(s, Math.exp(-z * Math.sqrt(varTheta)));
    expect(result.points[0].lo).toBeCloseTo(lo, 12);
    expect(result.points[0].hi).toBeCloseTo(hi, 12);
    expect(result.points[1].lo).toBeNull();
    expect(result.points[1].hi).toBeNull();
  });

  it('collects censor marks with the survival level in force (#128)', () => {
    expect(result.censorTimes).toHaveLength(1);
    const [mark] = result.censorTimes;
    expect(mark.time).toBe(4);
    expect(mark.count).toBe(1);
    expect(mark.ids).toEqual(['P2']);
    expect(mark.surv).toBeCloseTo(2 / 3, 12);
  });

  it('reports totals and the largest observed time (#128)', () => {
    expect(result.total).toBe(3);
    expect(result.maxTime).toBe(5);
  });

  it('derives the risk table from the same pass: at-risk means observed time ≥ t (TTE-STAT-005, #128)', () => {
    expect(result.riskTableAt([0, 2, 4, 6])).toEqual([
      { time: 0, atRisk: 3, cumEvents: 0 },
      { time: 2, atRisk: 3, cumEvents: 1 },
      { time: 4, atRisk: 2, cumEvents: 1 },
      { time: 6, atRisk: 0, cumEvents: 2 }
    ]);
  });

  it('retains the event ids at each event time for selection dispatch (#128)', () => {
    expect(result.points[0].ids).toEqual(['P1']);
    expect(result.points[1].ids).toEqual(['P3']);
  });
});

describe('kmEstimate — Freireich 6-MP arm (classic textbook values)', () => {
  // Freireich et al. 1963, 6-MP arm, n=21; the standard worked example.
  // Remission times: 6,6,6,6*,7,9*,10,10*,11*,13,16,17*,19*,20*,22,23,25*,32*,32*,34*,35*
  // (* censored). Published product-limit values:
  //   S(6)=18/21=.857143  S(7)=.806723  S(10)=.752941  S(13)=.690196
  //   S(16)=.627451  S(22)=.537815  S(23)=.448179
  const sixMp = obs([
    [6, true],
    [6, true],
    [6, true],
    [6, false],
    [7, true],
    [9, false],
    [10, true],
    [10, false],
    [11, false],
    [13, true],
    [16, true],
    [17, false],
    [19, false],
    [20, false],
    [22, true],
    [23, true],
    [25, false],
    [32, false],
    [32, false],
    [34, false],
    [35, false]
  ]);
  const result = kmEstimate(sixMp);

  it('reproduces the published survival estimates (TTE-STAT-002, #128)', () => {
    const surv = Object.fromEntries(result.points.map((p) => [p.time, p.surv]));
    expect(surv[6]).toBeCloseTo(0.857143, 6);
    expect(surv[7]).toBeCloseTo(0.806723, 6);
    expect(surv[10]).toBeCloseTo(0.752941, 6);
    expect(surv[13]).toBeCloseTo(0.690196, 6);
    expect(surv[16]).toBeCloseTo(0.627451, 6);
    expect(surv[22]).toBeCloseTo(0.537815, 6);
    expect(surv[23]).toBeCloseTo(0.448179, 6);
  });

  it('processes ties with censorings still at risk at the tied time (TTE-STAT-002, #128)', () => {
    // At t=6: three events and one censoring share the time; all 21 are at risk.
    const p6 = result.points.find((p) => p.time === 6);
    expect(p6.atRisk).toBe(21);
    expect(p6.events).toBe(3);
    // At t=10: the participant censored at 10 is still in the risk set of 15.
    const p10 = result.points.find((p) => p.time === 10);
    expect(p10.atRisk).toBe(15);
  });

  it('reproduces the Greenwood SE at day 13 (TTE-STAT-003, #128)', () => {
    // Var = S(13)² · (3/(21·18) + 1/(17·16) + 1/(15·14) + 1/(12·11))
    //     = 0.690196² · 0.02395064 = 0.01140889 → SE = 0.106815 (texts quote 0.1068).
    const p13 = result.points.find((p) => p.time === 13);
    expect(p13.se).toBeCloseTo(0.106815, 5);
  });

  it('the curve ends flat at the largest censored time (#128)', () => {
    expect(result.maxTime).toBe(35);
    expect(result.points[result.points.length - 1].time).toBe(23);
  });
});

describe('kmEstimate — degenerate inputs', () => {
  it('an all-censored group stays at S = 1 with no confidence band (TTE-STAT-006, #128)', () => {
    const result = kmEstimate(
      obs([
        [3, false],
        [8, false]
      ])
    );
    expect(result.points).toEqual([]);
    expect(result.censorTimes.map((c) => c.time)).toEqual([3, 8]);
    expect(result.total).toBe(2);
    expect(result.riskTableAt([0, 5, 10])).toEqual([
      { time: 0, atRisk: 2, cumEvents: 0 },
      { time: 5, atRisk: 1, cumEvents: 0 },
      { time: 10, atRisk: 0, cumEvents: 0 }
    ]);
  });

  it('an empty group returns an empty estimate rather than throwing (#128)', () => {
    const result = kmEstimate([]);
    expect(result.points).toEqual([]);
    expect(result.censorTimes).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.maxTime).toBe(0);
  });

  it('the band gaps from the point where the risk set is exhausted mid-curve (TTE-STAT-003, #128)', () => {
    // Two participants, both events at distinct times: at the second event nⱼ = dⱼ
    // exhausts the risk set (S = 0) — no bound is drawn there.
    const result = kmEstimate(
      obs([
        [1, true],
        [2, true]
      ])
    );
    expect(result.points[0].lo).not.toBeNull();
    expect(result.points[1].lo).toBeNull();
  });
});
