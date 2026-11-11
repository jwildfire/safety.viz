// hep-explorer's 30-day timing test on the gallery's demo data (#365). Until the
// demo data carried a study day, the demo passed the visit number as one: visit
// numbers never pass 26, so no participant's peaks could be 30 "days" apart and
// no point could be drawn hollow.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { csvRecords } from '../../../scripts/demo-data-lib.mjs';
import { syncSettings } from '../../../src/hep-explorer/configure.js';
import { buildPoints, cleanData, deriveBaseline } from '../../../src/hep-explorer/structureData.js';

const { records } = csvRecords(
  readFileSync(new URL('../../../site/data/adbds.csv', import.meta.url), 'utf8')
);
const MEASURES = {
  ALT: 'Alanine Aminotransferase',
  AST: 'Aspartate Aminotransferase',
  TB: 'Bilirubin',
  ALP: 'Alkaline Phosphatase'
};

// The gallery demo's mapping (site/demo/hep-explorer.js), with the study day under test.
const points = (studyday) => {
  const settings = syncSettings({
    studyday_col: studyday,
    baseline_col: 'ABLFL',
    visit_col: 'VISIT',
    visitn_col: 'VISITNUM',
    measure_values: MEASURES
  });
  const rows = deriveBaseline(cleanData(records, settings).rows, settings);
  return buildPoints(rows, settings, {
    measureX: 'ALT',
    measureY: 'TB',
    display: 'relative_uln',
    visitWindow: settings.visit_window,
    groupBy: null
  }).points;
};
const hollow = (list) => list.filter((point) => !point.withinWindow);

describe('hep-explorer timing on the demo data', () => {
  it('HEP-DISPLAY-005: on the demo data with study days, 131 of 318 participants are hollow (#365)', () => {
    const byDay = points('DY');
    expect(byDay).toHaveLength(318);
    expect(hollow(byDay)).toHaveLength(131);
    // Every hollow point's peaks really are more than 30 days apart.
    expect(hollow(byDay).every((point) => point.day_diff > 30)).toBe(true);
  });

  it('HEP-XAX-006: on the demo data every participant is evaluated, none drawn as a cross (#376)', () => {
    const byDay = points('DY');
    expect(byDay.filter((point) => point.timing === 'not_evaluated')).toHaveLength(0);
    expect(byDay.filter((point) => point.timing === 'outside')).toHaveLength(131);
  });

  it('HEP-DISPLAY-005: the visit number passed as a study day could draw no participant hollow (#365)', () => {
    expect(hollow(points('VISITNUM'))).toHaveLength(0);
  });
});
