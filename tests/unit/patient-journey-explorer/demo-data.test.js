import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PJE_AE_COLUMNS,
  PJE_CM_COLUMNS,
  PJE_DS_COLUMNS,
  PJE_EX_COLUMNS,
  PJE_LB_COLUMNS,
  PJE_LB_TESTS,
  PJE_MH_COLUMNS,
  PJE_OUTPUTS,
  buildPjeAeRecords,
  buildPjeCmRecords,
  buildPjeDsRecords,
  buildPjeExRecords,
  buildPjeLbRecords,
  buildPjeMhRecords,
  safetySubjects
} from '../../../scripts/demo-data-lib.mjs';

// Demo-data derivation guards for the Patient Journey Explorer (safety.viz#142,
// obot.roadmap#349). Six per-domain extracts under site/data/pje-*.csv, five from
// pharmaverseadam and one (disposition) from pharmaversesdtm because no ADaM DS
// dataset exists (design D24). Each builder is pure and `{ columns, records }`-shaped
// like buildAdslRecords, so the derivation rules are asserted here on hand-made rows
// without downloading the ~80 MB of source, and the committed files are guarded
// against silent upstream drift with facts measured 2026-09-18 from the raw rows
// (see docs/DATA_SOURCES.md). This file lives under the module's own directory so
// the evidence pipeline routes its records to the module rather than to every
// renderer's evidence page.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DATA = join(ROOT, 'site', 'data');

// Quote-aware RFC-4180 reader: the extracts carry verbatim terms with commas.
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

function readExtract(file) {
  const rows = parseCsv(readFileSync(join(DATA, file), 'utf8'));
  const header = rows[0];
  const records = rows
    .slice(1)
    .filter((r) => !(r.length === 1 && r[0] === ''))
    .map((r) => Object.fromEntries(header.map((col, i) => [col, r[i]])));
  return { header, records };
}

const subjects = (records) => new Set(records.map((r) => r.USUBJID));
const rowsFor = (records, id) => records.filter((r) => r.USUBJID === id);

// ---- builders -------------------------------------------------------------

describe('buildPjeExRecords', () => {
  const ex = (over = {}) => ({
    USUBJID: '01',
    EXTRT: 'XANOMELINE',
    EXDOSE: '54',
    EXDOSU: 'mg',
    ASTDY: '1',
    AENDY: '16',
    EXSTDTC: '2013-12-16',
    TRTSDT: '2013-12-16',
    PARAMCD: 'DOSE',
    ...over
  });

  it('PJE-DEMO-001: keeps only the PARAMCD=DOSE exposure records, in the declared columns (#142)', () => {
    const { columns, records } = buildPjeExRecords([
      ex(),
      ex({ PARAMCD: 'DOSEO' }),
      ex({ PARAMCD: 'PDOSEO' }),
      ex({ ASTDY: '17', AENDY: '174', EXDOSE: '81' })
    ]);
    expect(columns).toEqual(PJE_EX_COLUMNS);
    expect(PJE_EX_COLUMNS).toEqual([
      'USUBJID',
      'EXTRT',
      'EXDOSE',
      'EXDOSU',
      'ASTDY',
      'AENDY',
      'EXSTDTC',
      'TRTSDT'
    ]);
    expect(records).toHaveLength(2);
    expect(records[1]).toEqual({
      USUBJID: '01',
      EXTRT: 'XANOMELINE',
      EXDOSE: '81',
      EXDOSU: 'mg',
      ASTDY: '17',
      AENDY: '174',
      EXSTDTC: '2013-12-16',
      TRTSDT: '2013-12-16'
    });
  });

  it('PJE-DEMO-001: writes blanks, never the literal NA, for missing values (#142)', () => {
    const { records } = buildPjeExRecords([ex({ AENDY: 'NA', EXSTDTC: 'NA', EXDOSE: 'NA' })]);
    expect(records[0]).toMatchObject({ AENDY: '', EXSTDTC: '', EXDOSE: '' });
    expect(Object.values(records[0])).not.toContain('NA');
  });
});

describe('buildPjeAeRecords', () => {
  const ae = (over = {}) => ({
    USUBJID: '01',
    AETERM: 'ERYTHEMA',
    AEDECOD: 'ERYTHEMA',
    AEBODSYS: 'SKIN AND SUBCUTANEOUS TISSUE DISORDERS',
    ASTDY: '30',
    AENDY: 'NA',
    AESEV: 'MODERATE',
    AESER: 'N',
    AEREL: 'PROBABLE',
    AEOUT: 'NOT RECOVERED/NOT RESOLVED',
    AESTDTC: '2014-01-14',
    TRTSDT: '2013-12-16',
    TRTEMFL: 'Y',
    ...over
  });

  it('PJE-DEMO-001: keeps treatment-emergent events only and carries AEOUT for the end-state rule (#142)', () => {
    const { columns, records } = buildPjeAeRecords([ae(), ae({ TRTEMFL: 'NA', ASTDY: '-900' })]);
    expect(columns).toEqual(PJE_AE_COLUMNS);
    expect(PJE_AE_COLUMNS).toEqual([
      'USUBJID',
      'AETERM',
      'AEDECOD',
      'AEBODSYS',
      'ASTDY',
      'AENDY',
      'AESEV',
      'AESER',
      'AEREL',
      'AEOUT',
      'AESTDTC',
      'TRTSDT'
    ]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      AEDECOD: 'ERYTHEMA',
      ASTDY: '30',
      AENDY: '',
      AEOUT: 'NOT RECOVERED/NOT RESOLVED'
    });
  });
});

describe('buildPjeLbRecords', () => {
  const lb = (over = {}) => ({
    USUBJID: '01',
    LBTEST: 'Aspartate Aminotransferase',
    LBTESTCD: 'AST',
    PARAMCD: 'AST',
    AVAL: '36',
    LBSTRESU: 'U/L',
    ANRLO: '8',
    ANRHI: '34',
    ANRIND: 'HIGH',
    LBNRIND: 'NORMAL',
    ABLFL: 'NA',
    ANL01FL: 'Y',
    DTYPE: 'NA',
    ADY: '27',
    ADT: '2014-01-11',
    TRTSDT: '2013-12-16',
    ...over
  });

  it('PJE-DEMO-001: applies the analysis filter (DTYPE blank, ANL01FL or ABLFL, numeric AVAL) restricted to the liver panel (#142)', () => {
    const { columns, records } = buildPjeLbRecords([
      lb(),
      lb({ ANL01FL: 'NA', ABLFL: 'Y', ADY: '-10', AVAL: '29', ANRIND: 'NORMAL' }),
      lb({ DTYPE: 'AVERAGE' }),
      lb({ ANL01FL: 'NA' }),
      lb({ AVAL: 'NA' }),
      lb({ LBTEST: 'Sodium', LBTESTCD: 'SODIUM' })
    ]);
    expect(columns).toEqual(PJE_LB_COLUMNS);
    expect(PJE_LB_COLUMNS).toEqual([
      'USUBJID',
      'LBTEST',
      'LBTESTCD',
      'LBSTRESN',
      'LBSTRESU',
      'LBSTNRLO',
      'LBSTNRHI',
      'LBNRIND',
      'ABLFL',
      'LBDY',
      'LBDTC',
      'TRTSDT'
    ]);
    expect(records.map((r) => r.LBDY)).toEqual(['27', '-10']);
    expect(records[1]).toMatchObject({ ABLFL: 'Y', LBSTRESN: '29' });
  });

  it('PJE-DEMO-001: renames the ADaM analysis columns to the module defaults and prefers ANRIND over LBNRIND (#142)', () => {
    const { records } = buildPjeLbRecords([lb(), lb({ ANRIND: 'NA', LBNRIND: 'LOW' })]);
    expect(records[0]).toEqual({
      USUBJID: '01',
      LBTEST: 'Aspartate Aminotransferase',
      LBTESTCD: 'AST',
      LBSTRESN: '36',
      LBSTRESU: 'U/L',
      LBSTNRLO: '8',
      LBSTNRHI: '34',
      LBNRIND: 'HIGH',
      ABLFL: '',
      LBDY: '27',
      LBDTC: '2014-01-11',
      TRTSDT: '2013-12-16'
    });
    expect(records[1].LBNRIND).toBe('LOW');
  });

  it('PJE-DEMO-001: the default panel is the four liver tests, matched on LBTEST, and a missing test warns by name (#142)', () => {
    expect(PJE_LB_TESTS).toEqual([
      'Alanine Aminotransferase',
      'Aspartate Aminotransferase',
      'Bilirubin',
      'Alkaline Phosphatase'
    ]);
    const warnings = [];
    buildPjeLbRecords([lb()], { warn: (msg) => warnings.push(msg) });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Bilirubin');
    expect(warnings[0]).not.toContain('Aspartate');
  });
});

describe('buildPjeCmRecords', () => {
  const cm = (over = {}) => ({
    USUBJID: '01',
    CMSEQ: '5',
    CMTRT: 'MAALOX',
    CMDECOD: 'MAALOX',
    CMCLAS: 'ALIMENTARY TRACT AND METABOLISM',
    CMDOSE: 'NA',
    CMROUTE: 'ORAL',
    ASTDY: '1',
    AENDY: 'NA',
    CMSTDTC: '2013',
    CMENDTC: 'NA',
    TRTSDT: '2013-12-16',
    VISIT: 'WEEK 2',
    ...over
  });

  it('PJE-DEMO-001: de-duplicates the per-visit repeats to one row per course and keeps the lowest CMSEQ (#142)', () => {
    const { columns, records } = buildPjeCmRecords([
      cm({ CMSEQ: '9', VISIT: 'WEEK 4' }),
      cm({ CMSEQ: '5' }),
      cm({ CMSEQ: '7', VISIT: 'WEEK 3' }),
      // a different course of the same drug (different start) survives
      cm({ CMSEQ: '11', ASTDY: '43', CMSTDTC: '2014-01-27' }),
      // a different dose is a different course
      cm({ CMSEQ: '12', CMDOSE: '10' })
    ]);
    expect(columns).toEqual(PJE_CM_COLUMNS);
    expect(PJE_CM_COLUMNS).toEqual([
      'USUBJID',
      'CMTRT',
      'CMDECOD',
      'CMCLAS',
      'CMDOSE',
      'CMROUTE',
      'ASTDY',
      'AENDY',
      'CMSTDTC',
      'CMENDTC',
      'TRTSDT'
    ]);
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      USUBJID: '01',
      CMTRT: 'MAALOX',
      CMDECOD: 'MAALOX',
      CMCLAS: 'ALIMENTARY TRACT AND METABOLISM',
      CMDOSE: '',
      CMROUTE: 'ORAL',
      ASTDY: '1',
      AENDY: '',
      CMSTDTC: '2013',
      CMENDTC: '',
      TRTSDT: '2013-12-16'
    });
    expect(records.map((r) => r.ASTDY)).toEqual(['1', '43', '1']);
    expect(records[2].CMDOSE).toBe('10');
  });

  it('PJE-DEMO-001: keeps UNCODED as an ordinary class value (#142)', () => {
    const { records } = buildPjeCmRecords([cm({ CMCLAS: 'UNCODED', CMDECOD: 'NA' })]);
    expect(records[0]).toMatchObject({ CMCLAS: 'UNCODED', CMDECOD: '' });
  });
});

describe('buildPjeMhRecords', () => {
  const mh = (over = {}) => ({
    USUBJID: '01',
    MHTERM: 'VERBATIM_0308',
    MHDECOD: 'APPENDICECTOMY',
    MHCAT: 'HISTORICAL DIAGNOSIS',
    MHDY: '-6',
    ASTDY: 'NA',
    MHSTRTPT: 'BEFORE',
    MHENRTPT: 'NA',
    MHSTDTC: 'NA',
    TRTSDT: '2013-12-16',
    ...over
  });

  it('PJE-DEMO-001: plots at the collection day MHDY and carries the onset day separately as MHONSDY (#142)', () => {
    const { columns, records } = buildPjeMhRecords([
      mh(),
      mh({ MHTERM: 'ALZHEIMER', MHDECOD: 'NA', MHCAT: 'PRIMARY DIAGNOSIS', ASTDY: '-1311' })
    ]);
    expect(columns).toEqual(PJE_MH_COLUMNS);
    expect(PJE_MH_COLUMNS).toEqual([
      'USUBJID',
      'MHTERM',
      'MHDECOD',
      'MHCAT',
      'MHDY',
      'MHONSDY',
      'MHSTRTPT',
      'MHENRTPT',
      'MHSTDTC',
      'TRTSDT'
    ]);
    expect(records[0]).toEqual({
      USUBJID: '01',
      MHTERM: 'VERBATIM_0308',
      MHDECOD: 'APPENDICECTOMY',
      MHCAT: 'HISTORICAL DIAGNOSIS',
      MHDY: '-6',
      MHONSDY: '',
      MHSTRTPT: 'BEFORE',
      MHENRTPT: '',
      MHSTDTC: '',
      TRTSDT: '2013-12-16'
    });
    expect(records[1]).toMatchObject({ MHDY: '-6', MHONSDY: '-1311', MHDECOD: '' });
  });
});

describe('buildPjeDsRecords', () => {
  const ds = (over = {}) => ({
    USUBJID: '01',
    DSSEQ: '2',
    DSTERM: 'PROTOCOL COMPLETED',
    DSDECOD: 'COMPLETED',
    DSCAT: 'DISPOSITION EVENT',
    DSSTDTC: '2014-06-17',
    DSSTDY: '184',
    ...over
  });
  const adsl = [
    { USUBJID: '01', SAFFL: 'Y', TRTSDT: '2013-12-16' },
    { USUBJID: '02', SAFFL: 'N', TRTSDT: 'NA' },
    { USUBJID: '03', SAFFL: 'Y', TRTSDT: '2014-02-02' }
  ];

  it('PJE-DEMO-001: restricts the SDTM disposition rows to the safety population and joins TRTSDT from adsl (#142)', () => {
    const subjectMap = safetySubjects(adsl);
    expect([...subjectMap.entries()]).toEqual([
      ['01', '2013-12-16'],
      ['03', '2014-02-02']
    ]);
    const { columns, records } = buildPjeDsRecords(
      [
        ds({
          DSSEQ: '1',
          DSTERM: 'RANDOMIZED',
          DSDECOD: 'RANDOMIZED',
          DSCAT: 'PROTOCOL MILESTONE',
          DSSTDTC: '2013-12-16',
          DSSTDY: '1'
        }),
        ds(),
        ds({ USUBJID: '02' }),
        ds({ USUBJID: '99' })
      ],
      { subjects: subjectMap }
    );
    expect(columns).toEqual(PJE_DS_COLUMNS);
    expect(PJE_DS_COLUMNS).toEqual([
      'USUBJID',
      'DSDECOD',
      'DSTERM',
      'DSCAT',
      'DSSTDY',
      'DSSTDTC',
      'TRTSDT'
    ]);
    expect(records).toEqual([
      {
        USUBJID: '01',
        DSDECOD: 'RANDOMIZED',
        DSTERM: 'RANDOMIZED',
        DSCAT: 'PROTOCOL MILESTONE',
        DSSTDY: '1',
        DSSTDTC: '2013-12-16',
        TRTSDT: '2013-12-16'
      },
      {
        USUBJID: '01',
        DSDECOD: 'COMPLETED',
        DSTERM: 'PROTOCOL COMPLETED',
        DSCAT: 'DISPOSITION EVENT',
        DSSTDY: '184',
        DSSTDTC: '2014-06-17',
        TRTSDT: '2013-12-16'
      }
    ]);
  });

  it('PJE-DEMO-001: warns naming every safety participant with no disposition row (#142)', () => {
    const warnings = [];
    buildPjeDsRecords([ds()], { subjects: safetySubjects(adsl), warn: (m) => warnings.push(m) });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('03');
    expect(warnings[0]).not.toContain('01');
  });
});

// ---- committed files ------------------------------------------------------

describe('committed pje-*.csv extracts', () => {
  // Guard against silent upstream drift: measured 2026-09-18 from the live
  // pharmaverseadam extracts and pharmaversesdtm ds.csv at the revision named in
  // docs/DATA_SOURCES.md. Regeneration that shifts the demo breaks here loudly.
  const EXPECTED = {
    'pje-ex.csv': { columns: PJE_EX_COLUMNS, rows: 591, subjects: 254 },
    'pje-ae.csv': { columns: PJE_AE_COLUMNS, rows: 1122, subjects: 217 },
    'pje-lb.csv': { columns: PJE_LB_COLUMNS, rows: 6639, subjects: 254 },
    'pje-cm.csv': { columns: PJE_CM_COLUMNS, rows: 1081, subjects: 229 },
    'pje-mh.csv': { columns: PJE_MH_COLUMNS, rows: 1818, subjects: 254 },
    'pje-ds.csv': { columns: PJE_DS_COLUMNS, rows: 798, subjects: 254 }
  };

  it('PJE-DEMO-001: the six outputs are declared once, with the published headers (#142)', () => {
    expect(Object.fromEntries(PJE_OUTPUTS.map((o) => [o.file, o.columns]))).toEqual(
      Object.fromEntries(Object.entries(EXPECTED).map(([file, e]) => [file, e.columns]))
    );
  });

  for (const [file, e] of Object.entries(EXPECTED)) {
    it(`PJE-DEMO-001: ${file} carries the published header, ${e.rows} rows and ${e.subjects} participants, with no NA cells (#142)`, () => {
      const { header, records } = readExtract(file);
      expect(header).toEqual(e.columns);
      expect(records).toHaveLength(e.rows);
      expect(subjects(records).size).toBe(e.subjects);
      expect(records.some((r) => Object.values(r).includes('NA'))).toBe(false);
      expect(records.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.TRTSDT))).toBe(true);
    });
  }

  it("PJE-DEMO-001: the guide's data caveats are the extracts' own numbers — 71% of con-med courses have no end date, 83% are UNCODED, and the lab indicator carries only NORMAL, HIGH and LOW (#142)", () => {
    // docs/guides/patient-journey-explorer.md quotes these; a figure nobody
    // re-measures propagates, so the guide's numbers fail here if the
    // extracts change.
    const cm = readExtract('pje-cm.csv').records;
    const blankEnd = cm.filter((r) => r.AENDY === '').length;
    expect(Math.round((100 * blankEnd) / cm.length)).toBe(71);
    const uncoded = cm.filter((r) => r.CMCLAS === 'UNCODED').length;
    expect(Math.round((100 * uncoded) / cm.length)).toBe(83);
    const lb = readExtract('pje-lb.csv').records;
    expect(new Set(lb.map((r) => r.LBNRIND))).toEqual(new Set(['NORMAL', 'HIGH', 'LOW']));
    // The demo names the onset column the extract ships (MHONSDY), so the
    // 17% of history rows that carry an onset day are read, not ignored.
    const mh = readExtract('pje-mh.csv').records;
    expect(mh[0]).toHaveProperty('MHONSDY');
    expect(mh.some((r) => r.MHONSDY !== '')).toBe(true);
    const demo = readFileSync(join(ROOT, 'site', 'demo', 'patient-journey-explorer.js'), 'utf8');
    expect(demo).toContain("mh_onset_stdy_col: 'MHONSDY'");
    expect(demo).not.toMatch(/height:\s*\d+/);
  });

  it('PJE-DEMO-001: the six files together cover exactly the 254 safety participants (#142)', () => {
    const union = new Set();
    for (const file of Object.keys(EXPECTED))
      for (const id of subjects(readExtract(file).records)) union.add(id);
    expect(union.size).toBe(254);
    const adsl = subjects(readExtract('adsl.csv').records);
    expect([...union].every((id) => adsl.has(id))).toBe(true);
  });

  it('PJE-DEMO-001: the seeded participant 01-716-1447 carries the documented day-30 anchor story (#142)', () => {
    const id = '01-716-1447';
    // Exposure: 54 → 81 at day 17, 81 → 54 at day 175.
    const ex = rowsFor(readExtract('pje-ex.csv').records, id);
    expect(ex.map((r) => [r.EXDOSE, r.ASTDY, r.AENDY])).toEqual([
      ['54', '1', '16'],
      ['81', '17', '174'],
      ['54', '175', '184']
    ]);
    // The anchor and its neighbours: every blank end carries the ongoing outcome.
    // Rows keep adae source order (AESEQ), so compare in day order.
    const ae = rowsFor(readExtract('pje-ae.csv').records, id).sort(
      (a, b) => Number(a.ASTDY) - Number(b.ASTDY) || a.AEDECOD.localeCompare(b.AEDECOD)
    );
    expect(ae.map((r) => [r.AEDECOD, r.ASTDY, r.AENDY])).toEqual([
      ['HYPERHIDROSIS', '17', ''],
      ['ERYTHEMA', '30', ''],
      ['PRURITUS', '30', ''],
      ['ELECTROCARDIOGRAM T WAVE INVERSION', '89', ''],
      ['CHEST PAIN', '111', '115']
    ]);
    expect(ae.find((r) => r.AEDECOD === 'ERYTHEMA')).toMatchObject({
      AESEV: 'MODERATE',
      AESER: 'N',
      AEOUT: 'NOT RECOVERED/NOT RESOLVED',
      TRTSDT: '2013-12-16'
    });
    // Con-meds: 9 courses; 7 started on/before day 30, all with a blank end; 2 start day 43.
    const cm = rowsFor(readExtract('pje-cm.csv').records, id);
    expect(cm).toHaveLength(9);
    const activeAt30 = cm.filter((r) => Number(r.ASTDY) <= 30);
    expect(activeAt30).toHaveLength(7);
    expect(activeAt30.every((r) => r.AENDY === '')).toBe(true);
    expect(cm.filter((r) => r.ASTDY === '43').map((r) => r.CMTRT)).toEqual(['CORTISONE', 'LIDEX']);
    // Labs: the day-27 AST is HIGH at 36 U/L against a 34 U/L ULN (1.06 x ULN);
    // the flagged baseline sits at day -10; ALT never leaves the range.
    const lb = rowsFor(readExtract('pje-lb.csv').records, id);
    const ast = lb.filter((r) => r.LBTESTCD === 'AST');
    expect(ast.find((r) => r.LBDY === '27')).toMatchObject({
      LBSTRESN: '36',
      LBSTNRHI: '34',
      LBNRIND: 'HIGH',
      LBSTRESU: 'U/L'
    });
    expect(ast.filter((r) => r.ABLFL === 'Y').map((r) => [r.LBDY, r.LBSTRESN])).toEqual([
      ['-10', '29']
    ]);
    expect(lb.filter((r) => r.LBTESTCD === 'ALT').every((r) => r.LBNRIND === 'NORMAL')).toBe(true);
    // Medical history at the screening day, disposition with the three SDTM categories.
    const mh = rowsFor(readExtract('pje-mh.csv').records, id);
    expect(mh).toHaveLength(8);
    expect(mh.every((r) => r.MHDY === '-6')).toBe(true);
    const ds = rowsFor(readExtract('pje-ds.csv').records, id);
    expect(ds.map((r) => [r.DSDECOD, r.DSCAT, r.DSSTDY])).toEqual([
      ['RANDOMIZED', 'PROTOCOL MILESTONE', '1'],
      ['COMPLETED', 'DISPOSITION EVENT', '184'],
      ['FINAL LAB VISIT', 'OTHER EVENT', '184']
    ]);
  });

  it('PJE-DEMO-001: the seeded participant 01-705-1310 carries the 4.03 x ULN ALT peak and the adverse-event discontinuation (#142)', () => {
    const id = '01-705-1310';
    const alt = rowsFor(readExtract('pje-lb.csv').records, id).filter((r) => r.LBTESTCD === 'ALT');
    expect(alt.map((r) => [r.LBDY, r.LBSTRESN, r.LBNRIND])).toEqual([
      ['-7', '10', 'NORMAL'],
      ['21', '13', 'NORMAL'],
      ['29', '15', 'NORMAL'],
      ['45', '20', 'NORMAL'],
      ['55', '129', 'HIGH'],
      ['58', '42', 'HIGH'],
      ['83', '10', 'NORMAL']
    ]);
    const peak = alt.find((r) => r.LBDY === '55');
    expect(peak.LBSTNRHI).toBe('32');
    expect(Number(peak.LBSTRESN) / Number(peak.LBSTNRHI)).toBeCloseTo(4.03, 2);
    const ex = rowsFor(readExtract('pje-ex.csv').records, id);
    expect(ex.map((r) => [r.EXDOSE, r.ASTDY])).toEqual([
      ['54', '1'],
      ['81', '22']
    ]);
    const cm = rowsFor(readExtract('pje-cm.csv').records, id);
    expect(cm.map((r) => [r.CMTRT, r.ASTDY, r.AENDY, r.CMSTDTC])).toEqual([
      ['TIMOPTIC', '-1036', '', '2011']
    ]);
    const ds = rowsFor(readExtract('pje-ds.csv').records, id);
    expect(ds.find((r) => r.DSCAT === 'DISPOSITION EVENT')).toMatchObject({
      DSDECOD: 'ADVERSE EVENT',
      DSSTDY: '83'
    });
  });

  it('PJE-DEMO-001: the seeded participant 01-701-1203 is the uneventful placebo case with the 1986 con-med (#142)', () => {
    const id = '01-701-1203';
    const lb = rowsFor(readExtract('pje-lb.csv').records, id);
    expect(lb).toHaveLength(40);
    expect(lb.every((r) => r.LBNRIND === 'NORMAL')).toBe(true);
    const ae = rowsFor(readExtract('pje-ae.csv').records, id);
    expect(ae.map((r) => [r.AEDECOD, r.ASTDY, r.AENDY])).toEqual([
      ['EYE LASER SURGERY', '48', '48']
    ]);
    const ex = rowsFor(readExtract('pje-ex.csv').records, id);
    expect(ex.map((r) => r.EXDOSE)).toEqual(['0', '0', '0']);
    expect(ex.every((r) => r.EXTRT === 'PLACEBO')).toBe(true);
    const cm = rowsFor(readExtract('pje-cm.csv').records, id);
    expect(cm.every((r) => r.CMCLAS === 'UNCODED')).toBe(true);
    expect(cm.filter((r) => r.ASTDY === '-9894').map((r) => [r.CMTRT, r.CMSTDTC])).toEqual([
      ['TIMOPTIC', '1986'],
      ['TRUSOPT', '1986']
    ]);
  });

  it('PJE-DEMO-001: the study-wide caveats the demo page states hold on the committed files (#142)', () => {
    const ae = readExtract('pje-ae.csv').records;
    expect(ae.filter((r) => r.AESER === 'Y')).toHaveLength(3);
    const blankEnd = ae.filter((r) => r.AENDY === '');
    expect(blankEnd).toHaveLength(438);
    expect(blankEnd.every((r) => r.AEOUT === 'NOT RECOVERED/NOT RESOLVED')).toBe(true);
    const cm = readExtract('pje-cm.csv').records;
    const uncoded = cm.filter((r) => r.CMCLAS === 'UNCODED').length / cm.length;
    expect(uncoded).toBeGreaterThan(0.8);
    expect(uncoded).toBeLessThan(0.85);
    const mh = readExtract('pje-mh.csv').records;
    expect(mh.filter((r) => /^VERBATIM_\d+$/.test(r.MHTERM)).length).toBe(1564);
    expect(mh.every((r) => Number(r.MHDY) >= -37 && Number(r.MHDY) <= -2)).toBe(true);
    const lb = readExtract('pje-lb.csv').records;
    expect(new Set(lb.map((r) => r.LBNRIND))).toEqual(new Set(['LOW', 'NORMAL', 'HIGH']));
    expect(new Set(lb.map((r) => r.LBTEST))).toEqual(new Set(PJE_LB_TESTS));
  });
});

// ---- provenance (D24) -----------------------------------------------------

describe('docs/DATA_SOURCES.md provenance', () => {
  const doc = readFileSync(join(ROOT, 'docs', 'DATA_SOURCES.md'), 'utf8');

  it('PJE-DEMO-001: names pharmaversesdtm, its Apache-2.0 licence and the ds.csv source revision (#142)', () => {
    expect(doc).toContain('pharmaversesdtm');
    // The licence sentence must sit in the same paragraph as the package name.
    const sdtmParagraphs = doc.split(/\n\s*\n/).filter((p) => p.includes('pharmaversesdtm'));
    expect(sdtmParagraphs.some((p) => p.includes('Apache-2.0'))).toBe(true);
    // The revision the extract was taken at: the file's last commit on main.
    expect(doc).toContain('9c12f0c580e7223ec3cee280ecd3ab728f0718e6');
    expect(doc).toContain('v1.5.0');
  });

  it('PJE-DEMO-001: lists all six extracts in the file table (#142)', () => {
    for (const file of [
      'pje-ex.csv',
      'pje-ae.csv',
      'pje-lb.csv',
      'pje-cm.csv',
      'pje-mh.csv',
      'pje-ds.csv'
    ])
      expect(doc).toContain(`\`${file}\``);
  });
});
