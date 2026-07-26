import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkInputs } from '../../../src/hep-waterfall/checkInputs.js';
import { syncSettings } from '../../../src/hep-waterfall/configure.js';
import { makeRows } from './fixture.js';

// Required-column validation against src/data/schema/hep-waterfall.json (#93).
// The waterfall's required list is the hep lab-mapping block PLUS arm_col: a
// one-armed waterfall has no seam and no comparison, so the arm is structural
// here in a way it is not for the eDISH scatter.

const schema = JSON.parse(
  readFileSync(new URL('../../../src/data/schema/hep-waterfall.json', import.meta.url), 'utf8')
);

describe('hep-waterfall checkInputs', () => {
  it('HWF-DATA-001: names every missing required variable in one error (#93)', () => {
    const settings = syncSettings({});
    expect(() => checkInputs(makeRows(), settings)).not.toThrow();
    expect(() => checkInputs([{ USUBJID: 'P1', ARM: 'Placebo' }], settings)).toThrow(
      /Required variable\(s\) missing: TEST, STRESN, STNRHI/
    );
  });

  it('HWF-DATA-005: the arm column is required, so arms are never silently pooled (#93)', () => {
    expect(schema.properties.settings.required).toContain('arm_col');
    const settings = syncSettings({});
    const armless = makeRows().map(({ ARM, ...row }) => row);
    expect(() => checkInputs(armless, settings)).toThrow(/Required variable\(s\) missing: ARM/);
  });
});
