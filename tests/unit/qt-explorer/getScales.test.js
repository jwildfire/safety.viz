import { describe, it, expect } from 'vitest';
import {
  correctionSuffix,
  isQtcMeasure,
  measureUnit,
  centralAxisTitle,
  scatterAxisTitles,
  formatNumber,
  formatSigned,
  paddedDomain,
  armPointStyles,
  ARM_POINT_STYLES
} from '../../../src/qt-explorer/getScales.js';

const QTC = ['QTcF', 'QTcB'];

describe('qt-explorer getScales titles + units (QT-OUT-005, QT-CT-001)', () => {
  it('QT-SCL-001: correctionSuffix maps the QTc formulas', () => {
    expect(correctionSuffix('QTcF')).toBe('Fridericia');
    expect(correctionSuffix('QTcB')).toBe('Bazett');
    expect(correctionSuffix('Heart Rate')).toBeNull();
  });
  it('QT-SCL-002: isQtcMeasure + measureUnit distinguish QTc from HR', () => {
    expect(isQtcMeasure('QTcF', QTC)).toBe(true);
    expect(isQtcMeasure('Heart Rate', QTC)).toBe(false);
    expect(measureUnit('QTcF', QTC)).toBe('ms');
    expect(measureUnit('Heart Rate', QTC)).toBe('bpm');
  });
  it('QT-SCL-003: central axis title carries mode prefix + correction suffix', () => {
    expect(centralAxisTitle('QTcF', 'delta', QTC)).toBe('Δ QTcF (ms) − Fridericia');
    expect(centralAxisTitle('QTcF', 'deltadelta', QTC)).toBe('ΔΔ QTcF (ms) − Fridericia');
    expect(centralAxisTitle('Heart Rate', 'delta', QTC)).toBe('Δ Heart Rate (bpm)');
  });
  it('QT-SCL-004: scatter titles mirror the mockup', () => {
    expect(scatterAxisTitles('QTcF', QTC)).toEqual({
      x: 'Baseline QTcF (ms) − Fridericia',
      y: 'QTcF change (ms) − Fridericia'
    });
    expect(scatterAxisTitles('QTcB', QTC).y).toBe('QTcB change (ms) − Bazett');
  });
});

describe('qt-explorer getScales formatting + domains', () => {
  it('QT-SCL-005: formatNumber trims and guards non-finite', () => {
    expect(formatNumber(58.499)).toBe('58.5');
    expect(formatNumber(60)).toBe('60');
    expect(formatNumber(NaN)).toBe('NA');
  });
  it('QT-SCL-006: formatSigned signs the change with a real minus glyph', () => {
    expect(formatSigned(58.5)).toBe('+58.5');
    expect(formatSigned(-12)).toBe('−12');
    expect(formatSigned(0)).toBe('0');
  });
  it('QT-SCL-007: paddedDomain covers values and forced inclusions', () => {
    const [lo, hi] = paddedDomain([10, 20], [0, 60]);
    expect(lo).toBeLessThanOrEqual(0);
    expect(hi).toBeGreaterThanOrEqual(60);
  });
  it('QT-SCL-007: paddedDomain handles an empty / degenerate sample', () => {
    expect(paddedDomain([])).toEqual([0, 1]);
    const [lo, hi] = paddedDomain([5]);
    expect(lo).toBeLessThan(5);
    expect(hi).toBeGreaterThan(5);
  });
});

describe('qt-explorer getScales arm point styles (QT-OUT-004)', () => {
  it('QT-SCL-008: assigns a distinct cycling point style per arm', () => {
    const styles = armPointStyles(['Placebo', 'Drug', 'Other']);
    expect(styles.get('Placebo')).toBe(ARM_POINT_STYLES[0]);
    expect(styles.get('Drug')).toBe(ARM_POINT_STYLES[1]);
    expect(styles.get('Other')).toBe(ARM_POINT_STYLES[2]);
  });
});
