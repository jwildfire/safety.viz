import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS } from '../../../src/histogram/configure.js';
import { extractDoclets, API_SOURCE_FILES } from '../../../scripts/api/extract.mjs';
import { buildApiModel } from '../../../scripts/api/transform.mjs';

// Completeness gate (#6): runs the real `jsdoc -X` extraction over the
// histogram sources and asserts the documented surface covers the whole
// public API — every DEFAULT_SETTINGS key (so future settings stay
// documented), the factory, and the full lifecycle.

const LIFECYCLE_METHODS = ['init', 'setData', 'setSettings', 'render', 'resize', 'destroy'];

const schema = JSON.parse(
  readFileSync(new URL('../../../src/data/schema/histogram.json', import.meta.url), 'utf8')
);

const doclets = extractDoclets(API_SOURCE_FILES);
const model = buildApiModel({
  doclets,
  schema,
  module: 'histogram',
  settingsKeys: Object.keys(DEFAULT_SETTINGS)
});

describe('histogram API documentation completeness', () => {
  it('API-COMPLETE-001: the documented settings are exactly the DEFAULT_SETTINGS keys (#6)', () => {
    const documented = model.settings.map((setting) => setting.name).sort();
    expect(documented).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it('API-COMPLETE-002: every setting row has a type, default, and description (#6)', () => {
    for (const setting of model.settings) {
      expect(setting.type, `setting ${setting.name} has no type`).toBeTruthy();
      expect(setting.default, `setting ${setting.name} has no default`).toBeTruthy();
      expect(setting.description, `setting ${setting.name} has no description`).toBeTruthy();
    }
  });

  it('API-COMPLETE-003: the factory is documented with params and a return value (#6)', () => {
    expect(model.factory).not.toBeNull();
    expect(model.factory.name).toBe('histogram');
    expect(model.factory.description).toBeTruthy();
    expect(model.factory.params.map((param) => param.name)).toEqual(['element', 'settings']);
    expect(model.factory.returns.type).toBeTruthy();
  });

  it('API-COMPLETE-004: every lifecycle method is documented with a description and return value (#6)', () => {
    const byName = Object.fromEntries(model.methods.map((method) => [method.name, method]));
    for (const name of LIFECYCLE_METHODS) {
      expect(byName[name], `lifecycle method ${name} is not documented`).toBeTruthy();
      expect(byName[name].description, `lifecycle method ${name} has no description`).toBeTruthy();
      expect(byName[name].returns, `lifecycle method ${name} has no @returns`).toBeTruthy();
    }
  });

  it('API-COMPLETE-005: no missing-documentation entries remain across the public surface (#6)', () => {
    expect(model.missing).toEqual([]);
  });

  it('API-COMPLETE-006: the data contract derives from the schema and its settings map onto real setting names (#6)', () => {
    expect(model.dataContract.fields.length).toBeGreaterThan(0);
    const settingKeys = new Set(Object.keys(DEFAULT_SETTINGS));
    const contractSettings = model.dataContract.fields
      .map((field) => field.name)
      .filter((name) => name.startsWith('settings.'))
      .map((name) => name.replace('settings.', ''));
    expect(contractSettings.length).toBeGreaterThan(0);
    for (const name of contractSettings) {
      expect(settingKeys.has(name), `schema documents unknown setting ${name}`).toBe(true);
    }
  });
});
