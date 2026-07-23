import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/participant-profile/configure.js';
import { buildProfileModel } from '../../../src/participant-profile/structureData.js';
import { cleanData, deriveBaseline } from '../../../src/hep-core/rows.js';
import { makeRows, ALT_TEST, CREAT_TEST } from './fixture.js';

function clean(settings) {
  return deriveBaseline(cleanData(makeRows(), settings).rows, settings);
}

function model(id, overrides = {}, state = {}) {
  const settings = syncSettings({
    details: ['SEX', { value_col: 'AGE', label: 'Age' }],
    ...overrides
  });
  const rows = clean(settings);
  return buildProfileModel(rows, id, settings, { display: 'relative_uln', ...state });
}

describe('buildProfileModel — participant header fields (PPRF-2, PPRF-HDR-001)', () => {
  it('resolves details from the settings specs against the participant rows', () => {
    const { participant } = model('P1');
    expect(participant.id).toBe('P1');
    expect(participant.details).toEqual([
      { label: 'SEX', value: 'F' },
      { label: 'Age', value: 62 }
    ]);
  });

  it('computes the R Ratio (peak ALT xULN / peak ALP xULN) on the ULN scale', () => {
    // P1: ALT peak 160/40 = 4, ALP peak 144/120 = 1.2 -> 4 / 1.2
    expect(model('P1').participant.rRatio).toBeCloseTo(4 / 1.2, 10);
  });

  it('leaves the R Ratio NaN when ALP is missing', () => {
    expect(Number.isNaN(model('P4').participant.rRatio)).toBe(true);
  });

  it('passes P_ALT through from p_alt_col where a value exists, never computing it', () => {
    expect(model('P1', { p_alt_col: 'PALT' }).participant.pAlt).toBe('0.87');
    expect(model('P2', { p_alt_col: 'PALT' }).participant.pAlt).toBeNull();
    expect(model('P1').participant.pAlt).toBeNull();
  });
});

describe('buildProfileModel — spaghetti series (PPRF-3, PPRF-SPAG-001)', () => {
  it('builds one series per key measure present, day-ordered, in display units', () => {
    const { spaghetti } = model('P1');
    const alt = spaghetti.series.find((entry) => entry.key === 'ALT');
    expect(alt.isKey).toBe(true);
    expect(alt.points.map((point) => point.day)).toEqual([0, 30, 60]);
    expect(alt.points.map((point) => point.value)).toEqual([35 / 40, 4, 2]);
  });

  it('includes non-key measures as extra (isKey false) series', () => {
    const { spaghetti } = model('P1');
    const creat = spaghetti.series.find((entry) => entry.key === CREAT_TEST);
    expect(creat.isKey).toBe(false);
    expect(creat.points.map((point) => point.value)).toEqual([0.9 / 1.2, 1.5 / 1.2, 0.7 / 1.2]);
  });

  it('switches the series field with the display state (xBaseline)', () => {
    const { spaghetti } = model('P1', {}, { display: 'relative_baseline' });
    const alt = spaghetti.series.find((entry) => entry.key === 'ALT');
    expect(alt.points.map((point) => point.value)).toEqual([1, 160 / 35, 80 / 35]);
    expect(spaghetti.yLabel).toBe('Standardized Result [xBaseline]');
  });

  it('labels the y axis for the active display mode', () => {
    expect(model('P1').spaghetti.yLabel).toBe('Standardized Result [xULN]');
  });

  it('resolves per-measure cuts, falling back to the defaults entry (PPRF-3)', () => {
    const { spaghetti } = model('P1');
    const cutOf = (key) => spaghetti.series.find((entry) => entry.key === key).cut;
    expect(cutOf('ALT')).toBe(3); // defaults fallback
    expect(cutOf('TB')).toBe(2); // own entry
    expect(cutOf(CREAT_TEST)).toBe(3); // unlisted measure -> defaults
  });
});

describe('buildProfileModel — measure table model (PPRF-4, PPRF-TBL-001)', () => {
  it('orders rows key-first in measure_values order, extras after', () => {
    const { measures } = model('P1');
    expect(measures.map((entry) => entry.key)).toEqual(['ALT', 'AST', 'TB', 'ALP', CREAT_TEST]);
    expect(measures.map((entry) => entry.isKey)).toEqual([true, true, true, true, false]);
  });

  it('summarizes N/min/median/max from the raw values', () => {
    const alt = model('P1').measures.find((entry) => entry.key === 'ALT');
    expect(alt.n).toBe(3);
    expect(alt.min).toBe(35);
    expect(alt.median).toBe(80);
    expect(alt.max).toBe(160);
  });

  it('carries lln/uln and flags outliers on each spark point', () => {
    const creat = model('P1').measures.find((entry) => entry.key === CREAT_TEST);
    expect(creat.spark.map((point) => point.outlier)).toEqual([false, true, true]);
    expect(creat.spark[0]).toMatchObject({ day: 0, value: 0.9, lln: 0.8, uln: 1.2 });
  });

  it('computes the population extent over ALL participants at measureBounds', () => {
    // measureBounds [0, 1] -> the full-population min/max of the raw ALT values:
    // P1 35,160,80; P2 30,168; P3 20,24; P4 30,200; P5 30,80; P6 35,240; P7 20,24.
    const alt = model('P1', { measureBounds: [0, 1] }).measures.find(
      (entry) => entry.key === 'ALT'
    );
    expect(alt.populationExtent).toEqual([20, 240]);
  });

  it('narrower measureBounds move the extent inside the population range', () => {
    const alt = model('P1', { measureBounds: [0.5, 0.5] }).measures.find(
      (entry) => entry.key === 'ALT'
    );
    expect(alt.populationExtent[0]).toBe(alt.populationExtent[1]);
    expect(alt.populationExtent[0]).toBeGreaterThan(20);
    expect(alt.populationExtent[0]).toBeLessThan(240);
  });

  it('assigns each measure a color from the module palette', () => {
    const { measures, spaghetti } = model('P1');
    measures.forEach((entry) => {
      expect(entry.color).toMatch(/^#[0-9a-f]{6}$/i);
    });
    const altSeries = spaghetti.series.find((entry) => entry.key === 'ALT');
    const altMeasure = measures.find((entry) => entry.key === 'ALT');
    expect(altSeries.color).toBe(altMeasure.color);
  });

  it('reads the full TEST string as the label for key measures', () => {
    const alt = model('P1').measures.find((entry) => entry.key === 'ALT');
    expect(alt.label).toBe(ALT_TEST);
  });
});
