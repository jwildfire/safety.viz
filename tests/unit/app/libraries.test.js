// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import manifest from '../../../src/data/portfolio.json';
import schema from '../../../src/data/schema/portfolio.json';
import { parseFile } from '../../../src/app/parse.js';
import { buildMapping, setColumn, setMeasure } from '../../../src/app/mapping.js';
import { chartStatus, neededBy, supportedCount } from '../../../src/app/status.js';
import { chartData, chartSettings, isDestination } from '../../../src/app/charts.js';
import {
  OWN_LIBRARY,
  chartGroups,
  groupLabel,
  hueClass,
  libraryOf,
  mergeLibraries
} from '../../../src/app/libraries.js';
import { mountApp } from '../../../src/app/page.js';
import standIn, { log as standInLog } from '../../e2e/fixtures/stand-in-library.js';

// A second chart library in the demo app (#181, obot.roadmap#366). The app
// takes further libraries beside safety.viz's own, each a set of chart
// factories and a manifest in the portfolio manifest's format, version 2. These
// tests hold the format's new fields, the merge, the grouping, the settings,
// data and status a second library's chart is given, and what happens when a
// factory is missing — all against a stand-in library written for them
// (tests/e2e/fixtures/stand-in-library.js), so no other library's code is here.

// jsdom replaces the global URL, so the fixture path is built with node:path.
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../site/data');
const demoText = (file) => readFileSync(path.join(dataDir, file), 'utf8');
const demo = (file) => parseFile(file, demoText(file));
const files = {
  subject: demo('adsl.csv'),
  ae: demo('adae.csv'),
  bds: demo('adbds.csv'),
  eg: demo('adeg.csv')
};
const mappingsFor = (loaded, source) =>
  Object.fromEntries(
    Object.entries(loaded).map(([domain, file]) => [domain, buildMapping(domain, file, source)])
  );

const validate = new Ajv2020({ allErrors: true }).compile(schema);
const valid = (document) => {
  const ok = validate(document);
  return { ok, errors: validate.errors || [] };
};
const clone = (value) => JSON.parse(JSON.stringify(value));

// Safety.viz's own charts, as src/app/main.js hands them in; only their names matter here.
const ownCharts = Object.fromEntries(
  Object.values(manifest.modules).map((entry) => [entry.export, () => ({ init() {} })])
);
const merged = () => mergeLibraries(manifest, ownCharts, [standIn]);

afterEach(() => {
  vi.restoreAllMocks();
  standInLog.length = 0;
});

describe('manifest format version 2', () => {
  it('APP-LIB-001: an entry may name its library, its group, the named tables its init takes and that unmapped settings are left out; a library’s manifest may leave out the domains (#181)', () => {
    expect(valid(standIn.manifest)).toEqual({ ok: true, errors: [] });
    const entry = standIn.manifest.modules['stand-in-strip'];
    expect(entry).toMatchObject({
      library: 'stand-in',
      group: 'stand-in',
      tables: { results: { domain: 'bds', required: true } },
      unmappedSettings: 'omit'
    });
    expect(standIn.manifest.groups['stand-in']).toEqual({ label: 'Stand-in charts', order: 1 });
    // safety.viz's own manifest is version 2 and uses none of it.
    expect(valid(manifest)).toEqual({ ok: true, errors: [] });
    expect(manifest.version).toBe(2);
  });

  it('APP-LIB-002: the format stays strict: an unknown field, a group with no label, a table outside the standard domains, an unknown rule for unmapped settings, a version-1 document using a version-2 field and an unknown version are all refused (#181)', () => {
    const refuse = (change) => {
      const document = clone(standIn.manifest);
      change(document);
      return valid(document).ok;
    };
    const strip = (document) => document.modules['stand-in-strip'];
    expect(refuse((d) => (strip(d).colour = 'red'))).toBe(false);
    expect(refuse((d) => delete d.groups['stand-in'].label)).toBe(false);
    expect(refuse((d) => (d.groups['stand-in'].hue = 'red'))).toBe(false);
    expect(refuse((d) => (d.groups.bds = { label: 'Labs', order: 0 }))).toBe(false);
    expect(refuse((d) => (strip(d).tables.results.domain = 'lb'))).toBe(false);
    expect(refuse((d) => (strip(d).tables.results.label = 'Results'))).toBe(false);
    expect(refuse((d) => (strip(d).unmappedSettings = 'default'))).toBe(false);
    expect(refuse((d) => (d.version = 3))).toBe(false);
    // Version 1 says none of the new things, and names its domains.
    expect(refuse((d) => (d.version = 1))).toBe(false);
    const v1 = clone(manifest);
    v1.version = 1;
    expect(valid(v1).ok).toBe(true);
    v1.modules.histogram.group = 'bds';
    expect(valid(v1).ok).toBe(false);
    const noDomains = clone(manifest);
    noDomains.version = 1;
    delete noDomains.domains;
    expect(valid(noDomains).ok).toBe(false);
  });
});

describe('merging a second library', () => {
  it('APP-LIB-003: a library’s charts follow safety.viz’s, each under its own library, and safety.viz’s thirteen entries are carried unchanged (#181)', () => {
    const { manifest: all, problems } = merged();
    const keys = Object.keys(all.modules);
    expect(keys).toEqual([...Object.keys(manifest.modules), 'stand-in-strip', 'stand-in-absent']);
    for (const [module, entry] of Object.entries(manifest.modules)) {
      expect(all.modules[module]).toEqual(entry);
      expect(libraryOf(all.modules[module])).toBe(OWN_LIBRARY);
    }
    expect(libraryOf(all.modules['stand-in-strip'])).toBe('stand-in');
    expect(all.domains).toBe(manifest.domains);
    expect(all.groups).toEqual(standIn.manifest.groups);
    expect(problems['stand-in-strip']).toBeUndefined();
    // With no library handed in, the merge is safety.viz's manifest as it is.
    expect(mergeLibraries(manifest, ownCharts, []).manifest.modules).toEqual(manifest.modules);
  });

  it('APP-LIB-019: an entry whose name is already listed is left out with a warning, and an entry that names no library takes the one it was handed in with (#181, #193)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const other = clone(standIn.manifest);
    other.modules.histogram = { ...other.modules['stand-in-strip'] };
    delete other.modules['stand-in-strip'].library;
    const { manifest: all } = mergeLibraries(manifest, ownCharts, [
      { name: 'stand-in', charts: standIn.charts, manifest: other }
    ]);
    expect(all.modules.histogram).toEqual(manifest.modules.histogram);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('histogram'));
    expect(libraryOf(all.modules['stand-in-strip'])).toBe('stand-in');
  });

  it('APP-LIB-004: the tabs list safety.viz’s domains first, as today, then each declared group by its order, under its own label and hue (#181)', () => {
    const { manifest: all } = merged();
    const groups = chartGroups(all);
    expect(groups.map(([group]) => group)).toEqual(['bds', 'eg', 'ae', 'stand-in']);
    expect(groups[3][1].map(([module]) => module)).toEqual(['stand-in-strip', 'stand-in-absent']);
    expect(groupLabel('stand-in', all)).toBe('Stand-in charts');
    expect(groupLabel('bds', all)).toBe('Labs and vitals');
    expect(hueClass('bds', all)).toBe('sva-domain-bds');
    expect(hueClass('stand-in', all)).toBe('sva-library-group');
    // Without a library the groups are exactly today's.
    expect(chartGroups(manifest).map(([group]) => group)).toEqual(['bds', 'eg', 'ae']);
    // Declared groups sort by order; an entry may also sit under a domain.
    const two = clone(standIn.manifest);
    two.groups = { late: { label: 'Late', order: 5 }, early: { label: 'Early', order: 2 } };
    two.modules['stand-in-strip'].group = 'late';
    two.modules['stand-in-absent'].group = 'early';
    two.modules.extra = { ...clone(two.modules['stand-in-absent']), group: 'eg' };
    const sorted = mergeLibraries(manifest, ownCharts, [
      { name: 'stand-in', charts: standIn.charts, manifest: two }
    ]).manifest;
    expect(chartGroups(sorted).map(([group]) => group)).toEqual([
      'bds',
      'eg',
      'ae',
      'early',
      'late'
    ]);
    expect(chartGroups(sorted)[1][1].map(([module]) => module)).toEqual(['qt-explorer', 'extra']);
  });
});

describe('a second library’s chart: settings, data and status from its entry', () => {
  const { manifest: all, problems } = merged();
  const demoMappings = () => mappingsFor(files, all);

  it('APP-LIB-005: its settings are its entry’s column settings under the mapping and nothing else: no recipe, even under a safety chart’s name (#181)', () => {
    const settings = chartSettings('stand-in-strip', demoMappings(), all);
    expect(settings).toEqual({
      id_col: 'USUBJID',
      measure_col: 'TEST',
      value_col: 'STRESN',
      visit_col: 'VISIT',
      group_col: 'ARM'
    });
    // A foreign entry keyed like a safety chart gets no safety recipe or special case.
    const named = clone(all);
    named.modules['time-to-event'] = clone(all.modules['stand-in-strip']);
    named.modules.histogram = clone(all.modules['stand-in-strip']);
    expect(chartSettings('histogram', demoMappings(), named)).toEqual(settings);
    expect(chartSettings('time-to-event', demoMappings(), named)).toEqual(settings);
    expect(Object.keys(chartData('time-to-event', files, demoMappings(), named))).toEqual([
      'results',
      'participants'
    ]);
  });

  it('APP-LIB-006: under `unmappedSettings: "omit"` an unmapped setting is left out, not passed as null; without it, as for safety.viz’s charts, it is null (#181)', () => {
    // The demo labs file has no study day, so day_col is unmapped.
    expect(demoMappings().bds.columns.DY.value).toBeNull();
    const settings = chartSettings('stand-in-strip', demoMappings(), all);
    expect(settings).not.toHaveProperty('day_col');
    const cleared = demoMappings();
    cleared.bds = setColumn(cleared.bds, 'VISIT', null, files.bds);
    expect(chartSettings('stand-in-strip', cleared, all)).not.toHaveProperty('visit_col');
    const nulls = clone(all);
    delete nulls.modules['stand-in-strip'].unmappedSettings;
    expect(chartSettings('stand-in-strip', demoMappings(), nulls).day_col).toBeNull();
  });

  it('APP-LIB-007: its data is an object of its named tables, each the loaded file’s rows untouched; an optional table with no file is left out (#181)', () => {
    const data = chartData('stand-in-strip', files, demoMappings(), all);
    expect(Object.keys(data)).toEqual(['results', 'participants']);
    expect(data.results).toBe(files.bds.rows);
    expect(data.participants).toBe(files.subject.rows);
    const labsOnly = { bds: files.bds };
    const alone = chartData('stand-in-strip', labsOnly, mappingsFor(labsOnly, all), all);
    expect(alone).toEqual({ results: files.bds.rows });
    // An entry with no tables is handed its first domain’s rows, as today.
    expect(chartData('histogram', files, demoMappings(), all)).toBe(files.bds.rows);
    expect(isDestination('stand-in-strip', all)).toBe(true);
  });

  it('APP-LIB-008: its status is worked out from the entry alone: ready on the demo study, no file without its required table, ready without its optional one, missing a required column by name (#181)', () => {
    expect(chartStatus(demoMappings(), all, problems)['stand-in-strip']).toEqual({
      state: 'ready',
      missing: []
    });
    const subjectOnly = { subject: files.subject };
    expect(chartStatus(mappingsFor(subjectOnly, all), all, problems)['stand-in-strip']).toEqual({
      state: 'no file',
      missing: [{ kind: 'domain', domain: 'bds', label: 'Labs and vitals' }]
    });
    const labsOnly = { bds: files.bds };
    expect(chartStatus(mappingsFor(labsOnly, all), all, problems)['stand-in-strip'].state).toBe(
      'ready'
    );
    const cleared = demoMappings();
    cleared.bds = setColumn(cleared.bds, 'STRESN', null, files.bds);
    expect(chartStatus(cleared, all, problems)['stand-in-strip']).toEqual({
      state: 'missing',
      missing: [{ kind: 'column', domain: 'bds', key: 'STRESN', label: 'Result' }]
    });
    // Nothing is looked up by chart name: under a safety chart's name it needs
    // what its entry says, not that chart's measures.
    const named = clone(all);
    named.modules['hep-explorer'] = clone(all.modules['stand-in-strip']);
    const noLiver = demoMappings();
    for (const key of ['ALT', 'TB']) noLiver.bds = setMeasure(noLiver.bds, key, null);
    expect(chartStatus(noLiver, named, {})['hep-explorer'].state).toBe('ready');
  });

  it('APP-LIB-009: a chart whose factory is missing, or whose library is not on the page, reads "not loaded" in words, and nothing throws (#181)', () => {
    expect(problems['stand-in-absent']).toBe(
      'The stand-in library on this page has no chart called absent, so this chart cannot be drawn.'
    );
    expect(chartStatus(demoMappings(), all, problems)['stand-in-absent']).toEqual({
      state: 'not loaded',
      missing: [],
      message: problems['stand-in-absent']
    });
    const without = mergeLibraries(manifest, ownCharts, [
      { name: 'stand-in', charts: null, manifest: standIn.manifest }
    ]);
    expect(without.problems['stand-in-strip']).toBe(
      'The stand-in library is not loaded on this page, so this chart cannot be drawn.'
    );
    // An entry naming a column the standard domains do not have is reported, not drawn.
    const odd = clone(standIn.manifest);
    odd.modules['stand-in-strip'].settings.value_col.column = 'AVAL';
    const oddMerge = mergeLibraries(manifest, ownCharts, [
      { name: 'stand-in', charts: standIn.charts, manifest: odd }
    ]);
    expect(oddMerge.problems['stand-in-strip']).toMatch(/AVAL is not a column of Labs and vitals/);
    expect(() => chartStatus(demoMappings(), oddMerge.manifest, oddMerge.problems)).not.toThrow();
    expect(
      chartStatus(demoMappings(), oddMerge.manifest, oddMerge.problems)['stand-in-strip'].state
    ).toBe('not loaded');
    expect(oddMerge.factoryOf('stand-in-strip')).toBeNull();
    expect(merged().factoryOf('stand-in-strip')).toBe(standIn.charts.strip);
    expect(merged().factoryOf('histogram')).toBe(ownCharts.histogram);
  });

  it('APP-LIB-010: the counts include the second library’s charts, and the mapping table counts its chart among those that need a column (#181)', () => {
    const status = chartStatus(demoMappings(), all, problems);
    expect(supportedCount(status)).toEqual({ ready: 14, total: 15 });
    const needed = neededBy(all, problems);
    expect(needed.columns.bds.STRESN).toContain('Stand-in Result Strip');
    expect(needed.columns.bds.STRESN).not.toContain('Stand-in Absent Chart');
    expect(needed.columns.bds.DY).not.toContain('Stand-in Result Strip');
  });

  it('APP-LIB-011: safety.viz’s thirteen charts get the same settings, data and status with a second library handed in as without one (#181)', () => {
    const mappings = demoMappings();
    const before = chartStatus(mappingsFor(files, manifest), manifest);
    const after = chartStatus(mappings, all, problems);
    for (const module of Object.keys(manifest.modules)) {
      expect(chartSettings(module, mappings, all)).toEqual(
        chartSettings(module, mappingsFor(files, manifest), manifest)
      );
      expect(chartData(module, files, mappings, all)).toEqual(
        chartData(module, files, mappingsFor(files, manifest), manifest)
      );
      expect(after[module]).toEqual(before[module]);
    }
  });
});

describe('the page with a second library', () => {
  const DEMO = ['adsl.csv', 'adae.csv', 'adbds.csv', 'adeg.csv'].map((name) => ({
    name,
    text: demoText(name)
  }));
  const mounted = () => {
    document.body.innerHTML = '<div id="app"></div>';
    const app = mountApp('#app', { charts: ownCharts, manifest, libraries: [standIn] });
    app.loadFiles(DEMO);
    return app;
  };

  it('APP-LIB-012: the library’s charts have a tab of their own with its count and hue, and the overall count includes them (#181)', () => {
    const app = mounted();
    const tab = document.querySelector('.sva-tab[data-domain="stand-in"]');
    expect(tab.querySelector('.sva-tab-title').textContent).toBe('Stand-in charts');
    expect(tab.querySelector('.sva-tab-count').textContent).toBe('1 of 2');
    expect(tab.className).toContain('sva-library-group');
    expect(document.querySelector('.sva-count').textContent).toBe(
      '14 of 15 charts supported by the loaded data'
    );
    expect([...document.querySelectorAll('.sva-tab')].map((el) => el.dataset.domain)).toEqual([
      'bds',
      'eg',
      'ae',
      'stand-in'
    ]);
    app.destroy();
  });

  it('APP-LIB-013: opening its chart mounts it with its tables and settings; opening a safety chart destroys it; the missing one reads "not loaded" and throws nothing (#181)', () => {
    const app = mounted();
    app.select('stand-in-strip');
    const [init] = standInLog;
    expect(init).toMatchObject({ event: 'init', tables: ['results', 'participants'] });
    expect(init.settings).not.toHaveProperty('day_col');
    expect(document.querySelector('.sva-chart .stand-in-strip').dataset.tables).toBe(
      'results,participants'
    );
    expect(document.querySelector('.sva-chart').className).toContain('sva-library-group');
    app.select('histogram');
    expect(standInLog.at(-1)).toEqual({ event: 'destroy' });
    expect(document.querySelector('.stand-in-strip')).toBeNull();
    expect(() => app.select('stand-in-absent')).not.toThrow();
    expect(document.querySelector('.sva-message').textContent).toBe(
      'The stand-in library on this page has no chart called absent, so this chart cannot be drawn.'
    );
    expect(
      document.querySelector('.sva-item[data-view="stand-in-absent"] .sva-tag').textContent
    ).toBe('not loaded');
    app.destroy();
  });
});

describe('a library the page cannot use as handed in (#193)', () => {
  const DEMO = ['adsl.csv', 'adae.csv', 'adbds.csv', 'adeg.csv'].map((name) => ({
    name,
    text: demoText(name)
  }));
  const strip = () => clone(standIn.manifest.modules['stand-in-strip']);
  const withModules = (modules, extra = {}) => ({
    name: 'stand-in',
    charts: standIn.charts,
    manifest: { ...clone(standIn.manifest), modules, ...extra }
  });
  // Mount with these libraries on the demo study: the tabs, the count, and
  // whatever was thrown, if anything was.
  const mountWith = (libraries) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<div id="app"></div>';
    let app;
    try {
      app = mountApp('#app', { charts: ownCharts, manifest, libraries });
      app.loadFiles(DEMO);
    } catch (error) {
      return { thrown: String(error) };
    }
    const result = {
      thrown: null,
      app,
      tabs: [...document.querySelectorAll('.sva-tab')].map((tab) => ({
        group: tab.dataset.domain,
        title: tab.querySelector('.sva-tab-title').textContent,
        count: tab.querySelector('.sva-tab-count').textContent
      })),
      count: document.querySelector('.sva-count').textContent
    };
    return result;
  };
  const SAFETY_TABS = [
    { group: 'bds', title: 'Labs and vitals', count: '9 of 9' },
    { group: 'eg', title: 'ECG', count: '1 of 1' },
    { group: 'ae', title: 'Adverse events', count: '3 of 3' }
  ];

  it('APP-LIB-020: an entry with no domains, no settings, a setting with no domain, no title or no export, or one that is not an object, reads "not loaded" with the reason, and safety.viz’s thirteen charts still mount (#193)', () => {
    const cases = {
      'no-domains': (() => {
        const entry = strip();
        delete entry.domains;
        delete entry.tables;
        return [entry, /does not list the domains it reads/];
      })(),
      'no-settings': (() => {
        const entry = strip();
        delete entry.settings;
        return [entry, /does not list its settings/];
      })(),
      'setting-no-domain': (() => {
        const entry = strip();
        delete entry.settings.value_col.domain;
        return [entry, /its value_col setting names no domain/];
      })(),
      'no-title': (() => {
        const entry = strip();
        delete entry.title;
        return [entry, /has no title/];
      })(),
      'no-export': (() => {
        const entry = strip();
        delete entry.export;
        return [entry, /names no export/];
      })(),
      'a-null': [null, /is not an object/],
      'a-list': [[strip()], /is not an object/]
    };
    // Each alone: the sentence that says why.
    for (const [module, [entry, reason]] of Object.entries(cases)) {
      const { problems } = mergeLibraries(manifest, ownCharts, [withModules({ [module]: entry })]);
      expect(problems[module], module).toMatch(
        /^This chart’s entry in the stand-in chart list cannot be used: /
      );
      expect(problems[module], module).toMatch(reason);
    }
    // All of them in one chart list, on the page: it mounts, the safety charts
    // are as before, and each reads "not loaded" and, opened, says why.
    const mounted = mountWith([
      withModules(
        Object.fromEntries(Object.entries(cases).map(([module, [entry]]) => [module, entry]))
      )
    ]);
    expect(mounted.thrown).toBeNull();
    expect(mounted.tabs.slice(0, 3)).toEqual(SAFETY_TABS);
    for (const [module, [, reason]] of Object.entries(cases)) {
      const tag = document.querySelector(`.sva-item[data-view="${module}"] .sva-tag`);
      expect(tag.textContent, module).toBe('not loaded');
      expect(() => mounted.app.select(module), module).not.toThrow();
      expect(document.querySelector('.sva-message').textContent, module).toMatch(reason);
    }
    mounted.app.destroy();
    // An entry with no group and no first domain to list it under is listed
    // apart, never under a tab called "undefined".
    const loose = strip();
    delete loose.group;
    delete loose.domains;
    delete loose.tables;
    const none = { ...strip(), domains: [], settings: {} };
    delete none.group;
    delete none.tables;
    const apart = mountWith([withModules({ loose, none })]);
    expect(apart.tabs.map((tab) => tab.group)).toEqual(['bds', 'eg', 'ae', 'other']);
    expect(apart.tabs.map((tab) => tab.title)).toEqual([
      'Labs and vitals',
      'ECG',
      'Adverse events',
      'Other'
    ]);
    apart.app.destroy();
  });

  it('APP-LIB-021: a chart list whose modules are not an object of entries, or that is not an object, is not used, and the page says so in words; safety.viz’s charts still mount (#193)', () => {
    for (const given of ['oops', { version: 2, description: 'x', modules: [strip()] }]) {
      const mounted = mountWith([{ name: 'stand-in', charts: standIn.charts, manifest: given }]);
      expect(mounted.thrown).toBeNull();
      expect(mounted.tabs).toEqual(SAFETY_TABS);
      expect(document.querySelector('.sva-library-notes').textContent).toBe(
        'The stand-in charts are not shown: the stand-in library on this page has no chart list the app can read.'
      );
      mounted.app.destroy();
    }
  });

  it('APP-LIB-022: a library that declares a group with a standard domain’s id or the id of the group outside the set is refused that group, and safety.viz’s tabs keep their names and hues (#193)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const id of ['ae', 'bds', 'other']) {
      const library = withModules(
        { 'stand-in-strip': strip() },
        { groups: { ...clone(standIn.manifest.groups), [id]: { label: 'HIJACK', order: 0 } } }
      );
      const { manifest: all } = mergeLibraries(manifest, ownCharts, [library]);
      expect(Object.keys(all.groups), id).toEqual(['stand-in']);
      expect(groupLabel(id === 'other' ? 'other' : id, all), id).not.toBe('HIJACK');
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(`the group ${id}`));
      if (id !== 'other') expect(hueClass(id, all), id).toBe(`sva-domain-${id}`);
    }
    const mounted = mountWith([
      withModules(
        { 'stand-in-strip': strip() },
        { groups: { ...clone(standIn.manifest.groups), ae: { label: 'HIJACK', order: 0 } } }
      )
    ]);
    expect(mounted.tabs.slice(0, 3)).toEqual(SAFETY_TABS);
    mounted.app.destroy();
  });

  it('APP-LIB-023: a library that was asked for but did not load is named on the page, with why, in every view, and safety.viz’s charts are as before (#193)', () => {
    const mounted = mountWith([
      { name: 'stand-in', charts: undefined, manifest: undefined, file: 'stand-in.js' }
    ]);
    expect(mounted.thrown).toBeNull();
    expect(mounted.tabs).toEqual(SAFETY_TABS);
    expect(mounted.count).toBe('13 of 13 charts supported by the loaded data');
    const said =
      'The stand-in charts are not shown: stand-in.js did not load on this page, so the stand-in library is not here.';
    expect(document.querySelector('.sva-library-notes').textContent).toBe(said);
    mounted.app.select('histogram');
    expect(document.querySelector('.sva-library-notes').textContent).toBe(said);
    mounted.app.select('data');
    expect(document.querySelector('.sva-library-notes').textContent).toBe(said);
    mounted.app.destroy();
    // Without the file's name, the sentence still says which library.
    mountWith([{ name: 'stand-in' }]);
    expect(document.querySelector('.sva-library-notes').textContent).toBe(
      'The stand-in charts are not shown: the stand-in library did not load on this page.'
    );
    // With every library there, no such line.
    mountWith([standIn]);
    expect(document.querySelector('.sva-library-notes')).toBeNull();
  });

  it('APP-LIB-024: when two libraries share a name, the first is used for its charts, its settings and its control alike, and the second is left out with a warning (#193)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = { ...standIn, settings: () => ({ extra_col: 'first' }) };
    const second = { ...standIn, settings: () => ({ extra_col: 'second' }) };
    document.body.innerHTML = '<div id="app"></div>';
    const app = mountApp('#app', { charts: ownCharts, manifest, libraries: [first, second] });
    app.loadFiles(DEMO);
    app.select('stand-in-strip');
    expect(standInLog[0].settings.extra_col).toBe('first');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a name already used (stand-in)'));
    app.destroy();
  });

  it('APP-LIB-025: a chart whose export is a name every object inherits, such as constructor or toString, reads "not loaded": only the library’s own charts count (#193)', () => {
    for (const name of ['constructor', 'toString', 'hasOwnProperty']) {
      const entry = { ...strip(), export: name };
      const { problems, factoryOf } = mergeLibraries(manifest, ownCharts, [
        withModules({ odd: entry })
      ]);
      expect(problems.odd, name).toBe(
        `The stand-in library on this page has no chart called ${name}, so this chart cannot be drawn.`
      );
      expect(factoryOf('odd'), name).toBeNull();
    }
  });
});
