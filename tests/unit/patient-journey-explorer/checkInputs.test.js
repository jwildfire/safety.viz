import { describe, it, expect } from 'vitest';
import { syncSettings } from '../../../src/patient-journey-explorer/configure.js';
import { checkInputs } from '../../../src/patient-journey-explorer/checkInputs.js';
import { DOMAINS, normalizeInput } from '../../../src/patient-journey-explorer/normalize.js';
import schema from '../../../src/data/schema/patient-journey-explorer.json';

// Input validation for the patient-journey-explorer module (#142, design
// §5.3): at least one domain present, and every schema-required column
// resolvable in each present domain. PJE-DATA-004 / PJE-DATA-005.

const empty = () => Object.fromEntries(DOMAINS.map((domain) => [domain, []]));

describe('patient-journey-explorer checkInputs', () => {
  it('PJE-DATA-004: every entry of DOMAINS resolves a lower-case schema property carrying requiredSettings (#142)', () => {
    for (const domain of DOMAINS) {
      const property = schema.properties[domain.toLowerCase()];
      expect(property, domain).toBeDefined();
      expect(Array.isArray(property.requiredSettings), domain).toBe(true);
      expect(property.requiredSettings, domain).toContain('id_col');
      expect(property.description.length, domain).toBeGreaterThan(40);
    }
    expect(schema.properties.ae.requiredSettings).toEqual(['id_col', 'ae_stdy_col']);
    expect(schema.properties.lb.requiredSettings).toEqual([
      'id_col',
      'lb_test_col',
      'lb_value_col',
      'lb_day_col'
    ]);
    expect(schema.properties.ex.requiredSettings).toEqual(['id_col', 'ex_stdy_col']);
    expect(schema.properties.cm.requiredSettings).toEqual(['id_col', 'cm_trt_col']);
    expect(schema.properties.mh.requiredSettings).toEqual(['id_col']);
    expect(schema.properties.ds.requiredSettings).toEqual(['id_col', 'ds_decod_col']);
  });

  it('PJE-DATA-004: a valid per-domain map with the required columns passes (#142)', () => {
    const settings = syncSettings({});
    const domains = {
      ...empty(),
      AE: [{ USUBJID: 'P1', AETERM: 'RASH', ASTDY: 3 }],
      LB: [{ USUBJID: 'P1', LBTEST: 'ALT', LBSTRESN: 10, LBDY: 1 }]
    };
    expect(() => checkInputs(domains, settings)).not.toThrow();
  });

  it('PJE-DATA-004: a missing id column in the AE domain is named as ae.USUBJID (#142)', () => {
    const settings = syncSettings({});
    const domains = { ...empty(), AE: [{ SUBJ: 'P1', AETERM: 'RASH', ASTDY: 3 }] };
    expect(() => checkInputs(domains, settings)).toThrow(
      'Required variable(s) missing: ae.USUBJID'
    );
  });

  it('PJE-DATA-004: multiple misses across domains are named in one error, chains shown as their alternatives (#142)', () => {
    const settings = syncSettings({});
    const domains = {
      ...empty(),
      AE: [{ USUBJID: 'P1', AETERM: 'RASH' }],
      LB: [{ USUBJID: 'P1', LBTEST: 'ALT', LBDY: 1 }],
      DS: [{ USUBJID: 'P1', DSTERM: 'COMPLETED' }]
    };
    expect(() => checkInputs(domains, settings)).toThrow(
      'Required variable(s) missing: ae.ASTDY|AESTDY, lb.LBSTRESN, ds.DSDECOD'
    );
  });

  it('PJE-DATA-007: a chain is satisfied by any one of its columns appearing in any row (#142)', () => {
    const settings = syncSettings({});
    const domains = {
      ...empty(),
      AE: [
        { USUBJID: 'P1', AETERM: 'RASH' },
        { USUBJID: 'P2', AETERM: 'RASH', AESTDY: 4 }
      ]
    };
    expect(() => checkInputs(domains, settings)).not.toThrow();
  });

  it('PJE-DATA-004: remapped column settings are validated against the remapped names (#142)', () => {
    const settings = syncSettings({ id_col: 'SUBJID', ae_stdy_col: 'DAY' });
    expect(() =>
      checkInputs({ ...empty(), AE: [{ SUBJID: 'P1', DAY: 2 }] }, settings)
    ).not.toThrow();
    expect(() => checkInputs({ ...empty(), AE: [{ USUBJID: 'P1', ASTDY: 2 }] }, settings)).toThrow(
      'Required variable(s) missing: ae.SUBJID, ae.DAY'
    );
  });

  it('PJE-DATA-005: absent domains never throw; a single present domain is enough (#142)', () => {
    const settings = syncSettings({});
    expect(() =>
      checkInputs({ ...empty(), MH: [{ USUBJID: 'P1', MHTERM: 'ASTHMA' }] }, settings)
    ).not.toThrow();
    expect(() => checkInputs({ MH: [{ USUBJID: 'P1' }] }, settings)).not.toThrow();
  });

  it('PJE-DATA-004: all-empty input throws the "no usable data" message naming the domain column (#142)', () => {
    const settings = syncSettings({});
    const message =
      'No usable data: pass at least one of { ae, lb, ex, cm, mh, ds } (or a merged array with a DOMAIN column).';
    expect(() => checkInputs(empty(), settings)).toThrow(message);
    expect(() => checkInputs({}, settings)).toThrow(message);
    expect(() => checkInputs(null, settings)).toThrow(message);
    expect(() => checkInputs(normalizeInput(undefined, settings).domains, settings)).toThrow(
      message
    );
    expect(() => checkInputs(empty(), syncSettings({ domain_col: 'DOM' }))).toThrow(
      '(or a merged array with a DOM column).'
    );
  });
});
