import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/histogram/configure.js';
import { checkInputs } from '../../../src/histogram/checkInputs.js';
import schema from '../../../src/data/schema/histogram.json';

const settings = syncSettings({});

describe('histogram checkInputs', () => {
  it('SH-DATA-001: the JSON schema publishes the data contract with required column mappings (#2)', () => {
    expect(schema.title).toBeTruthy();
    expect(schema.required).toEqual(expect.arrayContaining(['data', 'settings']));
    expect(schema.properties.settings.required).toEqual(
      expect.arrayContaining(['measure_col', 'value_col'])
    );
    expect(schema.properties.data.items.type).toBe('object');
  });

  it("SH-DATA-001: missing required variables throw the pilot's error message (#2)", () => {
    expect(() => checkInputs([], settings)).toThrow('Required variable(s) missing: TEST, STRESN');
    expect(() => checkInputs([{ TEST: 'A' }], settings)).toThrow(
      'Required variable(s) missing: STRESN'
    );
  });

  it('SH-DATA-001/SH-DATA-003: valid long-format data with optional columns passes (#2)', () => {
    expect(() => checkInputs([{ TEST: 'A', STRESN: '1', STRESU: 'g/dL' }], settings)).not.toThrow();
  });
});
