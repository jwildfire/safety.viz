import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import manifest from '../../../src/data/portfolio.json';
import { parseFile } from '../../../src/app/parse.js';
import { buildMapping, setColumn, setMeasure } from '../../../src/app/mapping.js';
import { chartData, chartSettings, isDestination } from '../../../src/app/charts.js';

const demo = (file) =>
  parseFile(file, readFileSync(new URL(`../../../site/data/${file}`, import.meta.url), 'utf8'));

const files = {
  subject: demo('adsl.csv'),
  ae: demo('adae.csv'),
  bds: demo('adbds.csv'),
  eg: demo('adeg.csv')
};
const demoMappings = () =>
  Object.fromEntries(
    Object.entries(files).map(([domain, file]) => [domain, buildMapping(domain, file, manifest)])
  );

// A made-up chart that reads domains outside the standard set. No chart the
// app lists does since the experimental Patient Journey Explorer left the
// manifest (#165); the app's handling of one is kept, and held by this entry.
const withOutside = {
  ...manifest,
  modules: {
    ...manifest.modules,
    'visit-calendar': {
      export: 'visitCalendar',
      title: 'Visit Calendar',
      domains: [],
      externalDomains: ['sv', 'tv'],
      settings: {},
      note: 'Reads two domains of its own: subject visits and planned visits.'
    }
  }
};

// A study whose columns carry none of the default names.
const renamed = {
  columns: ['PT', 'LABNAME', 'RESULT', 'HI', 'WK', 'WKNO', 'GRP', 'GENDER_CD'],
  rows: [
    {
      PT: '1',
      LABNAME: 'SGPT',
      RESULT: '30',
      HI: '40',
      WK: 'Week 1',
      WKNO: '1',
      GRP: 'A',
      GENDER_CD: 'F'
    }
  ]
};
const renamedMapping = () => {
  let mapping = buildMapping('bds', renamed, manifest);
  for (const [column, value] of [
    ['USUBJID', 'PT'],
    ['TEST', 'LABNAME'],
    ['STRESN', 'RESULT'],
    ['STNRHI', 'HI'],
    ['VISIT', 'WK'],
    ['VISITNUM', 'WKNO'],
    ['ARM', 'GRP'],
    ['SEX', 'GENDER_CD']
  ]) {
    mapping = setColumn(mapping, column, value, renamed);
  }
  return mapping;
};

describe('demo app: chart recipes', () => {
  it('APP-CHART-001: on the demo study the histogram gets its columns, filters, groups and the rail’s settings (#150)', () => {
    const demographics = [
      { value_col: 'SITEID', label: 'Site' },
      { value_col: 'SEX', label: 'Sex' },
      { value_col: 'RACE', label: 'Race' },
      { value_col: 'ARM', label: 'Treatment arm' }
    ];
    expect(chartSettings('histogram', demoMappings(), manifest)).toEqual({
      measure_col: 'TEST',
      value_col: 'STRESN',
      id_col: 'USUBJID',
      unit_col: 'STRESU',
      normal_col_low: 'STNRLO',
      normal_col_high: 'STNRHI',
      filters: demographics,
      groups: demographics,
      measure_values: {
        ALT: 'Alanine Aminotransferase',
        AST: 'Aspartate Aminotransferase',
        TB: 'Bilirubin',
        ALP: 'Alkaline Phosphatase'
      },
      visit_col: 'VISIT',
      visitn_col: 'VISITNUM',
      profile_details: demographics.slice(1),
      // The labs extract has no study day; the rail reads visit order instead.
      studyday_col: 'VISITNUM'
    });
  });

  it('APP-CHART-002: a renamed study’s settings carry the user’s column names, and the data is not rewritten (#150)', () => {
    const mappings = { bds: renamedMapping() };
    const settings = chartSettings('hep-explorer', mappings, manifest);
    expect(settings).toMatchObject({
      id_col: 'PT',
      measure_col: 'LABNAME',
      value_col: 'RESULT',
      normal_col_high: 'HI',
      visit_col: 'WK',
      visitn_col: 'WKNO',
      arm_col: 'GRP',
      studyday_col: 'WKNO',
      measure_values: { ALT: 'SGPT' },
      filters: [
        { value_col: 'GENDER_CD', label: 'Sex' },
        { value_col: 'GRP', label: 'Treatment arm' }
      ]
    });
    expect(chartData('hep-explorer', { bds: renamed }, mappings, manifest)).toBe(renamed.rows);
  });

  it('APP-CHART-003: an unmapped optional column is passed as no column, never left to the chart’s default name (#150, #165)', () => {
    const settings = chartSettings('hep-explorer', { bds: renamedMapping() }, manifest);
    // No unit and no lower limit in the renamed study.
    expect(settings.unit_col).toBeNull();
    expect(settings.normal_col_low).toBeNull();
    // A setting the schema gives no default column is never set.
    expect(settings).not.toHaveProperty('baseline_col');
  });

  it('APP-CHART-003: a row cleared by hand is not read, although the file carries the chart’s default name for it (#165)', () => {
    let { bds } = demoMappings();
    expect(files.bds.columns).toEqual(expect.arrayContaining(['ARM', 'STNRLO', 'STRESU']));
    for (const column of ['ARM', 'STNRLO', 'STRESU']) {
      bds = setColumn(bds, column, null, files.bds);
    }
    const settings = chartSettings('hep-explorer', { bds }, manifest);
    // Left out, each of these would fall back to the name the file carries.
    expect(settings).toMatchObject({ arm_col: null, normal_col_low: null, unit_col: null });
    expect(settings.filters.map((filter) => filter.value_col)).not.toContain('ARM');
    expect(settings.profile_details.map((detail) => detail.value_col)).not.toContain('ARM');
    // The rail's columns too, on a host with no setting of its own for them.
    expect(chartSettings('shift-plot', { bds }, manifest)).toMatchObject({
      normal_col_low: null,
      normal_col_high: 'STNRHI',
      unit_col: null
    });
    // A nested setting is cleared as a nested object.
    const ae = setColumn(demoMappings().ae, 'AESER', null, files.ae);
    expect(chartSettings('ae-timelines', { ae }, manifest).highlight).toEqual({ value_col: null });
    // With neither a study day nor a visit order there is no study day to pass.
    const noDay = setColumn(bds, 'VISITNUM', null, files.bds);
    expect(chartSettings('hep-explorer', { bds: noDay }, manifest).studyday_col).toBeNull();
    // The user's rows are untouched: the chart is handed the file's own.
    expect(chartData('hep-explorer', files, { bds }, manifest)).toBe(files.bds.rows);
    // A domain with no file has no row to clear, and its settings are left out.
    expect(chartSettings('time-to-event', { ae: demoMappings().ae }, manifest)).not.toHaveProperty(
      'fu_day_col'
    );
  });

  it('APP-CHART-004: a nested column setting becomes a nested object (#150)', () => {
    const mappings = demoMappings();
    mappings.ae = setColumn(mappings.ae, 'AESEV', 'ARM', files.ae);
    const settings = chartSettings('ae-timelines', mappings, manifest);
    expect(settings.color).toEqual({ value_col: 'ARM' });
    expect(settings.highlight).toEqual({ value_col: 'AESER' });
    expect(Object.keys(settings)).not.toContain('color.value_col');
  });

  it('APP-CHART-005: charts that find measures by name are told the data’s names (#150)', () => {
    const mappings = demoMappings();
    expect(chartSettings('nep-explorer', mappings, manifest).measure_values).toEqual({
      CREAT: 'Creatinine'
    });
    expect(chartSettings('qt-explorer', mappings, manifest)).toMatchObject({
      measures: ['QTcF', 'QTcB', 'Heart Rate'],
      qtc_measures: ['QTcF', 'QTcB'],
      start_measure: 'QTcF'
    });
    // With one correction unmapped the other leads.
    mappings.eg = setMeasure(setMeasure(mappings.eg, 'QTcF', null), 'QTcB', 'QTc (Bazett)');
    expect(chartSettings('qt-explorer', mappings, manifest)).toMatchObject({
      measures: ['QTc (Bazett)', 'Heart Rate'],
      qtc_measures: ['QTc (Bazett)'],
      start_measure: 'QTc (Bazett)'
    });
    // A chart that reads no key measure is passed none.
    expect(chartSettings('results-over-time', mappings, manifest)).not.toHaveProperty(
      'measure_values'
    );
  });

  it('APP-CHART-010: every chart that hosts the participant rail is passed the unit and normal-range columns the rail reads, under the user’s names (#165)', () => {
    // The renamed-columns demo study maps the limits of normal to LLN and ULN.
    const file = {
      columns: ['SUBJID', 'LBTEST', 'LBSTRESN', 'UNITS', 'LLN', 'ULN', 'AVISIT', 'AVISITN'],
      rows: [
        {
          SUBJID: '1',
          LBTEST: 'ALT (SGPT)',
          LBSTRESN: '30',
          UNITS: 'U/L',
          LLN: '5',
          ULN: '40',
          AVISIT: 'Week 1',
          AVISITN: '1'
        }
      ]
    };
    let mapping = buildMapping('bds', file, manifest);
    for (const [column, value] of [
      ['STRESU', 'UNITS'],
      ['STNRLO', 'LLN'],
      ['STNRHI', 'ULN']
    ]) {
      mapping = setColumn(mapping, column, value, file);
    }
    const hosts = ['histogram', 'outlier-explorer', 'shift-plot', 'delta-delta', 'hep-explorer'];
    for (const module of hosts) {
      expect(chartSettings(module, { bds: mapping }, manifest), module).toMatchObject({
        unit_col: 'UNITS',
        normal_col_low: 'LLN',
        normal_col_high: 'ULN',
        visit_col: 'AVISIT'
      });
    }
    // A chart with no rail is not passed columns it has no setting for.
    const none = chartSettings('results-over-time', { bds: mapping }, manifest);
    expect(none).not.toHaveProperty('normal_col_high');
    expect(none).not.toHaveProperty('normal_col_low');
  });

  it('APP-CHART-006: the study day is the mapped column, else visit order, else nothing for a chart that would print it (#150)', () => {
    const mappings = demoMappings();
    expect(chartSettings('hep-waterfall', mappings, manifest).studyday_col).toBe('VISITNUM');
    expect(chartSettings('nep-explorer', mappings, manifest).studyday_col).toBeNull();
    const withDay = { ...mappings, bds: setColumn(mappings.bds, 'DY', 'VISITNUM', files.bds) };
    expect(chartSettings('nep-explorer', withDay, manifest).studyday_col).toBe('VISITNUM');
    // A chart with no use for the study day is not passed one.
    expect(chartSettings('results-over-time', mappings, manifest)).not.toHaveProperty(
      'studyday_col'
    );
  });

  it('APP-CHART-007: time to event is handed its events without the placeholder rows, and its population (#150)', () => {
    const mappings = demoMappings();
    const data = chartData('time-to-event', files, mappings, manifest);
    const placeholders = files.ae.rows.filter((row) => row.AEDECOD === '').length;
    expect(placeholders).toBeGreaterThan(0);
    expect(data.events).toHaveLength(files.ae.rows.length - placeholders);
    expect(data.population).toBe(files.subject.rows);
    expect(chartSettings('time-to-event', mappings, manifest)).toEqual({
      id_col: 'USUBJID',
      group_col: 'ARM',
      fu_day_col: 'EOSDY',
      censor_desc_col: 'EOSSTT',
      event_day_col: 'ASTDY',
      event_desc_col: 'AEDECOD',
      event_filters: [
        { value_col: 'AEBODSYS', label: 'Body system' },
        { value_col: 'AEDECOD', label: 'Preferred term' },
        { value_col: 'AESER', label: 'Serious' },
        { value_col: 'AESEV', label: 'Severity' }
      ],
      filters: [{ value_col: 'ARM', label: 'Treatment arm' }]
    });
  });

  it('APP-CHART-008: when the two tables name the participant differently, the population carries the events’ name too (#150)', () => {
    const subject = {
      columns: ['SUBJID', 'ARM', 'EOSDY'],
      rows: [{ SUBJID: '01', ARM: 'A', EOSDY: '90' }]
    };
    const mappings = {
      ae: demoMappings().ae,
      subject: buildMapping('subject', subject, manifest)
    };
    expect(mappings.subject.columns.USUBJID).toEqual({ value: 'SUBJID', source: 'guessed' });
    const data = chartData('time-to-event', { ae: files.ae, subject }, mappings, manifest);
    expect(data.population).toEqual([{ SUBJID: '01', ARM: 'A', EOSDY: '90', USUBJID: '01' }]);
    // The user's rows are copied, not changed.
    expect(subject.rows[0]).not.toHaveProperty('USUBJID');
    expect(chartSettings('time-to-event', mappings, manifest).id_col).toBe('USUBJID');
  });

  it('APP-CHART-009: twelve charts are destinations; the participant profile is not, nor is a chart outside the standard domains (#150, #165)', () => {
    const destinations = Object.keys(manifest.modules).filter((module) =>
      isDestination(module, manifest)
    );
    expect(destinations).toHaveLength(12);
    expect(
      Object.keys(manifest.modules).filter((module) => !destinations.includes(module))
    ).toEqual(['participant-profile']);
    expect(chartData('participant-profile', files, demoMappings(), manifest)).toBeNull();
    // A chart that reads domains of its own is not drawn from the standard set.
    expect(isDestination('visit-calendar', withOutside)).toBe(false);
    expect(chartData('visit-calendar', files, demoMappings(), withOutside)).toBeNull();
  });
});
