import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/hep-explorer/configure.js';
import { checkInputs } from '../../../src/hep-explorer/checkInputs.js';

describe('hep-explorer checkInputs', () => {
  it('HEP-DATA-005: valid long-format data with the required columns passes (port)', () => {
    const settings = syncSettings({});
    const data = [
      { USUBJID: 'P1', TEST: 'Aminotransferase, alanine (ALT)', STRESN: 10, STNRHI: 40 }
    ];
    expect(() => checkInputs(data, settings)).not.toThrow();
  });

  it('HEP-DATA-005: missing required columns throw a single error naming every missing variable (port)', () => {
    const settings = syncSettings({});
    expect(() => checkInputs([{ FOO: 1 }], settings)).toThrow(/Required variable\(s\) missing/);
    // The message lists each missing column mapping.
    expect(() => checkInputs([{ FOO: 1 }], settings)).toThrow(
      'Required variable(s) missing: USUBJID, TEST, STRESN, STNRHI'
    );
    // Only the truly absent columns are named.
    expect(() =>
      checkInputs([{ USUBJID: 'P1', TEST: 'Total Bilirubin', STRESN: 1 }], settings)
    ).toThrow('Required variable(s) missing: STNRHI');
  });

  it('HEP-DATA-005: remapped column settings are validated against the remapped names (port)', () => {
    const settings = syncSettings({ id_col: 'SUBJID', value_col: 'AVAL' });
    const data = [{ SUBJID: 'P1', TEST: 'Total Bilirubin', AVAL: 1, STNRHI: 1.2 }];
    expect(() => checkInputs(data, settings)).not.toThrow();
    expect(() => checkInputs([{ USUBJID: 'P1' }], settings)).toThrow(/SUBJID/);
  });

  it('HEP-DATA-005: non-array or empty data reports every required column as missing (port)', () => {
    const settings = syncSettings({});
    expect(() => checkInputs(null, settings)).toThrow(/USUBJID, TEST, STRESN, STNRHI/);
    expect(() => checkInputs([], settings)).toThrow(/Required variable\(s\) missing/);
  });
});
