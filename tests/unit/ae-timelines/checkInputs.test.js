import { describe, it, expect } from 'vitest';
import { checkInputs } from '../../../src/ae-timelines/checkInputs.js';
import { syncSettings } from '../../../src/ae-timelines/configure.js';
import schema from '../../../src/data/schema/ae-timelines.json';

// Input validation against the ae-timelines data contract (#26): one record
// per adverse event, ADaM column defaults, all remappable (AET-DATA-001).

const row = {
  USUBJID: 'SUBJ-01',
  AESEQ: '1',
  ASTDY: '5',
  AENDY: '12',
  AETERM: 'Headache',
  AESEV: 'MILD',
  AESER: 'N'
};

describe('ae-timelines checkInputs', () => {
  it('AET-DATA-001/AET-DATA-004: ADaM-named data passes validation with default settings (#26)', () => {
    expect(() => checkInputs([row], syncSettings({}))).not.toThrow();
  });

  it('AET-DATA-001: missing required columns throw with every missing column named (#26)', () => {
    const { USUBJID, ASTDY, ...partial } = row;
    expect(() => checkInputs([partial], syncSettings({}))).toThrow(
      'Required variable(s) missing: USUBJID, ASTDY'
    );
  });

  it('AET-DATA-003/AET-DATA-006: the coloring variable is required but remappable (#26)', () => {
    const { AESEV, ...noSeverity } = row;
    expect(() => checkInputs([noSeverity], syncSettings({}))).toThrow(
      'Required variable(s) missing: AESEV'
    );
    expect(() =>
      checkInputs(
        [{ ...noSeverity, AEREL: 'RELATED' }],
        syncSettings({ color: { value_col: 'AEREL' } })
      )
    ).not.toThrow();
  });

  it('AET-DATA-001: custom column mappings validate against the renamed columns (#26)', () => {
    const custom = syncSettings({
      id_col: 'subjid',
      seq_col: 'seq',
      stdy_col: 'start',
      endy_col: 'end',
      term_col: 'term'
    });
    const renamed = {
      subjid: 'SUBJ-01',
      seq: '1',
      start: '5',
      end: '12',
      term: 'Headache',
      AESEV: 'MILD'
    };
    expect(() => checkInputs([renamed], custom)).not.toThrow();
    expect(() => checkInputs([row], custom)).toThrow(/Required variable\(s\) missing/);
  });

  it('AET-DATA-001: the schema names the data and settings contract for the ADAE shape (#26)', () => {
    expect(schema.required).toEqual(['data', 'settings']);
    expect(schema.properties.settings.required).toEqual([
      'id_col',
      'seq_col',
      'stdy_col',
      'endy_col',
      'term_col',
      'color'
    ]);
    expect(schema.properties.settings.properties.color.required).toEqual(['value_col']);
  });
});
