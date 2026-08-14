// build-nep-aki-cohort.mjs — inject a synthetic acute-kidney-injury cohort into
// the vendored demo dataset so the nep-explorer KDIGO creatinine scatter (#120)
// is demonstrable.
//
// The KDIGO scatter stages a participant on the maximum FOLD change and the
// maximum ABSOLUTE change in serum creatinine over their post-baseline course.
// Measured on site/data/adbds.csv as it stood, the pharmaverseadam Alzheimer's
// Pilot 01 population cannot exercise it: all 208 stageable participants land in
// the no-stage box, the maximum fold change anywhere in the file is 1.45x, and
// the three coloured zones stay empty. The renderer would ship with a gallery
// hero showing a blob in a corner. So design #35 (decision D8) specifies a
// deterministic AKI cohort injected into the SHARED extract, on the mechanism
// scripts/build-hep-composite-cohort.mjs already uses for the `CLD-` chronic-
// liver cohort — rather than a nep-specific CSV, which would have made this the
// fourth exception to the one-versioned-extract rule (#89 DEMO-4).
//
// The cohort is a CHART-DRIVEN spec, not a plausible-population one (design
// §5.3). It is built to contain:
//
//   * creatinine in umol/L like every other lab in the file, so the demo runs
//     THROUGH the per-record mg/dL conversion rather than around it — that path
//     is the one place a silent staging error can hide;
//   * all four fold stages populated, with enough participants per stage that
//     the summary table's percentages mean something;
//   * participants who trip the >= 4.0 mg/dL Stage-3 rule, which no real dataset
//     here can supply (the RhoInc maximum creatinine is 1.93 mg/dL) — including
//     two whose fold change alone would only be Stage 1, so the rule is visibly
//     the thing that stages them;
//   * participants whose creatinine only falls, so D6's below-zero domain is
//     visible rather than merely implemented;
//   * fold and delta stagings that DISAGREE in both directions, so the summary
//     table's three columns are three different distributions; and
//   * no baseline flag — adbds.csv has no such column, so the demo runs on D7's
//     earliest-record fallback, the path most real studies take too.
//
// Deterministic: a fixed-seed mulberry32 PRNG drives all jitter, so re-running
// reproduces byte-identical rows. Idempotent: any previously injected cohort
// (USUBJID prefix `AKI-`) is stripped before the fresh cohort is appended, so
// this is safe to re-run after scripts/build-demo-data.mjs regenerates
// adbds.csv from source, and after build-hep-composite-cohort.mjs.
//
// Usage:  node scripts/build-nep-aki-cohort.mjs
//
// Provenance is documented in docs/DATA_SOURCES.md, and the invariants above are
// asserted against the committed CSV by tests/unit/nep-explorer/cohort.test.js
// (NEP-COHORT-001..012), so a regeneration that loses the signal fails the suite
// rather than quietly degrading the demo. Generated rows are clearly labelled
// (SITE `Nephrology Research Unit`, ARM `AKI: Study Drug` / `AKI: Placebo`,
// USUBJID `AKI-*`) and are synthetic — not derived from any real subject.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(rootDir, 'site', 'data', 'adbds.csv');
const PREFIX = 'AKI-';
const SITE = 'Nephrology Research Unit';
const TEST = 'Creatinine';
const UNIT = 'umol/L';

/** 1 mg/dL of creatinine = 88.4 umol/L (design §4). */
const UMOL_PER_MGDL = 88.4;

/** KDIGO Stage 3 on the absolute value reached, in mg/dL (D5). */
const ABSOLUTE_RULE = 4.0;

// Sex-specific reference ranges, matching the pharmaverseadam creatinine rows
// already in the file so the injected participants do not introduce a second
// reference band for this measure.
const REFERENCE = { F: { lo: 62, hi: 124 }, M: { lo: 71, hi: 141 } };

// The pilot's own visit vocabulary, verbatim (label AND number), so the cohort
// adds no new visit to the eight other renderers that read this file — the
// injected rows must not perturb their displays beyond the new participants.
const VISITS = [
  { visit: 'Baseline', visitn: 0 },
  { visit: 'Week 2', visitn: 4 },
  { visit: 'Week 4', visitn: 5 },
  { visit: 'Week 6', visitn: 7 },
  { visit: 'Week 8', visitn: 8 },
  { visit: 'Week 12', visitn: 9 },
  { visit: 'Week 16', visitn: 10 },
  { visit: 'Week 24', visitn: 12 }
];

// Archetypes, in mg/dL. `fold` is the ratio of the participant's MAXIMUM
// post-baseline creatinine to their baseline — the quantity the x-axis plots —
// so each band pins the stage the participant is built to land in, and
// `expect` records that intent for the build-time guard below.
//
// The bands are chosen so the whole band satisfies the intent: `no_stage` keeps
// baseline x (fold - 1) under 0.3 at its worst corner, `abs_rule_*` clears 4.0
// mg/dL at its lowest, and nothing sits within rounding distance of 1.5, 2.0,
// 3.0 or 0.3.
const ARCHETYPES = {
  // Fold < 1.5 and delta < 0.3: the white no-stage box, which is most of any
  // real cohort and is what makes the flagged corner readable.
  no_stage: { baseline: [0.65, 0.95], fold: [1.08, 1.28], expect: { fold: 0, delta: 0 } },
  // Creatinine that only ever falls (D6). Their maximum post-baseline value is
  // still below baseline, so fold < 1 and delta < 0 — the participants the R
  // source's y-limits drop off the plot without saying so.
  falling: { baseline: [2.2, 2.8], fold: [0.86, 0.92], expect: { fold: 0, delta: 0 } },
  // Stage 1 on the delta axis ONLY: a chronic-kidney-disease baseline where a
  // modest proportional rise is a large absolute one.
  delta_only: { baseline: [2.2, 3.0], fold: [1.16, 1.32], expect: { fold: 0, delta: 1 } },
  // Stage 1 on the fold axis ONLY. KDIGO's two Stage-1 criteria are not nested:
  // clearing 1.5x without clearing 0.3 mg/dL takes a baseline below ~0.6 mg/dL,
  // which is a low-muscle-mass participant rather than an impossible one. Two
  // of them keep the summary table's fold and delta columns honestly different.
  fold1_quiet: { baseline: [0.46, 0.5], fold: [1.52, 1.58], expect: { fold: 1, delta: 0 } },
  fold1: { baseline: [0.8, 1.05], fold: [1.55, 1.88], expect: { fold: 1, delta: 1 } },
  fold2: { baseline: [0.75, 1.05], fold: [2.05, 2.85], expect: { fold: 2, delta: 1 } },
  fold3: { baseline: [0.7, 0.95], fold: [3.1, 3.9], expect: { fold: 3, delta: 1 } },
  // Stage 3 both ways: a 3x+ rise that also reaches >= 4.0 mg/dL.
  abs_rule_fold3: {
    baseline: [1.1, 1.2],
    fold: [3.8, 4.3],
    expect: { fold: 3, delta: 1, absoluteRule: true }
  },
  // The D5 demonstrator: a high baseline whose rise is only Stage 1 on the fold
  // ladder, but whose maximum reaches >= 4.0 mg/dL. The zone under the point
  // says Stage 1; the ringed mark and the summary table say Stage 3.
  abs_rule_fold1: {
    baseline: [2.6, 2.75],
    fold: [1.55, 1.72],
    expect: { fold: 1, delta: 1, absoluteRule: true }
  }
};

// Per-arm composition. The active arm carries the injury signal; placebo keeps
// enough staged participants that the chart is not a two-colour story, and the
// no-stage cloud is split across both.
const rep = (key, n) => Array.from({ length: n }, () => key);
const ARMS = {
  'AKI: Study Drug': [
    ...rep('no_stage', 5),
    ...rep('falling', 1),
    ...rep('delta_only', 2),
    ...rep('fold1_quiet', 1),
    ...rep('fold1', 5),
    ...rep('fold2', 6),
    ...rep('fold3', 4),
    ...rep('abs_rule_fold3', 2),
    ...rep('abs_rule_fold1', 1)
  ],
  'AKI: Placebo': [
    ...rep('no_stage', 7),
    ...rep('falling', 2),
    ...rep('delta_only', 2),
    ...rep('fold1_quiet', 1),
    ...rep('fold1', 3),
    ...rep('fold2', 2),
    ...rep('fold3', 1),
    ...rep('abs_rule_fold1', 1)
  ]
};

const SEX = ['F', 'M'];
const RACE = ['WHITE', 'BLACK OR AFRICAN AMERICAN', 'ASIAN'];

// Deterministic PRNG (mulberry32) so jitter is reproducible.
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const csvField = (value) => {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const round2 = (value) => Math.round(value * 100) / 100;

const foldStage = (fold) => (fold >= 3 ? 3 : fold >= 2 ? 2 : fold >= 1.5 ? 1 : 0);
const deltaStage = (delta) => (delta >= 0.3 ? 1 : 0);

/**
 * The creatinine series in mg/dL for one participant: the baseline, then seven
 * post-baseline readings.
 *
 * A rising course peaks at `peakIndex` and partially recovers, with the
 * off-peak readings interpolated between baseline and peak so the peak is
 * unambiguously the maximum. A falling course descends to a trough and comes
 * partway back, with its FIRST post-baseline reading the highest of them — so
 * the participant's "maximum" is still below baseline, which is exactly the
 * shape that makes their delta negative.
 */
function creatinineSeries(baseline, fold, peakIndex, rng) {
  const post = VISITS.length - 1;
  const extreme = baseline * fold;
  if (fold < 1) {
    // Descending fractions of the maximum post-baseline value, then a partial
    // return that stays under it.
    const shape = [1, 0.93, 0.86, 0.8, 0.78, 0.83, 0.88];
    return [baseline, ...shape.map((factor) => extreme * factor * (1 + (rng() - 0.5) * 0.02))];
  }
  return [
    baseline,
    ...Array.from({ length: post }, (_, index) => {
      if (index === peakIndex) return extreme;
      // 25-80% of the way from baseline toward the peak, capped short of it so
      // no off-peak visit can tie or beat the peak after rounding.
      const fraction = 0.25 + rng() * 0.55;
      return Math.min(baseline + fraction * (extreme - baseline), extreme * 0.9);
    })
  ];
}

function buildCohort() {
  const rng = makeRng(20260728);
  const rows = [];
  let n = 0;
  for (const [arm, archetypeKeys] of Object.entries(ARMS)) {
    archetypeKeys.forEach((key) => {
      n += 1;
      const archetype = ARCHETYPES[key];
      const usubjid = `${PREFIX}${String(9000 + n)}`;
      const sex = SEX[n % SEX.length];
      const race = RACE[n % RACE.length];
      const siteid = 950 + (n % 3);
      const span = ([lo, hi]) => lo + rng() * (hi - lo);
      const baseline = span(archetype.baseline);
      const fold = span(archetype.fold);
      // Peaks rotate across the on-treatment visits so the cohort's maxima do
      // not all land on one visit.
      const peakIndex = 1 + (n % (VISITS.length - 2));
      const series = creatinineSeries(baseline, fold, peakIndex, rng);
      // Round in the unit the file is written in, then verify the stage on the
      // ROUNDED values — what the module will actually read.
      const umol = series.map((value) => round2(value * UMOL_PER_MGDL));
      const mgdl = umol.map((value) => value / UMOL_PER_MGDL);
      assertArchetype(usubjid, key, archetype, mgdl);
      VISITS.forEach((visit, index) => {
        rows.push([
          usubjid,
          SITE,
          siteid,
          sex,
          race,
          arm,
          visit.visit,
          visit.visitn,
          TEST,
          UNIT,
          umol[index],
          REFERENCE[sex].lo,
          REFERENCE[sex].hi
        ]);
      });
    });
  }
  return rows;
}

/**
 * Fail the build when a generated participant does not land in the stage their
 * archetype promises. The cohort's whole purpose is which zones it populates;
 * a jitter band that drifts across a cut-point would otherwise produce a demo
 * that renders perfectly and demonstrates the wrong thing.
 */
function assertArchetype(id, key, archetype, mgdl) {
  const [baseline, ...post] = mgdl;
  const max = Math.max(...post);
  const fold = max / baseline;
  const delta = max - baseline;
  const actual = {
    fold: foldStage(fold),
    delta: deltaStage(delta),
    absoluteRule: max >= ABSOLUTE_RULE
  };
  const expected = { absoluteRule: false, ...archetype.expect };
  const detail =
    `${id} (${key}): baseline ${baseline.toFixed(2)}, max ${max.toFixed(2)}, ` +
    `fold ${fold.toFixed(2)}, delta ${delta.toFixed(2)}`;
  if (
    actual.fold !== expected.fold ||
    actual.delta !== expected.delta ||
    actual.absoluteRule !== expected.absoluteRule
  ) {
    throw new Error(
      `${detail} — staged ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`
    );
  }
  if (key === 'falling' && !(delta < -0.15)) {
    throw new Error(`${detail} — falling archetype must land clearly below zero`);
  }
}

function main() {
  const raw = readFileSync(dataPath, 'utf8');
  const lines = raw.split('\n');
  const header = lines[0];
  const body = lines.slice(1).filter((line) => line.length > 0);
  // Idempotent: drop any previously injected cohort before appending.
  const kept = body.filter(
    (line) => !line.startsWith(PREFIX) && !line.startsWith(csvField(PREFIX))
  );
  const cohort = buildCohort().map((cells) => cells.map(csvField).join(','));
  const out = [header, ...kept, ...cohort].join('\n') + '\n';
  writeFileSync(dataPath, out);
  const subjects = cohort.length / VISITS.length;
  console.log(
    `Injected synthetic AKI cohort: ${subjects} subjects, ${cohort.length} rows ` +
      `appended to ${path.relative(rootDir, dataPath)} (kept ${kept.length} source rows).`
  );
}

main();
