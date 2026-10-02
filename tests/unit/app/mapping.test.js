import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../src/data/portfolio.json';
import { parseFile } from '../../../src/app/parse.js';
import {
  applySavedMapping,
  buildMapping,
  measureColumn,
  resolveColumn,
  resolveMeasure,
  serializeMappings,
  setColumn,
  setMeasure,
  MEASURES
} from '../../../src/app/mapping.js';

const demo = (file) =>
  parseFile(file, readFileSync(new URL(`../../../site/data/${file}`, import.meta.url), 'utf8'));

const measure = (key) => MEASURES.find((entry) => entry.key === key);

describe('demo app: the pre-filled mapping', () => {
  it('APP-MAP-001: a column with the same name is filled and says so, whatever its case (#149)', () => {
    expect(resolveColumn(['USUBJID', 'TEST'], 'bds', 'TEST')).toEqual({
      value: 'TEST',
      source: 'same name'
    });
    expect(resolveColumn(['usubjid'], 'bds', 'USUBJID')).toEqual({
      value: 'usubjid',
      source: 'same name'
    });
  });

  it('APP-MAP-002: a known alternative is filled and labelled a guess (#149)', () => {
    expect(resolveColumn(['SUBJID', 'LBTEST'], 'bds', 'TEST')).toEqual({
      value: 'LBTEST',
      source: 'guessed'
    });
    expect(resolveColumn(['TRT01A'], 'subject', 'ARM')).toEqual({
      value: 'TRT01A',
      source: 'guessed'
    });
    // The same name beats an alternative that is also present.
    expect(resolveColumn(['PARAM', 'TEST'], 'bds', 'TEST').source).toBe('same name');
  });

  it('APP-MAP-003: nothing fuzzier is attempted: a near miss stays empty (#149)', () => {
    expect(resolveColumn(['TESTNAME', 'TEST_NAME', 'LABTEST'], 'bds', 'TEST')).toEqual({
      value: null,
      source: null
    });
    // An alternative belongs to its domain: the labs result name is no ECG guess
    // for a column the ECG domain does not have.
    expect(resolveColumn(['ANRHI'], 'eg', 'BASE')).toEqual({ value: null, source: null });
  });

  it('APP-MAP-004: a key measure is found by its known names, ignoring case, punctuation and a bracketed unit (#149)', () => {
    expect(resolveMeasure(['Albumin', 'Alanine Aminotransferase'], measure('ALT'))).toEqual({
      value: 'Alanine Aminotransferase',
      source: 'guessed'
    });
    expect(resolveMeasure(['Alanine Aminotransferase (U/L)'], measure('ALT')).value).toBe(
      'Alanine Aminotransferase (U/L)'
    );
    expect(resolveMeasure(['Aminotransferase, alanine (ALT)'], measure('ALT'))).toEqual({
      value: 'Aminotransferase, alanine (ALT)',
      source: 'same name'
    });
    // Direct bilirubin is not total bilirubin.
    expect(resolveMeasure(['Direct Bilirubin', 'Albumin'], measure('TB'))).toEqual({
      value: null,
      source: null
    });
  });

  it('APP-MAP-005: the demo study fills every column it carries by the same name and guesses its key measures (#149)', () => {
    const adbds = demo('adbds.csv');
    const mapping = buildMapping('bds', adbds, manifest);
    expect(mapping.domain).toBe('bds');
    for (const [column, entry] of Object.entries(mapping.columns)) {
      // The labs extract has no study-day column; everything else is there.
      expect(entry, column).toEqual(
        column === 'DY' ? { value: null, source: null } : { value: column, source: 'same name' }
      );
    }
    expect(mapping.measures).toEqual({
      ALT: { value: 'Alanine Aminotransferase', source: 'guessed' },
      AST: { value: 'Aspartate Aminotransferase', source: 'guessed' },
      TB: { value: 'Bilirubin', source: 'guessed' },
      ALP: { value: 'Alkaline Phosphatase', source: 'guessed' },
      CREAT: { value: 'Creatinine', source: 'same name' }
    });

    const eg = buildMapping('eg', demo('adeg.csv'), manifest);
    expect(eg.measures).toEqual({
      QTcF: { value: 'QTcF', source: 'same name' },
      QTcB: { value: 'QTcB', source: 'same name' },
      HR: { value: 'Heart Rate', source: 'same name' }
    });
    // Domains with no key measures carry none.
    expect(buildMapping('subject', demo('adsl.csv'), manifest).measures).toEqual({});
  });

  it('APP-MAP-006: a row changed by hand is marked chosen, and can be cleared (#149)', () => {
    const file = { columns: ['PT_NO', 'TEST', 'STRESN'], rows: [] };
    const mapping = buildMapping('bds', file, manifest);
    expect(mapping.columns.USUBJID).toEqual({ value: null, source: null });
    const chosen = setColumn(mapping, 'USUBJID', 'PT_NO', file);
    expect(chosen.columns.USUBJID).toEqual({ value: 'PT_NO', source: 'chosen' });
    // The original is not mutated: the page keeps the previous state to compare.
    expect(mapping.columns.USUBJID.value).toBeNull();
    expect(setColumn(chosen, 'USUBJID', null, file).columns.USUBJID).toEqual({
      value: null,
      source: null
    });
    expect(setMeasure(mapping, 'ALT', 'SGPT (local lab)').measures.ALT).toEqual({
      value: 'SGPT (local lab)',
      source: 'chosen'
    });
  });

  it('APP-MAP-007: changing the measure column looks the key measures up again in the new column (#149)', () => {
    const file = {
      columns: ['USUBJID', 'CODE', 'NAME', 'STRESN'],
      rows: [
        { USUBJID: '1', CODE: 'ALT', NAME: 'Liver enzyme A', STRESN: '20' },
        { USUBJID: '1', CODE: 'CREAT', NAME: 'Kidney marker', STRESN: '1' }
      ]
    };
    const mapping = buildMapping('bds', file, manifest);
    expect(measureColumn(mapping)).toBeNull();
    expect(mapping.measures.ALT.value).toBeNull();
    const byCode = setColumn(mapping, 'TEST', 'CODE', file);
    expect(byCode.measures.ALT).toEqual({ value: 'ALT', source: 'guessed' });
    expect(byCode.measures.CREAT).toEqual({ value: 'CREAT', source: 'guessed' });
    // A measure the user chose by hand survives when it is still in the column.
    const byHand = setMeasure(byCode, 'TB', 'CREAT');
    expect(setColumn(byHand, 'STRESN', 'STRESN', file).measures.TB).toEqual({
      value: 'CREAT',
      source: 'chosen'
    });
  });
});

describe('demo app: the mapping file', () => {
  const file = {
    name: 'labs.csv',
    columns: ['SUBJID', 'LBTEST', 'LBSTRESN', 'ULN', 'GRP'],
    rows: [
      { SUBJID: '1', LBTEST: 'ALT (SGPT)', LBSTRESN: '30', ULN: '40', GRP: 'A' },
      { SUBJID: '1', LBTEST: 'Tot. Bilirubin', LBSTRESN: '1', ULN: '1.2', GRP: 'A' }
    ]
  };
  const byHand = () => {
    let mapping = buildMapping('bds', file, manifest);
    mapping = setColumn(mapping, 'STNRHI', 'ULN', file);
    mapping = setColumn(mapping, 'ARM', 'GRP', file);
    mapping = setColumn(mapping, 'VISIT', null, file);
    return setMeasure(mapping, 'TB', 'Tot. Bilirubin');
  };

  it('APP-MAP-008: mappings are saved as each row’s value, with the file each belongs to, marked provisional (#151)', () => {
    const saved = serializeMappings({ bds: file }, { bds: byHand() });
    expect(saved.safetyVizMapping).toBe(1);
    expect(saved.note).toContain('Provisional');
    expect(saved.domains.bds.file).toBe('labs.csv');
    expect(saved.domains.bds.columns).toMatchObject({
      USUBJID: 'SUBJID',
      STNRHI: 'ULN',
      ARM: 'GRP',
      VISIT: null
    });
    expect(saved.domains.bds.measures).toMatchObject({ ALT: 'ALT (SGPT)', TB: 'Tot. Bilirubin' });
    // Plain data: it survives being written to a file and read back.
    expect(JSON.parse(JSON.stringify(saved))).toEqual(saved);
  });

  it('APP-MAP-009: a saved mapping restores the same mapping on the same file, rows chosen by hand still marked chosen (#151)', () => {
    const before = byHand();
    const saved = JSON.parse(JSON.stringify(serializeMappings({ bds: file }, { bds: before })));
    const { mapping, skipped } = applySavedMapping(
      buildMapping('bds', file, manifest),
      saved.domains.bds,
      file
    );
    expect(mapping).toEqual(before);
    expect(skipped).toEqual([]);
    expect(mapping.columns.USUBJID.source).toBe('guessed');
    expect(mapping.columns.STNRHI.source).toBe('chosen');
  });

  it('APP-MAP-010: a saved value the file no longer carries is skipped and named, never applied blind (#151)', () => {
    const saved = serializeMappings({ bds: file }, { bds: byHand() }).domains.bds;
    const changed = {
      ...file,
      columns: ['SUBJID', 'LBTEST', 'LBSTRESN', 'GRP'],
      rows: [{ SUBJID: '1', LBTEST: 'ALT (SGPT)', LBSTRESN: '30', GRP: 'A' }]
    };
    const { mapping, skipped } = applySavedMapping(
      buildMapping('bds', changed, manifest),
      saved,
      changed
    );
    expect(mapping.columns.STNRHI).toEqual({ value: null, source: null });
    expect(mapping.columns.ARM).toEqual({ value: 'GRP', source: 'chosen' });
    expect(skipped).toEqual(['ULN', 'Tot. Bilirubin']);
  });
});
