// Input validation for the ae-explorer module (#60): the schema-driven
// required-column guard shared by every module.

import { describe, expect, it } from 'vitest';
import { checkInputs } from '../../../src/ae-explorer/checkInputs.js';
import { syncSettings } from '../../../src/ae-explorer/configure.js';
import { AE_ROWS } from './fixtures.js';

describe('ae-explorer checkInputs', () => {
  it('AE-DATA-003: default-column data passes with no settings (#60)', () => {
    expect(() => checkInputs(AE_ROWS, syncSettings({}))).not.toThrow();
  });

  it('AE-DATA-001: a single error names every missing required column (#60)', () => {
    const rows = AE_ROWS.map(({ AEBODSYS, ARM, ...rest }) => rest);
    expect(() => checkInputs(rows, syncSettings({}))).toThrow(
      'Required variable(s) missing: AEBODSYS, ARM'
    );
  });

  it('AE-CFG-003: remapped columns are validated under their new names (#60)', () => {
    const rows = AE_ROWS.map((row) => ({ ...row, TRT: row.ARM }));
    expect(() => checkInputs(rows, syncSettings({ group_col: 'TRT' }))).not.toThrow();
    expect(() => checkInputs(AE_ROWS, syncSettings({ group_col: 'TRT' }))).toThrow(
      'Required variable(s) missing: TRT'
    );
  });

  it('AE-DATA-001: empty data still reports the missing mapped columns (#60)', () => {
    expect(() => checkInputs([], syncSettings({}))).toThrow(/Required variable\(s\) missing/);
  });
});
