import { describe, it, expect } from 'vitest';
import { checkInputs } from '../../../src/qt-explorer/checkInputs.js';
import { syncSettings } from '../../../src/qt-explorer/configure.js';

const SETTINGS = syncSettings({});

describe('qt-explorer checkInputs (QT-DATA-005)', () => {
  it('QT-DATA-005: passes when every required column is present', () => {
    const data = [{ TEST: 'QTcF', STRESN: 420, ARM: 'Placebo', BASE: 410 }];
    expect(() => checkInputs(data, SETTINGS)).not.toThrow();
  });
  it('QT-DATA-005: throws naming each missing required column', () => {
    const data = [{ TEST: 'QTcF', STRESN: 420 }];
    expect(() => checkInputs(data, SETTINGS)).toThrow(/Required variable\(s\) missing:/);
    try {
      checkInputs(data, SETTINGS);
    } catch (error) {
      expect(error.message).toContain('ARM');
      expect(error.message).toContain('BASE');
    }
  });
  it('QT-DATA-005: an empty dataset reports all required columns missing', () => {
    expect(() => checkInputs([], SETTINGS)).toThrow(/TEST/);
  });
});
