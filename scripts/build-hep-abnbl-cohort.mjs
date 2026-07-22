// build-hep-abnbl-cohort.mjs — generate the synthetic ABNORMAL-BASELINE hepatic
// cohort that makes the modified ALT waterfall (#93) demonstrable.
//
// The waterfall (Figure 5 of Amirzadegan et al., Drug Safety 2025;48:443-453)
// plots, per participant, a floating bar from baseline ALT to maximum
// on-treatment ALT, over the population with ABNORMAL baseline liver tests and
// NORMAL baseline bilirubin. The vendored demo dataset (site/data/adbds.csv,
// pharmaverseadam Alzheimer's Pilot 01 + the synthetic `CLD-` composite cohort)
// verifiably cannot carry that figure:
//
//   * after the paper's mandated baseline-bilirubin exclusion, ZERO of the 234
//     surviving participants have baseline ALT >= 3xULN (only 19 exceed 1xULN);
//   * the whole file contains exactly TWO new-onset-jaundice participants, one
//     per arm — which contradicts the paper's "several developed jaundice" on
//     active drug; and
//   * the baseline trace is flat and discontinuous (215 of 234 survivors sit
//     between 6 and 40 U/L, then 11 stragglers jump to 62-85 U/L), so the
//     figure's unimodal "mountain" cannot form.
//
// So this script writes a SEPARATE file, site/data/adbds-abnbl.csv, purpose-built
// for the waterfall demo. site/data/adbds.csv is NOT touched: it is the demo
// dataset for six shipped renderers and their evidence baselines.
//
// Deterministic: a fixed-seed mulberry32 PRNG drives all jitter, so re-running
// reproduces byte-identical rows. Idempotent: any previously generated cohort
// (USUBJID prefix `ABL-`) is stripped before the fresh cohort is written, so the
// script is safe to re-run over its own output.
//
// Usage:  node scripts/build-hep-abnbl-cohort.mjs
//
// Provenance is documented in docs/DATA_SOURCES.md. Every generated row is
// clearly labelled as synthetic (SITE `Hepatology ABN-BL Unit (synthetic)`, ARM
// `ABL: Placebo` / `ABL: Study Drug`, USUBJID `ABL-*`) and is not derived from
// any real subject.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = path.join(rootDir, 'site', 'data', 'adbds-abnbl.csv');

// The measure contract shared with site/data/adbds.csv — same columns, same
// order, so any renderer that reads one file reads the other unchanged.
const HEADER = 'USUBJID,SITE,SITEID,SEX,RACE,ARM,VISIT,VISITNUM,TEST,STRESU,STRESN,STNRLO,STNRHI';

const PREFIX = 'ABL-';
const SITE = 'Hepatology ABN-BL Unit (synthetic)';
const ARM_PLACEBO = 'ABL: Placebo';
const ARM_ACTIVE = 'ABL: Study Drug';

// Deterministic PRNG (mulberry32) so jitter is reproducible — identical to the
// composite cohort generator's, and the reason two runs are byte-identical.
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

// The four liver measures: key -> { TEST string (must match the hep demos'
// measure_values mapping), unit, lower/upper limit of normal, decimals }.
//
// ALT's upper limit is a SINGLE cohort-wide value (40 U/L) and its unit is
// uniformly U/L: the waterfall plots an absolute axis, so a reference range
// that varies across participants would turn the ULN reference line into a
// band (HWF-AXIS-004). The pilot data's ALT ULN genuinely varies (32/34/35/40/43)
// — here it does not.
const MEASURES = {
  ALT: { test: 'Alanine Aminotransferase', unit: 'U/L', lo: 6, hi: 40, digits: 0 },
  AST: { test: 'Aspartate Aminotransferase', unit: 'U/L', lo: 6, hi: 40, digits: 0 },
  TB: { test: 'Bilirubin', unit: 'mg/dL', lo: 0.1, hi: 1.2, digits: 1 },
  ALP: { test: 'Alkaline Phosphatase', unit: 'U/L', lo: 40, hi: 120, digits: 0 }
};

// One real day-0 baseline plus four on-treatment visits, for EVERY participant
// and EVERY analyte. This is deliberate: 24 of the 318 participants in
// adbds.csv have no VISITNUM==0 ALT record and fall back to an unscheduled
// visit, which makes their "baseline" an on-treatment value and silently erases
// the bars-below-baseline signal the waterfall is built around. This cohort
// must not reproduce that defect.
//
// VISITNUM is the visit SEQUENCE (0 = baseline), the study-day surrogate the
// hep demos map through `studyday_col: 'VISITNUM'`; the VISIT label carries the
// clinical schedule.
const VISITS = [
  { visit: 'Baseline', visitn: 0 },
  { visit: 'Week 4', visitn: 1 },
  { visit: 'Week 8', visitn: 2 },
  { visit: 'Week 12', visitn: 3 },
  { visit: 'Week 16', visitn: 4 }
];
const ON_TREATMENT = VISITS.length - 1;

// Peak ALT ceiling (U/L). Rise magnitudes are scaled down for participants who
// already start high so the plotted domain stays readable: the baseline
// mountain tops out at 8xULN = 320 U/L, and letting a 6x rise off a 320 U/L
// baseline through would flatten the whole trace against the axis floor.
const PEAK_ALT_CAP = 700;

// ---------------------------------------------------------------------------
// Cohort composition
// ---------------------------------------------------------------------------
//
// 80 participants, 40 per arm, in two sub-populations:
//
//   * WATERFALL (58) — baseline TB <= 0.8xULN, comfortably clear of the 1.0
//     exclusion boundary so PRNG jitter cannot trip it, with baseline ALT
//     spread SMOOTHLY across 1.0-8.0xULN. These are the participants the figure
//     plots; the smooth spread is what produces the paper's unimodal baseline
//     "mountain" rather than a step function.
//   * EXCLUSION (22) — baseline TB 1.5-4.0xULN. The paper's Table-1 baseline-
//     jaundice exclusion therefore has something real to report, which makes
//     the exclusion note demonstrable evidence rather than a claim.
//
// Roles drive the shape of each participant's ALT trajectory:
//
//   DOWN     peak on-treatment ALT BELOW baseline — the caption's bars dropping
//            below the baseline trace
//   RISE     a modest rise (1.1-1.9x baseline)
//   TAIL     the "substantial increase over baseline" tail (3-6x own baseline)
//   JAUNDICE a large ALT rise AND peak TB 2.5-4.0xULN off a normal baseline TB
//            — new-onset jaundice, drawn green regardless of arm
const DOWN = 'down';
const RISE = 'rise';
const TAIL = 'tail';
const JAUNDICE = 'jaundice';

// Role ladders are written as one character per participant, in ASCENDING
// baseline-ALT order, so the whole arm's pattern is legible at a glance:
// D = down, R = rise, T = tail, J = jaundice.
const ROLE_CODES = { D: DOWN, R: RISE, T: TAIL, J: JAUNDICE };
const ladder = (pattern) => [...pattern].map((code) => ROLE_CODES[code]);

// Active waterfall arm (29): 15 D, 8 T, 6 J. Roles are scattered rather than
// banded so directions intermix across the baseline range, but the big rises
// sit at the lower baselines (a 6x rise off a 300 U/L baseline is neither
// plausible nor plottable) and the highest baselines skew to D — both the
// paper's signal and the clinically expected regression from a high start.
const ACTIVE_WATERFALL_ROLES = ladder('TDTJTDTJTDTJDJTDJDTJDDDDDDDDD');

// Placebo waterfall arm (29): 8 D, 20 R, 1 J — the mirror image. Placebo bars
// mostly drift upward; the single green bar is what makes the 6-vs-1 jaundice
// asymmetry read as drug-attributable rather than as background noise.
const PLACEBO_WATERFALL_ROLES = ladder('RRDRRJDRRRDRRDRRRDRRRDRRDRRDR');

// Exclusion-population ladders (11 per arm). These participants are dropped by
// the waterfall's baseline-bilirubin cohort rule, but they carry the same
// direction skew so the arm-level counts hold over the whole cohort — and so
// the plot stays honest if a reviewer toggles the cohort rule off.
const ACTIVE_EXCLUDED_ROLES = ladder('DDRDDDDRDDD');
const PLACEBO_EXCLUDED_ROLES = ladder('RRDRRRRDRRR');

const WATERFALL_N = ACTIVE_WATERFALL_ROLES.length + PLACEBO_WATERFALL_ROLES.length; // 58
const EXCLUDED_N = ACTIVE_EXCLUDED_ROLES.length + PLACEBO_EXCLUDED_ROLES.length; // 22

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

const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));

// A rise multiplier in [lo, hi], narrowed when the participant's own baseline is
// high enough that the full multiplier would blow past PEAK_ALT_CAP. The lower
// bound always wins, so a TAIL participant is always at least 3x their baseline.
function riseFactor(baseline, lo, hi, u) {
  const headroom = Math.max(lo * 1.05, Math.min(hi, PEAK_ALT_CAP / baseline));
  return lo + u * (headroom - lo);
}

// One measure's five values: the day-0 baseline, then four on-treatment visits
// of which `peakVisit` carries the peak. Every non-peak on-treatment visit is
// pulled to at most 94% of the peak, so the maximum on-treatment value is the
// designated peak in BOTH directions — including a declining participant, whose
// peak sits below baseline and whose bar must therefore point down.
function measureSeries(baseline, peak, peakVisit, digits, rng) {
  const values = [round(baseline, digits)];
  for (let i = 0; i < ON_TREATMENT; i += 1) {
    if (i === peakVisit) {
      values.push(round(peak, digits));
      continue;
    }
    const frac = 0.3 + rng() * 0.45;
    values.push(round(Math.min(baseline + frac * (peak - baseline), peak * 0.94), digits));
  }
  return values;
}

// Baseline ALT for the waterfall population: ONE ladder of 58 evenly spaced
// values from 1.0 to 8.0xULN, dealt alternately to the two arms, plus a wobble
// smaller than the ladder step. Both arms therefore span the full range, and
// the rendered order (placebo ascending, active descending) traces a single
// smooth mountain peaking at the arm boundary. A per-arm archetype table — the
// approach the CLD composite cohort takes — would produce clumps at a handful
// of target values and a stepped trace.
// The wobble is clamped back into 1.0-8.0xULN: the waterfall's population is
// participants with ABNORMAL baseline liver tests, so no plotted baseline may
// drift below the upper limit of normal.
function waterfallBaselineUln(ladderIndex, rng) {
  const span = 1 + (7 * ladderIndex) / (WATERFALL_N - 1);
  return clamp(span + (rng() - 0.5) * 0.06, 1, 8);
}

// Baseline ALT for the excluded population: a second, coarser ladder over
// 1.3-7.5xULN so this sub-population is also spread rather than clumped.
function excludedBaselineUln(ladderIndex, rng) {
  const span = 1.3 + (6.2 * ladderIndex) / (EXCLUDED_N - 1);
  return clamp(span + (rng() - 0.5) * 0.08, 1.3, 7.5);
}

// Assemble the 80 participant specs in a fixed order (waterfall ladder first,
// then the excluded ladder), each dealt alternately between arms.
function buildParticipantSpecs() {
  const specs = [];
  const cursor = { [ARM_PLACEBO]: 0, [ARM_ACTIVE]: 0 };
  for (let i = 0; i < WATERFALL_N; i += 1) {
    const arm = i % 2 === 0 ? ARM_PLACEBO : ARM_ACTIVE;
    const roles = arm === ARM_PLACEBO ? PLACEBO_WATERFALL_ROLES : ACTIVE_WATERFALL_ROLES;
    specs.push({ population: 'waterfall', ladderIndex: i, arm, role: roles[cursor[arm]] });
    cursor[arm] += 1;
  }
  cursor[ARM_PLACEBO] = 0;
  cursor[ARM_ACTIVE] = 0;
  for (let i = 0; i < EXCLUDED_N; i += 1) {
    const arm = i % 2 === 0 ? ARM_PLACEBO : ARM_ACTIVE;
    const roles = arm === ARM_PLACEBO ? PLACEBO_EXCLUDED_ROLES : ACTIVE_EXCLUDED_ROLES;
    specs.push({ population: 'excluded', ladderIndex: i, arm, role: roles[cursor[arm]] });
    cursor[arm] += 1;
  }
  return specs;
}

function buildCohort() {
  const rng = makeRng(20260722);
  const rows = [];
  let n = 0;

  for (const spec of buildParticipantSpecs()) {
    n += 1;
    const usubjid = `${PREFIX}${String(1000 + n)}`;
    const siteid = 800 + (n % 4);
    const sex = SEX[n % SEX.length];
    const race = RACE[n % RACE.length];
    const peakVisit = n % ON_TREATMENT;
    const isWaterfall = spec.population === 'waterfall';

    // --- ALT: baseline from the ladder, peak from the role -----------------
    const baselineAltUln = isWaterfall
      ? waterfallBaselineUln(spec.ladderIndex, rng)
      : excludedBaselineUln(spec.ladderIndex, rng);
    const baselineAlt = round(baselineAltUln * MEASURES.ALT.hi, 0);
    const u = rng();
    let peakAlt;
    if (spec.role === DOWN)
      peakAlt = baselineAlt * (0.45 + u * 0.37); // 0.45-0.82x
    else if (spec.role === RISE) peakAlt = baselineAlt * riseFactor(baselineAlt, 1.12, 1.87, u);
    else if (spec.role === TAIL) peakAlt = baselineAlt * riseFactor(baselineAlt, 3, 6, u);
    else peakAlt = baselineAlt * riseFactor(baselineAlt, 2.2, 3, u); // JAUNDICE
    const altSeries = measureSeries(baselineAlt, peakAlt, peakVisit, MEASURES.ALT.digits, rng);

    // --- TB: the cohort rule and the jaundice flag live here ---------------
    // Waterfall participants start at 0.35-0.75xULN — clear of the 0.8 cohort
    // ceiling even after rounding to the reported decimal. Non-jaundice peaks
    // are capped at 0.9xULN so no one is flagged by accident: the flag is
    // baseline TB <= 1xULN AND peak TB > 1xULN, and exactly seven participants
    // (6 active, 1 placebo) are built to satisfy it.
    let baselineTbUln;
    let peakTbUln;
    if (isWaterfall) {
      baselineTbUln = 0.35 + rng() * 0.4;
      peakTbUln =
        spec.role === JAUNDICE
          ? 2.5 + rng() * 1.5 // 2.5-4.0xULN: unambiguously over the 2.0 flag
          : Math.min(0.9, baselineTbUln * (0.8 + rng() * 0.6));
    } else {
      baselineTbUln = clamp(1.5 + (2.4 * spec.ladderIndex) / (EXCLUDED_N - 1), 1.55, 3.95);
      baselineTbUln += (rng() - 0.5) * 0.08;
      peakTbUln = clamp(baselineTbUln * (0.7 + rng() * 0.7), 0.9, 4.6);
    }
    const tbSeries = measureSeries(
      baselineTbUln * MEASURES.TB.hi,
      peakTbUln * MEASURES.TB.hi,
      peakVisit,
      MEASURES.TB.digits,
      rng
    );

    // --- AST tracks ALT; ALP is mildly elevated and largely stable ---------
    const astRatio = 0.75 + rng() * 0.2;
    const astSeries = altSeries.map((value) => Math.max(6, round(value * astRatio, 0)));
    const alpBase = (0.85 + rng() * 0.8) * MEASURES.ALP.hi;
    const alpSeries = VISITS.map(() => round(alpBase * (0.92 + rng() * 0.16), 0));

    const series = { ALT: altSeries, AST: astSeries, TB: tbSeries, ALP: alpSeries };
    VISITS.forEach((visit, i) => {
      for (const [key, meta] of Object.entries(MEASURES)) {
        rows.push([
          usubjid,
          SITE,
          siteid,
          sex,
          race,
          spec.arm,
          visit.visit,
          visit.visitn,
          meta.test,
          meta.unit,
          series[key][i],
          meta.lo,
          meta.hi
        ]);
      }
    });
  }
  return rows;
}

// Report the signal the cohort exists to carry, computed from the generated
// rows rather than asserted from the specification — so a regeneration that
// drifts is visible at the console, not only in the test suite.
function summarize(rows) {
  const byParticipant = new Map();
  for (const row of rows) {
    const [usubjid, , , , , arm, , visitn, test, , value] = row;
    if (!byParticipant.has(usubjid)) byParticipant.set(usubjid, { arm, alt: {}, tb: {} });
    const participant = byParticipant.get(usubjid);
    if (test === MEASURES.ALT.test) participant.alt[visitn] = Number(value);
    if (test === MEASURES.TB.test) participant.tb[visitn] = Number(value);
  }
  const stats = {};
  for (const [, p] of byParticipant) {
    const key = p.arm === ARM_ACTIVE ? 'active' : 'placebo';
    stats[key] = stats[key] || { n: 0, down: 0, up: 0, jaundice: 0, cohort: 0 };
    const peakAlt = Math.max(...[1, 2, 3, 4].map((v) => p.alt[v]));
    const peakTb = Math.max(...[1, 2, 3, 4].map((v) => p.tb[v]));
    stats[key].n += 1;
    if (peakAlt < p.alt[0]) stats[key].down += 1;
    else stats[key].up += 1;
    if (p.tb[0] <= MEASURES.TB.hi && peakTb > MEASURES.TB.hi) stats[key].jaundice += 1;
    if (p.tb[0] <= 0.8 * MEASURES.TB.hi) stats[key].cohort += 1;
  }
  return stats;
}

function main() {
  // Idempotent: keep anything in the file that is not a generated `ABL-` row,
  // so a re-run replaces this cohort rather than duplicating it.
  let kept = [];
  if (existsSync(dataPath)) {
    const lines = readFileSync(dataPath, 'utf8').split('\n');
    kept = lines
      .slice(1)
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith(PREFIX) && !line.startsWith(csvField(PREFIX)));
  }
  const rows = buildCohort();
  const cohort = rows.map((cells) => cells.map(csvField).join(','));
  writeFileSync(dataPath, [HEADER, ...kept, ...cohort].join('\n') + '\n');

  const participants = cohort.length / (VISITS.length * Object.keys(MEASURES).length);
  const stats = summarize(rows);
  console.log(
    `Wrote synthetic abnormal-baseline hepatic cohort: ${participants} participants, ` +
      `${cohort.length} rows → ${path.relative(rootDir, dataPath)}` +
      (kept.length ? ` (kept ${kept.length} non-${PREFIX} rows).` : '.')
  );
  for (const [side, s] of Object.entries(stats)) {
    console.log(
      `  ${side.padEnd(7)} n=${s.n}  ALT down=${s.down} up=${s.up}  ` +
        `new-onset jaundice=${s.jaundice}  baseline TB ≤0.8×ULN=${s.cohort}`
    );
  }
}

main();
