import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseCsv, parseJson, parseFile } from '../../../src/app/parse.js';

const demo = (file) => readFileSync(new URL(`../../../site/data/${file}`, import.meta.url), 'utf8');

describe('demo app: parsing', () => {
  it('APP-PARSE-001: reads quoted fields with embedded commas and doubled quotes (#149)', () => {
    const { columns, rows } = parseCsv(
      'USUBJID,TEST,NOTE\n01,"Aminotransferase, alanine (ALT)","said ""fine"""\n'
    );
    expect(columns).toEqual(['USUBJID', 'TEST', 'NOTE']);
    expect(rows).toEqual([
      { USUBJID: '01', TEST: 'Aminotransferase, alanine (ALT)', NOTE: 'said "fine"' }
    ]);
  });

  it('APP-PARSE-002: tolerates a byte-order mark, CRLF line ends, blank lines and a missing final newline (#149)', () => {
    const { columns, rows } = parseCsv('﻿A,B\r\n1,2\r\n\r\n3,4');
    expect(columns).toEqual(['A', 'B']);
    expect(rows).toEqual([
      { A: '1', B: '2' },
      { A: '3', B: '4' }
    ]);
  });

  it('APP-PARSE-003: fills a short row with blanks and keeps a quoted line break inside one field (#149)', () => {
    const { rows } = parseCsv('A,B,C\n1,"two\nlines"\n');
    expect(rows).toEqual([{ A: '1', B: 'two\nlines', C: '' }]);
  });

  it('APP-PARSE-004: reads a JSON list of records as text values, with columns in first-seen order (#149)', () => {
    const { columns, rows } = parseJson(
      JSON.stringify([
        { USUBJID: '01', STRESN: 12.5, FLAG: null },
        { USUBJID: '02', STRESN: 0, SITE: 'A' }
      ])
    );
    expect(columns).toEqual(['USUBJID', 'STRESN', 'FLAG', 'SITE']);
    expect(rows).toEqual([
      { USUBJID: '01', STRESN: '12.5', FLAG: '', SITE: '' },
      { USUBJID: '02', STRESN: '0', FLAG: '', SITE: 'A' }
    ]);
  });

  it('APP-PARSE-005: chooses the parser from the file name, whatever its case (#149)', () => {
    expect(parseFile('LABS.CSV', 'A\n1\n').rows).toEqual([{ A: '1' }]);
    expect(parseFile('labs.json', '[{"A":1}]').rows).toEqual([{ A: '1' }]);
  });

  it('APP-PARSE-006: refuses what it cannot read in one sentence that names the file (#149)', () => {
    expect(() => parseFile('labs.xpt', 'x')).toThrow(
      'labs.xpt is not a CSV or JSON file. SAS transport and sas7bdat files are not supported yet.'
    );
    expect(() => parseFile('labs.csv', '  \n')).toThrow('labs.csv is empty.');
    expect(() => parseFile('labs.csv', 'A,B\n')).toThrow('labs.csv has column names but no rows.');
    expect(() => parseFile('labs.json', '{"A":1}')).toThrow(
      'labs.json is not a list of records: it should be a JSON array with one object per row.'
    );
    expect(() => parseFile('labs.json', '[{"A":')).toThrow('labs.json is not valid JSON.');
  });

  it('APP-PARSE-007: reads the vendored demo extracts whole (#149)', () => {
    const adsl = parseFile('adsl.csv', demo('adsl.csv'));
    expect(adsl.columns).toEqual(['USUBJID', 'ARM', 'EOSDY', 'EOSSTT']);
    expect(adsl.rows.length).toBeGreaterThan(200);
    const adbds = parseFile('adbds.csv', demo('adbds.csv'));
    expect(adbds.columns).toContain('STNRHI');
    // The labs extract quotes nothing but would break a comma-splitting parser
    // the day a measure name carried a comma; every row must have every column.
    expect(adbds.rows.every((row) => Object.keys(row).length === adbds.columns.length)).toBe(true);
  });
});
