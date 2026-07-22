import { describe, it, expect } from 'vitest';
import { buildEcgRecords, correctQt, EG_TIMEPOINT } from '../../../scripts/demo-data-lib.mjs';

// ECG demo-data derivation (#79). The pilot ADEG ships QTcF/QTcB pre-derived as
// QTCFR/QTCBR, but those were rederived upstream from a corrupt `RR` column whose
// values contradict the recorded heart rate — passing them through inflated QTcF by
// ~80 ms and saturated every ICH E14 threshold in the demo. The build now derives the
// corrections itself from QT and the sound `RRR` parameter, and refuses to build if
// the RR source ever disagrees with HR again.

// One supine analysis reading. RR defaults to 60000/HR, i.e. internally consistent.
function reading({ id = '01-001', visit = 'Week 2', visitn = '2', paramcd, aval, ablfl = 'NA' }) {
  return {
    USUBJID: id,
    SITEID: '701',
    SEX: 'F',
    RACE: 'WHITE',
    AGE: '63',
    TRTA: 'Placebo',
    AVISIT: visit,
    AVISITN: visitn,
    PARAMCD: paramcd,
    AVAL: String(aval),
    BASE: 'NA',
    CHG: 'NA',
    ABLFL: ablfl,
    ANL01FL: 'Y',
    DTYPE: 'NA',
    ATPT: EG_TIMEPOINT
  };
}

// A visit's worth of source rows: QT, a consistent RRR, and the HR it implies.
function visitRows({ id, visit, visitn, qt, hr, ablfl = 'NA' }) {
  return [
    reading({ id, visit, visitn, paramcd: 'QT', aval: qt, ablfl }),
    reading({ id, visit, visitn, paramcd: 'RRR', aval: 60000 / hr, ablfl }),
    reading({ id, visit, visitn, paramcd: 'HR', aval: hr, ablfl })
  ];
}

describe('correctQt', () => {
  it('applies Fridericia — QT divided by the cube root of RR in seconds (#79)', () => {
    // RR = 1000 ms = 1 s, so any root of it is 1: QTc equals QT exactly.
    expect(correctQt(400, 1000, 1 / 3)).toBeCloseTo(400, 10);
    // RR = 800 ms: 0.8^(1/3) = 0.92832…
    expect(correctQt(400, 800, 1 / 3)).toBeCloseTo(400 / Math.cbrt(0.8), 10);
  });

  it('applies Bazett — QT divided by the square root of RR in seconds (#79)', () => {
    expect(correctQt(400, 1000, 1 / 2)).toBeCloseTo(400, 10);
    expect(correctQt(400, 640, 1 / 2)).toBeCloseTo(400 / Math.sqrt(0.64), 10);
  });

  it('corrects upward above 60 bpm and downward below it (#79)', () => {
    // RR < 1000 ms is a heart rate above 60 bpm, where QTc exceeds QT.
    expect(correctQt(400, 700, 1 / 3)).toBeGreaterThan(400);
    expect(correctQt(400, 1200, 1 / 3)).toBeLessThan(400);
  });
});

describe('buildEcgRecords', () => {
  const source = [
    ...visitRows({ id: '01-001', visit: 'Baseline', visitn: '0', qt: 400, hr: 60, ablfl: 'Y' }),
    ...visitRows({ id: '01-001', visit: 'Week 2', visitn: '2', qt: 420, hr: 60 })
  ];

  it('derives QTcF and QTcB from QT and RRR rather than the pilot parameters (#79)', () => {
    const { records } = buildEcgRecords(source);

    const qtcf = records.filter((r) => r.TEST === 'QTcF');
    const qtcb = records.filter((r) => r.TEST === 'QTcB');
    expect(qtcf).toHaveLength(2);
    expect(qtcb).toHaveLength(2);

    // At 60 bpm RR is exactly 1000 ms, so both corrections return QT unchanged.
    expect(Number(qtcf.find((r) => r.VISIT === 'Baseline').STRESN)).toBeCloseTo(400, 6);
    expect(Number(qtcb.find((r) => r.VISIT === 'Week 2').STRESN)).toBeCloseTo(420, 6);

    // The corrected values carry standard PARAMCDs, not the pilot's "Rederived" ones.
    expect(new Set(records.map((r) => r.PARAMCD))).toEqual(new Set(['QTCF', 'QTCB', 'HR']));
  });

  it('passes heart rate through as recorded (#79)', () => {
    const { records } = buildEcgRecords(source);
    const hr = records.filter((r) => r.TEST === 'Heart Rate');
    expect(hr).toHaveLength(2);
    expect(hr.every((r) => Number(r.STRESN) === 60)).toBe(true);
    expect(hr[0].STRESU).toBe('beats/min');
  });

  it('anchors BASE and CHG on each participant baseline record (#79)', () => {
    const { records } = buildEcgRecords(source);
    const week2 = records.find((r) => r.TEST === 'QTcF' && r.VISIT === 'Week 2');
    const baseline = records.find((r) => r.TEST === 'QTcF' && r.VISIT === 'Baseline');

    expect(Number(baseline.BASE)).toBeCloseTo(400, 6);
    expect(Number(baseline.CHG)).toBeCloseTo(0, 6);
    expect(Number(week2.BASE)).toBeCloseTo(400, 6);
    expect(Number(week2.CHG)).toBeCloseTo(20, 6);
  });

  it('keeps each participant on its own baseline (#79)', () => {
    const twoParticipants = [
      ...source,
      ...visitRows({ id: '01-002', visit: 'Baseline', visitn: '0', qt: 300, hr: 60, ablfl: 'Y' }),
      ...visitRows({ id: '01-002', visit: 'Week 2', visitn: '2', qt: 330, hr: 60 })
    ];
    const { records } = buildEcgRecords(twoParticipants);
    const other = records.find(
      (r) => r.TEST === 'QTcF' && r.VISIT === 'Week 2' && r.USUBJID === '01-002'
    );
    expect(Number(other.BASE)).toBeCloseTo(300, 6);
    expect(Number(other.CHG)).toBeCloseTo(30, 6);
  });

  it('refuses to build when the RR source contradicts the recorded heart rate (#79)', () => {
    // Reproduces the upstream defect: RR says 113.6 bpm while HR says 72.
    const corrupt = [
      reading({ paramcd: 'QT', aval: 456, ablfl: 'Y' }),
      reading({ paramcd: 'RRR', aval: 528, ablfl: 'Y' }),
      reading({ paramcd: 'HR', aval: 72, ablfl: 'Y' })
    ];
    expect(() => buildEcgRecords(corrupt)).toThrow(/disagrees with HR/);
  });

  it('drops non-analysis rows: the AVERAGE roll-up and non-supine postures (#79)', () => {
    const noisy = [
      ...source,
      ...visitRows({ id: '01-001', visit: 'Week 4', visitn: '4', qt: 500, hr: 60 }).map((r) => ({
        ...r,
        DTYPE: 'AVERAGE'
      })),
      ...visitRows({ id: '01-001', visit: 'Week 6', visitn: '6', qt: 500, hr: 60 }).map((r) => ({
        ...r,
        ATPT: 'AFTER STANDING FOR 1 MINUTE'
      }))
    ];
    const { records } = buildEcgRecords(noisy);
    expect(records.map((r) => r.VISIT)).not.toContain('Week 4');
    expect(records.map((r) => r.VISIT)).not.toContain('Week 6');
  });

  it('throws when a source parameter the derivation needs is absent (#79)', () => {
    const noRr = source.filter((r) => r.PARAMCD !== 'RRR');
    expect(() => buildEcgRecords(noRr)).toThrow(/RRR/);
  });
});
