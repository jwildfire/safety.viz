import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Chart } from 'chart.js';
import safetyViz, * as entry from '../../../src/main.js';
import * as shell from '../../../src/shell.js';
import * as filters from '../../../src/filters.js';
import * as axisLimits from '../../../src/axis-limits.js';
import * as listing from '../../../src/histogram/listing.js';
import * as profileHost from '../../../src/profile-host.js';
import * as boxWhisker from '../../../src/box-whisker.js';
import * as measureList from '../../../src/measure-list.js';
import * as km from '../../../src/time-to-event/km.js';

// The kit (#154, obot.roadmap#354): the parts every chart already shares,
// exposed on the bundle as one export so a second chart library on the same
// page can build from them instead of copying them. The kit is a re-export and
// nothing else, so what these tests hold is identity: every member IS the
// function the charts import, and the list of members is exactly the one in
// requirements/kit.md. Adding, dropping or renaming a member fails here until
// the matrix and the list below say the same thing — which is the point, since
// from v1.9.0 a change to any member is a breaking change.

const { kit } = entry;

// Member names by the module that owns them, in the kit's own order.
const MEMBERS = [
  [
    'src/shell.js',
    shell,
    [
      'createElement',
      'option',
      'multiSelect',
      'applyShellStyles',
      'renderShell',
      'controlBuilders',
      'renderViewSelector'
    ]
  ],
  [
    'src/filters.js',
    filters,
    [
      'ALL_VALUE',
      'normalizeFilterSpec',
      'initFilterState',
      'reconcileFilters',
      'filterMatches',
      'renderFilterControl'
    ]
  ],
  [
    'src/axis-limits.js',
    axisLimits,
    [
      'limitDigits',
      'formatLimit',
      'syncAxisLimits',
      'seedLimitInput',
      'applyLimitEdit',
      'clearAxisLimits'
    ]
  ],
  [
    'src/histogram/listing.js',
    listing,
    ['renderListing', 'searchRows', 'sortRows', 'paginate', 'buildCsv', 'exportCsv']
  ],
  [
    'src/profile-host.js',
    profileHost,
    [
      'buildProfileRows',
      'mountProfileRail',
      'unmountProfileRail',
      'syncProfileRail',
      'resetProfileRail'
    ]
  ],
  ['src/box-whisker.js', boxWhisker, ['drawBoxWhisker', 'boxWhiskerPlugin']],
  ['src/measure-list.js', measureList, ['resolveMeasureList', 'presentMeasures']],
  ['src/time-to-event/km.js', km, ['kmEstimate']]
];

const EXPECTED_NAMES = ['Chart', ...MEMBERS.flatMap(([, , names]) => names)];

// What src/main.js exported before the kit, and still must.
const OTHER_EXPORTS = [
  'aeExplorer',
  'aeTimelines',
  'deltaDelta',
  'hepExplorer',
  'hepWaterfall',
  'histogram',
  'nepExplorer',
  'outlierExplorer',
  'participantProfile',
  'patientJourneyExplorer',
  'portfolio',
  'qtExplorer',
  'resultsOverTime',
  'shiftPlot',
  'timeToEvent'
];

const membersOf = (file) => MEMBERS.find(([source]) => source === file);

// Every listed member of one module is on the kit and is the module's export.
function expectIdentical(file) {
  const [, module, names] = membersOf(file);
  for (const name of names) {
    expect(module[name], `${file} does not export ${name}`).toBeDefined();
    expect(kit[name], `kit.${name} is not ${file}'s ${name}`).toBe(module[name]);
  }
}

describe('kit: the shared chart parts as one export', () => {
  it('KIT-API-001: src/main.js exports the kit by name, and the default collection carries the same object (#154)', () => {
    expect(kit).toBeDefined();
    expect(typeof kit).toBe('object');
    expect(safetyViz.kit).toBe(kit);
  });

  it('KIT-API-002: the kit holds exactly the listed members, flat, under the names their modules export (#154)', () => {
    expect(Object.keys(kit)).toEqual(EXPECTED_NAMES);
    expect(new Set(EXPECTED_NAMES).size).toBe(EXPECTED_NAMES.length);
    expect(EXPECTED_NAMES).toHaveLength(36);
  });

  it('KIT-API-003: the shell members are the functions src/shell.js exports (#154)', () => {
    expectIdentical('src/shell.js');
  });

  it('KIT-API-004: the filter contract is the one src/filters.js exports (#154)', () => {
    expectIdentical('src/filters.js');
    expect(kit.ALL_VALUE).toBe('__all__');
  });

  it('KIT-API-005: the axis-limit helpers are the functions src/axis-limits.js exports (#154)', () => {
    expectIdentical('src/axis-limits.js');
  });

  it('KIT-API-006: the record listing and its search, sort, paging and CSV functions are the ones src/histogram/listing.js exports (#154)', () => {
    expectIdentical('src/histogram/listing.js');
  });

  it('KIT-API-007: the participant rail functions are the ones src/profile-host.js exports (#154)', () => {
    expectIdentical('src/profile-host.js');
  });

  it('KIT-API-008: the box drawing and its plugin are the functions src/box-whisker.js exports (#154)', () => {
    expectIdentical('src/box-whisker.js');
  });

  it('KIT-API-009: the measure list functions are the ones src/measure-list.js exports (#154)', () => {
    expectIdentical('src/measure-list.js');
  });

  it('KIT-API-010: the Kaplan–Meier estimator is the function src/time-to-event/km.js exports (#154)', () => {
    expectIdentical('src/time-to-event/km.js');
  });

  it('KIT-API-011: kit.Chart is the Chart.js constructor the charts import (#154)', () => {
    expect(kit.Chart).toBe(Chart);
    expect(typeof kit.Chart.register).toBe('function');
  });

  it('KIT-API-012: nothing else the shared modules export is on the kit: the status label and the colour helper stay internal (#154, #274)', () => {
    expect(typeof shell.statusLabel).toBe('function');
    expect(typeof shell.chartStatus).toBe('function');
    // The two banners the label replaced are gone (#274).
    expect(shell).not.toHaveProperty('prototypeBanner');
    expect(shell).not.toHaveProperty('experimentalBanner');
    expect(typeof boxWhisker.hexToRgba).toBe('function');
    expect(kit).not.toHaveProperty('statusLabel');
    expect(kit).not.toHaveProperty('chartStatus');
    expect(kit).not.toHaveProperty('hexToRgba');
    // Every other export of the eight modules is a kit member.
    for (const [file, module, names] of MEMBERS) {
      const unlisted = Object.keys(module).filter((name) => !names.includes(name));
      const allowed =
        {
          // The status label (#273) says safety.viz's own release status, so
          // it is not a kit member.
          'src/shell.js': [
            'LADDER_URL',
            'STATUS_LABEL_STYLES',
            'TIER_MEANINGS',
            'TIER_WORDS',
            'applyStatusLabelStyles',
            'chartStatus',
            'statusLabel',
            'statusLabelHtml',
            'statusLabelTree',
            'wireStatusLabel',
            'wireStatusLabels'
          ],
          'src/box-whisker.js': ['hexToRgba']
        }[file] || [];
      expect(
        unlisted.sort(),
        `${file} exports something the kit neither lists nor excludes`
      ).toEqual(allowed);
    }
  });

  it('KIT-API-013: the kit cannot be changed from outside: a member cannot be replaced, added or removed (#154)', () => {
    expect(Object.isFrozen(kit)).toBe(true);
    // This file is an ES module, so it is strict: the assignments throw.
    expect(() => {
      kit.renderShell = () => {};
    }).toThrow(TypeError);
    expect(() => {
      kit.somethingNew = () => {};
    }).toThrow(TypeError);
    expect(() => {
      delete kit.Chart;
    }).toThrow(TypeError);
    expect(kit.renderShell).toBe(shell.renderShell);
  });

  it('KIT-API-014: the kit is the only export added: every other export of src/main.js is still there under its name (#154)', () => {
    const named = Object.keys(entry).filter((name) => name !== 'default');
    expect([...named].sort()).toEqual([...OTHER_EXPORTS, 'kit'].sort());
    expect(Object.keys(safetyViz).sort()).toEqual([...OTHER_EXPORTS, 'kit'].sort());
  });
});

// The committed bundle is what a second library actually loads, so the same
// list is held against the built files: the script-tag bundle's global and the
// ES module bundle's named export.
describe('kit: on the committed bundle', () => {
  const { version } = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
  );
  const bundleUrl = (file) =>
    new URL(`../../../dist/safety.viz-${version}/${file}`, import.meta.url);

  it('KIT-API-015: the script-tag bundle carries SafetyViz.kit with the same members (#154)', () => {
    const source = readFileSync(bundleUrl('safety.viz.js'), 'utf8');
    const SafetyViz = new Function(`${source}\nreturn SafetyViz;`)();
    expect(Object.keys(SafetyViz.kit)).toEqual(EXPECTED_NAMES);
    expect(SafetyViz.default.kit).toBe(SafetyViz.kit);
    for (const name of EXPECTED_NAMES) {
      expect(typeof SafetyViz.kit[name], `SafetyViz.kit.${name}`).toBe(typeof kit[name]);
    }
    expect(Object.keys(SafetyViz).sort()).toEqual([...OTHER_EXPORTS, 'default', 'kit'].sort());
  });

  it('KIT-API-016: the ES module bundle exports kit with the same members (#154)', async () => {
    const bundle = await import(bundleUrl('safety.viz.esm.js').href);
    expect(Object.keys(bundle.kit)).toEqual(EXPECTED_NAMES);
    expect(bundle.default.kit).toBe(bundle.kit);
    for (const name of EXPECTED_NAMES) {
      expect(typeof bundle.kit[name], `kit.${name}`).toBe(typeof kit[name]);
    }
    expect(Object.keys(bundle).sort()).toEqual([...OTHER_EXPORTS, 'default', 'kit'].sort());
  });
});
