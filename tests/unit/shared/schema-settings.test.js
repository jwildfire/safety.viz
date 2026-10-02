import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

// The settings v1.8.0 added are in the schemas of the charts that read them
// (#166). Each chart's schema in src/data/schema/ is what the API page prints
// and what a host validates its configuration against, so a setting the code
// reads but the schema omits is a setting nobody can find — and before #166
// that was true of every one of this release's: `measures`, `axis_type`, the
// unscheduled-visit settings, and `start` / `all` / `multiple` on a filter.
//
// Presence alone would be a weak claim, so each case also holds the schema's
// default to the module's own DEFAULT_SETTINGS and validates a real
// configuration against the schema.

const schemaOf = (module) =>
  JSON.parse(
    readFileSync(new URL(`../../../src/data/schema/${module}.json`, import.meta.url), 'utf8')
  );
const defaultsOf = async (module) =>
  (await import(`../../../src/${module}/configure.js`)).DEFAULT_SETTINGS;
const settingsOf = (schema) => schema.properties.settings.properties;
const resolve = (schema, property) =>
  property.$ref ? schema.$defs[property.$ref.replace('#/$defs/', '')] : property;
const validSettings = (schema, settings) => {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile({
    ...schema.properties.settings,
    $defs: schema.$defs,
    required: []
  });
  validate(settings);
  return validate.errors || [];
};

// Matrix prefix, module — the twelve charts that build filter controls.
const FILTER_CHARTS = [
  ['SH', 'histogram'],
  ['SROT', 'results-over-time'],
  ['HWF', 'hep-waterfall'],
  ['QT', 'qt-explorer'],
  ['AE', 'ae-explorer'],
  ['NEP', 'nep-explorer'],
  ['AET', 'ae-timelines'],
  ['SOE', 'outlier-explorer'],
  ['HEP', 'hep-explorer'],
  ['SSP', 'shift-plot'],
  ['SDD', 'delta-delta'],
  ['TTE', 'time-to-event']
];

describe('schemas: a filter spec', () => {
  it.each(FILTER_CHARTS)(
    '%s-FILT-001: the %s schema lists start, all and multiple on a filter spec (#166)',
    (_prefix, module) => {
      const schema = schemaOf(module);
      const filters = resolve(schema, settingsOf(schema).filters);
      const spec = (filters.items.anyOf || filters.items.oneOf).find(
        (item) => item.type === 'object'
      );
      expect(Object.keys(spec.properties)).toEqual(
        expect.arrayContaining(['value_col', 'label', 'start', 'all', 'multiple'])
      );
      // "All" is on offer unless the spec says otherwise, whatever `start` is.
      expect(spec.properties.all).toMatchObject({ type: 'boolean', default: true });
      expect(spec.properties.multiple).toMatchObject({ type: 'boolean', default: false });
      for (const key of ['start', 'all', 'multiple'])
        expect(spec.properties[key].description, `${module}: ${key}`).toBeTruthy();
      // The description a reader meets on the API page names all three.
      for (const key of ['start', 'all', 'multiple'])
        expect(settingsOf(schema).filters.description, `${module}: ${key}`).toContain(`\`${key}\``);
      expect(
        validSettings(schema, {
          filters: [
            'SEX',
            { value_col: 'ARM', label: 'Arm', start: 'Placebo', all: false },
            { value_col: 'SITE', multiple: true, start: ['01', '02'] },
            { value_col: 'N', start: 0 }
          ]
        })
      ).toEqual([]);
      expect(validSettings(schema, { filters: [{ value_col: 'ARM', all: 'no' }] })).not.toEqual([]);
    }
  );
});

describe('schemas: the measures whitelist', () => {
  it.each([
    ['SH', 'histogram'],
    ['SOE', 'outlier-explorer'],
    ['SROT', 'results-over-time'],
    ['SSP', 'shift-plot'],
    ['SDD', 'delta-delta']
  ])('%s-MEAS-001: the %s schema lists the measures setting (#166)', async (_prefix, module) => {
    const schema = schemaOf(module);
    const { measures } = settingsOf(schema);
    expect(measures).toBeDefined();
    expect(measures.default).toBe((await defaultsOf(module)).measures);
    expect(measures.description).toBeTruthy();
    expect(validSettings(schema, { measures: ['ALT', 'AST'] })).toEqual([]);
    expect(validSettings(schema, { measures: null })).toEqual([]);
    expect(validSettings(schema, { measures: 'ALT' })).not.toEqual([]);
  });
});

describe('schemas: the shift plot axis type', () => {
  it('SSP-SCALE-001: the shift-plot schema lists axis_type with the scales the control offers (#166)', async () => {
    const schema = schemaOf('shift-plot');
    const { AXIS_TYPES, DEFAULT_SETTINGS } = await import('../../../src/shift-plot/configure.js');
    const { axis_type: axisType } = settingsOf(schema);
    expect(axisType).toBeDefined();
    expect(axisType.enum).toEqual(AXIS_TYPES);
    expect(axisType.default).toBe(DEFAULT_SETTINGS.axis_type);
    expect(validSettings(schema, { axis_type: 'log' })).toEqual([]);
    expect(validSettings(schema, { axis_type: 'sqrt' })).not.toEqual([]);
  });
});

describe('schemas: unscheduled visits', () => {
  it.each([
    ['HEP-DATA-013', 'hep-explorer'],
    ['SROT-CFG-017', 'results-over-time']
  ])(
    '%s: the %s schema lists the three unscheduled-visit settings with the defaults the code uses (#166)',
    async (_id, module) => {
      const schema = schemaOf(module);
      const defaults = await defaultsOf(module);
      const settings = settingsOf(schema);
      for (const key of [
        'unscheduled_visits',
        'unscheduled_visit_pattern',
        'unscheduled_visit_values'
      ]) {
        expect(settings[key], `${module}: ${key}`).toBeDefined();
        expect(settings[key].default, `${module}: ${key}`).toEqual(defaults[key]);
        expect(settings[key].description, `${module}: ${key}`).toBeTruthy();
      }
      expect(settings.unscheduled_visits.type).toBe('boolean');
      expect(
        validSettings(schema, {
          unscheduled_visits: false,
          unscheduled_visit_pattern: '/unsched/i',
          unscheduled_visit_values: ['Unscheduled 1']
        })
      ).toEqual([]);
      expect(validSettings(schema, { unscheduled_visits: 'yes' })).not.toEqual([]);
    }
  );
});
