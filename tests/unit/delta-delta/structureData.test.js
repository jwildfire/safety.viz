import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/delta-delta/configure.js';
import {
  BASELINE_COLOR,
  COMPARISON_COLOR,
  OTHER_COLOR,
  applyFilters,
  buildParticipants,
  cleanData,
  getMeasures,
  getVisits,
  measureDetails,
  plottablePoints,
  visitMean
} from '../../../src/delta-delta/structureData.js';

// Unit evidence for the delta-delta transform (#25): the change-from-baseline
// math and its supporting cleaning/discovery helpers, verified against a
// hand-computed fixture (SDD-REG-003/004/008, SDD-CFG-004/008, SDD-REG-022).

// One row per participant × measure × visit. Two blank results (SDD-REG-008)
// are removed on cleaning. Visits (by VISITNUM): Screening 0, Week 2 2, Week 4 4.
const RAW = [
  { USUBJID: '01-001', TEST: 'Albumin', VISIT: 'Screening', VISITNUM: 0, STRESN: 10, SITE: 'A', ARM: 'Placebo' },
  { USUBJID: '01-001', TEST: 'Albumin', VISIT: 'Week 4', VISITNUM: 4, STRESN: 14, SITE: 'A', ARM: 'Placebo' },
  { USUBJID: '01-001', TEST: 'Bilirubin', VISIT: 'Screening', VISITNUM: 0, STRESN: 20, SITE: 'A', ARM: 'Placebo' },
  { USUBJID: '01-001', TEST: 'Bilirubin', VISIT: 'Week 4', VISITNUM: 4, STRESN: 15, SITE: 'A', ARM: 'Placebo' },
  { USUBJID: '01-001', TEST: 'Calcium', VISIT: 'Screening', VISITNUM: 0, STRESN: 1, SITE: 'A', ARM: 'Placebo' },
  { USUBJID: '01-001', TEST: 'Calcium', VISIT: 'Week 4', VISITNUM: 4, STRESN: 2, SITE: 'A', ARM: 'Placebo' },
  { USUBJID: '01-002', TEST: 'Albumin', VISIT: 'Screening', VISITNUM: 0, STRESN: 8, SITE: 'A', ARM: 'Drug' },
  { USUBJID: '01-002', TEST: 'Albumin', VISIT: 'Week 2', VISITNUM: 2, STRESN: '', SITE: 'A', ARM: 'Drug' },
  { USUBJID: '01-002', TEST: 'Albumin', VISIT: 'Week 4', VISITNUM: 4, STRESN: 8, SITE: 'A', ARM: 'Drug' },
  { USUBJID: '01-002', TEST: 'Bilirubin', VISIT: 'Screening', VISITNUM: 0, STRESN: 5, SITE: 'A', ARM: 'Drug' },
  { USUBJID: '01-002', TEST: 'Bilirubin', VISIT: 'Week 4', VISITNUM: 4, STRESN: '', SITE: 'A', ARM: 'Drug' },
  { USUBJID: '01-003', TEST: 'Albumin', VISIT: 'Screening', VISITNUM: 0, STRESN: 6, SITE: 'B', ARM: 'Placebo' },
  { USUBJID: '01-003', TEST: 'Albumin', VISIT: 'Week 2', VISITNUM: 2, STRESN: 6.5, SITE: 'B', ARM: 'Placebo' },
  { USUBJID: '01-003', TEST: 'Albumin', VISIT: 'Week 4', VISITNUM: 4, STRESN: 12, SITE: 'B', ARM: 'Placebo' },
  { USUBJID: '01-003', TEST: 'Bilirubin', VISIT: 'Screening', VISITNUM: 0, STRESN: 10, SITE: 'B', ARM: 'Placebo' },
  { USUBJID: '01-003', TEST: 'Bilirubin', VISIT: 'Week 4', VISITNUM: 4, STRESN: 13, SITE: 'B', ARM: 'Placebo' }
];

const settings = syncSettings({ filters: ['SITE', 'ARM'] });
const baseState = {
  measureX: 'Albumin',
  measureY: 'Bilirubin',
  baseline: ['Screening'],
  comparison: ['Week 4']
};

function participantsById(rows, state = baseState) {
  const built = buildParticipants(rows, settings, state);
  return Object.fromEntries(built.map((participant) => [participant.id, participant]));
}

describe('delta-delta structureData', () => {
  const { rows, removed } = cleanData(RAW, settings);

  it('SDD-REG-008: missing/non-numeric results are removed with a count (#25)', () => {
    expect(removed).toBe(2);
    expect(rows.every((row) => Number.isFinite(row.__dd_value))).toBe(true);
  });

  it('SDD-CFG-004: getMeasures returns the sorted distinct measures (#25)', () => {
    expect(getMeasures(rows, settings)).toEqual(['Albumin', 'Bilirubin', 'Calcium']);
  });

  it('SDD-CFG-008: getVisits orders visits by the numeric visit column (#25)', () => {
    expect(getVisits(rows, settings)).toEqual(['Screening', 'Week 2', 'Week 4']);
  });

  it('SDD-REG-003: plotted deltas are comparison minus baseline per measure (#25)', () => {
    const byId = participantsById(rows);
    expect(byId['01-001'].delta_x).toBe(4); // 14 − 10
    expect(byId['01-001'].delta_y).toBe(-5); // 15 − 20
    expect(byId['01-003'].delta_x).toBe(6); // 12 − 6
    expect(byId['01-003'].delta_y).toBe(3); // 13 − 10
  });

  it('SDD-REG-022: a participant missing the comparison result yields a non-plottable NaN delta (#25)', () => {
    const byId = participantsById(rows);
    expect(byId['01-002'].delta_x).toBe(0); // 8 − 8
    expect(Number.isNaN(byId['01-002'].delta_y)).toBe(true); // comparison result removed
    const points = plottablePoints(Object.values(byId));
    expect(points.map((point) => point.id).sort()).toEqual(['01-001', '01-003']);
  });

  it('SDD-FUNC-001/SDD-REG-004: multiple baseline visits are averaged (#25)', () => {
    const byId = participantsById(rows, { ...baseState, baseline: ['Screening', 'Week 2'] });
    // 01-003 Albumin baseline = mean(6, 6.5) = 6.25; comparison Week 4 = 12.
    expect(byId['01-003'].delta_x).toBeCloseTo(5.75, 10);
    expect(visitMean(rows.filter((r) => r.USUBJID === '01-003' && r.TEST === 'Albumin'), ['Screening', 'Week 2'], settings)).toBeCloseTo(6.25, 10);
  });

  it('SDD-REG-019/025: measure rows sort X-measure, Y-measure, then alphabetical, tagged by axis (#25)', () => {
    const details = measureDetails(
      rows.filter((row) => row.USUBJID === '01-001'),
      settings,
      baseState
    );
    expect(details.map((detail) => detail.key)).toEqual(['Albumin', 'Bilirubin', 'Calcium']);
    expect(details.map((detail) => detail.axisFlag)).toEqual(['X', 'Y', '']);
  });

  it('SDD-REG-023: sparkline records are visit-ordered and role-colored (#25)', () => {
    const details = measureDetails(
      rows.filter((row) => row.USUBJID === '01-003'),
      settings,
      baseState
    );
    const albumin = details.find((detail) => detail.key === 'Albumin');
    expect(albumin.records.map((record) => record.VISIT)).toEqual(['Screening', 'Week 2', 'Week 4']);
    expect(albumin.records.map((record) => record.color)).toEqual([
      BASELINE_COLOR,
      OTHER_COLOR,
      COMPARISON_COLOR
    ]);
  });

  it('SDD-FUNC-006: participant metadata carries the filter and detail columns (#25)', () => {
    const byId = participantsById(rows);
    expect(byId['01-001'].meta.SITE).toBe('A');
    expect(byId['01-001'].meta.ARM).toBe('Placebo');
    expect(byId['01-001'].meta.USUBJID).toBe('01-001');
  });

  it('SDD-REG-006: filters keep only the participants whose metadata matches (#25)', () => {
    const built = buildParticipants(rows, settings, baseState);
    expect(applyFilters(built, { SITE: 'A' }).map((p) => p.id).sort()).toEqual(['01-001', '01-002']);
    expect(applyFilters(built, { ARM: 'Placebo' }).map((p) => p.id).sort()).toEqual([
      '01-001',
      '01-003'
    ]);
    expect(applyFilters(built, { SITE: null }).length).toBe(3);
  });
});
