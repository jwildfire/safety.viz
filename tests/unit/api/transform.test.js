import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { transformDoclets, buildApiModel } from '../../../scripts/api/transform.mjs';

// Doclet-JSON → API-page data model transform (#6). The fixture mirrors real
// `jsdoc -X` output: documented lifecycle methods, a private helper, an
// undocumented method, the module.exports factory doclet, and the
// HistogramSettings typedef (one property intentionally missing a description).

const doclets = JSON.parse(
  readFileSync(new URL('./fixtures/doclets.json', import.meta.url), 'utf8')
);

describe('transformDoclets: methods table', () => {
  const model = transformDoclets(doclets);

  it('API-XFORM-001: extracts documented instance methods in source order with signature, params, and returns (#6)', () => {
    expect(model.methods.map((method) => method.name)).toEqual(['init', 'setSettings']);
    const init = model.methods[0];
    expect(init.signature).toBe('init(data)');
    expect(init.description).toBe('Load data and render the histogram.');
    expect(init.params).toEqual([
      {
        name: 'data',
        type: 'Array.<Object>',
        optional: false,
        default: null,
        description: 'Long-format result records.'
      }
    ]);
    expect(init.returns).toEqual({
      type: 'SafetyHistogram',
      description: 'The instance, for chaining.'
    });
  });

  it('API-XFORM-002: brackets optional params in signatures and carries their defaults (#6)', () => {
    const setSettings = model.methods[1];
    expect(setSettings.signature).toBe('setSettings([settings])');
    expect(setSettings.params[0].optional).toBe(true);
    expect(setSettings.params[0].default).toBe('{}');
  });

  it('API-XFORM-003: excludes private and undocumented methods from the table (#6)', () => {
    const names = model.methods.map((method) => method.name);
    expect(names).not.toContain('renderShell');
    expect(names).not.toContain('destroyCharts');
  });
});

describe('transformDoclets: factory', () => {
  const model = transformDoclets(doclets);

  it('API-XFORM-004: maps the documented module.exports doclet to the factory, named for its source file (#6)', () => {
    expect(model.factory.name).toBe('histogram');
    expect(model.factory.signature).toBe('histogram([element], [settings])');
    expect(model.factory.description).toBe('Create a safety histogram inside the target element.');
    expect(model.factory.params.map((param) => param.name)).toEqual(['element', 'settings']);
    expect(model.factory.params[0].type).toBe('string | HTMLElement');
    expect(model.factory.returns.type).toBe('SafetyHistogram');
  });

  it('API-XFORM-005: ignores the spurious undocumented global doclet jsdoc emits for the default export (#6)', () => {
    // The fixture's undocumented global `histogram` function must not surface
    // as a method or a missing-doc entry.
    expect(model.methods.map((method) => method.name)).not.toContain('histogram');
    expect(model.missing.map((entry) => entry.name)).not.toContain('histogram');
  });
});

describe('transformDoclets: settings table', () => {
  const model = transformDoclets(doclets);

  it('API-XFORM-006: extracts settings rows from the typedef properties with display-ready types and defaults (#6)', () => {
    expect(model.settings.map((setting) => setting.name)).toEqual([
      'measure_col',
      'normal_range',
      'start_value',
      'filters',
      'page_size'
    ]);
    expect(model.settings[0]).toEqual({
      name: 'measure_col',
      type: 'string',
      nullable: false,
      default: "'TEST'",
      description: 'Column holding the measure name.'
    });
  });

  it('API-XFORM-007: normalizes non-string defaults (booleans, numbers, null) to display strings (#6)', () => {
    const byName = Object.fromEntries(model.settings.map((setting) => [setting.name, setting]));
    expect(byName.normal_range.default).toBe('true');
    expect(byName.page_size.default).toBe('10');
    expect(byName.start_value.default).toBe('null');
    expect(byName.start_value.nullable).toBe(true);
    expect(byName.filters.default).toBe('[]');
  });
});

describe('transformDoclets: missing-doc detection', () => {
  it('API-XFORM-008: flags undocumented public methods and settings properties without descriptions (#6)', () => {
    const model = transformDoclets(doclets);
    expect(model.missing).toContainEqual(
      expect.objectContaining({ kind: 'method', name: 'destroyCharts' })
    );
    expect(model.missing).toContainEqual(
      expect.objectContaining({ kind: 'setting', name: 'page_size' })
    );
    // Private helpers are intentionally undocumented surface — never flagged.
    expect(model.missing.map((entry) => entry.name)).not.toContain('renderShell');
  });

  it('API-XFORM-009: flags a missing factory when no documented default export exists (#6)', () => {
    const model = transformDoclets(
      doclets.filter((doclet) => doclet.longname !== 'module.exports')
    );
    expect(model.factory).toBeNull();
    expect(model.missing).toContainEqual(expect.objectContaining({ kind: 'factory' }));
  });
});

describe('buildApiModel', () => {
  const schema = {
    title: 'contract',
    description: 'A tiny schema.',
    type: 'object',
    required: ['data'],
    properties: {
      data: { type: 'array', description: 'Records.' }
    }
  };

  it('API-XFORM-010: assembles the artifact with module, factory, methods, settings, data contract, and missing docs (#6)', () => {
    const model = buildApiModel({ doclets, schema, module: 'histogram' });
    expect(Object.keys(model).sort()).toEqual([
      'dataContract',
      'factory',
      'methods',
      'missing',
      'module',
      'settings'
    ]);
    expect(model.module).toBe('histogram');
    expect(model.dataContract.fields[0].name).toBe('data');
  });

  it('API-XFORM-011: flags DEFAULT_SETTINGS keys absent from the settings typedef (#6)', () => {
    const model = buildApiModel({
      doclets,
      schema,
      module: 'histogram',
      settingsKeys: ['measure_col', 'page_size', 'brand_new_setting']
    });
    expect(model.missing).toContainEqual(
      expect.objectContaining({ kind: 'setting', name: 'brand_new_setting' })
    );
    // Keys that are documented must not be flagged as uncovered.
    expect(model.missing.filter((entry) => entry.name === 'measure_col')).toEqual([]);
  });
});
