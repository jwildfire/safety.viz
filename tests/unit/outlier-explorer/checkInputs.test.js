import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/outlier-explorer/configure.js';
import { checkInputs } from '../../../src/outlier-explorer/checkInputs.js';

describe('outlier-explorer checkInputs', () => {
  it('SOE-DATA-001: valid long-format data with the required columns passes (#24)', () => {
    const settings = syncSettings({});
    const data = [{ TEST: 'Albumin', STRESN: 10, USUBJID: 'P1' }];
    expect(() => checkInputs(data, settings)).not.toThrow();
  });

  it('SOE-DATA-001: missing required measure/value columns throw a naming error (#24)', () => {
    const settings = syncSettings({});
    expect(() => checkInputs([{ FOO: 1 }], settings)).toThrow(/Required variable\(s\) missing/);
    expect(() => checkInputs([{ TEST: 'Albumin' }], settings)).toThrow(/STRESN/);
  });

  it('SOE-DATA-003: an empty settings object initializes from the defaults (#24)', () => {
    const settings = syncSettings({});
    const data = [{ TEST: 'Albumin', STRESN: 10, USUBJID: 'P1' }];
    expect(() => checkInputs(data, settings)).not.toThrow();
  });
});
