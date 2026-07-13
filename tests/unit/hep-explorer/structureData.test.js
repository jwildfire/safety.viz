import { describe, it, expect } from 'vitest';
import { GROUP_NONE, syncSettings } from '../../../src/hep-explorer/configure.js';
import {
  unique,
  mean,
  quantile,
  median,
  resolveMeasureRows,
  cleanData,
  deriveBaseline,
  assignSequence,
  maxRRatio,
  participantPeak,
  computeRRatio,
  buildPoints,
  applyFilters,
  classifyQuadrants,
  visitPathSeries,
  participantMeasureSeries,
  measureSummary
} from '../../../src/hep-explorer/structureData.js';

const settings = syncSettings({ filters: ['SEX'] });
const M = settings.measure_values;

// One long-format lab record: participant x measure x visit/day, with ULN.
const row = (id, key, day, value, uln, extra = {}) => ({
  USUBJID: id,
  TEST: M[key],
  STRESN: value,
  STNRHI: uln,
  DY: day,
  ...extra
});

// Hand-computed fixture (ULNs: ALT 40, TB 1, ALP 100):
// P1 peaks at ALT 160/40 = 4xULN (day 10) and TB 3/1 = 3xULN (day 12) — the
//   possible-Hy's-Law participant; ALT baseline 20 -> mDISH peak 160/20 = 8.
// P2 stays normal: ALT peak 0.75xULN, TB peak 0.8xULN; no ALP -> rRatio NaN.
// P3 has no TB rows at all -> dropped from the scatter.
const raw = [
  row('P1', 'ALT', 0, 20, 40, { SEX: 'F', VISIT: 'Baseline' }),
  row('P1', 'ALT', 10, 160, 40, { SEX: 'F', VISIT: 'Week 2' }),
  row('P1', 'TB', 0, 1, 1, { SEX: 'F', VISIT: 'Baseline' }),
  row('P1', 'TB', 12, 3, 1, { SEX: 'F', VISIT: 'Week 2' }),
  row('P1', 'ALP', 0, 100, 100, { SEX: 'F', VISIT: 'Baseline' }),
  row('P1', 'ALP', 10, 120, 100, { SEX: 'F', VISIT: 'Week 2' }),
  row('P2', 'ALT', 0, 20, 40, { SEX: 'M', VISIT: 'Baseline' }),
  row('P2', 'ALT', 10, 30, 40, { SEX: 'M', VISIT: 'Week 2' }),
  row('P2', 'TB', 0, 0.5, 1, { SEX: 'M', VISIT: 'Baseline' }),
  row('P2', 'TB', 10, 0.8, 1, { SEX: 'M', VISIT: 'Week 2' }),
  row('P3', 'ALT', 0, 40, 40, { SEX: 'F', VISIT: 'Baseline' })
];

const prepared = deriveBaseline(cleanData(raw, settings).rows, settings);
const edishState = {
  measureX: 'ALT',
  measureY: 'TB',
  display: 'relative_uln',
  visitWindow: 30,
  groupBy: GROUP_NONE
};

describe('hep-explorer structureData', () => {
  it('HEP-API: unique, mean, quantile, and median match hand computations (port)', () => {
    expect(unique(['a', 'b', 'a', null, '', undefined])).toEqual(['a', 'b']);
    expect(mean([1, 2, 3, 'x'])).toBe(2);
    expect(mean([])).toBeNaN();
    expect(quantile([10, 12, 14, 16, 18], 0.25)).toBe(12);
    expect(median([1, 3, 100])).toBe(3);
    expect(median([1, 3])).toBe(2);
  });

  it('HEP-DATA-003: cleanData drops blank/non-numeric values and non-positive ULNs with a count (port)', () => {
    const { rows, removed } = cleanData(
      [
        row('P1', 'ALT', 0, 20, 40),
        row('P1', 'ALT', 1, '', 40), // blank value
        row('P1', 'ALT', 2, 'NA', 40), // non-numeric value
        row('P1', 'ALT', 3, 25, 'NA'), // non-numeric ULN
        row('P1', 'ALT', 4, 25, 0), // zero ULN (x/ULN denominator)
        row('P1', 'ALT', 5, 30, 40)
      ],
      settings
    );
    expect(removed).toBe(4);
    expect(rows.map((r) => r.__hep_value)).toEqual([20, 30]);
  });

  it('HEP-DATA-004/HEP-DISPLAY-002: cleanData tags rows with numeric value, ULN, day, and the xULN derivation (port)', () => {
    const { rows } = cleanData([row('P1', 'ALT', 10, 160, 40)], settings);
    expect(rows[0].__hep_value).toBe(160);
    expect(rows[0].__hep_uln).toBe(40);
    expect(rows[0].__hep_day).toBe(10);
    expect(rows[0].__hep_relative_uln).toBe(4);
    // The xBaseline column waits for deriveBaseline.
    expect(rows[0].__hep_relative_baseline).toBeNaN();
  });

  it('HEP-DATA-004: without a study-day column __hep_day is NaN and timing falls back to filled points (port)', () => {
    const noDay = syncSettings({ studyday_col: null });
    const { rows } = cleanData([row('P1', 'ALT', 0, 160, 40), row('P1', 'TB', 0, 3, 1)], noDay);
    expect(rows.every((r) => Number.isNaN(r.__hep_day))).toBe(true);
    const { points } = buildPoints(deriveBaseline(rows, noDay), noDay, edishState);
    // No usable study day -> the day gap is unavailable, but points default to
    // filled (withinWindow true) rather than all-hollow.
    expect(points[0].day_diff).toBeNaN();
    expect(points[0].withinWindow).toBe(true);
  });

  it('HEP-DATA-004: a non-numeric study-day value is treated as absent (NaN), not coerced (port)', () => {
    // A blank or non-numeric DY must not become 0 via Number('') === 0.
    const { rows } = cleanData(
      [row('P1', 'ALT', '', 160, 40), row('P1', 'ALT', 'SCREEN', 80, 40)],
      settings
    );
    expect(rows.every((r) => Number.isNaN(r.__hep_day))).toBe(true);
  });

  it('HEP-SELECT-004/HEP-DATA-004: with no study day, assignSequence orders and pairs by per-measure input order (port)', () => {
    const noDay = syncSettings({ studyday_col: null, visit_col: null, filters: ['SEX'] });
    const rows = assignSequence(
      deriveBaseline(
        cleanData(
          [
            row('Q1', 'ALT', null, 40, 40, { SEX: 'F' }), // ALT #1 -> 1xULN
            row('Q1', 'ALT', null, 160, 40, { SEX: 'F' }), // ALT #2 -> 4xULN
            row('Q1', 'TB', null, 1, 1, { SEX: 'F' }), // TB  #1 -> 1xULN
            row('Q1', 'TB', null, 3, 1, { SEX: 'F' }) // TB  #2 -> 3xULN
          ],
          noDay
        ).rows,
        noDay
      ),
      noDay
    );
    // Each participant x measure numbers its records 1..n in input order.
    expect(rows.map((r) => r.__hep_seq)).toEqual([1, 2, 1, 2]);
    // No usable study day -> the point renders filled.
    const { points } = buildPoints(rows, noDay, edishState);
    expect(points[0].day_diff).toBeNaN();
    expect(points[0].withinWindow).toBe(true);
    // The visit path pairs ALT/TB by sequence, in sequence order, labelled #n.
    const path = visitPathSeries(rows, 'Q1', noDay, edishState);
    expect(path).toHaveLength(2);
    expect(path[0]).toMatchObject({ x: 1, y: 1, label: '#1' });
    expect(path[1]).toMatchObject({ x: 4, y: 3, label: '#2' });
  });

  it('HEP-CTRL-010: maxRRatio is the largest finite participant R-Ratio, 0 when none is finite (port)', () => {
    // P1 has ALT peak 4xULN over ALP peak 1.2xULN; P2 has no ALP -> NaN R-Ratio.
    expect(maxRRatio(prepared, settings)).toBeCloseTo(4 / 1.2, 10);
    // No ALP anywhere -> every R-Ratio is NaN -> 0.
    const noAlp = deriveBaseline(
      cleanData([row('Z1', 'ALT', 0, 160, 40), row('Z1', 'TB', 0, 3, 1)], settings).rows,
      settings
    );
    expect(maxRRatio(noAlp, settings)).toBe(0);
  });

  it('HEP-DATA-002: resolveMeasureRows matches rows via the measure_values TEST strings (port)', () => {
    const altRows = resolveMeasureRows(prepared, settings, 'ALT');
    expect(altRows).toHaveLength(5); // P1 x2, P2 x2, P3 x1
    expect(altRows.every((r) => r.TEST === 'Aminotransferase, alanine (ALT)')).toBe(true);
    expect(resolveMeasureRows(prepared, settings, 'AST')).toEqual([]);
  });

  it('HEP-DISPLAY-001: deriveBaseline uses the day-0 record, else the earliest day, as the xBaseline denominator (port)', () => {
    // P1 ALT baseline is the day-0 value 20 -> day-10 record is 160/20 = 8xBaseline.
    const p1Alt = resolveMeasureRows(prepared, settings, 'ALT').filter((r) => r.USUBJID === 'P1');
    expect(p1Alt.map((r) => r.__hep_baseline)).toEqual([20, 20]);
    expect(p1Alt.map((r) => r.__hep_relative_baseline)).toEqual([1, 8]);
    // No day-0 record -> earliest day wins.
    const late = deriveBaseline(
      cleanData([row('P9', 'ALT', 7, 30, 40), row('P9', 'ALT', 3, 10, 40)], settings).rows,
      settings
    );
    expect(late.map((r) => r.__hep_baseline)).toEqual([10, 10]);
    expect(late.find((r) => r.__hep_day === 7).__hep_relative_baseline).toBe(3);
  });

  it('HEP-DISPLAY-004: a zero baseline leaves xBaseline NaN so mDISH drops the participant (port)', () => {
    const zeroBase = deriveBaseline(
      cleanData([row('P8', 'ALT', 0, 0, 40), row('P8', 'ALT', 10, 20, 40)], settings).rows,
      settings
    );
    expect(zeroBase.every((r) => Number.isNaN(r.__hep_relative_baseline))).toBe(true);
  });

  it('HEP-DISPLAY-003: participantPeak picks the record with the max active-display value, per display mode (port)', () => {
    // ULN and baseline scales disagree on the peak record here:
    // day 0: 50/10 = 5xULN, 1xBaseline; day 5: 60/30 = 2xULN, 1.2xBaseline.
    const rows = deriveBaseline(
      cleanData([row('P7', 'ALT', 0, 50, 10), row('P7', 'ALT', 5, 60, 30)], settings).rows,
      settings
    );
    const ulnPeak = participantPeak(rows, 'ALT', 'relative_uln');
    expect(ulnPeak.key).toBe('ALT');
    expect(ulnPeak.value).toBe(5);
    expect(ulnPeak.day).toBe(0);
    const baselinePeak = participantPeak(rows, 'ALT', 'relative_baseline');
    expect(baselinePeak.value).toBeCloseTo(1.2, 10);
    expect(baselinePeak.day).toBe(5);
    // No finite values -> null.
    expect(participantPeak([], 'ALT', 'relative_uln')).toBeNull();
  });

  it('HEP-DISPLAY-006: computeRRatio is peak ALT xULN over peak ALP xULN, NaN without ALP (port)', () => {
    const p1Rows = prepared.filter((r) => r.USUBJID === 'P1');
    // 4xULN ALT / 1.2xULN ALP.
    expect(computeRRatio(p1Rows, settings)).toBeCloseTo(4 / 1.2, 10);
    const p2Rows = prepared.filter((r) => r.USUBJID === 'P2');
    expect(computeRRatio(p2Rows, settings)).toBeNaN();
  });

  it('HEP-CHART-001/HEP-DISPLAY-003: buildPoints reduces to one peak-vs-peak point per participant with timing and rRatio (port)', () => {
    const { points, droppedParticipants } = buildPoints(prepared, settings, edishState);
    expect(points.map((p) => p.id)).toEqual(['P1', 'P2']);
    const p1 = points[0];
    expect(p1.x).toBe(4);
    expect(p1.y).toBe(3);
    expect(p1.days_x).toBe(10);
    expect(p1.days_y).toBe(12);
    expect(p1.day_diff).toBe(2);
    expect(p1.withinWindow).toBe(true);
    expect(p1.rRatio).toBeCloseTo(4 / 1.2, 10);
    expect(p1.group).toBeNull();
    expect(p1.raw).toEqual({ USUBJID: 'P1', SEX: 'F' });
    const p2 = points[1];
    expect(p2.x).toBe(0.75);
    expect(p2.y).toBe(0.8);
    expect(p2.rRatio).toBeNaN();
    // P3 has no TB rows -> dropped and counted for the warning note.
    expect(droppedParticipants).toBe(1);
  });

  it('HEP-DISPLAY-001: buildPoints in mDISH uses the xBaseline peaks (port)', () => {
    const { points } = buildPoints(prepared, settings, {
      ...edishState,
      display: 'relative_baseline'
    });
    const p1 = points.find((p) => p.id === 'P1');
    expect(p1.x).toBe(8); // 160 / baseline 20
    expect(p1.y).toBe(3); // 3 / baseline 1
    // rRatio stays on the ULN scale regardless of display mode.
    expect(p1.rRatio).toBeCloseTo(4 / 1.2, 10);
  });

  it('HEP-DISPLAY-004: buildPoints in mDISH drops participants without a usable baseline (port)', () => {
    const zeroBase = deriveBaseline(
      cleanData(
        [
          row('P8', 'ALT', 0, 0, 40),
          row('P8', 'ALT', 10, 20, 40),
          row('P8', 'TB', 0, 1, 1),
          row('P8', 'TB', 10, 2, 1)
        ],
        settings
      ).rows,
      settings
    );
    const edish = buildPoints(zeroBase, settings, edishState);
    expect(edish.points).toHaveLength(1);
    const mdish = buildPoints(zeroBase, settings, {
      ...edishState,
      display: 'relative_baseline'
    });
    expect(mdish.points).toHaveLength(0);
    expect(mdish.droppedParticipants).toBe(1);
  });

  it('HEP-CTRL-008: buildPoints flags points outside the timing window as hollow (port)', () => {
    const { points } = buildPoints(prepared, settings, { ...edishState, visitWindow: 1 });
    // P1's peaks are 2 days apart -> outside a 1-day window.
    expect(points.find((p) => p.id === 'P1').withinWindow).toBe(false);
    // P2's peaks share day 10 -> within any non-negative window.
    expect(points.find((p) => p.id === 'P2').withinWindow).toBe(true);
  });

  it('HEP-CTRL-009: buildPoints tags each point with its participant-level group value when grouping (port)', () => {
    const grouped = syncSettings({ groups: ['SEX'], group_by: 'SEX' });
    const rows = deriveBaseline(cleanData(raw, grouped).rows, grouped);
    const { points } = buildPoints(rows, grouped, { ...edishState, groupBy: 'SEX' });
    expect(points.find((p) => p.id === 'P1').group).toBe('F');
    expect(points.find((p) => p.id === 'P2').group).toBe('M');
  });

  it('HEP-CTRL-011: applyFilters keeps points matching every active filter; unset filters match everything (port)', () => {
    const { points } = buildPoints(prepared, settings, edishState);
    expect(applyFilters(points, { SEX: 'F' }).map((p) => p.id)).toEqual(['P1']);
    expect(applyFilters(points, { SEX: 'M' }).map((p) => p.id)).toEqual(['P2']);
    expect(applyFilters(points, { SEX: '' })).toHaveLength(2);
    expect(applyFilters(points, {})).toHaveLength(2);
    expect(applyFilters(points, { SEX: 'X' })).toHaveLength(0);
  });

  it('HEP-QUAD-004: classifyQuadrants buckets one point per quadrant with counts and percents (port)', () => {
    const points = [
      { x: 4, y: 3 }, // High/High
      { x: 1, y: 3 }, // Normal/High
      { x: 4, y: 0.5 }, // High/Normal
      { x: 1, y: 0.5 } // Normal/Normal
    ];
    const { counts, labels } = classifyQuadrants(points, 3, 2);
    expect(counts).toEqual({
      'upper-right': 1,
      'upper-left': 1,
      'lower-right': 1,
      'lower-left': 1
    });
    const byPosition = Object.fromEntries(labels.map((l) => [l.position, l]));
    expect(byPosition['upper-right'].label).toBe("Possible Hy's Law Range");
    expect(byPosition['upper-left'].label).toBe('Hyperbilirubinemia');
    expect(byPosition['lower-right'].label).toBe("Temple's Corollary");
    expect(byPosition['lower-left'].label).toBe('Normal Range');
    expect(labels.every((l) => l.percent === 25)).toBe(true);
  });

  it('HEP-QUAD-004: a point exactly on a cutpoint classifies as High, and empty data yields zero percents (port)', () => {
    const { counts } = classifyQuadrants([{ x: 3, y: 2 }], 3, 2);
    expect(counts['upper-right']).toBe(1);
    const empty = classifyQuadrants([], 3, 2);
    expect(empty.labels.every((l) => l.count === 0 && l.percent === 0)).toBe(true);
  });

  it('HEP-SELECT-003: visitPathSeries pairs the X/Y values by visit in chronological order (port)', () => {
    const path = visitPathSeries(prepared, 'P1', settings, edishState);
    expect(path).toHaveLength(2);
    expect(path[0]).toMatchObject({ x: 0.5, y: 1, visit: 'Baseline', label: 'Baseline' });
    expect(path[1]).toMatchObject({ x: 4, y: 3, visit: 'Week 2', label: 'Week 2' });
    // A participant without both measures has no path.
    expect(visitPathSeries(prepared, 'P3', settings, edishState)).toEqual([]);
  });

  it('HEP-SELECT-003: without a visit column the path pairs by study day and labels the days (port)', () => {
    const noVisit = syncSettings({ visit_col: null, filters: ['SEX'] });
    const path = visitPathSeries(prepared, 'P1', noVisit, edishState);
    // Only day 0 has both an ALT and a TB record (peaks land on days 10 vs 12).
    expect(path).toHaveLength(1);
    expect(path[0]).toMatchObject({ x: 0.5, y: 1, day: 0, label: 'Day 0' });
  });

  it('HEP-SELECT-003: visitPathSeries respects the active display mode (port)', () => {
    const path = visitPathSeries(prepared, 'P1', settings, {
      ...edishState,
      display: 'relative_baseline'
    });
    expect(path[0]).toMatchObject({ x: 1, y: 1 });
    expect(path[1]).toMatchObject({ x: 8, y: 3 });
  });

  it('HEP-SELECT-002: participantMeasureSeries returns one day-ordered series per present measure in display units (port)', () => {
    const series = participantMeasureSeries(prepared, 'P1', settings, edishState);
    // AST is absent from the fixture and filtered out; MEASURE_KEYS order kept.
    expect(series.map((s) => s.key)).toEqual(['ALT', 'TB', 'ALP']);
    const alt = series[0];
    expect(alt.label).toBe('ALT');
    expect(alt.points.map((p) => p.day)).toEqual([0, 10]);
    expect(alt.points.map((p) => p.value)).toEqual([0.5, 4]);
    expect(alt.points[1].raw.STRESN).toBe(160);
    // mDISH units flow through.
    const mdish = participantMeasureSeries(prepared, 'P1', settings, {
      display: 'relative_baseline'
    });
    expect(mdish.find((s) => s.key === 'ALT').points.map((p) => p.value)).toEqual([1, 8]);
  });

  it('HEP-SELECT-005: measureSummary reports n/min/median/max of the raw values per present measure (port)', () => {
    const summary = measureSummary(prepared, 'P1', settings);
    expect(summary.map((s) => s.key)).toEqual(['ALT', 'TB', 'ALP']);
    expect(summary[0]).toEqual({ key: 'ALT', label: 'ALT', n: 2, min: 20, median: 90, max: 160 });
    expect(summary[1]).toEqual({ key: 'TB', label: 'TB', n: 2, min: 1, median: 2, max: 3 });
    expect(summary[2]).toEqual({
      key: 'ALP',
      label: 'ALP',
      n: 2,
      min: 100,
      median: 110,
      max: 120
    });
    // P3 has ALT only.
    expect(measureSummary(prepared, 'P3', settings).map((s) => s.key)).toEqual(['ALT']);
  });
});
