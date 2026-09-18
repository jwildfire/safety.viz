import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_SETTINGS,
  LANE_KEYS,
  syncSettings
} from '../../../src/patient-journey-explorer/configure.js';

// Settings defaults + merge for the patient-journey-explorer module (#142,
// design §3.2): the flat, domain-prefixed snake_case column mapping, the
// camelCase alias contract that keeps the plan's §7 settings object alive, the
// lane / lane-group / filter normalization and the coercion table. PJE-CFG-*.

// The literal settings object from pje-plan.md §7. A plan-shaped paste must
// produce a working chart, which is what the alias contract exists for.
const PLAN_SETTINGS = () => ({
  id_col: 'USUBJID',
  time: { day_col: '--DY', date_col: '--DTC', mode: 'day' },
  contextWindowDays: 30,
  lanes: {
    exposure: { enabled: true, domain: 'EX' },
    doseChanges: { enabled: true, derivedFrom: 'exposure' },
    adverseEvents: { enabled: true, domain: 'AE', severityCol: 'AESEV', seriousCol: 'AESER' },
    labs: {
      enabled: true,
      domain: 'LB',
      tests: ['ALT', 'AST', 'TBILI', 'ALP'],
      smallMultiple: true
    },
    conMeds: { enabled: true, domain: 'CM' },
    medicalHistory: { enabled: true, domain: 'MH' },
    disposition: { enabled: true, domain: 'DS' }
  },
  filters: [
    { domain: 'AE', col: 'AESER', label: 'Serious only' },
    { domain: 'LB', col: 'LBNRIND', label: 'Abnormal labs' },
    { domain: 'CM', col: 'CMCLAS', label: 'ATC class' }
  ],
  onSelectSubject: () => {},
  onAnchorEvent: () => {}
});

const DAY_CHAINS = ['ex_stdy_col', 'ae_stdy_col', 'lb_day_col', 'cm_stdy_col', 'ds_stdy_col'];

let warn;
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

const warnings = () => warn.mock.calls.map((call) => String(call[0]));

describe('DEFAULT_SETTINGS', () => {
  it('PJE-CFG-001: carries a column mapping for all six domains, every key snake_case and domain-prefixed (#142)', () => {
    const prefixes = ['ex_', 'ae_', 'lb_', 'cm_', 'mh_', 'ds_'];
    for (const prefix of prefixes) {
      const keys = Object.keys(DEFAULT_SETTINGS).filter((key) => key.startsWith(prefix));
      expect(keys.length, prefix).toBeGreaterThan(0);
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      expect(key, key).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('PJE-CFG-001: the documented column defaults are present with their documented values (#142)', () => {
    expect(DEFAULT_SETTINGS.id_col).toBe('USUBJID');
    expect(DEFAULT_SETTINGS.domain_col).toBe('DOMAIN');
    expect(DEFAULT_SETTINGS.subject).toBeNull();
    expect(DEFAULT_SETTINGS.time).toEqual({
      mode: 'day',
      ref_date_col: 'TRTSDT',
      allow_date_mode: true
    });
    expect(DEFAULT_SETTINGS.context_window_days).toBe(30);
    expect(DEFAULT_SETTINGS.ex_trt_col).toBe('EXTRT');
    expect(DEFAULT_SETTINGS.ex_dose_col).toBe('EXDOSE');
    expect(DEFAULT_SETTINGS.ex_dosu_col).toBe('EXDOSU');
    expect(DEFAULT_SETTINGS.ex_stdy_col).toEqual(['ASTDY', 'EXSTDY']);
    expect(DEFAULT_SETTINGS.ex_endy_col).toEqual(['AENDY', 'EXENDY']);
    expect(DEFAULT_SETTINGS.ex_stdtc_col).toBe('EXSTDTC');
    expect(DEFAULT_SETTINGS.ae_term_col).toBe('AETERM');
    expect(DEFAULT_SETTINGS.ae_decod_col).toBe('AEDECOD');
    expect(DEFAULT_SETTINGS.ae_soc_col).toBe('AEBODSYS');
    expect(DEFAULT_SETTINGS.ae_stdy_col).toEqual(['ASTDY', 'AESTDY']);
    expect(DEFAULT_SETTINGS.ae_endy_col).toEqual(['AENDY', 'AEENDY']);
    expect(DEFAULT_SETTINGS.ae_sev_col).toBe('AESEV');
    expect(DEFAULT_SETTINGS.ae_ser_col).toBe('AESER');
    expect(DEFAULT_SETTINGS.ae_rel_col).toBe('AEREL');
    expect(DEFAULT_SETTINGS.ae_stdtc_col).toBe('AESTDTC');
    expect(DEFAULT_SETTINGS.ae_severity_values).toEqual(['MILD', 'MODERATE', 'SEVERE']);
    expect(DEFAULT_SETTINGS.ae_serious_value).toBe('Y');
    expect(DEFAULT_SETTINGS.ae_out_col).toBe('AEOUT');
    expect(DEFAULT_SETTINGS.ae_ongoing_values).toEqual([
      'NOT RECOVERED/NOT RESOLVED',
      'RECOVERING/RESOLVING',
      'ONGOING',
      'N'
    ]);
    expect(DEFAULT_SETTINGS.lb_test_col).toBe('LBTEST');
    expect(DEFAULT_SETTINGS.lb_testcd_col).toBe('LBTESTCD');
    expect(DEFAULT_SETTINGS.lb_value_col).toBe('LBSTRESN');
    expect(DEFAULT_SETTINGS.lb_lo_col).toBe('LBSTNRLO');
    expect(DEFAULT_SETTINGS.lb_hi_col).toBe('LBSTNRHI');
    expect(DEFAULT_SETTINGS.lb_day_col).toEqual(['LBDY', 'ADY']);
    expect(DEFAULT_SETTINGS.lb_nrind_col).toBe('LBNRIND');
    expect(DEFAULT_SETTINGS.lb_unit_col).toBe('LBSTRESU');
    expect(DEFAULT_SETTINGS.lb_dtc_col).toBe('LBDTC');
    expect(DEFAULT_SETTINGS.lb_tests).toEqual([
      'Alanine Aminotransferase',
      'Aspartate Aminotransferase',
      'Bilirubin',
      'Alkaline Phosphatase'
    ]);
    expect(DEFAULT_SETTINGS.lb_normal_value).toBe('NORMAL');
    expect(DEFAULT_SETTINGS.lb_baseline_flag_col).toBe('ABLFL');
    expect(DEFAULT_SETTINGS.lb_baseline_flag_value).toBe('Y');
    expect(DEFAULT_SETTINGS.lb_baseline_day).toBe(1);
    expect(DEFAULT_SETTINGS.lb_change_factor).toBe(2);
    expect(DEFAULT_SETTINGS.cm_trt_col).toBe('CMTRT');
    expect(DEFAULT_SETTINGS.cm_class_col).toBe('CMCLAS');
    expect(DEFAULT_SETTINGS.cm_stdy_col).toEqual(['ASTDY', 'CMSTDY']);
    expect(DEFAULT_SETTINGS.cm_endy_col).toEqual(['AENDY', 'CMENDY']);
    expect(DEFAULT_SETTINGS.cm_stdtc_col).toBe('CMSTDTC');
    expect(DEFAULT_SETTINGS.cm_uncoded_value).toBe('UNCODED');
    expect(DEFAULT_SETTINGS.cm_out_col).toBeNull();
    expect(DEFAULT_SETTINGS.cm_ongoing_values).toEqual(['ONGOING', 'Y', 'CONTINUING']);
    expect(DEFAULT_SETTINGS.mh_term_col).toBe('MHTERM');
    expect(DEFAULT_SETTINGS.mh_decod_col).toBe('MHDECOD');
    expect(DEFAULT_SETTINGS.mh_cat_col).toBe('MHCAT');
    expect(DEFAULT_SETTINGS.mh_day_col).toBe('MHDY');
    expect(DEFAULT_SETTINGS.mh_day_source).toBe('collection');
    expect(DEFAULT_SETTINGS.mh_onset_stdy_col).toBe('ASTDY');
    expect(DEFAULT_SETTINGS.mh_strtpt_col).toBe('MHSTRTPT');
    expect(DEFAULT_SETTINGS.mh_enrtpt_col).toBe('MHENRTPT');
    expect(DEFAULT_SETTINGS.mh_onset_dtc_col).toBe('MHSTDTC');
    expect(DEFAULT_SETTINGS.ds_decod_col).toBe('DSDECOD');
    expect(DEFAULT_SETTINGS.ds_term_col).toBe('DSTERM');
    expect(DEFAULT_SETTINGS.ds_cat_col).toBe('DSCAT');
    expect(DEFAULT_SETTINGS.ds_stdy_col).toBe('DSSTDY');
    expect(DEFAULT_SETTINGS.ds_dtc_col).toBe('DSSTDTC');
    expect(DEFAULT_SETTINGS.ds_reference_cats).toEqual(['DISPOSITION EVENT']);
    expect(DEFAULT_SETTINGS.source_url_template).toBeNull();
    expect(DEFAULT_SETTINGS.source_url_label).toBe('Open source record');
    expect(DEFAULT_SETTINGS.on_select_subject).toBeNull();
    expect(DEFAULT_SETTINGS.on_anchor_event).toBeNull();
    expect(DEFAULT_SETTINGS.on_context_change).toBeNull();
    expect(DEFAULT_SETTINGS.row_height).toBe(26);
    expect(DEFAULT_SETTINGS.row_height_min).toBe(18);
    expect(DEFAULT_SETTINGS.max_rows_per_lane).toBe(12);
    expect(DEFAULT_SETTINGS.lab_height).toBe(96);
    expect(DEFAULT_SETTINGS.lab_height_min).toBe(64);
    expect(DEFAULT_SETTINGS.height).toBe(720);
    expect(DEFAULT_SETTINGS.fit_to_height).toBe(true);
    expect(DEFAULT_SETTINGS.width).toBe('100%');
    expect(DEFAULT_SETTINGS.page_size).toBe(10);
  });

  it('PJE-CFG-001: the seven lanes, three lane groups and three filters are the documented defaults (#142)', () => {
    expect(LANE_KEYS).toEqual([
      'exposure',
      'doseChanges',
      'adverseEvents',
      'labs',
      'conMeds',
      'medicalHistory',
      'disposition'
    ]);
    expect(Object.keys(DEFAULT_SETTINGS.lanes)).toEqual(LANE_KEYS);
    expect(DEFAULT_SETTINGS.lanes.medicalHistory).toEqual({
      enabled: true,
      label: 'Medical history (at screening)',
      group: 'context'
    });
    expect(DEFAULT_SETTINGS.lane_groups.map((group) => group.key)).toEqual([
      'treatment',
      'events',
      'context'
    ]);
    expect(DEFAULT_SETTINGS.filters).toEqual([
      { domain: 'AE', value_col: 'AESER', label: 'Serious only', type: 'flag', flag_value: 'Y' },
      {
        domain: 'LB',
        value_col: 'LBNRIND',
        label: 'Abnormal labs only',
        type: 'flag',
        flag_value: '__abnormal__'
      },
      { domain: 'CM', value_col: 'CMCLAS', label: 'ATC class', multiple: true }
    ]);
  });

  it('PJE-CFG-001: every column setting is overridable through syncSettings (#142)', () => {
    const synced = syncSettings({ ae_term_col: 'TERM', lb_value_col: 'AVAL', ds_stdy_col: 'DSDY' });
    expect(synced.ae_term_col).toBe('TERM');
    expect(synced.lb_value_col).toBe('AVAL');
    expect(synced.ds_stdy_col).toEqual(['DSDY']);
    expect(synced.ae_decod_col).toBe('AEDECOD');
  });

  it('syncSettings never mutates DEFAULT_SETTINGS or the caller object (#142)', () => {
    const before = JSON.stringify(DEFAULT_SETTINGS);
    const input = { lanes: { labs: null }, filters: [{ domain: 'AE', col: 'AESER' }] };
    const snapshot = JSON.stringify(input);
    syncSettings(input);
    expect(JSON.stringify(DEFAULT_SETTINGS)).toBe(before);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('aliases (PJE-CFG-002)', () => {
  it('PJE-CFG-002: every top-level camelCase alias maps onto its snake_case key with one warning each (#142)', () => {
    const fn = () => {};
    const synced = syncSettings({
      contextWindowDays: 14,
      sourceUrlTemplate: 'https://edc.example/{domain}/{USUBJID}',
      onSelectSubject: fn,
      onAnchorEvent: fn,
      onContextChange: fn,
      labTests: ['ALT'],
      idCol: 'SUBJID',
      domainCol: 'DOM',
      rowHeight: 30,
      pageSize: 25,
      maxRowsPerLane: 5,
      labHeight: 120,
      laneGroups: [{ key: 'treatment', label: 'Rx' }]
    });
    expect(synced.context_window_days).toBe(14);
    expect(synced.source_url_template).toBe('https://edc.example/{domain}/{USUBJID}');
    expect(synced.on_select_subject).toBe(fn);
    expect(synced.on_anchor_event).toBe(fn);
    expect(synced.on_context_change).toBe(fn);
    expect(synced.lb_tests).toEqual(['ALT']);
    expect(synced.id_col).toBe('SUBJID');
    expect(synced.domain_col).toBe('DOM');
    expect(synced.row_height).toBe(30);
    expect(synced.page_size).toBe(25);
    expect(synced.max_rows_per_lane).toBe(5);
    expect(synced.lab_height).toBe(120);
    expect(synced.lane_groups).toEqual([{ key: 'treatment', label: 'Rx', collapsed: false }]);
    for (const alias of [
      'contextWindowDays',
      'sourceUrlTemplate',
      'onSelectSubject',
      'onAnchorEvent',
      'onContextChange',
      'labTests',
      'idCol',
      'domainCol',
      'rowHeight',
      'pageSize',
      'maxRowsPerLane',
      'labHeight',
      'laneGroups'
    ]) {
      expect(
        warnings().filter((text) => text.includes(alias)),
        alias
      ).toHaveLength(1);
    }
    for (const alias of ['contextWindowDays', 'idCol']) {
      expect(synced).not.toHaveProperty(alias);
    }
  });

  it('PJE-CFG-002: the canonical key wins silently when both it and its alias are given (#142)', () => {
    const synced = syncSettings({
      contextWindowDays: 14,
      context_window_days: 7,
      idCol: 'A',
      id_col: 'B'
    });
    expect(synced.context_window_days).toBe(7);
    expect(synced.id_col).toBe('B');
    expect(warnings().filter((text) => text.includes('contextWindowDays'))).toHaveLength(0);
    expect(warnings().filter((text) => text.includes('idCol'))).toHaveLength(0);
  });

  it('PJE-CFG-002: lane-level severityCol, seriousCol and tests are lifted to the top level; domain, derivedFrom and smallMultiple are ignored (#142)', () => {
    const synced = syncSettings({
      lanes: {
        adverseEvents: { severityCol: 'AETOXGR', seriousCol: 'SERIOUS', domain: 'AE' },
        labs: { tests: ['ALT', 'AST'], smallMultiple: false, domain: 'LB' },
        doseChanges: { derivedFrom: 'exposure' }
      }
    });
    expect(synced.ae_sev_col).toBe('AETOXGR');
    expect(synced.ae_ser_col).toBe('SERIOUS');
    expect(synced.lb_tests).toEqual(['ALT', 'AST']);
    expect(synced.lanes.adverseEvents).toEqual({
      enabled: true,
      label: 'Adverse events',
      group: 'events'
    });
    expect(synced.lanes.labs).toEqual({ enabled: true, label: 'Labs', group: 'events' });
    expect(synced.lanes.doseChanges.enabled).toBe(true);
    expect(
      warnings().some((text) => text.includes('severityCol') && text.includes('ae_sev_col'))
    ).toBe(true);
    expect(
      warnings().some((text) => text.includes('seriousCol') && text.includes('ae_ser_col'))
    ).toBe(true);
    expect(warnings().some((text) => text.includes('tests') && text.includes('lb_tests'))).toBe(
      true
    );
  });

  it('PJE-CFG-002: filters[].col maps to value_col and the literal plan §7 object yields three live filters (#142)', () => {
    const synced = syncSettings(PLAN_SETTINGS());
    expect(synced.filters).toHaveLength(3);
    expect(synced.filters.map((spec) => spec.value_col)).toEqual(['AESER', 'LBNRIND', 'CMCLAS']);
    expect(synced.filters.map((spec) => spec.domain)).toEqual(['AE', 'LB', 'CM']);
    expect(synced.filters.map((spec) => spec.label)).toEqual([
      'Serious only',
      'Abnormal labs',
      'ATC class'
    ]);
    for (const spec of synced.filters) expect(spec).not.toHaveProperty('col');
    // A spec carrying both keeps value_col.
    const both = syncSettings({ filters: [{ domain: 'AE', col: 'X', value_col: 'AESER' }] });
    expect(both.filters[0].value_col).toBe('AESER');
  });

  it('PJE-CFG-002: the plan §7 object gives every domain a resolvable day column and lifts the lane-level columns (#142)', () => {
    const synced = syncSettings(PLAN_SETTINGS());
    expect(synced.ex_stdy_col).toEqual(['EXDY', 'ASTDY', 'EXSTDY']);
    expect(synced.ae_stdy_col).toEqual(['AEDY', 'ASTDY', 'AESTDY']);
    expect(synced.lb_day_col).toEqual(['LBDY', 'ADY']);
    expect(synced.cm_stdy_col).toEqual(['CMDY', 'ASTDY', 'CMSTDY']);
    expect(synced.ds_stdy_col).toEqual(['DSDY', 'DSSTDY']);
    expect(synced.mh_day_col).toEqual(['MHDY']);
    expect(synced.ex_stdtc_col).toEqual(['EXDTC', 'EXSTDTC']);
    expect(synced.ae_stdtc_col).toEqual(['AEDTC', 'AESTDTC']);
    expect(synced.lb_dtc_col).toEqual(['LBDTC']);
    expect(synced.ae_sev_col).toBe('AESEV');
    expect(synced.ae_ser_col).toBe('AESER');
    expect(synced.lb_tests).toEqual(['ALT', 'AST', 'TBILI', 'ALP']);
    expect(synced.context_window_days).toBe(30);
    expect(typeof synced.on_select_subject).toBe('function');
    expect(typeof synced.on_anchor_event).toBe('function');
    expect(synced.time).toEqual({ mode: 'day', ref_date_col: 'TRTSDT', allow_date_mode: true });
    for (const key of DAY_CHAINS) expect(Array.isArray(synced[key]), key).toBe(true);
  });

  it('PJE-CFG-002: time.day_col without "--" is rejected with a named warning and changes nothing (#142)', () => {
    const synced = syncSettings({ time: { day_col: 'ASTDY' } });
    expect(synced.ae_stdy_col).toEqual(['ASTDY', 'AESTDY']);
    expect(warnings().some((text) => text.includes('time.day_col must contain "--"'))).toBe(true);
  });

  it('PJE-CFG-002: unknown time keys, filters without a column and unknown lanes are rejected with a named warning each (#142)', () => {
    const synced = syncSettings({
      time: { mode: 'day', zoom: true },
      filters: [
        { domain: 'AE', label: 'No column' },
        { domain: 'AE', value_col: 'AESER' }
      ],
      lanes: { vitals: { enabled: true } }
    });
    expect(synced.time).not.toHaveProperty('zoom');
    expect(synced.filters).toHaveLength(1);
    expect(synced.lanes).not.toHaveProperty('vitals');
    expect(warnings().some((text) => text.includes('zoom'))).toBe(true);
    expect(warnings().some((text) => text.includes('No column'))).toBe(true);
    expect(warnings().some((text) => text.includes('vitals'))).toBe(true);
  });
});

describe('lanes and lane groups (PJE-CFG-003)', () => {
  it('PJE-CFG-003: a partial lane override back-fills label and group from the defaults (#142)', () => {
    const synced = syncSettings({ lanes: { labs: { enabled: false } } });
    expect(synced.lanes.labs).toEqual({ enabled: false, label: 'Labs', group: 'events' });
    expect(synced.lanes.exposure).toEqual(DEFAULT_SETTINGS.lanes.exposure);
    expect(Object.keys(synced.lanes)).toEqual(LANE_KEYS);
  });

  it('PJE-CFG-003: a lane set to null is disabled and keeps its label (#142)', () => {
    const synced = syncSettings({ lanes: { labs: null } });
    expect(synced.lanes.labs.enabled).toBe(false);
    expect(synced.lanes.labs.label).toBe('Labs');
  });

  it('PJE-CFG-003: an unknown lane key is dropped with a console warning and enabled is boolean-coerced (#142)', () => {
    const synced = syncSettings({ lanes: { vitals: { enabled: true }, conMeds: { enabled: 0 } } });
    expect(synced.lanes).not.toHaveProperty('vitals');
    expect(synced.lanes.conMeds.enabled).toBe(false);
    expect(warnings().some((text) => text.includes('vitals'))).toBe(true);
    expect(syncSettings({ lanes: { conMeds: { enabled: 'yes' } } }).lanes.conMeds.enabled).toBe(
      true
    );
  });

  it('lane_groups normalize to { key, label, collapsed } and fall back to the defaults when unusable (#142)', () => {
    const synced = syncSettings({
      lane_groups: [{ key: 'context', collapsed: 1 }, { label: 'x' }]
    });
    expect(synced.lane_groups).toEqual([{ key: 'context', label: 'context', collapsed: true }]);
    expect(syncSettings({ lane_groups: 'nope' }).lane_groups).toEqual(DEFAULT_SETTINGS.lane_groups);
    expect(syncSettings({ lane_groups: [] }).lane_groups).toEqual(DEFAULT_SETTINGS.lane_groups);
  });
});

describe('coercion (PJE-CFG-004 and merge rules)', () => {
  it('PJE-CFG-004: context_window_days coerces to a non-negative integer defaulting to 30; zero is legal (#142)', () => {
    expect(syncSettings({ context_window_days: '30' }).context_window_days).toBe(30);
    expect(syncSettings({ context_window_days: -5 }).context_window_days).toBe(0);
    expect(syncSettings({ context_window_days: 'abc' }).context_window_days).toBe(30);
    expect(syncSettings({ context_window_days: 0 }).context_window_days).toBe(0);
    expect(syncSettings({ context_window_days: 7.9 }).context_window_days).toBe(7);
    expect(syncSettings({}).context_window_days).toBe(30);
  });

  it('time deep-merges key by key and date mode is honoured only when allow_date_mode is true (#142)', () => {
    expect(syncSettings({ time: { mode: 'date' } }).time).toEqual({
      mode: 'date',
      ref_date_col: 'TRTSDT',
      allow_date_mode: true
    });
    expect(syncSettings({ time: { mode: 'date', allow_date_mode: false } }).time.mode).toBe('day');
    expect(syncSettings({ time: { mode: 'weeks' } }).time.mode).toBe('day');
    expect(syncSettings({ time: { ref_date_col: 'RFSTDTC' } }).time.ref_date_col).toBe('RFSTDTC');
    expect(syncSettings({ time: null }).time).toEqual(DEFAULT_SETTINGS.time);
  });

  it('filters normalize through normalizeFilterSpec keeping domain, type and flag_value, and drop specs without a recognized domain (#142)', () => {
    const synced = syncSettings({
      filters: [
        { domain: 'ae', value_col: 'AESER', type: 'flag', flag_value: 'Y' },
        { domain: 'VS', value_col: 'VSTEST' },
        { value_col: 'AESEV' },
        { domain: 'CM', value_col: 'CMCLAS', multiple: true, start: ['A'] }
      ]
    });
    expect(synced.filters).toEqual([
      {
        domain: 'AE',
        value_col: 'AESER',
        label: 'AESER',
        type: 'flag',
        flag_value: 'Y',
        start: null,
        all: true,
        multiple: false
      },
      {
        domain: 'CM',
        value_col: 'CMCLAS',
        label: 'CMCLAS',
        start: ['A'],
        all: false,
        multiple: true
      }
    ]);
    expect(syncSettings({ filters: null }).filters).toEqual([]);
  });

  it('lb_tests and ae_severity_values arrayify to strings; an empty lb_tests means every test and an empty severity list falls back (#142)', () => {
    expect(syncSettings({ lb_tests: 'ALT' }).lb_tests).toEqual(['ALT']);
    expect(syncSettings({ lb_tests: [] }).lb_tests).toEqual([]);
    expect(syncSettings({ lb_tests: null }).lb_tests).toEqual([]);
    expect(syncSettings({ ae_severity_values: 'MILD' }).ae_severity_values).toEqual(['MILD']);
    expect(syncSettings({ ae_severity_values: [] }).ae_severity_values).toEqual([
      'MILD',
      'MODERATE',
      'SEVERE'
    ]);
  });

  it('lb_change_factor must be a finite number above 1 and lb_baseline_day a finite integer (#142)', () => {
    expect(syncSettings({ lb_change_factor: 3 }).lb_change_factor).toBe(3);
    expect(syncSettings({ lb_change_factor: 1 }).lb_change_factor).toBe(2);
    expect(syncSettings({ lb_change_factor: 'x' }).lb_change_factor).toBe(2);
    expect(syncSettings({ lb_baseline_day: -1 }).lb_baseline_day).toBe(-1);
    expect(syncSettings({ lb_baseline_day: 2.7 }).lb_baseline_day).toBe(2);
    expect(syncSettings({ lb_baseline_day: 'x' }).lb_baseline_day).toBe(1);
  });

  it('callbacks are kept only when they are functions (#142)', () => {
    const fn = () => {};
    const synced = syncSettings({
      on_select_subject: fn,
      on_anchor_event: 'later',
      on_context_change: 1
    });
    expect(synced.on_select_subject).toBe(fn);
    expect(synced.on_anchor_event).toBeNull();
    expect(synced.on_context_change).toBeNull();
  });

  it('layout numbers coerce to positive integers with their documented fallbacks and fit_to_height to a boolean (#142)', () => {
    const synced = syncSettings({
      row_height: '20',
      row_height_min: 0,
      lab_height: -3,
      lab_height_min: 'x',
      height: 500.9,
      max_rows_per_lane: 3,
      page_size: null,
      fit_to_height: 0
    });
    expect(synced.row_height).toBe(20);
    expect(synced.row_height_min).toBe(18);
    expect(synced.lab_height).toBe(96);
    expect(synced.lab_height_min).toBe(64);
    expect(synced.height).toBe(500);
    expect(synced.max_rows_per_lane).toBe(3);
    expect(synced.page_size).toBe(10);
    expect(synced.fit_to_height).toBe(false);
  });

  it('PJE-DATA-007: every day column accepts a single name or a fallback chain and syncs to an array (#142)', () => {
    const synced = syncSettings({ ae_stdy_col: 'AESTDY', cm_endy_col: ['CMENDY', 'AENDY'] });
    expect(synced.ae_stdy_col).toEqual(['AESTDY']);
    expect(synced.cm_endy_col).toEqual(['CMENDY', 'AENDY']);
    for (const key of [
      'ex_stdy_col',
      'ex_endy_col',
      'ae_stdy_col',
      'ae_endy_col',
      'lb_day_col',
      'cm_stdy_col',
      'cm_endy_col',
      'ds_stdy_col'
    ]) {
      expect(Array.isArray(syncSettings({})[key]), key).toBe(true);
    }
  });

  it('ds_reference_cats and the ongoing-value lists are upper-cased and trimmed; an empty ds_reference_cats warns once (#142)', () => {
    const synced = syncSettings({
      ds_reference_cats: [' disposition event ', 'other event'],
      ae_ongoing_values: 'ongoing',
      cm_ongoing_values: [' y ']
    });
    expect(synced.ds_reference_cats).toEqual(['DISPOSITION EVENT', 'OTHER EVENT']);
    expect(synced.ae_ongoing_values).toEqual(['ONGOING']);
    expect(synced.cm_ongoing_values).toEqual(['Y']);
    syncSettings({ ds_reference_cats: [] });
    expect(warnings().filter((text) => text.includes('ds_reference_cats'))).toHaveLength(1);
  });

  it("mh_day_source accepts only 'onset' exactly and otherwise falls back to 'collection' with a warning (#142)", () => {
    expect(syncSettings({ mh_day_source: 'onset' }).mh_day_source).toBe('onset');
    expect(syncSettings({ mh_day_source: 'Onset' }).mh_day_source).toBe('collection');
    expect(warnings().some((text) => text.includes('mh_day_source'))).toBe(true);
  });
});

describe('import hygiene (RF-19)', () => {
  it('configure.js imports under a bare Node-style dynamic import, pulling in no JSON and no DOM (#142)', async () => {
    // The API generator loads this file outside the bundler; the whitelist is
    // ../filters.js and ../histogram/configure.js. A JSON import or a
    // document reference at module scope would throw here.
    const module = await import('../../../src/patient-journey-explorer/configure.js');
    expect(typeof module.syncSettings).toBe('function');
    expect(module.DEFAULT_SETTINGS).toBeTypeOf('object');
    expect(typeof document).toBe('undefined');
  });
});
