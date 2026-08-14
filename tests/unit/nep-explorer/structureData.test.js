import { describe, it, expect } from 'vitest';
import { syncSettings, UMOL_PER_MGDL } from '../../../src/nep-explorer/configure.js';
import {
  applyFilters,
  combinedStage,
  deltaStage,
  foldStage,
  resolveBaseline,
  stageSummary,
  structureData
} from '../../../src/nep-explorer/structureData.js';

// The KDIGO reduction (#120): records to one staged participant per point.
// Requirement groups: NEP-DATA-* (baseline resolution, maxima, dropped records),
// NEP-STAGE-* (the ladders and the >= 4.0 mg/dL rule), NEP-UNIT-002/003 (the
// per-record conversion and the refuse-to-guess path), NEP-TBL-* (the summary).

const SETTINGS = syncSettings({});

const mg = (value) => value * UMOL_PER_MGDL;

/** One creatinine record, in µmol/L unless a unit is given. */
function record(id, visitn, mgdl, extra = {}) {
  return {
    USUBJID: id,
    TEST: 'Creatinine',
    STRESN: Math.round(mg(mgdl) * 100) / 100,
    STRESU: 'umol/L',
    VISIT: visitn === 0 ? 'Baseline' : `Week ${visitn}`,
    VISITNUM: visitn,
    ARM: 'Study Drug',
    ...extra
  };
}

/** A participant's whole series, baseline first. */
function series(id, values, extra = {}) {
  return values.map((mgdl, index) => record(id, index === 0 ? 0 : index * 2, mgdl, extra));
}

describe('nep-explorer staging', () => {
  it('NEP-STAGE-001: the fold ladder stages at 1.5 / 2 / 3, worst match first (#120)', () => {
    const cuts = [1.5, 2, 3];
    expect(foldStage(1.49, cuts)).toBe(0);
    expect(foldStage(1.5, cuts)).toBe(1);
    expect(foldStage(1.99, cuts)).toBe(1);
    expect(foldStage(2, cuts)).toBe(2);
    expect(foldStage(2.99, cuts)).toBe(2);
    expect(foldStage(3, cuts)).toBe(3);
    expect(foldStage(12, cuts)).toBe(3);
    // A participant whose creatinine only fell is Stage 0, not unstaged.
    expect(foldStage(0.7, cuts)).toBe(0);
    expect(foldStage(NaN, cuts)).toBe(null);
  });

  it('NEP-STAGE-001: the ladder is read worst-first, so an ascending source ordering cannot hide Stages 2 and 3 (#120)', () => {
    // This is the defect the port exists to avoid. The R source writes
    //   case_when(DELTA_C > .3 ~ "Stage 1", > 1.5 ~ "Stage 2", > 2.5 ~ "Stage 3")
    // and case_when returns the FIRST match, so its Stage 2 and Stage 3 arms are
    // unreachable — every value above the lowest cut is labelled Stage 1. Read
    // worst-first, the same three numbers stage correctly.
    const cuts = [0.3, 1.5, 2.5];
    expect(foldStage(2.0, cuts)).toBe(2);
    expect(foldStage(3.0, cuts)).toBe(3);
    expect(foldStage(0.4, cuts)).toBe(1);
  });

  it('NEP-STAGE-002: the absolute-change axis carries one cut-point and produces Stage 1 only (#120)', () => {
    // KDIGO defines no Stage 2 or Stage 3 on absolute CHANGE (design §3.1).
    expect(deltaStage(0.29, 0.3)).toBe(0);
    expect(deltaStage(0.3, 0.3)).toBe(1);
    expect(deltaStage(9, 0.3)).toBe(1);
    expect(deltaStage(-0.4, 0.3)).toBe(0);
    // Suppressed: the unit is unknown, so no absolute claim can be made.
    expect(deltaStage(null, 0.3)).toBe(null);
    expect(deltaStage(NaN, 0.3)).toBe(null);
  });

  it('NEP-STAGE-004: the combined stage is the worse of the two axes (#120)', () => {
    expect(combinedStage(0, 0, false)).toBe(0);
    expect(combinedStage(0, 1, false)).toBe(1);
    expect(combinedStage(1, 0, false)).toBe(1);
    expect(combinedStage(2, 1, false)).toBe(2);
    expect(combinedStage(3, 1, false)).toBe(3);
    // A suppressed delta stage cannot lower the fold stage.
    expect(combinedStage(2, null, false)).toBe(2);
  });

  it('NEP-STAGE-003: the >= 4.0 mg/dL rule raises the stage to 3 whatever the fold change says (#120)', () => {
    // D5: the rule is about the VALUE reached, not a change, so it is not a
    // region of the (fold, delta) plane at all — it rides on the mark.
    expect(combinedStage(1, 1, true)).toBe(3);
    expect(combinedStage(0, 0, true)).toBe(3);
  });
});

describe('nep-explorer baseline resolution', () => {
  const rows = [
    { VISITNUM: 8, DY: 56, ABLFL: '' },
    { VISITNUM: 0, DY: 1, ABLFL: 'Y' },
    { VISITNUM: 4, DY: 28, ABLFL: '' }
  ];

  it('NEP-DATA-001: an explicit baseline flag outranks record order (#120)', () => {
    const settings = syncSettings({ baseline_col: 'ABLFL', baseline_value: 'Y' });
    const resolved = resolveBaseline(rows, settings);
    expect(resolved.record.VISITNUM).toBe(0);
    expect(resolved.fallback).toBe(false);
  });

  it('NEP-DATA-002: with no flag configured the earliest record is the baseline, and the fallback is counted (#120)', () => {
    // D7: study day first, then visit number, then input order. Counting the
    // fallback keeps the number visible rather than assumed — and it is the path
    // the demo actually takes, since adbds.csv ships no baseline flag.
    const resolved = resolveBaseline(rows, syncSettings({ studyday_col: 'DY' }));
    expect(resolved.record.DY).toBe(1);
    expect(resolved.fallback).toBe(true);
  });

  it('NEP-DATA-002: a configured flag that no record carries still falls back rather than dropping the participant (#120)', () => {
    const settings = syncSettings({ baseline_col: 'ABLFL', baseline_value: 'BASELINE' });
    const resolved = resolveBaseline(rows, settings);
    expect(resolved.record.VISITNUM).toBe(0);
    expect(resolved.fallback).toBe(true);
  });

  it('NEP-DATA-002: without a study-day column the fallback orders on visit number (#120)', () => {
    const noDay = [{ VISITNUM: 9 }, { VISITNUM: 2 }, { VISITNUM: 5 }];
    const resolved = resolveBaseline(noDay, syncSettings({ studyday_col: null }));
    expect(resolved.record.VISITNUM).toBe(2);
  });

  it('NEP-DATA-002: with neither column the fallback keeps input order (#120)', () => {
    const bare = [{ id: 'first' }, { id: 'second' }];
    const resolved = resolveBaseline(bare, syncSettings({ studyday_col: null, visitn_col: null }));
    expect(resolved.record.id).toBe('first');
  });
});

describe('nep-explorer structureData', () => {
  it('NEP-DATA-003: reduces each participant to one staged point at their maximum post-baseline value (#120)', () => {
    // The maximum is taken over the POST-baseline series; the baseline record
    // itself can never be the maximum.
    const data = [...series('P1', [1.0, 1.2, 2.4, 1.6]), ...series('P2', [0.8, 0.85, 0.9, 0.86])];
    const { points } = structureData(data, SETTINGS);
    expect(points).toHaveLength(2);
    const p1 = points.find((point) => point.id === 'P1');
    expect(p1.baseline).toBeCloseTo(1.0, 6);
    expect(p1.max).toBeCloseTo(2.4, 6);
    expect(p1.fold).toBeCloseTo(2.4, 6);
    expect(p1.delta).toBeCloseTo(1.4, 6);
    expect(p1.maxVisit).toBe('Week 4');
    expect(p1.foldStage).toBe(2);
    expect(p1.deltaStage).toBe(1);
    expect(p1.stage).toBe(2);
    expect(p1.absoluteRule).toBe(false);

    const p2 = points.find((point) => point.id === 'P2');
    expect(p2.fold).toBeCloseTo(1.125, 6);
    expect(p2.stage).toBe(0);
  });

  it('NEP-UNIT-002: values convert to mg/dL per record, so one participant may mix known units (#120)', () => {
    // Mixed units within one measure are not hypothetical: the demo BDS file
    // carries bilirubin in BOTH mg/dL (256 records) and µmol/L (1654). A
    // per-DATASET shortcut would pass review here and fail on a real study.
    const data = [
      record('MIX', 0, 1.0),
      { ...record('MIX', 4, 0), STRESN: 2.5, STRESU: 'mg/dL' },
      { ...record('MIX', 8, 0), STRESN: 265.2, STRESU: 'μmol/L' } // U+03BC = 3.0 mg/dL
    ];
    const { points, unitsResolved } = structureData(data, SETTINGS);
    expect(unitsResolved).toBe(true);
    expect(points[0].baseline).toBeCloseTo(1.0, 6);
    expect(points[0].max).toBeCloseTo(3.0, 6);
    expect(points[0].fold).toBeCloseTo(3.0, 6);
    expect(points[0].delta).toBeCloseTo(2.0, 6);
    expect(points[0].unit).toBe('mg/dL');
  });

  it('NEP-UNIT-003: an unrecognized unit suppresses the absolute claims and keeps the fold axis (#120)', () => {
    // Design §4: a wrong staging is worse than an incomplete one. The fold axis
    // is a ratio and stays valid; the delta staging, the delta cut-line and the
    // >= 4.0 mg/dL rule are all absolute claims and go.
    //
    // This branch CANNOT be reached from the demo, whose units are all known —
    // which is exactly the kind of branch that ships untested.
    const data = series('U1', [1.0, 3.5]).map((row) => ({ ...row, STRESU: 'arb. units' }));
    const { points, unitsResolved, nativeUnit } = structureData(data, SETTINGS);
    expect(unitsResolved).toBe(false);
    expect(nativeUnit).toBe('arb. units');
    const point = points[0];
    // Fold is still exact — it is the ratio of two same-unit values.
    expect(point.fold).toBeCloseTo(3.5, 6);
    expect(point.foldStage).toBe(3);
    // Every absolute claim is withheld.
    expect(point.deltaStage).toBe(null);
    expect(point.absoluteRule).toBe(false);
    expect(point.unit).toBe('arb. units');
    // The delta is still plotted, in the native unit, so the cloud keeps its
    // shape; it just carries no staging.
    expect(point.delta).toBeCloseTo(mg(2.5), 4);
    expect(point.stage).toBe(3);
  });

  it('NEP-UNIT-003: a record with no unit at all also suppresses, rather than assuming mg/dL (#120)', () => {
    const data = series('U2', [1.0, 1.8]).map((row) => ({ ...row, STRESU: '' }));
    const { unitsResolved, points } = structureData(data, SETTINGS);
    expect(unitsResolved).toBe(false);
    expect(points[0].deltaStage).toBe(null);
  });

  it('NEP-UNIT-003: one unrecognized record suppresses for the whole chart, and mixed native units drop (#120)', () => {
    // Suppression is a display decision, so it is chart-wide: an axis cannot be
    // labelled mg/dL for some points and not others. Within that mode a
    // participant whose own records disagree has no computable fold change and
    // is dropped with a reason rather than plotted on a guess.
    const data = [
      ...series('KNOWN', [1.0, 1.6]),
      ...series('ODD', [1.0, 2.0]).map((row) => ({ ...row, STRESU: 'arb. units' })),
      record('MIXED', 0, 1.0),
      { ...record('MIXED', 4, 0), STRESN: 2.0, STRESU: 'arb. units' }
    ];
    const { points, unitsResolved, droppedParticipants } = structureData(data, SETTINGS);
    expect(unitsResolved).toBe(false);
    expect(points.map((point) => point.id).sort()).toEqual(['KNOWN', 'ODD']);
    expect(droppedParticipants).toEqual([
      { id: 'MIXED', reason: 'Records use more than one unit and cannot be compared' }
    ]);
  });

  it('NEP-STAGE-003: a participant reaching the absolute rule is Stage 3 on a Stage-1 fold change (#120)', () => {
    // The chronic-kidney-disease case the synthetic cohort carries: a modest
    // proportional rise from a high baseline that still reaches 4.0 mg/dL.
    const data = series('CKD', [2.7, 3.1, 4.4, 4.0]);
    const { points } = structureData(data, SETTINGS);
    const point = points[0];
    expect(point.foldStage).toBe(1);
    expect(point.absoluteRule).toBe(true);
    expect(point.stage).toBe(3);
  });

  it('NEP-DATA-004: a participant whose creatinine only falls keeps a negative delta and is plotted (#120)', () => {
    // D6: the R source's scale_y_continuous(limits = c(0, max)) drops these —
    // 21 of 110 in the RhoInc data, unannounced.
    const data = series('DOWN', [2.6, 2.3, 1.9, 2.1]);
    const { points, droppedParticipants } = structureData(data, SETTINGS);
    expect(droppedParticipants).toEqual([]);
    expect(points[0].delta).toBeLessThan(0);
    expect(points[0].fold).toBeLessThan(1);
    expect(points[0].stage).toBe(0);
  });

  it('NEP-DATA-005: unusable records and participants are counted and exportable, never silently dropped (#120)', () => {
    const data = [
      ...series('OK', [1.0, 1.7]),
      { ...record('BAD', 0, 1.0), STRESN: '' },
      { ...record('BAD', 4, 0), STRESN: 'NA' },
      ...series('ONLYBASE', [1.0]),
      {
        USUBJID: 'OTHER',
        TEST: 'Sodium',
        STRESN: 140,
        STRESU: 'mmol/L',
        VISIT: 'Baseline',
        VISITNUM: 0
      }
    ];
    const { points, droppedRows, droppedParticipants } = structureData(data, SETTINGS);
    expect(points.map((point) => point.id)).toEqual(['OK']);
    // Non-numeric creatinine results leave as ROWS, with their reason attached.
    expect(droppedRows).toHaveLength(2);
    expect(droppedRows.every((row) => /non-numeric/i.test(row.__nep_dropReason))).toBe(true);
    // The row's own columns survive the export; the module's working does not.
    expect(droppedRows[0].USUBJID).toBe('BAD');
    expect(Object.keys(droppedRows[0]).filter((key) => key.startsWith('__nep_'))).toEqual([
      '__nep_dropReason'
    ]);
    // Participants leave as PARTICIPANTS, which is a different count.
    expect(droppedParticipants).toEqual([
      { id: 'BAD', reason: 'No usable creatinine result' },
      { id: 'ONLYBASE', reason: 'No post-baseline creatinine record' }
    ]);
    // A participant with no creatinine at all is not in this chart's population
    // and is not reported as a drop.
    expect(droppedParticipants.some((entry) => entry.id === 'OTHER')).toBe(false);
  });

  it('NEP-DATA-002: the count of participants resolved by the baseline fallback is reported (#120)', () => {
    const data = [...series('A', [1.0, 1.5]), ...series('B', [1.0, 1.5])];
    const flagged = data.map((row) => ({ ...row, ABLFL: row.VISITNUM === 0 ? 'Y' : '' }));
    expect(structureData(data, SETTINGS).baselineFallbacks).toBe(2);
    expect(structureData(flagged, syncSettings({ baseline_col: 'ABLFL' })).baselineFallbacks).toBe(
      0
    );
  });

  it('NEP-SCAT-003: the point carries the visit and study day its maximum came from (#120)', () => {
    const withDay = series('D1', [1.0, 1.4, 2.2]).map((row, index) => ({
      ...row,
      DY: [1, 15, 29][index]
    }));
    const { points } = structureData(withDay, syncSettings({ studyday_col: 'DY' }));
    expect(points[0].maxVisit).toBe('Week 4');
    expect(points[0].maxDay).toBe(29);
    expect(points[0].baselineVisit).toBe('Baseline');
    // adbds.csv has no study-day column, so the tooltip line degrades rather
    // than rendering an empty value.
    const { points: noDay } = structureData(series('D2', [1.0, 2.2]), SETTINGS);
    expect(noDay[0].maxDay).toBe(null);
  });

  it('NEP-CFG-003: custom stage cut-points restage the same data (#120)', () => {
    const data = series('C1', [1.0, 1.7]);
    expect(structureData(data, SETTINGS).points[0].foldStage).toBe(1);
    // The source's own rectangles, restored by setting three numbers.
    const restaged = structureData(data, syncSettings({ stages: { fold: [2, 3, 4] } }));
    expect(restaged.points[0].foldStage).toBe(0);
  });

  it('NEP-TBL-001: the summary reports N and % for the fold, delta and combined stagings (#120)', () => {
    // The R app's table is two marginal distributions sharing a stage row
    // label, not a cross-tab; the port keeps that shape and adds the combined
    // stage, which is the column a reviewer reads off the chart (design §6.4).
    const points = [
      { foldStage: 0, deltaStage: 0, stage: 0 },
      { foldStage: 0, deltaStage: 1, stage: 1 },
      { foldStage: 1, deltaStage: 0, stage: 1 },
      { foldStage: 2, deltaStage: 1, stage: 2 },
      { foldStage: 1, deltaStage: 1, stage: 3, absoluteRule: true }
    ];
    const summary = stageSummary(points);
    expect(summary.total).toBe(5);
    expect(summary.rows.map((row) => row.fold.n)).toEqual([2, 2, 1, 0]);
    expect(summary.rows.map((row) => row.delta.n)).toEqual([2, 3, null, null]);
    expect(summary.rows.map((row) => row.combined.n)).toEqual([1, 2, 1, 1]);
    expect(summary.rows[0].fold.percent).toBeCloseTo(40, 6);
    expect(summary.rows[1].combined.percent).toBeCloseTo(40, 6);
    // Stages 2 and 3 do not EXIST on the absolute-change axis, so those cells
    // are null rather than a zero that would read as "nobody qualified".
    expect(summary.rows[2].delta.percent).toBe(null);
  });

  it('NEP-TBL-002: every stage row is present even when empty (#120)', () => {
    const summary = stageSummary([{ foldStage: 0, deltaStage: 0, stage: 0 }]);
    expect(summary.rows.map((row) => row.stage)).toEqual([0, 1, 2, 3]);
    expect(summary.rows[3].combined.n).toBe(0);
    expect(summary.rows[3].combined.percent).toBe(0);
  });

  it('NEP-TBL-003: an empty population summarizes to zeroes rather than dividing by zero (#120)', () => {
    const summary = stageSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.rows[0].fold.percent).toBe(0);
  });

  it('NEP-CFG-006: filters constrain the plotted population on the active selections only (#120)', () => {
    const points = [
      { id: 'A', meta: { SEX: 'F', ARM: 'Drug' } },
      { id: 'B', meta: { SEX: 'M', ARM: 'Drug' } },
      { id: 'C', meta: { SEX: 'F', ARM: 'Placebo' } }
    ];
    expect(applyFilters(points, {}).map((point) => point.id)).toEqual(['A', 'B', 'C']);
    expect(applyFilters(points, { SEX: 'F' }).map((point) => point.id)).toEqual(['A', 'C']);
    expect(applyFilters(points, { SEX: 'F', ARM: 'Drug' }).map((point) => point.id)).toEqual(['A']);
    expect(applyFilters(points, { SEX: null }).map((point) => point.id)).toEqual(['A', 'B', 'C']);
  });
});
