import { describe, it, expect } from 'vitest';
import { checkInputs } from '../../../src/participant-profile/checkInputs.js';
import { syncSettings } from '../../../src/participant-profile/configure.js';
import { makeRows } from './fixture.js';

const settings = syncSettings({});

describe('checkInputs — standalone long-lab contract (PPRF-1)', () => {
  it('accepts data carrying every required mapped column', () => {
    expect(() => checkInputs(makeRows(), settings)).not.toThrow();
  });

  it('names every missing required variable in one error', () => {
    const rows = makeRows().map(({ STRESN, STNRHI, ...rest }) => rest);
    expect(() => checkInputs(rows, settings)).toThrow(
      'Required variable(s) missing: STRESN, STNRHI'
    );
  });

  it('treats empty data as missing every required variable', () => {
    expect(() => checkInputs([], settings)).toThrow(/Required variable\(s\) missing/);
  });
});
