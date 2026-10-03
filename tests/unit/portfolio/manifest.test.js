import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import safetyViz, { portfolio } from '../../../src/main.js';
import { columnSettings } from '../../../scripts/portfolio-lib.mjs';

// The portfolio manifest (#138, obot.roadmap#325) is the one statement of the
// standard domain set and of what every chart reads from it. It is useful only
// while it agrees with the charts' own data schemas, so the agreement is a
// test: change a schema's column default or its required list and this file
// fails until the manifest says the same thing.

const read = (relative) =>
  JSON.parse(readFileSync(new URL(`../../../${relative}`, import.meta.url), 'utf8'));

const manifest = read('src/data/portfolio.json');
const manifestSchema = read('src/data/schema/portfolio.json');
const moduleSchema = (module) => read(`src/data/schema/${module}.json`);

// Prototypes: charts the site's config marks `prototype: true`. A prototype is
// not ready for production: it is exported from the bundle and shown on the
// docs site, but left out of the manifest by rule, so that neither the demo app
// nor the Domains page presents it as a finished chart (@jwildfire, 2026-10-02,
// #165). An experimental chart, by contrast, ships: it is in the manifest. The
// list is read from the config, not kept here: a chart leaves it by losing the
// flag and gaining a manifest entry, and the tests below fail for any chart
// that is in neither. Module name → the name it is exported under.
const siteConfig = read('site/config.json');
const exportName = (module) => module.replace(/-(\w)/g, (match, letter) => letter.toUpperCase());
const PROTOTYPES = Object.fromEntries(
  siteConfig.renderers
    .filter((renderer) => renderer.prototype)
    .map((renderer) => [renderer.module, exportName(renderer.module)])
);

const STANDARD_DOMAINS = Object.keys(manifest.domains);
const modules = Object.entries(manifest.modules);
const onStandardSet = modules.filter(([, entry]) => !entry.externalDomains);
const asList = (value) => [].concat(value);

describe('portfolio manifest', () => {
  it('PF-MAN-001: validates against its JSON Schema (#138)', () => {
    const validate = new Ajv2020({ allErrors: true }).compile(manifestSchema);
    const valid = validate(manifest);
    expect(validate.errors || []).toEqual([]);
    expect(valid).toBe(true);
  });

  it('PF-MAN-002: names the four standard domains, each with labelled columns (#138)', () => {
    expect(Object.keys(manifest.domains)).toEqual(['subject', 'ae', 'bds', 'eg']);
    for (const [id, domain] of Object.entries(manifest.domains)) {
      expect(domain.label, `${id} has no label`).toBeTruthy();
      expect(Object.keys(domain.columns), `${id} has no columns`).not.toHaveLength(0);
      expect(Object.keys(domain.columns), `${id} has no participant column`).toContain('USUBJID');
    }
  });

  it('PF-MAN-003: every chart exported by src/main.js appears exactly once, or is a prototype (#138, #165)', () => {
    const exported = Object.keys(safetyViz).filter((key) => typeof safetyViz[key] === 'function');
    const listed = modules.map(([, entry]) => entry.export);
    expect([...listed, ...Object.values(PROTOTYPES)].sort()).toEqual([...exported].sort());
    expect(new Set(listed).size).toBe(listed.length);
    // Never both: a prototype has no manifest entry.
    for (const [module, name] of Object.entries(PROTOTYPES)) {
      expect(manifest.modules[module], `${module} is a prototype and in the manifest`).toBe(
        undefined
      );
      expect(listed).not.toContain(name);
    }
  });

  it('PF-MAN-004: every module has a data schema of the same name (#138)', () => {
    for (const [module] of modules) {
      expect(existsSync(new URL(`../../../src/data/schema/${module}.json`, import.meta.url))).toBe(
        true
      );
    }
    // ...and no chart schema is left out of the manifest, but for the
    // prototypes, which are left out by rule.
    const schemas = readdirSync(new URL('../../../src/data/schema/', import.meta.url))
      .filter((file) => file.endsWith('.json') && file !== 'portfolio.json')
      .map((file) => file.replace(/\.json$/, ''));
    expect(schemas.sort()).toEqual(
      [...modules.map(([module]) => module), ...Object.keys(PROTOTYPES)].sort()
    );
  });

  it("PF-MAN-005: each module's column settings and defaults match its own schema (#138)", () => {
    for (const [module, entry] of onStandardSet) {
      const fromSchema = columnSettings(moduleSchema(module));
      const fromManifest = Object.fromEntries(
        Object.entries(entry.settings).map(([key, setting]) => [key, setting.column])
      );
      const defaults = Object.fromEntries(
        Object.entries(fromSchema).map(([key, setting]) => [key, setting.column])
      );
      expect(fromManifest, `${module}: column settings or defaults disagree`).toEqual(defaults);
    }
  });

  it("PF-MAN-006: each setting is required exactly as its schema's required array says (#138)", () => {
    for (const [module, entry] of onStandardSet) {
      const fromSchema = columnSettings(moduleSchema(module));
      for (const [key, setting] of Object.entries(entry.settings)) {
        expect(setting.required, `${module}.${key}: required flag disagrees`).toBe(
          fromSchema[key].required
        );
      }
    }
  });

  it('PF-MAN-007: every mapped column exists in a domain the module reads (#138)', () => {
    for (const [module, entry] of onStandardSet) {
      const reads = [...entry.domains, ...(entry.optionalDomains || [])];
      expect(entry.domains.length, `${module} reads no standard domain`).toBeGreaterThan(0);
      for (const domain of reads) expect(STANDARD_DOMAINS).toContain(domain);
      for (const [key, setting] of Object.entries(entry.settings)) {
        for (const domain of asList(setting.domain)) {
          expect(reads, `${module}.${key} names a domain the module does not read`).toContain(
            domain
          );
          if (setting.column !== null) {
            expect(
              Object.keys(manifest.domains[domain].columns),
              `${module}.${key}: ${setting.column} is not a ${domain} column`
            ).toContain(setting.column);
          }
        }
      }
    }
  });

  it('PF-MAN-008: every required column is present in the vendored demo extract (#138)', () => {
    const header = (file) =>
      readFileSync(new URL(`../../../site/data/${file}`, import.meta.url), 'utf8')
        .split(/\r?\n/, 1)[0]
        .split(',');
    for (const [module, entry] of onStandardSet) {
      for (const [key, setting] of Object.entries(entry.settings)) {
        if (!setting.required) continue;
        for (const domain of asList(setting.domain)) {
          expect(
            header(manifest.domains[domain].demo),
            `${module}.${key}: ${setting.column} is missing from ${manifest.domains[domain].demo}`
          ).toContain(setting.column);
        }
      }
    }
  });

  it('PF-MAN-009: thirteen modules are listed and all read the standard set; a prototype is left out and an experimental chart is in (#138, #165)', () => {
    expect(modules).toHaveLength(13);
    expect(onStandardSet).toHaveLength(13);
    // The tiers, as the site's config sets them, decide what the manifest lists.
    const tier = Object.fromEntries(
      siteConfig.renderers.map((renderer) => [
        renderer.module,
        renderer.prototype ? 'prototype' : renderer.experimental ? 'experimental' : 'stable'
      ])
    );
    // The Patient Journey Explorer is the prototype; nothing else is.
    expect(Object.keys(PROTOTYPES)).toEqual(['patient-journey-explorer']);
    for (const [module] of modules) {
      expect(tier[module], `${module} is in the manifest`).not.toBe('prototype');
    }
    // Every experimental chart ships: it is in the manifest.
    const experimental = Object.keys(tier).filter((module) => tier[module] === 'experimental');
    expect(experimental).toContain('hep-waterfall');
    for (const module of experimental) {
      expect(
        manifest.modules[module],
        `${module} is experimental and not in the manifest`
      ).toBeDefined();
    }
  });

  it('PF-MAN-010: the manifest is exported from the bundle entry as `portfolio` (#138)', () => {
    expect(portfolio).toEqual(manifest);
    expect(safetyViz.portfolio).toBe(portfolio);
  });

  it('PF-MAN-013: the manifest is written in format version 2, and its thirteen entries use none of what version 2 added, so each means what it meant in version 1 (#181)', () => {
    expect(manifest.version).toBe(2);
    expect(manifest.groups).toBeUndefined();
    for (const [module, entry] of modules) {
      for (const field of ['library', 'group', 'tables', 'unmappedSettings']) {
        expect(entry[field], `${module} uses the version-2 field ${field}`).toBeUndefined();
      }
    }
    // The same document, called version 1, is a valid version-1 manifest.
    const validate = new Ajv2020({ allErrors: true }).compile(manifestSchema);
    expect(validate({ ...manifest, version: 1 })).toBe(true);
  });
});

describe('columnSettings', () => {
  it('PF-MAN-011: reads column-name settings and skips toggles and field lists (#138)', () => {
    const settings = columnSettings(moduleSchema('ae-explorer'));
    expect(Object.keys(settings)).toEqual([
      'id_col',
      'major_col',
      'minor_col',
      'group_col',
      'placeholder_flag.value_col'
    ]);
    expect(settings.major_col).toEqual({ column: 'AEBODSYS', required: true });
    // total_col, group_cols and diff_col are booleans: table toggles, not columns.
    expect(settings.total_col).toBeUndefined();
    // time_cols and tooltip_cols are field lists, not single column names.
    expect(columnSettings(moduleSchema('outlier-explorer')).time_cols).toBeUndefined();
  });

  it('PF-MAN-012: reads a nested value_col and a null default (#138)', () => {
    // ae-timelines keeps its severity column at color.value_col (AET-CFG-005).
    expect(columnSettings(moduleSchema('ae-timelines'))['color.value_col']).toEqual({
      column: 'AESEV',
      required: true
    });
    expect(columnSettings(moduleSchema('hep-explorer')).baseline_col).toEqual({
      column: null,
      required: false
    });
  });
});
