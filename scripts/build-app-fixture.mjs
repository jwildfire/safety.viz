// Renamed-column study for the demo app's browser tests (#151,
// obot.roadmap#352). Cuts 24 participants from the vendored demo extracts under
// site/data/ and writes them under tests/e2e/fixtures/app/ the way a study
// programmer's folder might arrive: SDTM-style names the app can guess, names
// it cannot, different words for the key measures, one JSON file, and one file
// that belongs to no domain. Deterministic: rerunning reproduces the committed
// files byte for byte.
//
//   node scripts/build-app-fixture.mjs [--out-dir <dir>]
//
// What the app should make of each file is the test's expectation, not this
// script's; see tests/e2e/basic-app-load.spec.js. This is the first cut of the
// non-standard dataset the file loading requirement (obot.roadmap#333) extends.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCsv } from '../src/app/parse.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFlag = process.argv.indexOf('--out-dir');
const outDir =
  outFlag > -1
    ? path.resolve(process.argv[outFlag + 1])
    : path.join(rootDir, 'tests/e2e/fixtures/app');

const demo = (file) => parseCsv(readFileSync(path.join(rootDir, 'site/data', file), 'utf8')).rows;

const csvField = (value) => {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const toCsv = (columns, records) =>
  [columns.join(','), ...records.map((rec) => columns.map((col) => csvField(rec[col])).join(','))]
    .join('\n')
    .concat('\n');

// ---- the cut: the first eight participants of each pilot arm ---------------
const ARMS = ['Placebo', 'Xanomeline Low Dose', 'Xanomeline High Dose'];
const PER_ARM = 8;
const adsl = demo('adsl.csv');
const participants = ARMS.flatMap((arm) =>
  adsl.filter((row) => row.ARM === arm).slice(0, PER_ARM)
).map((row) => row.USUBJID);
const kept = new Set(participants);

// ---- labs and vitals: SDTM-ish names, three invented, key measures renamed --
// Ten measures keep the file small. The liver panel and creatinine are the
// ones charts find by name; three are renamed to words the app's lists know,
// total bilirubin to one they do not, and creatinine is left as the library's
// own default.
const MEASURES = {
  'Alanine Aminotransferase': 'ALT (SGPT)',
  'Aspartate Aminotransferase': 'AST (SGOT)',
  Bilirubin: 'Tot. Bilirubin',
  'Alkaline Phosphatase': 'Alk Phos',
  Creatinine: 'Creatinine',
  Albumin: 'Albumin',
  Glucose: 'Glucose',
  Potassium: 'Potassium',
  'Systolic Blood Pressure': 'Systolic Blood Pressure',
  'Pulse Rate': 'Pulse Rate'
};
const adbds = demo('adbds.csv').filter((row) => kept.has(row.USUBJID) && row.TEST in MEASURES);
const labs = adbds.map((row) => ({
  SUBJID: row.USUBJID,
  CENTRE: row.SITEID,
  SEX: row.SEX,
  RACE: row.RACE,
  TREATMENT: row.ARM,
  AVISIT: row.VISIT,
  AVISITN: row.VISITNUM,
  LBTEST: MEASURES[row.TEST],
  UNITS: row.STRESU,
  LBSTRESN: row.STRESN,
  LLN: row.STNRLO,
  ULN: row.STNRHI
}));

// ---- subject-level: demographics from the labs rows, follow-up renamed ------
const demographics = new Map();
for (const row of adbds) if (!demographics.has(row.USUBJID)) demographics.set(row.USUBJID, row);
const dm = adsl
  .filter((row) => kept.has(row.USUBJID))
  .map((row) => {
    const person = demographics.get(row.USUBJID) || {};
    return {
      SUBJID: row.USUBJID,
      TREATMENT: row.ARM,
      CENTRE: person.SITEID ?? '',
      SEX: person.SEX ?? '',
      RACE: person.RACE ?? '',
      LASTDAY: row.EOSDY,
      STATUS: row.EOSSTT
    };
  });

// ---- adverse events: SDTM names, the arm invented ---------------------------
const ae = demo('adae.csv')
  .filter((row) => kept.has(row.USUBJID))
  .map((row) => ({
    SUBJID: row.USUBJID,
    TREATMENT: row.ARM,
    AESEQ: row.AESEQ,
    AESOC: row.AEBODSYS,
    AEDECOD: row.AEDECOD,
    AETERM: row.AETERM,
    AESEV: row.AESEV,
    AESER: row.AESER,
    AESTDY: row.ASTDY,
    AEENDY: row.AENDY
  }));

// ---- ECG: a JSON list of records, CDISC test names --------------------------
const ECG_MEASURES = {
  QTcF: 'QTcF Interval, Aggregate',
  QTcB: 'QTcB Interval, Aggregate',
  'Heart Rate': 'ECG Mean Heart Rate'
};
const number = (value) => (value === '' ? null : Number(value));
const ecg = demo('adeg.csv')
  .filter((row) => kept.has(row.USUBJID))
  .map((row) => ({
    SUBJID: row.USUBJID,
    TREATMENT: row.ARM,
    AVISIT: row.VISIT,
    AVISITN: number(row.VISITNUM),
    EGTEST: ECG_MEASURES[row.TEST],
    EGSTRESU: row.STRESU,
    EGSTRESN: number(row.STRESN),
    BASE: number(row.BASE),
    CHG: number(row.CHG),
    EGBLFL: row.ABLFL
  }));

// ---- a file that belongs to no domain ---------------------------------------
const notes = ['701', '702', '703'].map((centre, index) => ({
  CENTRE: centre,
  MONITOR: `Monitor ${String.fromCharCode(65 + index)}`,
  VISIT_DATE: `2014-0${index + 1}-15`,
  COMMENT: index % 2 ? 'No findings, routine visit' : 'Source documents reviewed; "queries" raised'
}));

mkdirSync(outDir, { recursive: true });
const write = (name, text) => writeFileSync(path.join(outDir, name), text);
write('labs_final.csv', toCsv(Object.keys(labs[0]), labs));
write('dm.csv', toCsv(Object.keys(dm[0]), dm));
write('ae.csv', toCsv(Object.keys(ae[0]), ae));
write('ecg.json', `${JSON.stringify(ecg, null, 1)}\n`);
write('site_notes.csv', toCsv(Object.keys(notes[0]), notes));

console.log(
  `Wrote the renamed-column study to ${path.relative(rootDir, outDir)}/: ` +
    `${participants.length} participants · labs_final.csv ${labs.length} rows · dm.csv ${dm.length} · ` +
    `ae.csv ${ae.length} · ecg.json ${ecg.length} · site_notes.csv ${notes.length}`
);
