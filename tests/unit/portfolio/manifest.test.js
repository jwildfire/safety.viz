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

// Experimental modules: exported from the bundle and shown on the docs site, but
// deliberately left out of the manifest, so that neither the demo app nor the
// Domains page presents them as completed charts (@jwildfire, 2026-10-02,
// #165). Module name → the name it is exported under. A module leaves this
// list by gaining a manifest entry, not by being forgotten: the tests below
// fail for any chart that is in neither.
const EXPERIMENTAL = {
  // Reads six SDTM domains of its own, none supplied by the standard set.
  'patient-journey-explorer': 'patientJourneyExplorer'
};

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

  it('PF-MAN-003: every chart exported by src/main.js appears exactly once, or is listed as experimental (#138, #165)', () => {
    const exported = Object.keys(safetyViz).filter((key) => typeof safetyViz[key] === 'function');
    const listed = modules.map(([, entry]) => entry.export);
    expect([...listed, ...Object.values(EXPERIMENTAL)].sort()).toEqual([...exported].sort());
    expect(new Set(listed).size).toBe(listed.length);
    // Never both: an experimental module has no manifest entry.
    for (const [module, name] of Object.entries(EXPERIMENTAL)) {
      expect(manifest.modules[module], `${module} is experimental and in the manifest`).toBe(
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
    // experimental modules, which are left out on purpose.
    const schemas = readdirSync(new URL('../../../src/data/schema/', import.meta.url))
      .filter((file) => file.endsWith('.json') && file !== 'portfolio.json')
      .map((file) => file.replace(/\.json$/, ''));
    expect(schemas.sort()).toEqual(
      [...modules.map(([module]) => module), ...Object.keys(EXPERIMENTAL)].sort()
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

  it('PF-MAN-009: thirteen modules are listed and all read the standard set; the experimental Patient Journey Explorer is not listed (#138, #165)', () => {
    expect(modules).toHaveLength(13);
    expect(onStandardSet).toHaveLength(13);
    expect(Object.keys(EXPERIMENTAL)).toEqual(['patient-journey-explorer']);
    // The site's registry says the same of every module left out on purpose.
    const { renderers } = read('site/config.json');
    for (const module of Object.keys(EXPERIMENTAL)) {
      const renderer = renderers.find((entry) => entry.module === module);
      expect(renderer.experimental, `${module} is not marked experimental on the site`).toBe(true);
    }
  });

  it('PF-MAN-010: the manifest is exported from the bundle entry as `portfolio` (#138)', () => {
    expect(portfolio).toEqual(manifest);
    expect(safetyViz.portfolio).toBe(portfolio);
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
