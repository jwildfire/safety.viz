import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/hep-explorer/configure.js';
import { cleanData, deriveBaseline } from '../../../src/hep-explorer/structureData.js';
import {
  COMPOSITE_QUADRANTS,
  QUADRANT_STYLE,
  CONCERN_COLORS,
  ALT_ULN_CUT,
  BILI_ULN_CUT,
  BLN_LINES,
  classifyComposite,
  buildCompositeSubjects,
  migrationMatrix,
  concernOf,
  byArmSummary
} from '../../../src/hep-explorer/composite.js';

// Composite plot (issue #67, HEP-COMP-*): faithful port of the FDA
// Composite-eDISH-Plot algorithm (Composite_eDISH_Model.R) — Tesfaldet et al.,
// Drug Safety 2024;47:699-710. Strict thresholds (ALT > 3xULN, BILI > 2xULN),
// peak taken over ON-TREATMENT records only (non-concurrent per analyte), and
// xBLN = peak on-treatment / the subject's OWN baseline.

const NN = 'Normal & NN';
const CH = 'Cholestasis';
const TC = "Temple's Corollary";
const HL = "Hy's Law";

const settings = syncSettings({ groups: ['ARM'] });
const M = settings.measure_values;

// One long-format lab record (ULNs: ALT 40, TB 1 — so xULN math is trivial).
const row = (id, key, day, value, uln, extra = {}) => ({
  USUBJID: id,
  TEST: M[key],
  STRESN: value,
  STNRHI: uln,
  DY: day,
  ...extra
});

// Hand-computed fixture. Baseline = day 0; on-treatment = day > 0. ULN(ALT)=40,
// ULN(TB)=1. Elevation: ALT xULN > 3 (value > 120); BILI xULN > 2 (value > 2).
//
// S1 Drug   Normal&NN -> Hy's Law            (RED)    non-concurrent peaks
//   base ALT 40 (1.0x), TB 1 (1.0x); peak ALT 200 (5.0x d10), TB 3 (3.0x d20)
//   xBLN: ALT 200/40 = 5.0, TB 3/1 = 3.0
// S2 Placebo Hy's Law -> Normal & NN         (GREEN)  peak must exclude baseline
//   base ALT 160 (4.0x), TB 3 (3.0x); peak ALT 80 (2.0x), TB 1.5 (1.5x)
//   xBLN: ALT 80/160 = 0.5, TB 1.5/3 = 0.5
// S3 Drug   Cholestasis -> Temple's Corollary (YELLOW)
//   base ALT 80 (2.0x), TB 4 (4.0x); peak ALT 200 (5.0x), TB 1.5 (1.5x)
//   xBLN: ALT 200/80 = 2.5, TB 1.5/4 = 0.375
// S4 Placebo Temple's -> Temple's            (GRAY, diagonal) TB peak exactly 2xULN
//   base ALT 160 (4.0x), TB 1 (1.0x); peak ALT 240 (6.0x), TB 2 (2.0x -> NOT elevated)
//   xBLN: ALT 240/160 = 1.5, TB 2/1 = 2.0
// S5 Drug   Normal&NN -> Temple's Corollary  (RED)    baseline ALT EXACTLY 3xULN
//   base ALT 120 (3.0x -> NOT elevated), TB 1 (1.0x); peak ALT 200 (5.0x), TB 1 (1.0x)
//   xBLN: ALT 200/120 = 1.6667, TB 1/1 = 1.0
// S6 Drug   excluded: no on-treatment TB record (baseline TB only)
//   base ALT 40, TB 1; peak ALT 200 on-treatment; NO on-treatment TB
const raw = [
  // S1
  row('S1', 'ALT', 0, 40, 40, { ARM: 'Drug' }),
  row('S1', 'ALT', 10, 200, 40, { ARM: 'Drug' }),
  row('S1', 'ALT', 20, 100, 40, { ARM: 'Drug' }),
  row('S1', 'TB', 0, 1, 1, { ARM: 'Drug' }),
  row('S1', 'TB', 10, 1, 1, { ARM: 'Drug' }),
  row('S1', 'TB', 20, 3, 1, { ARM: 'Drug' }),
  // S2
  row('S2', 'ALT', 0, 160, 40, { ARM: 'Placebo' }),
  row('S2', 'ALT', 10, 80, 40, { ARM: 'Placebo' }),
  row('S2', 'TB', 0, 3, 1, { ARM: 'Placebo' }),
  row('S2', 'TB', 10, 1.5, 1, { ARM: 'Placebo' }),
  // S3
  row('S3', 'ALT', 0, 80, 40, { ARM: 'Drug' }),
  row('S3', 'ALT', 10, 200, 40, { ARM: 'Drug' }),
  row('S3', 'TB', 0, 4, 1, { ARM: 'Drug' }),
  row('S3', 'TB', 10, 1.5, 1, { ARM: 'Drug' }),
  // S4
  row('S4', 'ALT', 0, 160, 40, { ARM: 'Placebo' }),
  row('S4', 'ALT', 10, 240, 40, { ARM: 'Placebo' }),
  row('S4', 'TB', 0, 1, 1, { ARM: 'Placebo' }),
  row('S4', 'TB', 10, 2, 1, { ARM: 'Placebo' }),
  // S5
  row('S5', 'ALT', 0, 120, 40, { ARM: 'Drug' }),
  row('S5', 'ALT', 10, 200, 40, { ARM: 'Drug' }),
  row('S5', 'TB', 0, 1, 1, { ARM: 'Drug' }),
  row('S5', 'TB', 10, 1, 1, { ARM: 'Drug' }),
  // S6 (excluded: no on-treatment TB)
  row('S6', 'ALT', 0, 40, 40, { ARM: 'Drug' }),
  row('S6', 'ALT', 10, 200, 40, { ARM: 'Drug' }),
  row('S6', 'TB', 0, 1, 1, { ARM: 'Drug' })
];

const prepared = deriveBaseline(cleanData(raw, settings).rows, settings);
const built = buildCompositeSubjects(prepared, settings);
const byId = Object.fromEntries(built.subjects.map((s) => [s.id, s]));

describe('hep-explorer composite — constants', () => {
  it('HEP-COMP-001: quadrant order and thresholds match the FDA reference', () => {
    expect(COMPOSITE_QUADRANTS).toEqual([NN, CH, TC, HL]);
    expect(ALT_ULN_CUT).toBe(3);
    expect(BILI_ULN_CUT).toBe(2);
    expect(BLN_LINES).toEqual([1, 3, 5]);
    // Every quadrant has a color + point style; every concern level a fill.
    COMPOSITE_QUADRANTS.forEach((q) => {
      expect(QUADRANT_STYLE[q].color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(typeof QUADRANT_STYLE[q].pointStyle).toBe('string');
    });
    ['red', 'yellow', 'green', 'gray'].forEach((c) => {
      expect(CONCERN_COLORS[c]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe('hep-explorer composite — classifyComposite (strict thresholds)', () => {
  it('HEP-COMP-001: classifies the four quadrants by ALT>3 / BILI>2 xULN', () => {
    expect(classifyComposite(1, 1)).toBe(NN);
    expect(classifyComposite(2, 4)).toBe(CH);
    expect(classifyComposite(5, 3)).toBe(HL);
    expect(classifyComposite(6, 1)).toBe(TC);
  });

  it('HEP-COMP-001: the threshold value itself is on the NORMAL side (strict >)', () => {
    // Exactly 3xULN ALT is NOT elevated; exactly 2xULN BILI is NOT elevated.
    expect(classifyComposite(3, 2)).toBe(NN);
    expect(classifyComposite(3, 1)).toBe(NN);
    expect(classifyComposite(4, 2)).toBe(TC);
    expect(classifyComposite(2, 2)).toBe(NN);
    expect(classifyComposite(2, 2.0001)).toBe(CH);
    expect(classifyComposite(3.0001, 2)).toBe(TC);
  });
});

describe('hep-explorer composite — buildCompositeSubjects', () => {
  it('HEP-COMP-001/002: derives baseline & on-treatment-peak xULN and quadrants', () => {
    expect(byId.S1.baselineAltULN).toBeCloseTo(1.0, 10);
    expect(byId.S1.baselineBiliULN).toBeCloseTo(1.0, 10);
    expect(byId.S1.peakAltULN).toBeCloseTo(5.0, 10);
    expect(byId.S1.peakBiliULN).toBeCloseTo(3.0, 10);
    expect(byId.S1.pretreatQuadrant).toBe(NN);
    expect(byId.S1.onTreatQuadrant).toBe(HL);
  });

  it('HEP-COMP-002: peak is the ON-TREATMENT max, excluding the baseline record', () => {
    // S2 baseline ALT is 4.0xULN but the on-treatment max is only 2.0xULN.
    expect(byId.S2.baselineAltULN).toBeCloseTo(4.0, 10);
    expect(byId.S2.peakAltULN).toBeCloseTo(2.0, 10);
    expect(byId.S2.pretreatQuadrant).toBe(HL);
    expect(byId.S2.onTreatQuadrant).toBe(NN);
  });

  it('HEP-COMP-003: xBLN = peak on-treatment / the subject own baseline', () => {
    expect(byId.S1.peakAltBLN).toBeCloseTo(5.0, 10);
    expect(byId.S1.peakBiliBLN).toBeCloseTo(3.0, 10);
    expect(byId.S2.peakAltBLN).toBeCloseTo(0.5, 10);
    expect(byId.S2.peakBiliBLN).toBeCloseTo(0.5, 10);
    expect(byId.S3.peakAltBLN).toBeCloseTo(2.5, 10);
    expect(byId.S3.peakBiliBLN).toBeCloseTo(0.375, 10);
  });

  it('HEP-COMP-001: baseline ALT exactly 3xULN classifies as Normal & NN (S5)', () => {
    expect(byId.S5.baselineAltULN).toBeCloseTo(3.0, 10);
    expect(byId.S5.pretreatQuadrant).toBe(NN);
    expect(byId.S5.onTreatQuadrant).toBe(TC);
  });

  it('HEP-COMP-002: on-treatment BILI exactly 2xULN is NOT elevated (S4 diagonal)', () => {
    expect(byId.S4.peakBiliULN).toBeCloseTo(2.0, 10);
    expect(byId.S4.pretreatQuadrant).toBe(TC);
    expect(byId.S4.onTreatQuadrant).toBe(TC);
  });

  it('HEP-COMP-006: excludes subjects lacking an on-treatment ALT/BILI peak', () => {
    expect(byId.S6).toBeUndefined();
    expect(built.excluded).toBe(1);
    expect(built.subjects).toHaveLength(5);
  });

  it('HEP-COMP-005: carries group/arm meta for the by-arm summary', () => {
    expect(byId.S1.raw.ARM).toBe('Drug');
    expect(byId.S2.raw.ARM).toBe('Placebo');
  });
});

describe('hep-explorer composite — peak is on-treatment only (FDA AVISITN>0)', () => {
  // Screening (negative day) and duplicate baseline (day 0) records must NOT be
  // eligible as the on-treatment peak — the FDA reference takes the peak over
  // AVISITN > 0 only.
  const edgeRaw = [
    // SCR: a screening ALT at day -7 = 5xULN must be ignored; on-treatment peak
    // is day 14 = 2xULN. Baseline (day 0) = 1xULN.
    row('SCR', 'ALT', -7, 200, 40),
    row('SCR', 'ALT', 0, 40, 40),
    row('SCR', 'ALT', 14, 80, 40),
    row('SCR', 'TB', 0, 1, 1),
    row('SCR', 'TB', 14, 1, 1),
    // DUP0: a second day-0 ALT record = 5xULN must not be treated as a peak;
    // on-treatment peak is day 14 = 2xULN.
    row('DUP0', 'ALT', 0, 40, 40),
    row('DUP0', 'ALT', 0, 200, 40),
    row('DUP0', 'ALT', 14, 80, 40),
    row('DUP0', 'TB', 0, 1, 1),
    row('DUP0', 'TB', 14, 1, 1)
  ];
  const edge = buildCompositeSubjects(
    deriveBaseline(cleanData(edgeRaw, settings).rows, settings),
    settings
  );
  const byIdEdge = Object.fromEntries(edge.subjects.map((s) => [s.id, s]));

  it('HEP-COMP-002: a screening (negative study-day) record is excluded from the peak', () => {
    expect(byIdEdge.SCR.peakAltULN).toBeCloseTo(2.0, 10);
    expect(byIdEdge.SCR.onTreatQuadrant).toBe(NN);
  });

  it('HEP-COMP-002: a duplicate day-0 record is not treated as on-treatment', () => {
    expect(byIdEdge.DUP0.peakAltULN).toBeCloseTo(2.0, 10);
    expect(byIdEdge.DUP0.onTreatQuadrant).toBe(NN);
  });
});

describe('hep-explorer composite — xBLN is an independent peak (varying ULN)', () => {
  // When ULN varies across a subject's on-treatment visits, peak ×ULN and peak
  // ×BLN can come from different visits; the FDA reference takes each as an
  // independent max. ALT baseline 40 (ULN 40) = 1×ULN.
  //   day 10: AVAL 300, ULN 100 -> 3.0×ULN, 7.5×BLN
  //   day 20: AVAL 200, ULN  40 -> 5.0×ULN, 5.0×BLN
  const vary = buildCompositeSubjects(
    deriveBaseline(
      cleanData(
        [
          row('V1', 'ALT', 0, 40, 40),
          row('V1', 'ALT', 10, 300, 100),
          row('V1', 'ALT', 20, 200, 40),
          row('V1', 'TB', 0, 1, 1),
          row('V1', 'TB', 10, 1, 1)
        ],
        settings
      ).rows,
      settings
    ),
    settings
  );
  const v1 = vary.subjects.find((s) => s.id === 'V1');

  it('HEP-COMP-003: peak ×ULN and peak ×BLN are independent maxima', () => {
    expect(v1.peakAltULN).toBeCloseTo(5.0, 10); // day 20
    expect(v1.peakAltBLN).toBeCloseTo(7.5, 10); // day 10, the independent xBLN max
  });
});

describe('hep-explorer composite — concernOf (4x4 matrix)', () => {
  it('HEP-COMP-004: diagonal is gray (no migration)', () => {
    COMPOSITE_QUADRANTS.forEach((q) => expect(concernOf(q, q)).toBe('gray'));
  });

  it('HEP-COMP-004: worsening migrations are red', () => {
    expect(concernOf(NN, CH)).toBe('red');
    expect(concernOf(NN, TC)).toBe('red');
    expect(concernOf(NN, HL)).toBe('red');
    expect(concernOf(CH, HL)).toBe('red');
    expect(concernOf(TC, HL)).toBe('red');
  });

  it('HEP-COMP-004: lateral single-analyte migrations are yellow', () => {
    expect(concernOf(CH, TC)).toBe('yellow');
    expect(concernOf(TC, CH)).toBe('yellow');
  });

  it('HEP-COMP-004: improvement toward Normal / partial resolution is green', () => {
    expect(concernOf(CH, NN)).toBe('green');
    expect(concernOf(TC, NN)).toBe('green');
    expect(concernOf(HL, NN)).toBe('green');
    expect(concernOf(HL, CH)).toBe('green');
    expect(concernOf(HL, TC)).toBe('green');
  });

  it('HEP-COMP-004: the full matrix has 5 red, 2 yellow, 5 green, 4 gray', () => {
    const tally = { red: 0, yellow: 0, green: 0, gray: 0 };
    COMPOSITE_QUADRANTS.forEach((pre) =>
      COMPOSITE_QUADRANTS.forEach((post) => {
        tally[concernOf(pre, post)] += 1;
      })
    );
    expect(tally).toEqual({ red: 5, yellow: 2, green: 5, gray: 4 });
  });
});

describe('hep-explorer composite — migrationMatrix', () => {
  const matrix = migrationMatrix(built.subjects);

  it('HEP-COMP-004: counts pretreatment x on-treatment migrations', () => {
    expect(matrix.counts[NN][HL]).toBe(1); // S1
    expect(matrix.counts[NN][TC]).toBe(1); // S5
    expect(matrix.counts[HL][NN]).toBe(1); // S2
    expect(matrix.counts[CH][TC]).toBe(1); // S3
    expect(matrix.counts[TC][TC]).toBe(1); // S4
    expect(matrix.counts[NN][NN]).toBe(0);
  });

  it('HEP-COMP-004: row totals, column totals, and grand total', () => {
    expect(matrix.rowTotals[NN]).toBe(2);
    expect(matrix.rowTotals[CH]).toBe(1);
    expect(matrix.rowTotals[TC]).toBe(1);
    expect(matrix.rowTotals[HL]).toBe(1);
    expect(matrix.colTotals[NN]).toBe(1);
    expect(matrix.colTotals[CH]).toBe(0);
    expect(matrix.colTotals[TC]).toBe(3);
    expect(matrix.colTotals[HL]).toBe(1);
    expect(matrix.total).toBe(5);
  });
});

describe('hep-explorer composite — byArmSummary', () => {
  it('HEP-COMP-005: buckets migrations by concern color per arm', () => {
    const rows = byArmSummary(built.subjects, 'ARM');
    const drug = rows.find((r) => r.arm === 'Drug');
    const placebo = rows.find((r) => r.arm === 'Placebo');
    // Drug: S1 red, S3 yellow, S5 red.
    expect(drug).toMatchObject({ red: 2, yellow: 1, green: 0, gray: 0, total: 3 });
    // Placebo: S2 green, S4 gray.
    expect(placebo).toMatchObject({ red: 0, yellow: 0, green: 1, gray: 1, total: 2 });
  });

  it('HEP-COMP-005: with no arm column, summarizes all subjects as one row', () => {
    const rows = byArmSummary(built.subjects, null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ arm: 'All', red: 2, yellow: 1, green: 1, gray: 1, total: 5 });
  });
});
