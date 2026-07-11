import { describe, it, expect } from 'vitest';
import {
  buildTimelineRows,
  cleanData,
  colorDomain,
  colorFor,
  populationCount,
  sortSubjects
} from '../../../src/ae-timelines/structureData.js';
import { syncSettings } from '../../../src/ae-timelines/configure.js';

// Data preparation for the ae-timelines module (#26), matching the original
// renderer's onInit pipeline (cleanData, checkColorBy, defineColorDomain,
// calculatePopulationSize) and onDraw sortYdomain with hand-computed fixtures.

const settings = syncSettings({});

const ae = (subject, seq, start, end, term, severity, serious = 'N') => ({
  USUBJID: subject,
  AESEQ: seq,
  ASTDY: start,
  AENDY: end,
  AETERM: term,
  AESEV: severity,
  AESER: serious
});

// Eight participants: SUBJ-05 is an AE-free placeholder row, SUBJ-07 has one
// AE with a non-integer start day, and SUBJ-08 has only a blank-term row.
const raw = [
  ae('SUBJ-01', '1', '5', '12', 'Headache', 'MILD'),
  ae('SUBJ-01', '2', '20', '25', 'Nausea', 'MODERATE', 'Y'),
  ae('SUBJ-02', '1', '2', '30', 'Fatigue', 'SEVERE'),
  ae('SUBJ-03', '1', '8', '', 'Rash', 'MILD'),
  ae('SUBJ-04', '1', '15', '18', 'Dizziness', ''),
  ae('SUBJ-05', '', '', '', '', ''),
  ae('SUBJ-06', '1', '3', '10', 'Insomnia', 'MODERATE', 'Y'),
  ae('SUBJ-07', '1', 'UNK', '9', 'Cough', 'MILD'),
  ae('SUBJ-07', '2', '11', '14', 'Fever', 'MILD'),
  ae('SUBJ-08', '1', '4', '6', '   ', 'MILD')
];

describe('ae-timelines structureData', () => {
  it('AET-FUNC-007: the population counts every participant in the raw data, including AE-free placeholders (#26)', () => {
    expect(populationCount(raw, settings)).toBe(8);
  });

  it('AET-DATA-001: cleaning removes blank-term and non-integer-start-day records with reported counts (#26)', () => {
    const { rows, removedTerm, removedDay } = cleanData(raw, settings);
    // SUBJ-05's placeholder and SUBJ-08's blank term fail the term filter;
    // SUBJ-07's 'UNK' start day fails the integer filter.
    expect(removedTerm).toBe(2);
    expect(removedDay).toBe(1);
    expect(rows).toHaveLength(7);
    expect(rows.map((row) => row.USUBJID)).not.toContain('SUBJ-05');
    expect(rows.map((row) => row.USUBJID)).not.toContain('SUBJ-08');
  });

  it('AET-DATA-001: cleaning coerces study days and falls back to the start day for unusable stop days (#26)', () => {
    const { rows } = cleanData(raw, settings);
    const headache = rows.find((row) => row.AETERM === 'Headache');
    expect(headache.__aet_stdy).toBe(5);
    expect(headache.__aet_endy).toBe(12);
    const rash = rows.find((row) => row.AETERM === 'Rash');
    expect(rash.__aet_stdy).toBe(8);
    expect(rash.__aet_endy).toBeNull();
  });

  it('AET-FUNC-003: missing severity values are normalized to N/A (#26)', () => {
    const { rows } = cleanData(raw, settings);
    const dizziness = rows.find((row) => row.AETERM === 'Dizziness');
    expect(dizziness.AESEV).toBe('N/A');
  });

  it('AET-FUNC-003/AET-CFG-005: the color domain keeps the configured order, then extras, with N/A last (#26)', () => {
    const { rows } = cleanData(raw, settings);
    expect(colorDomain(rows, settings.color)).toEqual(['MILD', 'MODERATE', 'SEVERE', 'N/A']);

    // Unexpected values sort alphabetically after the configured levels.
    const extras = [
      { AESEV: 'SEVERE' },
      { AESEV: 'LIFE-THREATENING' },
      { AESEV: 'GRADE 4' },
      { AESEV: 'N/A' }
    ];
    expect(colorDomain(extras, settings.color)).toEqual([
      'MILD',
      'MODERATE',
      'SEVERE',
      'GRADE 4',
      'LIFE-THREATENING',
      'N/A'
    ]);
  });

  it('AET-FUNC-003: colors map by domain position with N/A rendered gray (#26)', () => {
    const domain = ['MILD', 'MODERATE', 'SEVERE', 'N/A'];
    expect(colorFor('MILD', domain, settings.color.colors)).toBe('#66bd63');
    expect(colorFor('MODERATE', domain, settings.color.colors)).toBe('#fdae61');
    expect(colorFor('SEVERE', domain, settings.color.colors)).toBe('#d73027');
    expect(colorFor('N/A', domain, settings.color.colors)).toBe('#999999');
  });

  it('AET-FUNC-006/AET-REG-003: earliest sort orders participants by first AE start day, ties by ID (#26)', () => {
    const { rows } = cleanData(raw, settings);
    expect(sortSubjects(rows, settings, 'earliest')).toEqual([
      'SUBJ-02', // day 2
      'SUBJ-06', // day 3
      'SUBJ-01', // day 5
      'SUBJ-03', // day 8
      'SUBJ-07', // day 11 (its day-'UNK' record was removed)
      'SUBJ-04' // day 15
    ]);
    const tied = [
      ae('SUBJ-B', '1', '5', '6', 'AE', 'MILD'),
      ae('SUBJ-A', '1', '5', '6', 'AE', 'MILD')
    ];
    expect(sortSubjects(cleanData(tied, settings).rows, settings, 'earliest')).toEqual([
      'SUBJ-A',
      'SUBJ-B'
    ]);
  });

  it('AET-FUNC-006/AET-REG-003: alphabetical-descending sort matches the original top-to-bottom order (#26)', () => {
    // The original sorts the bottom-to-top y domain descending, which reads
    // alphabetically ascending from the top — the order asserted here.
    const { rows } = cleanData(raw, settings);
    expect(sortSubjects(rows, settings, 'alphabetical-descending')).toEqual([
      'SUBJ-01',
      'SUBJ-02',
      'SUBJ-03',
      'SUBJ-04',
      'SUBJ-06',
      'SUBJ-07'
    ]);
  });

  it('AET-FUNC-002/AET-CFG-008: timeline rows carry duration, color value, and the serious flag (#26)', () => {
    const { rows } = cleanData(raw, settings);
    const events = buildTimelineRows(rows, settings);
    const nausea = events.find((event) => event.term === 'Nausea');
    expect(nausea).toMatchObject({
      subject: 'SUBJ-01',
      start: 20,
      end: 25,
      color: 'MODERATE',
      serious: true
    });
    // A missing stop day renders as a zero-length event at the start day.
    const rash = events.find((event) => event.term === 'Rash');
    expect(rash.end).toBe(8);
    expect(rash.serious).toBe(false);
    // Without a highlight configuration nothing is serious.
    const noHighlight = buildTimelineRows(rows, syncSettings({ highlight: null }));
    expect(noHighlight.every((event) => event.serious === false)).toBe(true);
  });
});
