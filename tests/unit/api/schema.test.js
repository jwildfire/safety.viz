import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformSchema } from '../../../scripts/api/transform.mjs';

// The data-contract section of the API page derives straight from the JSON
// schema — never hand-copied (#6, #21 design Pillar 3). These tests run
// against the real schema so the derivation is pinned to the source of truth.

const schema = JSON.parse(
  readFileSync(new URL('../../../src/data/schema/histogram.json', import.meta.url), 'utf8')
);

describe('transformSchema', () => {
  const contract = transformSchema(schema);

  it('API-SCHEMA-001: carries the schema title and description onto the contract (#6)', () => {
    expect(contract.title).toBe(schema.title);
    expect(contract.description).toBe(schema.description);
    expect(contract.description).toContain('SH-DATA-001');
  });

  it('API-SCHEMA-002: flattens top-level and nested settings properties into dotted field rows (#6)', () => {
    const names = contract.fields.map((field) => field.name);
    expect(names[0]).toBe('data');
    expect(names[1]).toBe('settings');
    expect(names).toContain('settings.measure_col');
    expect(names).toContain('settings.details');
  });

  it('API-SCHEMA-003: derives required flags from each level’s required array (#6)', () => {
    const byName = Object.fromEntries(contract.fields.map((field) => [field.name, field]));
    expect(byName.data.required).toBe(true);
    expect(byName.settings.required).toBe(true);
    expect(byName['settings.measure_col'].required).toBe(true);
    expect(byName['settings.value_col'].required).toBe(true);
    expect(byName['settings.id_col'].required).toBe(false);
  });

  it('API-SCHEMA-004: carries types, defaults, and descriptions through from the schema (#6)', () => {
    const byName = Object.fromEntries(contract.fields.map((field) => [field.name, field]));
    expect(byName.data.type).toBe('array');
    expect(byName['settings.measure_col'].type).toBe('string');
    expect(byName['settings.measure_col'].default).toBe('TEST');
    expect(byName['settings.measure_col'].description).toContain('measure name');
    expect(byName['settings.normal_col_low'].description).toContain('SH-FUNC-004C');
  });

  it('API-SCHEMA-005: resolves local $defs references to their concrete type (#6)', () => {
    const byName = Object.fromEntries(contract.fields.map((field) => [field.name, field]));
    expect(byName['settings.filters'].type).toBe('array');
    expect(byName['settings.groups'].type).toBe('array');
    expect(byName['settings.filters'].description).toContain('filter columns');
  });

  it('API-SCHEMA-006: every contract field carries a non-empty description (#6)', () => {
    for (const field of contract.fields) {
      expect(field.description, `field ${field.name} has no description`).toBeTruthy();
    }
  });
});
