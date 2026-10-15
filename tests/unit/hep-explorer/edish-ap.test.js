import { describe, it, expect } from 'vitest';
import { syncSettings, SCREEN_OPTIONS } from '../../../src/hep-explorer/configure.js';
import {
  cleanData,
  classifyQuadrants,
  deriveBaseline
} from '../../../src/hep-explorer/structureData.js';
import {
  QUADRANT_LABELS,
  QUADRANT_MEANINGS,
  quadrantLabelsFor
} from '../../../src/hep-explorer/getPlugins.js';
import {
  COMPOSITE_QUADRANTS,
  QUADRANT_SETS,
  classifyComposite,
  quadrantName,
  resolveScreen,
  screenForMeasure
} from '../../../src/hep-core/quadrants.js';
import { buildHepSubjects } from '../../../src/hep-core/subjects.js';

// eDISH-AP, the cholestatic DILI screening plot (safety.viz#344,
// obot.roadmap#421): eDISH with alkaline phosphatase on the x-axis in place of
// ALT, read beside standard eDISH in FDA's hepatology review for fitusiran
// (NDA 219019, 2025). The hepatocellular screen must stay exactly as it was.

const [NN, CH, TC, HL] = COMPOSITE_QUADRANTS;

describe('eDISH-AP quadrant sets (hep-core)', () => {
  it('HEP-AP-001: two named quadrant sets — hepatocellular is today’s eDISH, cholestatic puts ALP on x at 2×ULN (#344)', () => {
    expect(Object.keys(QUADRANT_SETS)).toEqual(['hepatocellular', 'cholestatic']);

    const hep = QUADRANT_SETS.hepatocellular;
    expect(hep.label).toBe('eDISH');
    expect(hep.xMeasure).toBe('ALT');
    expect(hep.xCut).toBe(3);
    expect(hep.yCut).toBe(2);
    // The hepatocellular names ARE the FDA reference's quadrant keys.
    COMPOSITE_QUADRANTS.forEach((key) => expect(hep.names[key]).toBe(key));

    const chol = QUADRANT_SETS.cholestatic;
    expect(chol.label).toBe('eDISH-AP');
    expect(chol.xMeasure).toBe('ALP');
    expect(chol.xCut).toBe(2);
    expect(chol.yCut).toBe(2);
    expect(chol.names).toEqual({
      [NN]: 'Normal range',
      [CH]: 'Bilirubin only',
      [TC]: 'ALP elevation only',
      [HL]: 'Cholestatic injury + jaundice'
    });
  });

  it('HEP-AP-002: the cholestatic set classifies on ALP 2×ULN with the cut value on the normal side; the default screen is unchanged (#344)', () => {
    // Exactly on both cut lines: normal.
    expect(classifyComposite(2, 2, 'cholestatic')).toBe(NN);
    expect(classifyComposite(2.01, 1, 'cholestatic')).toBe(TC);
    expect(classifyComposite(1, 2.01, 'cholestatic')).toBe(CH);
    expect(classifyComposite(4, 3, 'cholestatic')).toBe(HL);
    // An x of 2.5 is elevated for ALP but not for ALT.
    expect(classifyComposite(2.5, 1, 'cholestatic')).toBe(TC);
    expect(classifyComposite(2.5, 1)).toBe(NN);
    expect(classifyComposite(2.5, 1, 'hepatocellular')).toBe(NN);
    expect(classifyComposite(3.5, 3)).toBe(HL);
  });

  it('HEP-AP-003: screens resolve from a setting or an x measure, and quadrant keys read as the active screen’s names (#344)', () => {
    expect(resolveScreen('cholestatic')).toBe('cholestatic');
    expect(resolveScreen('hepatocellular')).toBe('hepatocellular');
    expect(resolveScreen('bogus')).toBe('hepatocellular');
    expect(resolveScreen(undefined)).toBe('hepatocellular');

    expect(screenForMeasure('ALP')).toBe('cholestatic');
    ['ALT', 'AST', 'TB', undefined].forEach((key) =>
      expect(screenForMeasure(key)).toBe('hepatocellular')
    );

    expect(quadrantName(HL, 'cholestatic')).toBe('Cholestatic injury + jaundice');
    expect(quadrantName(CH, 'cholestatic')).toBe('Bilirubin only');
    expect(quadrantName(HL, 'hepatocellular')).toBe(HL);
    expect(quadrantName(HL)).toBe(HL);
    expect(quadrantName('Something else', 'cholestatic')).toBe('Something else');
  });
});

describe('eDISH-AP subject reduction (hep-core)', () => {
  const settings = syncSettings({});
  const M = settings.measure_values;
  const row = (id, key, day, value, uln) => ({
    USUBJID: id,
    TEST: M[key],
    STRESN: value,
    STNRHI: uln,
    DY: day,
    ARM: 'Study Drug'
  });
  // CHOL: a cholestatic participant — ALP 3×ULN with jaundice, ALT normal.
  // HEPA: a hepatocellular participant — ALT 5×ULN, ALP normal, no jaundice.
  // NOALP: no ALP at all — kept by eDISH, dropped by eDISH-AP.
  const raw = [
    row('CHOL', 'ALT', 0, 30, 40),
    row('CHOL', 'ALT', 14, 50, 40),
    row('CHOL', 'ALP', 0, 100, 100),
    row('CHOL', 'ALP', 14, 300, 100),
    row('CHOL', 'TB', 0, 1, 1),
    row('CHOL', 'TB', 14, 2.5, 1),
    row('HEPA', 'ALT', 0, 40, 40),
    row('HEPA', 'ALT', 14, 200, 40),
    row('HEPA', 'ALP', 0, 80, 100),
    row('HEPA', 'ALP', 14, 120, 100),
    row('HEPA', 'TB', 0, 1, 1),
    row('HEPA', 'TB', 14, 1, 1),
    row('NOALP', 'ALT', 0, 40, 40),
    row('NOALP', 'ALT', 14, 60, 40),
    row('NOALP', 'TB', 0, 1, 1),
    row('NOALP', 'TB', 14, 1, 1)
  ];
  const prepared = deriveBaseline(cleanData(raw, settings).rows, settings);
  const byId = (subjects) => Object.fromEntries(subjects.map((s) => [s.id, s]));

  it('HEP-AP-004: the cholestatic reduction puts peak ALP on x and classifies with the cholestatic set (#344)', () => {
    const { subjects, excluded } = buildHepSubjects(prepared, settings, 'cholestatic');
    const s = byId(subjects);
    expect(excluded).toBe(1);
    expect(s.NOALP).toBeUndefined();

    expect(s.CHOL.screen).toBe('cholestatic');
    expect(s.CHOL.xMeasure).toBe('ALP');
    expect(s.CHOL.baselineXULN).toBeCloseTo(1);
    expect(s.CHOL.peakXULN).toBeCloseTo(3);
    expect(s.CHOL.peakXBLN).toBeCloseTo(3);
    expect(s.CHOL.pretreatQuadrant).toBe(NN);
    expect(s.CHOL.onTreatQuadrant).toBe(HL);

    // ALT 5×ULN is elevated for eDISH but this screen reads ALP (1.2×ULN).
    expect(s.HEPA.peakXULN).toBeCloseTo(1.2);
    expect(s.HEPA.onTreatQuadrant).toBe(NN);
  });

  it('HEP-AP-004: the default reduction is the hepatocellular screen, with the generic x fields equal to the ALT fields (#344)', () => {
    const { subjects, excluded } = buildHepSubjects(prepared, settings);
    const s = byId(subjects);
    expect(excluded).toBe(0);
    expect(s.HEPA.screen).toBe('hepatocellular');
    expect(s.HEPA.xMeasure).toBe('ALT');
    expect(s.HEPA.onTreatQuadrant).toBe(TC);
    subjects.forEach((subject) => {
      expect(subject.peakXULN).toBe(subject.peakAltULN);
      expect(subject.baselineXULN).toBe(subject.baselineAltULN);
      expect(subject.peakXBLN).toBe(subject.peakAltBLN);
    });
    // CHOL's jaundice with a normal ALT is the TB-only quadrant under eDISH.
    expect(s.CHOL.onTreatQuadrant).toBe(CH);
  });
});

describe('eDISH-AP on the scatter', () => {
  const points = [
    { x: 1, y: 1 },
    { x: 2, y: 2 }, // exactly on both cut lines
    { x: 3, y: 1 },
    { x: 1, y: 3 },
    { x: 4, y: 4 }
  ];

  it('HEP-AP-005: the cholestatic scatter names its quadrants for ALP, counts a value on the line as normal, and explains each quadrant (#344)', () => {
    const labels = quadrantLabelsFor('cholestatic');
    expect(labels.map((entry) => [entry.position, entry.label])).toEqual([
      ['upper-right', 'Cholestatic injury + jaundice'],
      ['upper-left', 'Bilirubin only'],
      ['lower-right', 'ALP elevation only'],
      ['lower-left', 'Normal range']
    ]);
    labels.forEach((entry) => expect(QUADRANT_MEANINGS[entry.label]).toMatch(/\w/));
    expect(QUADRANT_MEANINGS['Cholestatic injury + jaundice']).not.toMatch(/aminotransferase/i);

    const { counts, labels: classified } = classifyQuadrants(points, 2, 2, 'cholestatic');
    expect(counts).toEqual({
      'upper-right': 1,
      'upper-left': 1,
      'lower-right': 1,
      'lower-left': 2
    });
    expect(classified.map((entry) => entry.label)).toEqual(labels.map((entry) => entry.label));
  });

  it('HEP-AP-005: the hepatocellular scatter keeps its labels and its at-or-above rule (#344)', () => {
    expect(quadrantLabelsFor('hepatocellular')).toBe(QUADRANT_LABELS);
    expect(quadrantLabelsFor()).toBe(QUADRANT_LABELS);
    const { counts } = classifyQuadrants(points, 2, 2);
    expect(counts['upper-right']).toBe(2);
    expect(counts['lower-left']).toBe(1);
  });
});

describe('eDISH-AP settings', () => {
  it('HEP-AP-006: a screen setting defaults to hepatocellular, rejects unknown values, and the ALP cut line defaults to 2×ULN (#344)', () => {
    expect(syncSettings({}).screen).toBe('hepatocellular');
    expect(syncSettings({ screen: 'cholestatic' }).screen).toBe('cholestatic');
    expect(syncSettings({ screen: 'nonsense' }).screen).toBe('hepatocellular');
    expect(syncSettings({}).cuts.ALP.relative_uln).toBe(2);
    expect(SCREEN_OPTIONS).toEqual([
      { value: 'hepatocellular', label: 'eDISH (hepatocellular)' },
      { value: 'cholestatic', label: 'eDISH-AP (cholestatic)' }
    ]);
  });
});
