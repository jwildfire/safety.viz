import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../src/data/portfolio.json';
import { placeFile } from '../../../src/app/detect.js';

const header = (file) =>
  readFileSync(new URL(`../../../site/data/${file}`, import.meta.url), 'utf8')
    .split(/\r?\n/, 1)[0]
    .split(',');

describe('demo app: placing a file in a domain', () => {
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

  it('APP-PLACE-006: a standard ADaM labs file with baseline and change columns is labs, not ECG: the measure names decide in both directions (#165)', () => {
    // Nine of the ten ECG columns against nine of the thirteen labs columns:
    // by column names alone the fuller match would be ECG.
    const adlb = [
      'USUBJID',
      'PARAM',
      'AVAL',
      'AVISIT',
      'AVISITN',
      'TRTA',
      'BASE',
      'CHG',
      'ABLFL',
      'ANRLO',
      'ANRHI',
      'ADY'
    ];
    const counts = Object.fromEntries(
      placeFile(adlb, manifest).candidates.map((candidate) => [candidate.domain, candidate.matched])
    );
    expect(counts).toMatchObject({ bds: 9, eg: 9 });
    const labs = placeFile(adlb, manifest, {
      measureNames: ['Alanine Aminotransferase', 'Bilirubin']
    });
    expect(labs).toMatchObject({ domain: 'bds', matched: 9, of: 13 });
    expect(placeFile(adlb, manifest, { measureNames: ['QTcF', 'Heart Rate'] })).toMatchObject({
      domain: 'eg',
      matched: 9,
      of: 10
    });
    // Without normal ranges or a study day it carries more ECG columns than
    // labs columns, and is still labs by what it measures.
    const lean = [
      'USUBJID',
      'PARAM',
      'AVAL',
      'AVALU',
      'AVISIT',
      'AVISITN',
      'TRTA',
      'BASE',
      'CHG',
      'ABLFL'
    ];
    expect(placeFile(lean, manifest).domain).toBe('eg');
    expect(placeFile(lean, manifest, { measureNames: ['Creatinine'] }).domain).toBe('bds');
    // The measure names never move a file that is neither: only labs and ECG share a shape.
    const adsl = ['USUBJID', 'ARM', 'SITEID', 'SEX', 'RACE', 'AGE'];
    expect(placeFile(adsl, manifest, { measureNames: ['QTcF'] }).domain).toBe('subject');
  });
});
