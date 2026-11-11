// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { parseFile } from '../../../src/app/parse.js';
import { buildMapping, setColumn, setMeasure } from '../../../src/app/mapping.js';
import { chartData, chartSettings, isDestination } from '../../../src/app/charts.js';
import { mountApp } from '../../../src/app/page.js';
import { normalizeXAxis, renderXAxisControl, resolveXAxis } from '../../../src/x-axis.js';

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
const demoMappings = () =>
  Object.fromEntries(
    Object.entries(files).map(([domain, file]) => [domain, buildMapping(domain, file, manifest)])
  );

// A made-up chart that reads domains outside the standard set. No chart the
// app lists does since the Patient Journey Explorer, a prototype, left the
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

// The X-axis setting the demo study's mapping gives a chart with the toggle
// (#373): Visit from the visit number and name, Study day from DY.
const DEMO_X_AXIS = {
  options: [
    { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
    { key: 'day', col: 'DY', type: 'linear', title: 'Study day' }
  ]
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
      studyday_col: 'DY',
      x_axis: DEMO_X_AXIS
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
      // No study day in the renamed study: none is passed, never the visit number.
      studyday_col: null,
      x_axis: {
        options: [
          { key: 'visit', col: 'WKNO', label_col: 'WK', type: 'ordinal', title: 'Visit' },
          { key: 'day', col: null, type: 'linear', title: 'Study day' }
        ]
      },
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
    // With no study day mapped there is no study day to pass.
    const noDay = setColumn(setColumn(bds, 'DY', null, files.bds), 'VISITNUM', null, files.bds);
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

  it('APP-CHART-006: the study day passed to a chart is the mapped column or none, never the visit number (#150, #373)', () => {
    // The demo study carries the study day (DY, #365), so it is the mapped column.
    const mappings = demoMappings();
    const takesDay = [
      'histogram',
      'outlier-explorer',
      'shift-plot',
      'delta-delta',
      'hep-explorer',
      'hep-waterfall',
      'nep-explorer',
      'results-over-time'
    ];
    for (const module of takesDay) {
      expect(chartSettings(module, mappings, manifest).studyday_col, module).toBe('DY');
    }
    // Cleared by hand: no study day, although the visit number is mapped. The
    // visit-order stand-in went with the X-axis toggle (#373).
    const noDay = { ...mappings, bds: setColumn(mappings.bds, 'DY', null, files.bds) };
    expect(noDay.bds.columns.VISITNUM.value).toBe('VISITNUM');
    for (const module of takesDay) {
      expect(chartSettings(module, noDay, manifest).studyday_col, module).toBeNull();
    }
  });

  it('APP-CHART-011: every chart with the X-axis toggle is passed x_axis from the mapped visit and study-day columns; an unmapped one leaves its option with no column (#373)', () => {
    const mappings = demoMappings();
    // The outlier explorer, hep-explorer and the QT explorer have the toggle,
    // and so does the participant profile beside every chart that hosts it on
    // the labs: those hosts forward x_axis to it.
    const toggles = [
      'histogram',
      'outlier-explorer',
      'shift-plot',
      'delta-delta',
      'hep-explorer',
      'qt-explorer'
    ];
    for (const module of toggles) {
      expect(chartSettings(module, mappings, manifest).x_axis, module).toEqual(DEMO_X_AXIS);
    }
    // The chart keeps its own default view: the app names none until the
    // reader picks one (APP-CHART-012).
    expect(chartSettings('hep-explorer', mappings, manifest).x_axis).not.toHaveProperty('default');
    // The charts that are visit-only, day-only or have no time axis get none.
    for (const module of [
      'results-over-time',
      'hep-waterfall',
      'nep-explorer',
      'ae-explorer',
      'ae-timelines',
      'time-to-event'
    ]) {
      expect(chartSettings(module, mappings, manifest), module).not.toHaveProperty('x_axis');
    }
    // No study day mapped: the Study day option stays, with no column, so the
    // chart greys it out and says there is no study day in this data.
    const noDay = { ...mappings, bds: setColumn(mappings.bds, 'DY', null, files.bds) };
    const xAxis = chartSettings('outlier-explorer', noDay, manifest).x_axis;
    expect(xAxis.options[1]).toEqual({ key: 'day', col: null, type: 'linear', title: 'Study day' });
    const resolved = resolveXAxis(normalizeXAxis({ x_axis: xAxis }), files.bds.rows);
    expect(resolved.options.map((option) => [option.key, option.available, option.reason])).toEqual(
      [
        ['visit', true, null],
        ['day', false, 'No study day in this data']
      ]
    );
    expect(resolved.active).toBe('visit');
    // The ECG domain's own columns, for the QT explorer.
    const eg = setColumn(mappings.eg, 'DY', null, files.eg);
    expect(chartSettings('qt-explorer', { ...mappings, eg }, manifest).x_axis.options[1].col).toBe(
      null
    );
    // With only the visit name, Visit is ordered and labelled by it.
    const nameOnly = setColumn(noDay.bds, 'VISITNUM', null, files.bds);
    expect(chartSettings('histogram', { bds: nameOnly }, manifest).x_axis.options[0]).toEqual({
      key: 'visit',
      col: 'VISIT',
      label_col: 'VISIT',
      type: 'ordinal',
      title: 'Visit'
    });
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

// Stand-ins for the chart factories that draw the real X-axis control (#373):
// a chart with a toggle of its own draws it in its sidebar, and every chart
// passed x_axis draws the participant panel's toggle in its rail, which opens
// on the chart's view and keeps its own after that. Each records the settings
// it was handed, and the page's own logic is all the test touches.
function toggleCharts(ownToggle = ['outlierExplorer', 'hepExplorer']) {
  const calls = [];
  const charts = { portfolio: manifest };
  for (const entry of Object.values(manifest.modules)) {
    charts[entry.export] = vi.fn((element, settings) => {
      calls.push({ export: entry.export, settings });
      const view = { chart: null, rail: null };
      let rows = [];
      const draw = () => {
        element.innerHTML = '';
        if (!settings.x_axis) return;
        const xAxis = normalizeXAxis(settings);
        if (ownToggle.includes(entry.export)) {
          const sidebar = document.createElement('div');
          sidebar.className = 'sv-sidebar';
          renderXAxisControl(sidebar, {
            resolved: resolveXAxis(xAxis, rows, view.chart),
            onChange: (key) => {
              view.chart = key;
              draw();
            }
          });
          element.append(sidebar);
        }
        const rail = document.createElement('aside');
        rail.className = 'sv-rail';
        renderXAxisControl(rail, {
          resolved: resolveXAxis(xAxis, rows, view.rail ?? view.chart),
          onChange: (key) => {
            view.rail = key;
            draw();
          }
        });
        element.append(rail);
      };
      return {
        init(data) {
          rows = data;
          draw();
        },
        destroy() {
          element.innerHTML = '';
        }
      };
    });
  }
  const last = (name) => calls.filter((call) => call.export === name).at(-1);
  return { charts, calls, last };
}

const DEMO = ['adsl.csv', 'adae.csv', 'adbds.csv', 'adeg.csv'].map((name) => ({
  name,
  text: demoText(name)
}));

describe('demo app: the remembered X-axis view', () => {
  let root;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    window.location.hash = '';
  });

  const button = (where, key) =>
    root.querySelector(`.sva-chart ${where} .sv-xaxis-option[data-key="${key}"]`);
  const pressed = (where) =>
    root.querySelector(`.sva-chart ${where} .sv-xaxis-option[aria-pressed="true"]`).dataset.key;

  it('APP-CHART-012: a chart opens on the X-axis view the reader left it on, after another chart or tab, while the page is open (#373)', () => {
    const { charts, last } = toggleCharts();
    const app = mountApp(root, { charts, manifest });
    app.loadFiles(DEMO);

    // The first time, the chart opens on its own default.
    app.select('outlier-explorer');
    expect(last('outlierExplorer').settings.x_axis).not.toHaveProperty('default');
    expect(pressed('.sv-sidebar')).toBe('visit');
    button('.sv-sidebar', 'day').click();
    expect(pressed('.sv-sidebar')).toBe('day');
    // The panel's own toggle is not the chart's view, in a chart with one of its own.
    button('.sv-rail', 'visit').click();
    expect(pressed('.sv-rail')).toBe('visit');

    // Another chart, then back: the chart opens on Study day.
    app.select('histogram');
    expect(last('histogram').settings.x_axis).not.toHaveProperty('default');
    // In a chart whose only toggle is the panel's, the panel's view is the chart's.
    button('.sv-rail', 'day').click();
    app.select('outlier-explorer');
    expect(last('outlierExplorer').settings.x_axis.default).toBe('day');
    expect(pressed('.sv-sidebar')).toBe('day');

    // Another tab, then back.
    app.openDomain('ae');
    expect(root.querySelector('.sva-chart .sv-xaxis-option')).toBeNull();
    app.select('histogram');
    expect(last('histogram').settings.x_axis.default).toBe('day');
    expect(pressed('.sv-rail')).toBe('day');
    // The data view, then back, and a chart the reader never switched keeps its own default.
    app.select('data');
    app.select('outlier-explorer');
    expect(pressed('.sv-sidebar')).toBe('day');
    app.select('shift-plot');
    expect(last('shiftPlot').settings.x_axis).not.toHaveProperty('default');

    // A greyed option is not a choice: with no study day mapped, Study day
    // cannot be pressed, and the remembered view stays the reader's last.
    app.select('outlier-explorer');
    button('.sv-sidebar', 'visit').click();
    app.state.mappings.bds = setColumn(app.state.mappings.bds, 'DY', null, app.state.files.bds);
    app.refresh();
    expect(button('.sv-sidebar', 'day').disabled).toBe(true);
    button('.sv-sidebar', 'day').click();
    app.select('histogram');
    app.select('outlier-explorer');
    expect(last('outlierExplorer').settings.x_axis.default).toBe('visit');
  });

  it('APP-CHART-012: the remembered view is not kept across page loads (#373)', () => {
    const first = toggleCharts();
    const app = mountApp(root, { charts: first.charts, manifest });
    app.loadFiles(DEMO);
    app.select('outlier-explorer');
    button('.sv-sidebar', 'day').click();
    app.destroy();
    // The page loaded again: the chart opens on its own default.
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    const second = toggleCharts();
    const reloaded = mountApp(root, { charts: second.charts, manifest });
    reloaded.loadFiles(DEMO);
    reloaded.select('outlier-explorer');
    expect(second.last('outlierExplorer').settings.x_axis).not.toHaveProperty('default');
    expect(pressed('.sv-sidebar')).toBe('visit');
  });
});
