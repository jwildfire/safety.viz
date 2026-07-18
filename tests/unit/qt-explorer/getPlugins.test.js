import { describe, it, expect } from 'vitest';
import {
  ARM_COLORS,
  hexToRgba,
  armColorScale,
  scatterTooltip
} from '../../../src/qt-explorer/getPlugins.js';

describe('qt-explorer getPlugins helpers (QT-OUT-004/006)', () => {
  it('QT-PLG-001: hexToRgba converts to rgba at opacity', () => {
    expect(hexToRgba('#1f78b4', 0.5)).toBe('rgba(31, 120, 180, 0.5)');
  });
  it('QT-PLG-002: armColorScale assigns stable cycling colors', () => {
    const scale = armColorScale(['Placebo', 'Drug']);
    expect(scale.get('Placebo')).toBe(ARM_COLORS[0]);
    expect(scale.get('Drug')).toBe(ARM_COLORS[1]);
  });
  it('QT-PLG-003: scatterTooltip lists id, arm, baseline, value, change, visit', () => {
    const lines = scatterTooltip(
      { id: 'D2', arm: 'Drug', baseline: 430, value: 500, change: 70, visit: 'Week 4' },
      'QTcF'
    );
    expect(lines[0]).toBe('Participant: D2');
    expect(lines).toContain('Arm: Drug');
    expect(lines).toContain('Change: +70');
    expect(lines).toContain('Visit: Week 4');
  });
});
