// build-hep-composite-cohort.mjs — inject a synthetic chronic-liver-disease
// cohort into the vendored demo dataset so the hep-explorer COMPOSITE plot
// (#67) is demonstrable.
//
// The composite plot (Tesfaldet et al., Drug Safety 2024) exists for the
// population with ABNORMAL baseline liver tests — exactly the population the
// pharmaverseadam Alzheimer's Pilot 01 data (site/data/adbds.csv) does not
// contain (its baseline liver labs are essentially normal). This script
// synthesizes a small, deterministic chronic-hepatitis cohort (elevated
// baseline ALT/AST/TB/ALP, two study arms, a 12-week on-treatment course) whose
// baseline→on-treatment migration exercises every composite quadrant and
// concern level, and appends it to site/data/adbds.csv.
//
// Deterministic: a fixed-seed LCG drives all jitter, so re-running reproduces
// byte-identical rows. Idempotent: any previously injected cohort (USUBJID
// prefix `CLD-`) is stripped before the fresh cohort is appended, so this can be
// re-run after scripts/build-demo-data.mjs regenerates adbds.csv from source.
//
// Usage:  node scripts/build-hep-composite-cohort.mjs
//
// Provenance is documented in docs/DATA_SOURCES.md. The generated rows are
// clearly labeled (SITE `Hepatology Research Unit`, ARM `CLD: Study Drug` /
// `CLD: Placebo`, USUBJID `CLD-*`) and are synthetic — not derived from any real
// subject.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(rootDir, 'site', 'data', 'adbds.csv');
const PREFIX = 'CLD-';

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

// The four liver measures: key -> { test string (must match the demo's
// measure_values), unit, lower/upper normal limit }.
const MEASURES = {
  ALT: { test: 'Alanine Aminotransferase', unit: 'U/L', lo: 6, hi: 40 },
  AST: { test: 'Aspartate Aminotransferase', unit: 'U/L', lo: 6, hi: 40 },
  TB: { test: 'Bilirubin', unit: 'mg/dL', lo: 0.1, hi: 1.2 },
  ALP: { test: 'Alkaline Phosphatase', unit: 'U/L', lo: 40, hi: 120 }
};

const VISITS = [
  { visit: 'Baseline', visitn: 0 },
  { visit: 'Week 4', visitn: 4 },
  { visit: 'Week 8', visitn: 8 },
  { visit: 'Week 12', visitn: 12 }
];

// Migration archetypes as (baseline ALT ×ULN, baseline TB ×ULN, peak ALT ×ULN,
// peak TB ×ULN). Thresholds: ALT > 3×ULN and TB > 2×ULN are elevated. Targets
// sit comfortably clear of the boundaries so the ±jitter cannot cross a
// quadrant. `concern` documents the intended migration for review.
const ARCHETYPES = {
  nn_stable: { bAlt: 1.6, bTb: 1.0, pAlt: 1.9, pTb: 1.1, concern: 'gray' },
  ch_stable: { bAlt: 2.0, bTb: 3.0, pAlt: 2.2, pTb: 3.4, concern: 'gray' },
  tc_stable: { bAlt: 4.0, bTb: 1.2, pAlt: 4.6, pTb: 1.4, concern: 'gray' },
  hl_stable: { bAlt: 4.2, bTb: 2.6, pAlt: 5.2, pTb: 3.0, concern: 'gray' },
  nn_to_hl: { bAlt: 1.8, bTb: 1.1, pAlt: 5.2, pTb: 3.0, concern: 'red' },
  nn_to_tc: { bAlt: 2.0, bTb: 1.0, pAlt: 4.2, pTb: 1.3, concern: 'red' },
  nn_to_ch: { bAlt: 1.5, bTb: 1.4, pAlt: 2.2, pTb: 3.1, concern: 'red' },
  ch_to_tc: { bAlt: 2.0, bTb: 3.4, pAlt: 4.1, pTb: 1.5, concern: 'yellow' },
  tc_to_ch: { bAlt: 4.0, bTb: 1.2, pAlt: 2.1, pTb: 3.0, concern: 'yellow' },
  hl_to_nn: { bAlt: 4.2, bTb: 2.6, pAlt: 1.6, pTb: 1.2, concern: 'green' },
  ch_to_nn: { bAlt: 2.2, bTb: 3.0, pAlt: 1.5, pTb: 1.1, concern: 'green' },
  tc_to_nn: { bAlt: 4.0, bTb: 1.2, pAlt: 1.6, pTb: 1.1, concern: 'green' },
  hl_to_ch: { bAlt: 4.4, bTb: 3.0, pAlt: 2.1, pTb: 2.6, concern: 'green' },
  hl_to_tc: { bAlt: 4.6, bTb: 2.6, pAlt: 4.0, pTb: 1.5, concern: 'green' }
};

// Per-arm composition (multiset of archetype keys). Study Drug skews toward
// benefit (green) migrations; Placebo skews toward stable + concern — mirroring
// the paper's finding that benefit migrations favored the study drug.
const rep = (key, n) => Array.from({ length: n }, () => key);
// Arm labels are prefixed so this synthetic chronic-liver sub-cohort is never
// conflated with the pharmaverseadam Pilot 01 arms (Placebo / Xanomeline ...)
// in the shared dataset's grouping and summaries.
const ARMS = {
  'CLD: Study Drug': [
    ...rep('nn_stable', 3),
    ...rep('ch_stable', 2),
    ...rep('tc_stable', 2),
    ...rep('hl_stable', 2),
    ...rep('hl_to_nn', 3),
    ...rep('ch_to_nn', 3),
    ...rep('tc_to_nn', 2),
    ...rep('hl_to_ch', 2),
    ...rep('hl_to_tc', 2),
    ...rep('ch_to_tc', 2),
    ...rep('tc_to_ch', 1),
    ...rep('nn_to_hl', 3),
    ...rep('nn_to_tc', 3),
    ...rep('nn_to_ch', 2)
  ],
  'CLD: Placebo': [
    ...rep('nn_stable', 5),
    ...rep('ch_stable', 3),
    ...rep('tc_stable', 3),
    ...rep('hl_stable', 3),
    ...rep('hl_to_nn', 2),
    ...rep('ch_to_nn', 2),
    ...rep('tc_to_nn', 1),
    ...rep('ch_to_tc', 2),
    ...rep('tc_to_ch', 1),
    ...rep('nn_to_hl', 4),
    ...rep('nn_to_tc', 3),
    ...rep('nn_to_ch', 3)
  ]
};

const SEX = ['M', 'F'];
const RACE = ['WHITE', 'BLACK OR AFRICAN AMERICAN', 'ASIAN'];

const csvField = (value) => {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

function round(value, digits) {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

// On-treatment peak visit index (1..3) rotates per subject so peaks don't all
// land on the same visit; non-peak on-treatment visits interpolate between
// baseline and peak, staying strictly below the peak.
function measureSeries(baselineX, peakX, uln, digits, peakVisit, rng) {
  const baseline = baselineX * uln;
  const peak = peakX * uln;
  return VISITS.map((visit, i) => {
    if (i === 0) return round(baseline * (1 + (rng() - 0.5) * 0.06), digits);
    if (i === peakVisit) return round(peak, digits);
    // Interpolate ~40-65% of the way from baseline to peak, then nudge down so
    // this visit never exceeds the peak.
    const frac = 0.4 + rng() * 0.25;
    const value = baseline + frac * (peak - baseline);
    return round(Math.min(value, peak * 0.92), digits);
  });
}

function buildCohort() {
  const rng = makeRng(20260717);
  const rows = [];
  let n = 0;
  for (const [arm, archetypeKeys] of Object.entries(ARMS)) {
    archetypeKeys.forEach((key) => {
      n += 1;
      const arche = ARCHETYPES[key];
      const usubjid = `${PREFIX}${String(9000 + n)}`;
      const siteid = 900 + (n % 4);
      const site = 'Hepatology Research Unit';
      const sex = SEX[n % SEX.length];
      const race = RACE[n % RACE.length];
      const peakVisit = 1 + (n % 3);
      // Small per-subject jitter on the ×ULN targets (kept well within the
      // quadrant so classification is stable), applied per measure.
      const jitter = () => 1 + (rng() - 0.5) * 0.12;
      const altSeries = measureSeries(
        arche.bAlt * jitter(),
        arche.pAlt * jitter(),
        MEASURES.ALT.hi,
        0,
        peakVisit,
        rng
      );
      const tbSeries = measureSeries(
        arche.bTb * jitter(),
        arche.pTb * jitter(),
        MEASURES.TB.hi,
        1,
        peakVisit,
        rng
      );
      // AST tracks ALT (~0.85x); ALP mildly elevated, largely stable.
      const astSeries = altSeries.map((v) => round(v * (0.8 + rng() * 0.15), 0));
      const alpBase = (1.1 + rng() * 0.9) * MEASURES.ALP.hi;
      const alpSeries = VISITS.map(() => round(alpBase * (0.92 + rng() * 0.16), 0));
      const series = { ALT: altSeries, AST: astSeries, TB: tbSeries, ALP: alpSeries };
      VISITS.forEach((visit, i) => {
        for (const [mKey, meta] of Object.entries(MEASURES)) {
          rows.push([
            usubjid,
            site,
            siteid,
            sex,
            race,
            arm,
            visit.visit,
            visit.visitn,
            meta.test,
            meta.unit,
            series[mKey][i],
            meta.lo,
            meta.hi
          ]);
        }
      });
    });
  }
  return rows;
}

function main() {
  const raw = readFileSync(dataPath, 'utf8');
  const lines = raw.split('\n');
  const header = lines[0];
  // Strip a trailing blank line if present.
  const body = lines.slice(1).filter((line) => line.length > 0);
  // Idempotent: drop any previously injected synthetic cohort.
  const kept = body.filter(
    (line) => !line.startsWith(csvField(PREFIX)) && !line.startsWith(PREFIX)
  );
  const cohort = buildCohort().map((cells) => cells.map(csvField).join(','));
  const out = [header, ...kept, ...cohort].join('\n') + '\n';
  writeFileSync(dataPath, out);
  const subjects = cohort.length / (VISITS.length * Object.keys(MEASURES).length);
  console.log(
    `Injected synthetic chronic-liver cohort: ${subjects} subjects, ${cohort.length} rows ` +
      `appended to ${path.relative(rootDir, dataPath)} (kept ${kept.length} source rows).`
  );
}

main();
