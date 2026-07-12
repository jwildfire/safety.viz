import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/shift-plot/configure.js';
import { checkInputs } from '../../../src/shift-plot/checkInputs.js';
import schema from '../../../src/data/schema/shift-plot.json';

const settings = syncSettings({});

describe('shift-plot checkInputs', () => {
  it('SSP-DATA-001: the JSON schema publishes the data contract with required column mappings (#14)', () => {
    expect(schema.title).toBeTruthy();
    expect(schema.required).toEqual(expect.arrayContaining(['data', 'settings']));
    expect(schema.properties.settings.required).toEqual(
      expect.arrayContaining(['measure_col', 'value_col', 'visit_col'])
    );
    expect(schema.properties.data.items.type).toBe('object');
  });

  it('SSP-DATA-001: missing required variables throw a clear message (#14)', () => {
    expect(() => checkInputs([], settings)).toThrow(
      'Required variable(s) missing: TEST, STRESN, VISIT'
    );
    expect(() => checkInputs([{ TEST: 'A', STRESN: '1' }], settings)).toThrow(
      'Required variable(s) missing: VISIT'
    );
  });

  it('SSP-DATA-003: valid long-format data with optional columns passes (#14)', () => {
    expect(() =>
      checkInputs([{ TEST: 'A', STRESN: '1', VISIT: 'Baseline', STRESU: 'g/dL' }], settings)
    ).not.toThrow();
  });
});
