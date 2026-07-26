import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { syncSettings } from '../../../src/hep-explorer/configure.js';
import {
  cleanData,
  deriveBaseline,
  resolveMeasureRows
} from '../../../src/hep-explorer/structureData.js';
import {
  buildCompositeSubjects,
  buildHepSubjects,
  reduceMeasure,
  splitBaselineOnTreatment
} from '../../../src/hep-core/subjects.js';
import { boxStats } from '../../../src/hep-core/stats.js';

// THE single per-subject hepatic reduction shared by the composite view
// (Amirzadegan 2025 Fig 4), the migration Sankey (Fig 3) and the ALT waterfall
// (Fig 5) — obot.roadmap#43, safety.viz#91.
//
// Two verified defects this file pins:
//   1. the absolute maximum must be taken over the raw value INDEPENDENTLY of
//      the ×ULN maximum (ALT's STNRHI genuinely varies across visits: 32, 34,
//      35, 40, 43 in the demo data), so the ×ULN-maximising record is not the
//      absolute-maximising record;
//   2. the on-treatment set must exclude the resolved baseline record BY
//      IDENTITY, not merely by day > 0 — 24 of 318 demo participants have no
//      VISITNUM 0 ALT record and fall back to an unscheduled visit, so a day > 0
//      test counts their own baseline as on-treatment and their peak can never
//      fall below baseline, erasing the exact signal Figure 5 is built on.

const NN = 'Normal & NN';
const TC = "Temple's Corollary";

const settings = syncSettings({});
const M = settings.measure_values;

// One long-format lab record (ULNs: ALT 40, TB 1 — so ×ULN math is trivial).
const row = (id, key, day, value, uln, extra = {}) => ({
  USUBJID: id,
  TEST: M[key],
  STRESN: value,
  STNRHI: uln,
  DY: day,
  ...extra
});

// FB   fallback baseline: NO day-0 record. Baseline is the day-3 unscheduled
//      visit and is also this participant's HIGHEST ALT, so the peak must land
//      strictly BELOW baseline (the bar drops).
// VU   varying ULN: the ×ULN-maximising record (day 20, 200/40 = 5×) is NOT the
//      absolute-maximising record (day 10, 300 U/L = 3×).
// FLG  explicit baseline flag on a day-7 record (ABLFL = 'Y').
// JND  new-onset jaundice on active drug: baseline TB 1×, peak TB 3×.
// BJ   baseline jaundice on placebo: baseline TB 3× — already above the cut.
// OTH  an arm that is neither the placebo nor a designated active arm.
const raw = [
  // FB
  row('FB', 'ALT', 3, 400, 40, { ARM: 'Study Drug', VISIT: 'Unscheduled 1.1' }),
  row('FB', 'ALT', 10, 100, 40, { ARM: 'Study Drug' }),
  row('FB', 'ALT', 21, 80, 40, { ARM: 'Study Drug' }),
  row('FB', 'TB', 3, 1, 1, { ARM: 'Study Drug' }),
  row('FB', 'TB', 10, 1, 1, { ARM: 'Study Drug' }),
  // VU
  row('VU', 'ALT', 0, 40, 40, { ARM: 'Study Drug' }),
  row('VU', 'ALT', 10, 300, 100, { ARM: 'Study Drug' }),
  row('VU', 'ALT', 20, 200, 40, { ARM: 'Study Drug' }),
  row('VU', 'TB', 0, 1, 1, { ARM: 'Study Drug' }),
  row('VU', 'TB', 10, 1, 1, { ARM: 'Study Drug' }),
  // FLG
  row('FLG', 'ALT', 0, 500, 40, { ARM: 'Placebo', ABLFL: '' }),
  row('FLG', 'ALT', 7, 100, 40, { ARM: 'Placebo', ABLFL: 'Y' }),
  row('FLG', 'ALT', 14, 90, 40, { ARM: 'Placebo', ABLFL: '' }),
  row('FLG', 'TB', 0, 1, 1, { ARM: 'Placebo', ABLFL: '' }),
  row('FLG', 'TB', 7, 1, 1, { ARM: 'Placebo', ABLFL: 'Y' }),
  row('FLG', 'TB', 14, 1, 1, { ARM: 'Placebo', ABLFL: '' }),
  // JND
  row('JND', 'ALT', 0, 40, 40, { ARM: 'Study Drug' }),
  row('JND', 'ALT', 10, 200, 40, { ARM: 'Study Drug' }),
  row('JND', 'TB', 0, 1, 1, { ARM: 'Study Drug' }),
  row('JND', 'TB', 10, 3, 1, { ARM: 'Study Drug' }),
  // BJ
  row('BJ', 'ALT', 0, 40, 40, { ARM: 'Placebo' }),
  row('BJ', 'ALT', 10, 60, 40, { ARM: 'Placebo' }),
  row('BJ', 'TB', 0, 3, 1, { ARM: 'Placebo' }),
  row('BJ', 'TB', 10, 4, 1, { ARM: 'Placebo' }),
  // OTH
  row('OTH', 'ALT', 0, 40, 40, { ARM: 'Open Label Extension' }),
  row('OTH', 'ALT', 10, 50, 40, { ARM: 'Open Label Extension' }),
  row('OTH', 'TB', 0, 1, 1, { ARM: 'Open Label Extension' }),
  row('OTH', 'TB', 10, 1, 1, { ARM: 'Open Label Extension' })
];

const prepared = deriveBaseline(cleanData(raw, settings).rows, settings);
const built = buildHepSubjects(prepared, settings);
const byId = Object.fromEntries(built.subjects.map((s) => [s.id, s]));
const altRows = (id, rows = prepared) =>
  resolveMeasureRows(
    rows.filter((r) => r.USUBJID === id),
    settings,
    'ALT'
  );

describe('hep-core subjects — splitBaselineOnTreatment', () => {
  it('HEP-CORE-002: the on-treatment set excludes the baseline record by identity (#91)', () => {
    const { baselineRow, onTreatment } = splitBaselineOnTreatment(altRows('FB'), settings);
    expect(baselineRow.__hep_day).toBe(3);
    expect(baselineRow.__hep_value).toBe(400);
    expect(onTreatment).not.toContain(baselineRow);
    expect(onTreatment.map((r) => r.__hep_value)).toEqual([100, 80]);
  });

  it('HEP-CORE-002: records at or before the baseline day are not on-treatment (#91)', () => {
    // Screening at day -7 and a duplicate day-0 record are both excluded.
    const rows = deriveBaseline(
      cleanData(
        [
          row('SCR', 'ALT', -7, 200, 40),
          row('SCR', 'ALT', 0, 40, 40),
          row('SCR', 'ALT', 0, 240, 40),
          row('SCR', 'ALT', 14, 80, 40)
        ],
        settings
      ).rows,
      settings
    );
    const { baselineRow, onTreatment } = splitBaselineOnTreatment(rows, settings);
    expect(baselineRow.__hep_value).toBe(40);
    expect(onTreatment.map((r) => r.__hep_value)).toEqual([80]);
  });

  it('HEP-CORE-002: a PRE-DOSE screening record is never on-treatment, even with a negative-day baseline (#91)', () => {
    // ADaM ADLB with studyday_col 'DY': screening draws land days before first
    // dose and there is NO day-0 record, so the baseline resolves to day -14.
    // If the on-treatment floor were the baseline's own day, the day -3 PRE-DOSE
    // value (500 U/L) would become the on-treatment peak — reporting a 2.5x
    // treatment-emergent rise that never happened and classifying the subject
    // into Hy's Law off a pre-dose draw. The FDA reference's AVISITN > 0 floor
    // has to survive the identity fix; this fixture fails on a bare
    // `day > baselineDay` predicate.
    const rows = deriveBaseline(
      cleanData(
        [
          row('PRE', 'ALT', -14, 200, 40),
          row('PRE', 'ALT', -3, 500, 40),
          row('PRE', 'ALT', 14, 80, 40)
        ],
        settings
      ).rows,
      settings
    );
    const { baselineRow, onTreatment } = splitBaselineOnTreatment(rows, settings);
    expect(baselineRow.__hep_day).toBe(-14);
    expect(baselineRow.__hep_value).toBe(200);
    expect(onTreatment.map((r) => r.__hep_day)).toEqual([14]);
    const reduced = reduceMeasure(rows, settings);
    expect(reduced.peakValue).toBe(80);
    expect(reduced.peakDay).toBe(14);
    expect(reduced.peakULN).toBeCloseTo(2, 10);
  });

  it('HEP-CORE-003: an explicit baseline flag outranks the day-0 heuristic (#91)', () => {
    const flagged = syncSettings({ baseline_col: 'ABLFL', baseline_value: 'Y' });
    const { baselineRow, onTreatment } = splitBaselineOnTreatment(altRows('FLG'), flagged);
    expect(baselineRow.__hep_day).toBe(7);
    expect(baselineRow.__hep_value).toBe(100);
    expect(onTreatment.map((r) => r.__hep_value)).toEqual([90]);
  });

  it('HEP-CORE-003: without a flag, day 0 wins, else the earliest record (#91)', () => {
    expect(splitBaselineOnTreatment(altRows('FLG'), settings).baselineRow.__hep_value).toBe(500);
    expect(splitBaselineOnTreatment(altRows('FB'), settings).baselineRow.__hep_value).toBe(400);
  });

  it('HEP-CORE-003: with no usable study day, every non-baseline record is on-treatment (#91)', () => {
    const dayless = syncSettings({ studyday_col: null });
    const rows = deriveBaseline(
      cleanData(
        [
          { USUBJID: 'ND', TEST: M.ALT, STRESN: 40, STNRHI: 40 },
          { USUBJID: 'ND', TEST: M.ALT, STRESN: 200, STNRHI: 40 }
        ],
        dayless
      ).rows,
      dayless
    );
    const { baselineRow, onTreatment } = splitBaselineOnTreatment(rows, dayless);
    expect(baselineRow.__hep_value).toBe(40);
    expect(onTreatment.map((r) => r.__hep_value)).toEqual([200]);
  });
});

describe('hep-core subjects — reduceMeasure', () => {
  it('HEP-CORE-004: the absolute maximum is independent of the ×ULN maximum (#91)', () => {
    const reduced = reduceMeasure(altRows('VU'), settings);
    // Day 20 maximises ×ULN (200/40 = 5×); day 10 maximises the raw value (300).
    expect(reduced.peakULN).toBeCloseTo(5, 10);
    expect(reduced.peakValue).toBe(300);
    expect(reduced.peakDay).toBe(10);
    expect(reduced.baselineValue).toBe(40);
    expect(reduced.baselineULN).toBeCloseTo(1, 10);
    expect(reduced.uln).toBe(40);
  });

  it('HEP-CORE-002: a participant whose baseline is their highest value peaks below it (#91)', () => {
    const reduced = reduceMeasure(altRows('FB'), settings);
    expect(reduced.baselineValue).toBe(400);
    expect(reduced.peakValue).toBe(100);
    expect(reduced.peakValue).toBeLessThan(reduced.baselineValue);
    expect(reduced.peakDay).toBe(10);
  });

  it('HEP-CORE-002: null when no usable baseline or no on-treatment record survives (#91)', () => {
    expect(reduceMeasure([], settings)).toBeNull();
    const single = deriveBaseline(
      cleanData([row('ONE', 'ALT', 0, 40, 40)], settings).rows,
      settings
    );
    expect(reduceMeasure(single, settings)).toBeNull();
  });
});

describe('hep-core subjects — buildHepSubjects', () => {
  it('HEP-CORE-001: one record per participant carrying ×ULN and absolute units (#91)', () => {
    expect(built.subjects).toHaveLength(6);
    expect(new Set(built.subjects.map((s) => s.id)).size).toBe(6);
    expect(byId.VU).toMatchObject({
      baselineAlt: 40,
      peakAlt: 300,
      peakAltDay: 10,
      altUln: 40,
      baselineBili: 1,
      peakBili: 1
    });
    expect(byId.VU.baselineAltULN).toBeCloseTo(1, 10);
    expect(byId.VU.peakAltULN).toBeCloseTo(5, 10);
  });

  it('HEP-CORE-002: the absolute peak falls below baseline when it should (#91)', () => {
    expect(byId.FB.baselineAlt).toBe(400);
    expect(byId.FB.peakAlt).toBe(100);
    expect(byId.FB.peakAlt).toBeLessThan(byId.FB.baselineAlt);
    expect(byId.FB.pretreatQuadrant).toBe(TC);
    expect(byId.FB.onTreatQuadrant).toBe(NN);
  });

  it('HEP-CORE-005: the arm column is retained without being a group or a filter (#91)', () => {
    // settings carries no groups and no filters — arm must still survive.
    expect(settings.groups.filter((g) => g.value_col !== 'hep_none')).toHaveLength(0);
    expect(settings.filters).toHaveLength(0);
    expect(byId.VU.arm).toBe('Study Drug');
    expect(byId.VU.raw.ARM).toBe('Study Drug');
    expect(built.armCol).toBe('ARM');
  });

  it('HEP-CORE-007: each participant carries the resolved placebo/active side (#91)', () => {
    expect(byId.BJ.side).toBe('placebo');
    expect(byId.VU.side).toBe('active');
    // With active_arms named, an undesignated arm resolves to no side at all.
    const scoped = buildHepSubjects(prepared, syncSettings({ active_arms: ['Study Drug'] }));
    const scopedById = Object.fromEntries(scoped.subjects.map((s) => [s.id, s]));
    expect(scopedById.OTH.side).toBeNull();
    expect(scopedById.VU.side).toBe('active');
    expect(scopedById.BJ.side).toBe('placebo');
  });

  it('HEP-CORE-006: new-onset jaundice needs a normal baseline and an elevated peak (#91)', () => {
    expect(byId.JND).toMatchObject({ newOnsetJaundice: true, baselineJaundice: false });
    expect(byId.JND.peakBili).toBe(3);
    // BJ is already jaundiced at baseline, so its rise is not NEW onset.
    expect(byId.BJ).toMatchObject({ newOnsetJaundice: false, baselineJaundice: true });
    expect(byId.VU).toMatchObject({ newOnsetJaundice: false, baselineJaundice: false });
  });

  it('HEP-CORE-006: the jaundice threshold is settable (#91)', () => {
    const strict = buildHepSubjects(prepared, syncSettings({ jaundice_uln: 5 }));
    const strictById = Object.fromEntries(strict.subjects.map((s) => [s.id, s]));
    expect(strictById.JND.newOnsetJaundice).toBe(false);
  });

  it('HEP-CORE-003: buildHepSubjects honours the explicit baseline flag (#91)', () => {
    const flagged = buildHepSubjects(
      prepared,
      syncSettings({ baseline_col: 'ABLFL', baseline_value: 'Y' })
    );
    const flaggedById = Object.fromEntries(flagged.subjects.map((s) => [s.id, s]));
    expect(flaggedById.FLG.baselineAlt).toBe(100);
    expect(flaggedById.FLG.peakAlt).toBe(90);
    // ×Baseline must be relative to the FLAGGED baseline (90 / 100), not to
    // deriveBaseline's day-0-else-earliest column (90 / 500 = 0.18). Reading the
    // per-row __hep_relative_baseline field makes peakAltBLN disagree with
    // baselineAlt by 5x, and the composite view plots peakAltBLN against the
    // 1x/3x/5x baseline reference lines.
    expect(flaggedById.FLG.peakAltBLN).toBeCloseTo(0.9, 10);
    expect(flaggedById.FLG.peakAltBLN).toBeCloseTo(
      flaggedById.FLG.peakAlt / flaggedById.FLG.baselineAlt,
      10
    );
  });

  it('HEP-CORE-002: ×Baseline always agrees with the reduction that produced it (#91)', () => {
    built.subjects.forEach((subject) => {
      expect(subject.peakAltBLN, `${subject.id}.peakAltBLN`).toBeCloseTo(
        subject.peakAlt / subject.baselineAlt,
        10
      );
      expect(subject.peakBiliBLN, `${subject.id}.peakBiliBLN`).toBeCloseTo(
        subject.peakBili / subject.baselineBili,
        10
      );
    });
  });

  it('HEP-ARM-002: an ambiguous placebo designation is surfaced as a warning (#91)', () => {
    // Two arms match /placebo/i and neither IS 'placebo', so no arm is sided
    // placebo and the caller gets a sentence to render as a .sv-warning.
    const ambiguous = deriveBaseline(
      cleanData(
        [
          row('A1', 'ALT', 0, 40, 40, { ARM: 'CLD: Placebo' }),
          row('A1', 'ALT', 10, 80, 40, { ARM: 'CLD: Placebo' }),
          row('A1', 'TB', 0, 1, 1, { ARM: 'CLD: Placebo' }),
          row('A1', 'TB', 10, 1, 1, { ARM: 'CLD: Placebo' }),
          row('A2', 'ALT', 0, 40, 40, { ARM: 'Matching Placebo' }),
          row('A2', 'ALT', 10, 80, 40, { ARM: 'Matching Placebo' }),
          row('A2', 'TB', 0, 1, 1, { ARM: 'Matching Placebo' }),
          row('A2', 'TB', 10, 1, 1, { ARM: 'Matching Placebo' })
        ],
        settings
      ).rows,
      settings
    );
    const result = buildHepSubjects(ambiguous, settings);
    expect(result.placeboArm).toBeNull();
    expect(result.armWarning).toMatch(/placebo_arm/);
    expect(result.subjects.every((subject) => subject.side === 'active')).toBe(true);
    // The unambiguous fixture above carries no warning at all.
    expect(built.armWarning).toBeNull();
    expect(built.placeboArm).toBe('Placebo');
  });

  it('HEP-CORE-001: every field the composite view consumes is still present (#91)', () => {
    const composite = buildCompositeSubjects(prepared, settings);
    expect(composite.excluded).toBe(built.excluded);
    expect(composite.subjects.map((s) => s.id)).toEqual(built.subjects.map((s) => s.id));
    const compositeFields = [
      'id',
      'raw',
      'baselineAltULN',
      'baselineBiliULN',
      'peakAltULN',
      'peakBiliULN',
      'peakAltBLN',
      'peakBiliBLN',
      'pretreatQuadrant',
      'onTreatQuadrant',
      'concern'
    ];
    composite.subjects.forEach((subject, index) => {
      compositeFields.forEach((field) => {
        expect(subject[field], `${subject.id}.${field}`).not.toBeUndefined();
        expect(subject[field]).toEqual(built.subjects[index][field]);
      });
    });
  });
});

// The split is NOT behaviour-preserving for the shipped composite view: the
// plan's chunk-0 baseline correction rides along with it. These numbers pin the
// correction against the real demo dataset so the churn is reviewable — before
// the fix the composite scatter plotted 295 subjects with 23 excluded; after it
// 293/25, because participants 01-703-1197 and 01-708-1236 lose their only
// on-treatment total-bilirubin record once the resolved baseline is excluded by
// identity. If this test starts failing, a rendering change to the composite
// view has to be re-baselined on purpose, not discovered in a screenshot diff.
describe('hep-core subjects — the demo-dataset composite population', () => {
  const DEMO_SETTINGS = syncSettings({
    studyday_col: 'VISITNUM',
    visit_col: 'VISIT',
    measure_values: {
      ALT: 'Alanine Aminotransferase',
      AST: 'Aspartate Aminotransferase',
      TB: 'Bilirubin',
      ALP: 'Alkaline Phosphatase'
    }
  });

  // site/data/adbds.csv carries no quoted fields, so a split parse is exact.
  const demoRows = (() => {
    const lines = readFileSync('site/data/adbds.csv', 'utf8').trim().split('\n');
    const header = lines[0].split(',');
    return lines.slice(1).map((line) => {
      const cells = line.split(',');
      return Object.fromEntries(header.map((col, i) => [col, cells[i] ?? '']));
    });
  })();

  const demo = buildHepSubjects(
    deriveBaseline(cleanData(demoRows, DEMO_SETTINGS).rows, DEMO_SETTINGS),
    DEMO_SETTINGS
  );
  const demoIds = new Set(demo.subjects.map((subject) => subject.id));

  it('HEP-CORE-002: pins the composite subject and excluded counts (#91)', () => {
    expect(demo.subjects).toHaveLength(293);
    expect(demo.excluded).toBe(25);
  });

  it('HEP-CORE-002: the two participants the baseline fix drops are named (#91)', () => {
    expect(demoIds.has('01-703-1197')).toBe(false);
    expect(demoIds.has('01-708-1236')).toBe(false);
  });

  it('HEP-CORE-002: the identity rule targets exactly the 24 no-day-0 participants, none CLD- (#91)', () => {
    // The identity exclusion can only change a participant with no day-0 record —
    // one whose baseline resolves to a fallback visit and, under the old day > 0
    // rule, counted its own baseline as on-treatment. .hep-core-split-proof.md
    // enumerates these 24; this pins the rule-target population so a regression in
    // baseline resolution (a re-appearing day > 0 test) is caught here rather than
    // in an evidence-baseline diff.
    const prepared = deriveBaseline(cleanData(demoRows, DEMO_SETTINGS).rows, DEMO_SETTINGS);
    const byId = new Map();
    prepared.forEach((r) => {
      const id = r[DEMO_SETTINGS.id_col];
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(r);
    });
    const noDay0 = [];
    byId.forEach((rows, id) => {
      const alt = resolveMeasureRows(rows, DEMO_SETTINGS, 'ALT');
      const tb = resolveMeasureRows(rows, DEMO_SETTINGS, 'TB');
      const altNo = alt.length && !alt.some((r) => r.__hep_day === 0);
      const tbNo = tb.length && !tb.some((r) => r.__hep_day === 0);
      if (altNo || tbNo) noDay0.push(id);
    });
    expect(byId.size).toBe(318);
    expect(noDay0).toHaveLength(24);
    expect(noDay0.some((id) => id.startsWith('CLD-'))).toBe(false);
    // The two the fix fully drops are a subset of the rule-target population.
    expect(noDay0).toContain('01-703-1197');
    expect(noDay0).toContain('01-708-1236');
  });

  it('HEP-ARM-002: the real Placebo arm — not the synthetic CLD cohort — is the comparator (#91)', () => {
    expect(demo.arms).toEqual([
      'CLD: Placebo',
      'CLD: Study Drug',
      'Placebo',
      'Xanomeline High Dose',
      'Xanomeline Low Dose'
    ]);
    expect(demo.placeboArm).toBe('Placebo');
    expect(demo.armWarning).toBeNull();
    expect(demo.sides.get('Placebo')).toBe('placebo');
    expect(demo.sides.get('CLD: Placebo')).toBe('active');
    // Every participant randomised to the real control arm sits on the placebo
    // side; before the exact-match rule all 79 of them were plotted as active.
    const placeboSide = demo.subjects.filter((subject) => subject.side === 'placebo');
    expect(placeboSide.length).toBeGreaterThan(50);
    expect(placeboSide.every((subject) => subject.arm === 'Placebo')).toBe(true);
  });
});

// boxStats lives in src/hep-core/stats.js; its tests ride here because the
// safety.viz#91 merge gate whitelists exactly four new unit-test files under
// tests/unit/hep-explorer/ (quadrants, subjects, arms, migration).
describe('hep-core stats — boxStats', () => {
  it('HEP-CORE-009: returns the box-and-whisker shape with R-7 quantiles (#91)', () => {
    const stats = boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(stats.n).toBe(10);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(10);
    expect(stats.q5).toBeCloseTo(1.45, 10);
    expect(stats.q25).toBeCloseTo(3.25, 10);
    expect(stats.median).toBeCloseTo(5.5, 10);
    expect(stats.q75).toBeCloseTo(7.75, 10);
    expect(stats.q95).toBeCloseTo(9.55, 10);
    expect(stats.mean).toBeCloseTo(5.5, 10);
    // The keys src/box-whisker.js drawBoxWhisker reads.
    ['n', 'q5', 'q25', 'median', 'q75', 'q95', 'mean'].forEach((key) =>
      expect(stats[key], key).not.toBeUndefined()
    );
  });

  it('HEP-CORE-009: ignores non-numeric values and survives an empty sample (#91)', () => {
    const stats = boxStats([2, 'x', 4, undefined, NaN, 6]);
    expect(stats.n).toBe(3);
    expect(stats.median).toBe(4);
    const empty = boxStats([]);
    expect(empty.n).toBe(0);
    expect(Number.isNaN(empty.median)).toBe(true);
    expect(Number.isNaN(empty.mean)).toBe(true);
  });
});
