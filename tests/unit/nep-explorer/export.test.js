import { describe, it, expect } from 'vitest';
import safetyViz, { nepExplorer } from '../../../src/main.js';
import { checkInputs, hasCreatinine } from '../../../src/nep-explorer/checkInputs.js';
import { syncSettings } from '../../../src/nep-explorer/configure.js';

const SETTINGS = syncSettings({});

describe('nep-explorer module export', () => {
  it('NEP-API-001: the public collection exposes the nepExplorer factory (#120)', () => {
    expect(typeof nepExplorer).toBe('function');
    expect(typeof safetyViz.nepExplorer).toBe('function');
    expect(safetyViz.nepExplorer).toBe(nepExplorer);
  });
});

describe('nep-explorer checkInputs', () => {
  it('NEP-DATA-006: every required mapped column is named when it is missing (#120)', () => {
    expect(() => checkInputs([], SETTINGS)).toThrow(/USUBJID, TEST, STRESN/);
    expect(() => checkInputs([{ USUBJID: 'A', TEST: 'Creatinine' }], SETTINGS)).toThrow(/STRESN/);
    expect(() =>
      checkInputs([{ USUBJID: 'A', TEST: 'Creatinine', STRESN: 1 }], SETTINGS)
    ).not.toThrow();
  });

  it('NEP-DATA-006: a dataset with no creatinine is reported, not thrown (#120)', () => {
    // A lab extract with no creatinine is a legitimate dataset this chart has
    // nothing to say about. Failing the page would be the wrong answer — the
    // module renders its shell and says so in the annotation instead.
    const rows = [{ USUBJID: 'A', TEST: 'Sodium', STRESN: 140 }];
    expect(() => checkInputs(rows, SETTINGS)).not.toThrow();
    expect(hasCreatinine(rows, SETTINGS)).toBe(false);
    expect(hasCreatinine([{ TEST: 'Creatinine' }], SETTINGS)).toBe(true);
  });

  it('NEP-CFG-008: the creatinine check follows a renamed measure (#120)', () => {
    const renamed = syncSettings({ measure_values: { CREAT: 'CREAT' } });
    expect(hasCreatinine([{ TEST: 'Creatinine' }], renamed)).toBe(false);
    expect(hasCreatinine([{ TEST: 'CREAT' }], renamed)).toBe(true);
  });
});
