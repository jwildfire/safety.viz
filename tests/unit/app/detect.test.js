import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../src/data/portfolio.json';
import { placeFile } from '../../../src/app/detect.js';

const header = (file) =>
  readFileSync(new URL(`../../../site/data/${file}`, import.meta.url), 'utf8')
    .split(/\r?\n/, 1)[0]
    .split(',');

describe('portfolio app: placing a file in a domain', () => {
  it('APP-PLACE-001: the four vendored demo extracts place to their four domains (#149)', () => {
    expect(placeFile(header('adsl.csv'), manifest).domain).toBe('subject');
    expect(placeFile(header('adae.csv'), manifest).domain).toBe('ae');
    expect(placeFile(header('adbds.csv'), manifest).domain).toBe('bds');
    expect(placeFile(header('adeg.csv'), manifest).domain).toBe('eg');
  });

  it('APP-PLACE-002: reports how many of the domain’s columns were found, and every candidate (#149)', () => {
    const placed = placeFile(header('adbds.csv'), manifest);
    // The labs extract carries every bds column but the study day.
    expect(placed.matched).toBe(12);
    expect(placed.of).toBe(13);
    expect(placed.candidates.map((candidate) => candidate.domain)).toEqual([
      'bds',
      'eg',
      'subject',
      'ae'
    ]);
    expect(placed.candidates[0]).toEqual({ domain: 'bds', matched: 12, of: 13 });
  });

  it('APP-PLACE-003: a file matching two columns or fewer is not placed, and says what it did find (#149)', () => {
    const placed = placeFile(['USUBJID', 'ARM', 'FAVOURITE_COLOUR'], manifest);
    expect(placed.domain).toBeNull();
    expect(placed.found).toEqual(['USUBJID', 'ARM']);
    expect(placeFile(['A', 'B', 'C'], manifest).found).toEqual([]);
  });

  it('APP-PLACE-004: known alternative names count, so an ADaM or SDTM file is placed (#149)', () => {
    const adlb = [
      'USUBJID',
      'PARAM',
      'AVAL',
      'AVALU',
      'ANRLO',
      'ANRHI',
      'AVISIT',
      'AVISITN',
      'ADY'
    ];
    expect(placeFile(adlb, manifest)).toMatchObject({ domain: 'bds', matched: 9, of: 13 });
    const sdtmAe = ['usubjid', 'AESEQ', 'AESOC', 'AEDECOD', 'AETERM', 'AESTDY', 'AEENDY', 'AESEV'];
    expect(placeFile(sdtmAe, manifest)).toMatchObject({ domain: 'ae', matched: 8, of: 10 });
  });

  it('APP-PLACE-005: on equal counts the fuller match wins (#149)', () => {
    // A lean subject table: five of the seven subject columns are also five of
    // the thirteen labs columns.
    const adsl = ['USUBJID', 'ARM', 'SITEID', 'SEX', 'RACE', 'AGE'];
    expect(placeFile(adsl, manifest)).toMatchObject({ domain: 'subject', matched: 5, of: 7 });
  });

  it('APP-PLACE-006: labs and ECG share a shape, so QT measure names send a file to ECG (#149)', () => {
    // A long-format ECG file with site and demographics carries more labs
    // columns than ECG columns; only its measure names say what it is.
    const adeg = ['USUBJID', 'PARAM', 'AVAL', 'AVISIT', 'AVISITN', 'ADY', 'TRTA', 'SITEID', 'SEX'];
    expect(placeFile(adeg, manifest).domain).toBe('bds');
    expect(
      placeFile(adeg, manifest, { measureNames: ['QTcF Interval, Aggregate', 'Heart Rate'] }).domain
    ).toBe('eg');
    // Heart rate alone is a vital sign as much as an ECG parameter.
    expect(placeFile(adeg, manifest, { measureNames: ['Heart Rate', 'Weight'] }).domain).toBe(
      'bds'
    );
  });
});
