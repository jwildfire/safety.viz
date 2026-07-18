// build-demo-data.mjs — regenerate the vendored demo datasets from a canonical source.
//
// safety.viz demos and evidence run on three vendored CSVs:
//   site/data/adbds.csv — one row per lab / vital-sign measurement (BDS shape)
//   site/data/adae.csv  — one row per adverse event
//   site/data/adeg.csv  — one row per ECG interval measurement (QT / QTc / HR), the
//                         demo dataset for the QT Safety Explorer
//
// This script (re)builds all three from **pharmaverseadam** (https://github.com/pharmaverse/pharmaverseadam),
// the pharmaverse consortium's ADaM test data derived from the CDISC SDTM/ADaM Pilot 01
// study (Apache-2.0). It replaces an earlier synthetic stopgap of unclear provenance.
// See obot.roadmap requirement #25 and docs/DATA_SOURCES.md.
//
// The BDS file is the row-bind of ADaM `adlb` (labs) + `advs` (vitals) — both already
// carry participant demographics, treatment arm, visit, standardized numeric result, and
// reference ranges, so no separate `adsl` join is needed. The AE file is `adae` projected
// to the columns the AE renderers map (MedDRA SOC/PT, severity, seriousness, study days).
// The ECG file is `adeg` projected to a QT measure contract (QTcF / QTcB / HR, each with
// its analysis value, source-derived baseline, and change-from-baseline) — see buildEg.
//
// Usage:  node scripts/build-demo-data.mjs [--source-dir <dir>] [--out-dir <dir>]
//   Fetches the source CSVs from raw.githubusercontent.com by default (cached under
//   node's tmp), or reads them from --source-dir if provided
//   (adlb.csv/advs.csv/adae.csv/adsl.csv/adeg.csv).
//   Writes adbds.csv + adae.csv + adeg.csv to --out-dir (default: site/data).
//
// The generated CSVs are committed to the repo; rerun this script to refresh them.

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

const PHARMAVERSEADAM_BASE =
  'https://raw.githubusercontent.com/pharmaverse/pharmaverseadam/main/inst/extdata';
const SOURCE_FILES = ['adlb.csv', 'advs.csv', 'adae.csv', 'adsl.csv', 'adeg.csv'];

// ECG measure panel for the QT Safety Explorer demo. The pilot ADEG carries eight
// PARAMCDs; the demo keeps the two fixed heart-rate corrections in scope for Phase 1
// (QTcF / QTcB) plus heart rate, which the QT workflow reads alongside QTc (an
// increase to ≥100 bpm or ≥25% can itself drive an apparent QTc change). QT-RR is out
// of scope, and the pilot has no PR/QRS intervals and no moxifloxacin positive-control
// arm — expected for CDISC Pilot 01; those are Phase-2 items on a richer dataset.
// Maps source PARAMCD → display name + unit.
const EG_PARAMS = [
  { paramcd: 'QTCFR', test: 'QTcF', unit: 'msec' },
  { paramcd: 'QTCBR', test: 'QTcB', unit: 'msec' },
  { paramcd: 'HR', test: 'Heart Rate', unit: 'beats/min' }
];
const EG_PARAM_BY_CODE = new Map(EG_PARAMS.map((p) => [p.paramcd, p]));
// The pilot records each visit at three postural timepoints (supine, standing 1 min,
// standing 3 min) plus a DTYPE=AVERAGE roll-up. Keep the supine reading — the resting
// posture ICH-E14 analyses use — which carries the source-derived BASE and CHG the QT
// displays need (the AVERAGE roll-up rows do not).
const EG_TIMEPOINT = 'AFTER LYING DOWN FOR 5 MINUTES';

// Curated measure panel for the demo BDS. The full pilot carries 55 measures
// (incl. sparse cell-morphology / qualitative-urinalysis labs); the demo keeps a
// clinically-meaningful continuous panel — core chemistry, the CBC, key vitals, and
// two endocrine markers — all of which carry reference ranges for the normal-range
// overlay. Names must match adlb LBTEST / advs PARAM (unit-stripped) exactly; the
// build warns if any entry is missing from the source.
const MEASURE_ALLOWLIST = [
  // Vitals
  'Diastolic Blood Pressure',
  'Systolic Blood Pressure',
  'Pulse Rate',
  'Temperature',
  'Weight',
  // Chemistry
  'Albumin',
  'Alanine Aminotransferase',
  'Alkaline Phosphatase',
  'Aspartate Aminotransferase',
  'Bilirubin',
  'Blood Urea Nitrogen',
  'Calcium',
  'Chloride',
  'Cholesterol',
  'Creatinine',
  'Gamma Glutamyl Transferase',
  'Glucose',
  'Phosphate',
  'Potassium',
  'Protein',
  'Sodium',
  'Urate',
  // Hematology (CBC)
  'Hemoglobin',
  'Hematocrit',
  'Erythrocytes',
  'Leukocytes',
  'Platelet',
  'Lymphocytes'
];
// (Thyrotropin / Vitamin B12 are in the pilot but have too few analysis-flagged
// records to form a histogram, so they are left out of the demo panel.)
const ALLOWED = new Set(MEASURE_ALLOWLIST);

// ---- tiny arg parser ------------------------------------------------------
function parseArgs(argv) {
  const args = { sourceDir: null, outDir: join(REPO_ROOT, 'site', 'data') };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--source-dir') args.sourceDir = argv[(i += 1)];
    else if (argv[i] === '--out-dir') args.outDir = argv[(i += 1)];
  }
  return args;
}

// ---- RFC-4180 CSV parse / serialize ---------------------------------------
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toRecords(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0];
  const records = [];
  for (let r = 1; r < rows.length; r += 1) {
    if (rows[r].length === 1 && rows[r][0] === '') continue; // trailing blank line
    const rec = {};
    for (let c = 0; c < header.length; c += 1) rec[header[c]] = rows[r][c];
    records.push(rec);
  }
  return records;
}

function csvField(value) {
  const s = value == null ? '' : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(columns, records) {
  const lines = [columns.join(',')];
  for (const rec of records) lines.push(columns.map((col) => csvField(rec[col])).join(','));
  return lines.join('\n') + '\n';
}

// ---- value helpers --------------------------------------------------------
// pharmaverseadam CSVs encode missing values as the literal string `NA` (R's
// write.csv convention). Treat that — and empty — as blank everywhere.
const isBlank = (v) => v == null || v === '' || v === 'NA';
const isNum = (v) => !isBlank(v) && Number.isFinite(Number(v));
const clean = (v) => (isBlank(v) ? '' : v); // string field → '' when missing
const num = (v) => (isNum(v) ? v : ''); // numeric field → '' when missing

// Vitals carry the measure name in PARAM with a trailing unit, e.g.
// "Diastolic Blood Pressure (mmHg)"; split it into a clean name + unit.
function splitParamUnit(param) {
  const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(param || '');
  return m ? { name: m[1].trim(), unit: m[2].trim() } : { name: (param || '').trim(), unit: '' };
}

// ---- fetch / load source --------------------------------------------------
async function loadSource(name, sourceDir) {
  if (sourceDir) {
    const p = join(sourceDir, name);
    console.log(`  reading ${p}`);
    return readFile(p, 'utf8');
  }
  const cacheDir = join(tmpdir(), 'safety-viz-demo-data');
  await mkdir(cacheDir, { recursive: true });
  const cached = join(cacheDir, name);
  if (existsSync(cached)) {
    console.log(`  cached ${cached}`);
    return readFile(cached, 'utf8');
  }
  const url = `${PHARMAVERSEADAM_BASE}/${name}`;
  console.log(`  fetching ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(cached));
  return readFile(cached, 'utf8');
}

// ---- transforms -----------------------------------------------------------
// Map one ADaM BDS record (adlb or advs) to the safety.viz measure contract.
// `name`/`unit` are resolved per-domain by the caller (labs use LBTEST/LBSTRESU;
// vitals derive both from PARAM, whose VSTEST is not populated). AVAL is the
// standardized numeric result, consistent with the unit and ANRLO/ANRHI range.
function mapMeasure(rec, name, unit) {
  return {
    USUBJID: clean(rec.USUBJID),
    SITE: isBlank(rec.SITEID) ? '' : `Clinical Site ${rec.SITEID}`,
    SITEID: clean(rec.SITEID),
    SEX: clean(rec.SEX),
    RACE: clean(rec.RACE),
    ARM: clean(rec.ARM),
    VISIT: clean(rec.AVISIT) || clean(rec.VISIT),
    VISITNUM: clean(rec.AVISITN) || clean(rec.VISITNUM),
    TEST: name,
    STRESU: unit,
    STRESN: rec.AVAL,
    STNRLO: num(rec.ANRLO),
    STNRHI: num(rec.ANRHI)
  };
}

// Keep one analysis record per measurement: numeric result, not an ADaM-derived row
// (DTYPE populated = derived, e.g. calculated absolutes / baseline averages), and either
// the primary-analysis record (ANL01FL='Y') or the baseline record (ABLFL='Y' — baseline
// carries ABLFL, not ANL01FL, so it must be kept explicitly or change-from-baseline
// displays lose their anchor visit). Together this de-duplicates the intra-visit
// vital-sign timepoints to one analysis value per visit while retaining baseline.
const isAnalysisMeasure = (rec) =>
  isBlank(rec.DTYPE) && isNum(rec.AVAL) && (rec.ANL01FL === 'Y' || rec.ABLFL === 'Y');

function buildBds(adlbText, advsText) {
  const labs = toRecords(adlbText)
    .filter((r) => isAnalysisMeasure(r) && ALLOWED.has(clean(r.LBTEST)))
    .map((r) => mapMeasure(r, clean(r.LBTEST), clean(r.LBSTRESU)));
  const vitals = toRecords(advsText)
    .filter((r) => isAnalysisMeasure(r) && ALLOWED.has(splitParamUnit(r.PARAM).name))
    .map((r) => {
      const { name, unit } = splitParamUnit(r.PARAM);
      return mapMeasure(r, name, clean(r.VSSTRESU) || unit);
    });
  const columns = [
    'USUBJID',
    'SITE',
    'SITEID',
    'SEX',
    'RACE',
    'ARM',
    'VISIT',
    'VISITNUM',
    'TEST',
    'STRESU',
    'STRESN',
    'STNRLO',
    'STNRHI'
  ];
  const records = [...labs, ...vitals];

  // Guard: every curated measure should be present in the source.
  const found = new Set(records.map((r) => r.TEST));
  const missing = MEASURE_ALLOWLIST.filter((m) => !found.has(m));
  if (missing.length)
    console.warn(`  WARNING: curated measures not found in source: ${missing.join(', ')}`);

  return { columns, records };
}

function buildAe(adaeText, adslText) {
  // AETERM is the verbatim term the AE Timelines renderer requires (term_col);
  // AEDECOD/AEBODSYS are the MedDRA PT/SOC the AE Explorer's hierarchy uses.
  const columns = [
    'USUBJID',
    'ARM',
    'AESEQ',
    'AEBODSYS',
    'AEDECOD',
    'AETERM',
    'AESEV',
    'AESER',
    'ASTDY',
    'AENDY'
  ];
  const records = toRecords(adaeText)
    // Treatment-emergent AEs only (TRTEMFL='Y') — the standard focus of an AE
    // safety display, and it drops a handful of pre-existing conditions whose
    // onset is years before treatment (ASTDY down to −13,469) that otherwise
    // dominate the timeline axis.
    .filter((r) => r.TRTEMFL === 'Y' && (!isBlank(r.AETERM) || !isBlank(r.AEDECOD)))
    .map((r) => ({
      USUBJID: clean(r.USUBJID),
      ARM: clean(r.TRTA) || clean(r.ARM),
      AESEQ: clean(r.AESEQ),
      AEBODSYS: clean(r.AEBODSYS),
      AEDECOD: clean(r.AEDECOD),
      AETERM: clean(r.AETERM) || clean(r.AEDECOD),
      AESEV: clean(r.AESEV) || clean(r.ASEV),
      AESER: clean(r.AESER),
      ASTDY: num(r.ASTDY),
      AENDY: num(r.AENDY)
    }));

  // One placeholder row (all AE columns blank) per safety-population subject
  // with no treatment-emergent AEs, so participant denominators are the
  // treated population, not just participants with events — the AE
  // renderers' shared placeholder-row convention (AE Explorer counts them
  // toward group denominators; AE Timelines keeps them in its participant
  // total while dropping the blank-term record with a reported count).
  const seen = new Set(records.map((r) => r.USUBJID));
  const placeholders = toRecords(adslText)
    .filter((r) => r.SAFFL === 'Y' && !seen.has(clean(r.USUBJID)))
    .map((r) => ({
      USUBJID: clean(r.USUBJID),
      ARM: clean(r.TRT01A) || clean(r.ARM),
      AESEQ: '',
      AEBODSYS: '',
      AEDECOD: '',
      AETERM: '',
      AESEV: '',
      AESER: '',
      ASTDY: '',
      AENDY: ''
    }));
  return { columns, records: [...records, ...placeholders], placeholders: placeholders.length };
}

// Map one ADaM ADEG record to the QT measure contract. Keeps the source-standardized
// analysis value (AVAL), the source-derived baseline (BASE) and change-from-baseline
// (CHG) — no correction formula is recomputed here; QTcF/QTcB arrive pre-derived from
// the pilot. One row per participant × visit × ECG parameter (supine timepoint).
function mapEg(rec, param) {
  return {
    USUBJID: clean(rec.USUBJID),
    SITE: isBlank(rec.SITEID) ? '' : `Clinical Site ${rec.SITEID}`,
    SITEID: clean(rec.SITEID),
    SEX: clean(rec.SEX),
    RACE: clean(rec.RACE),
    AGE: num(rec.AGE),
    ARM: clean(rec.TRTA) || clean(rec.ARM),
    VISIT: clean(rec.AVISIT) || clean(rec.VISIT),
    VISITNUM: clean(rec.AVISITN) || clean(rec.VISITNUM),
    PARAMCD: param.paramcd,
    TEST: param.test,
    STRESU: param.unit,
    STRESN: rec.AVAL,
    BASE: num(rec.BASE),
    CHG: num(rec.CHG),
    ABLFL: clean(rec.ABLFL)
  };
}

// Keep one analysis reading per participant × visit × parameter: the supine timepoint,
// a source reading (not the DTYPE=AVERAGE roll-up, which lacks BASE/CHG), and either the
// primary-analysis record (ANL01FL='Y') or the baseline record (ABLFL='Y' — baseline
// carries ABLFL, not ANL01FL, and anchors every change-from-baseline display). Mirrors
// the BDS build's isAnalysisMeasure, restricted to the supine posture.
const isEgAnalysisRecord = (rec) =>
  isBlank(rec.DTYPE) &&
  clean(rec.ATPT) === EG_TIMEPOINT &&
  isNum(rec.AVAL) &&
  (rec.ANL01FL === 'Y' || rec.ABLFL === 'Y');

function buildEg(adegText) {
  const columns = [
    'USUBJID',
    'SITE',
    'SITEID',
    'SEX',
    'RACE',
    'AGE',
    'ARM',
    'VISIT',
    'VISITNUM',
    'PARAMCD',
    'TEST',
    'STRESU',
    'STRESN',
    'BASE',
    'CHG',
    'ABLFL'
  ];
  const records = toRecords(adegText)
    .filter((r) => isEgAnalysisRecord(r) && EG_PARAM_BY_CODE.has(clean(r.PARAMCD)))
    .map((r) => mapEg(r, EG_PARAM_BY_CODE.get(clean(r.PARAMCD))));

  // Guard: every curated parameter should be present in the source.
  const found = new Set(records.map((r) => r.PARAMCD));
  const missing = EG_PARAMS.filter((p) => !found.has(p.paramcd)).map((p) => p.paramcd);
  if (missing.length)
    console.warn(`  WARNING: curated ECG parameters not found in source: ${missing.join(', ')}`);

  return { columns, records };
}

// ---- main -----------------------------------------------------------------
async function main() {
  const { sourceDir, outDir } = parseArgs(process.argv.slice(2));
  console.log('Loading pharmaverseadam source datasets…');
  const [adlbText, advsText, adaeText, adslText, adegText] = await Promise.all(
    SOURCE_FILES.map((f) => loadSource(f, sourceDir))
  );

  const bds = buildBds(adlbText, advsText);
  const ae = buildAe(adaeText, adslText);
  const eg = buildEg(adegText);

  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'adbds.csv'), toCsv(bds.columns, bds.records));
  await writeFile(join(outDir, 'adae.csv'), toCsv(ae.columns, ae.records));
  await writeFile(join(outDir, 'adeg.csv'), toCsv(eg.columns, eg.records));

  const measures = new Set(bds.records.map((r) => r.TEST));
  const subjects = new Set(bds.records.map((r) => r.USUBJID));
  const arms = new Set(bds.records.map((r) => r.ARM));
  console.log(
    `\nadbds.csv: ${bds.records.length} rows · ${subjects.size} participants · ` +
      `${measures.size} measures · arms {${[...arms].join(', ')}}`
  );
  console.log(
    `adae.csv : ${ae.records.length - ae.placeholders} events + ${ae.placeholders} ` +
      `placeholder rows · ${new Set(ae.records.map((r) => r.USUBJID)).size} participants · ` +
      `${new Set(ae.records.map((r) => r.AEBODSYS).filter(Boolean)).size} body systems`
  );
  const egSubjects = new Set(eg.records.map((r) => r.USUBJID));
  const egParams = new Set(eg.records.map((r) => r.TEST));
  const egArms = new Set(eg.records.map((r) => r.ARM));
  console.log(
    `adeg.csv : ${eg.records.length} rows · ${egSubjects.size} participants · ` +
      `${egParams.size} parameters {${[...egParams].join(', ')}} · arms {${[...egArms].join(', ')}}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
