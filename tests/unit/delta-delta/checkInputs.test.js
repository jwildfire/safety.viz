import { describe, it, expect } from 'vitest';
import { checkInputs } from '../../../src/delta-delta/checkInputs.js';
import { syncSettings } from '../../../src/delta-delta/configure.js';

// Unit evidence for the delta-delta input guard (#25): required mapped columns
// must be present or the renderer throws (SDD-DATA-001, SDD-REG-010).

const settings = syncSettings({});

describe('delta-delta checkInputs', () => {
  it('SDD-DATA-001: valid long-format data with the required columns passes (#25)', () => {
    const data = [{ USUBJID: '1', TEST: 'Albumin', VISIT: 'Screening', STRESN: 10 }];
    expect(() => checkInputs(data, settings)).not.toThrow();
  });

  it('SDD-REG-010: missing a required mapped column throws a named error (#25)', () => {
    const data = [{ USUBJID: '1', TEST: 'Albumin', STRESN: 10 }]; // no VISIT column
    expect(() => checkInputs(data, settings)).toThrow(/Required variable\(s\) missing: VISIT/);
  });

  it('SDD-REG-010: an empty dataset reports every required column missing (#25)', () => {
    expect(() => checkInputs([], settings)).toThrow(/Required variable\(s\) missing/);
  });
});
