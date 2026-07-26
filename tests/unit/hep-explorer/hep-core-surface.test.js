import { describe, it, expect } from 'vitest';
import * as barrel from '../../../src/hep-core/index.js';
import * as quadrants from '../../../src/hep-core/quadrants.js';
import * as subjects from '../../../src/hep-core/subjects.js';
import * as arms from '../../../src/hep-core/arms.js';
import * as migration from '../../../src/hep-core/migration.js';
import * as stats from '../../../src/hep-core/stats.js';
import * as rows from '../../../src/hep-core/rows.js';
import * as shim from '../../../src/hep-explorer/composite.js';
import * as structureDataShim from '../../../src/hep-explorer/structureData.js';
import * as configureShim from '../../../src/hep-explorer/configure.js';

// Surface guards for the hep-core split (obot.roadmap#43, safety.viz#91). The
// behaviour of every hep-core function is pinned by the per-module suites under
// tests/unit/hep-explorer/ (quadrants, subjects, arms, migration) and
// tests/unit/hep-waterfall/ (stats); what nothing pinned until now is the WIRING
// the split promises: the barrel re-exports the whole domain layer, and the
// deprecated src/hep-explorer/composite.js shim re-exports the same bindings the
// hep-core modules own — so a consumer importing through either path can never
// drift onto a divergent copy. These are properties of the module graph, so they
// are asserted against the module namespaces, not against behaviour.
//
// NOTE: this file lives under tests/unit/hep-explorer/ deliberately — hep-core
// is not a renderer module (absent from site/config.json), so a
// tests/unit/hep-core/ path would route to null and, per the shared-scaffold
// rule in scripts/evidence-lib.mjs, be duplicated into EVERY module's
// evidence.json. Routing through hep-explorer (the module that owns the split)
// confines the evidence delta to docs/evidence/hep-explorer/ alone.

const MODULES = { quadrants, subjects, arms, migration, stats, rows };

// The row-level reducers moved VERBATIM out of src/hep-explorer/structureData.js
// (and cutFor / MEASURE_KEYS out of configure.js) for the participant-profile
// module (#98, PPRF-1): the module consumes them from hep-core directly, and the
// hep-explorer files keep re-export shims so no existing caller churns.
const ROWS_EXPORTS = [
  'MEASURE_KEYS',
  'assignSequence',
  'cleanData',
  'computeRRatio',
  'cutFor',
  'dayThenIndex',
  'deriveBaseline',
  'displayField',
  'hasStudyDay',
  'measureSummary',
  'participantMeasureSeries',
  'participantPeak',
  'resolveMeasureRows'
];

// The shim's documented re-export list, verbatim from src/hep-explorer/composite.js.
const SHIM_EXPORTS = {
  quadrants: [
    'ALT_ULN_CUT',
    'BILI_ULN_CUT',
    'BLN_LINES',
    'COMPOSITE_QUADRANTS',
    'CONCERN_COLORS',
    'CONCERN_MATRIX',
    'QUADRANT_STYLE',
    'classifyComposite',
    'concernOf'
  ],
  subjects: ['buildCompositeSubjects'],
  migration: ['byArmSummary', 'migrationMatrix']
};

describe('hep-core index — the barrel re-exports the whole domain layer', () => {
  it('every named export of every hep-core module is on the barrel, identity-equal (#91)', () => {
    Object.entries(MODULES).forEach(([name, mod]) => {
      Object.keys(mod).forEach((key) => {
        expect(barrel[key], `${name}.${key} missing from the barrel`).toBe(mod[key]);
      });
    });
  });

  it('the barrel adds nothing of its own — its surface is exactly the union of the five modules (#91)', () => {
    const union = new Set(Object.values(MODULES).flatMap((mod) => Object.keys(mod)));
    expect(Object.keys(barrel).sort()).toEqual([...union].sort());
  });

  it('no two hep-core modules export the same name, so the barrel cannot shadow (#91)', () => {
    const seen = new Map();
    Object.entries(MODULES).forEach(([name, mod]) => {
      Object.keys(mod).forEach((key) => {
        expect(seen.has(key), `${key} exported by both ${seen.get(key)} and ${name}`).toBe(false);
        seen.set(key, name);
      });
    });
  });
});

describe('hep-core rows — the moved row-level reducers (#98, PPRF-1)', () => {
  it('rows.js exports exactly the documented reducer surface', () => {
    expect(Object.keys(rows).sort()).toEqual(ROWS_EXPORTS);
  });

  it('the hep-explorer structureData shim re-exports the moved reducers, identity-equal', () => {
    [
      'cleanData',
      'assignSequence',
      'hasStudyDay',
      'deriveBaseline',
      'resolveMeasureRows',
      'participantPeak',
      'computeRRatio',
      'participantMeasureSeries',
      'measureSummary'
    ].forEach((key) => {
      expect(structureDataShim[key], `structureData.${key} diverged from rows.${key}`).toBe(
        rows[key]
      );
    });
  });

  it('the hep-explorer configure shim re-exports cutFor and MEASURE_KEYS, identity-equal', () => {
    expect(configureShim.cutFor).toBe(rows.cutFor);
    expect(configureShim.MEASURE_KEYS).toBe(rows.MEASURE_KEYS);
  });
});

describe('hep-explorer composite shim — deprecated path stays bound to hep-core', () => {
  it('the shim re-exports exactly its documented twelve names, nothing more (#91)', () => {
    const documented = Object.values(SHIM_EXPORTS).flat().sort();
    expect(Object.keys(shim).sort()).toEqual(documented);
  });

  it('every shim export is the hep-core binding itself, not a copy (#91)', () => {
    Object.entries(SHIM_EXPORTS).forEach(([name, keys]) => {
      keys.forEach((key) => {
        expect(shim[key], `shim.${key} diverged from ${name}.${key}`).toBe(MODULES[name][key]);
      });
    });
  });

  it('buildCompositeSubjects is a distinct deprecated alias delegating to buildHepSubjects (#91)', () => {
    // A separate function object (so the @deprecated JSDoc can live on it) that
    // must keep delegating: same result object for the same inputs.
    expect(shim.buildCompositeSubjects).not.toBe(subjects.buildHepSubjects);
    const rows = [
      { id: 'S1', measure: 'ALT', value: 20, uln: 40, day: 0 },
      { id: 'S1', measure: 'ALT', value: 200, uln: 40, day: 10 },
      { id: 'S1', measure: 'TB', value: 0.5, uln: 1, day: 0 },
      { id: 'S1', measure: 'TB', value: 3, uln: 1, day: 10 }
    ];
    const settings = {
      id_col: 'id',
      measure_col: 'measure',
      value_col: 'value',
      normal_col_high: 'uln',
      studyday_col: 'day',
      measure_values: { ALT: 'ALT', TB: 'TB' },
      groups: [],
      filters: []
    };
    const clean = rows.map((row, index) => ({
      ...row,
      __hep_index: index,
      __hep_day: row.day,
      __hep_value: row.value,
      __hep_uln: row.uln,
      __hep_relative_uln: row.value / row.uln
    }));
    expect(shim.buildCompositeSubjects(clean, settings)).toEqual(
      subjects.buildHepSubjects(clean, settings)
    );
  });
});
