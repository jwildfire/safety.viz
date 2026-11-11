// Demo app: one recipe per chart (#150, obot.roadmap#352). The charts take
// their column names as settings, so a mapping never rewrites the user's data:
// it becomes a settings object. This module is that translation, plus the few
// places where charts differ in how they are handed their data.
//
// What a recipe adds beyond the manifest's column settings mirrors what the
// site's own demo pages pass each chart (site/demo/<module>.js): filters and
// groups over the demographic columns, the key measure names, and the columns
// the railed participant profile reads.

import { MEASURES } from './mapping.js';
import { OWN_LIBRARY, libraryOf } from './libraries.js';

/** Demographic columns offered as filters and groups, when mapped. */
const DEMOGRAPHICS = ['SITEID', 'SEX', 'RACE', 'ARM'];

/** The liver panel the hepatic charts and the participant profile read by name. */
const LIVER = ['ALT', 'AST', 'TB', 'ALP'];

/**
 * Per-chart additions to the manifest's column settings.
 *
 * - `filters` / `groups`: pass the mapped demographic columns as filter or
 *   group specs.
 * - `measures`: the key measures passed as `measure_values`.
 * - `rail`: the chart hosts the railed participant profile, which reads the
 *   visit, study-day, unit and normal-range columns and the liver panel. A host
 *   forwards them to the rail whether or not it has a setting of its own for
 *   them (the shift plot and delta-delta list no normal range), so they are
 *   passed to every host, with the study day: the mapped column or null,
 *   never the visit number (#373).
 * - `xAxis`: the chart has the X-axis toggle (#373), so it is passed `x_axis`
 *   built from the mapped columns (see xAxisSetting). A rail host is passed
 *   it too, for the participant profile's toggle beside it.
 */
export const RECIPES = {
  histogram: { filters: true, groups: true, rail: true, measures: LIVER },
  'outlier-explorer': { filters: true, groups: true, rail: true, measures: LIVER },
  'results-over-time': { filters: true, groups: true },
  'shift-plot': { filters: true, rail: true, measures: LIVER },
  'delta-delta': { filters: true, rail: true, measures: LIVER },
  'hep-explorer': { filters: true, groups: true, rail: true, measures: LIVER },
  'hep-waterfall': { filters: true, measures: LIVER },
  'nep-explorer': { filters: true, measures: ['CREAT'] },
  'qt-explorer': { xAxis: true },
  'ae-explorer': {},
  'ae-timelines': {},
  'time-to-event': {}
};

/** Event descriptor columns the time-to-event explorer offers as event filters. */
const EVENT_FILTERS = ['AEBODSYS', 'AEDECOD', 'AESER', 'AESEV'];

const asList = (value) => [].concat(value);

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const mapped = (mappings, domain, column) => {
  const row = mappings[domain] && mappings[domain].columns[column];
  return row ? row.value : null;
};

const mappedMeasure = (mappings, key) => {
  const { domain } = MEASURES.find((measure) => measure.key === key);
  const row = mappings[domain] && mappings[domain].measures[key];
  return row ? row.value : null;
};

/**
 * The X-axis setting for a chart with the toggle (#373, design 436): the Visit
 * option from the mapped visit number, labelled by the visit name, and the
 * Study day option from the mapped study day. An option whose column is
 * unmapped keeps its place with no column, so the chart greys it out and says
 * why; a visit number is never passed as a study day. The default view is left
 * to the chart, or to the page, which passes the view the reader last chose.
 * @private
 */
function xAxisSetting(domain, mappings) {
  const visit = mapped(mappings, domain, 'VISIT');
  return {
    options: [
      {
        key: 'visit',
        col: mapped(mappings, domain, 'VISITNUM') || visit,
        label_col: visit,
        type: 'ordinal',
        title: 'Visit'
      },
      { key: 'day', col: mapped(mappings, domain, 'DY'), type: 'linear', title: 'Study day' }
    ]
  };
}

/**
 * Filter or group specs for the mapped columns among `columns`, labelled from
 * the manifest.
 * @private
 */
function fieldSpecs(columns, domain, mappings, manifest) {
  return columns
    .filter((column) => mapped(mappings, domain, column))
    .map((column) => ({
      value_col: mapped(mappings, domain, column),
      label: manifest.domains[domain].columns[column].label
    }));
}

const isOwn = (entry) => libraryOf(entry) === OWN_LIBRARY;

/**
 * Whether a chart is drawn in the page's main pane. The participant profile is
 * not: it is the rail that opens beside the charts that host it. Nor is a chart
 * that reads domains outside the standard set. A chart of another library
 * (#181) is drawn unless it reads such domains: recipes are safety.viz's.
 * @param {string} module The module name, as keyed in the manifest.
 * @param {Object} manifest The portfolio manifest, with any further libraries' charts merged in.
 * @returns {boolean} True when the chart is drawn in the main pane.
 */
export function isDestination(module, manifest) {
  const entry = manifest.modules[module];
  if (entry.externalDomains) return false;
  return isOwn(entry) ? has(RECIPES, module) : true;
}

/**
 * Turn the mappings into one chart's settings.
 *
 * Every column setting the manifest lists is set to the user's mapped column.
 * A setting whose row is unmapped is set to null — no column — and not left
 * out: left out, the chart would fall back to its default name and read that
 * column when the file happens to carry it, while the mapping table says "not
 * mapped". The chart degrades as it does for any absent optional column.
 * Settings of a domain with no file are left out: there is no row to clear and
 * no column to read. Nested settings (`color.value_col`) become nested objects.
 *
 * An entry may say `unmappedSettings: "omit"` (manifest format 2, #181): then
 * an unmapped setting is left out instead, for a chart that refuses a null
 * column setting. A chart of another library is handed its entry's column
 * settings and nothing more: the recipes and the per-chart additions below are
 * safety.viz's own.
 * @param {string} module The module name, as keyed in the manifest.
 * @param {Object<string, Object>} mappings The mapping for each loaded domain.
 * @param {Object} manifest The portfolio manifest, with any further libraries' charts merged in.
 * @returns {Object} Settings to pass the chart's factory.
 */
export function chartSettings(module, mappings, manifest) {
  const entry = manifest.modules[module];
  const own = isOwn(entry);
  const recipe = own && has(RECIPES, module) ? RECIPES[module] : {};
  const omit = entry.unmappedSettings === 'omit';
  const settings = {};

  for (const [key, setting] of Object.entries(entry.settings)) {
    if (setting.column === null) continue;
    const domain = asList(setting.domain).find((id) => mappings[id]);
    if (!domain) continue;
    const value = mapped(mappings, domain, setting.column);
    if (value === null && omit) continue;
    const [outer, inner] = key.split('.');
    if (inner) settings[outer] = { ...(settings[outer] || {}), [inner]: value };
    else settings[key] = value;
  }

  const [domain] = entry.domains;

  if (recipe.filters) settings.filters = fieldSpecs(DEMOGRAPHICS, domain, mappings, manifest);
  if (recipe.groups) settings.groups = fieldSpecs(DEMOGRAPHICS, domain, mappings, manifest);

  if (recipe.measures) {
    const values = Object.fromEntries(
      recipe.measures.map((key) => [key, mappedMeasure(mappings, key)]).filter(([, value]) => value)
    );
    if (Object.keys(values).length) settings.measure_values = values;
  }

  if (recipe.rail) {
    for (const [key, column] of [
      ['visit_col', 'VISIT'],
      ['visitn_col', 'VISITNUM'],
      ['unit_col', 'STRESU'],
      ['normal_col_low', 'STNRLO'],
      ['normal_col_high', 'STNRHI']
    ]) {
      settings[key] = mapped(mappings, domain, column);
    }
    settings.profile_details = fieldSpecs(['SEX', 'RACE', 'ARM'], domain, mappings, manifest);
    settings.studyday_col = mapped(mappings, domain, 'DY');
  }

  if (recipe.rail || recipe.xAxis) settings.x_axis = xAxisSetting(domain, mappings);

  if (own && module === 'qt-explorer') {
    const measures = ['QTcF', 'QTcB', 'HR'].map((key) => mappedMeasure(mappings, key));
    settings.measures = measures.filter(Boolean);
    settings.qtc_measures = measures.slice(0, 2).filter(Boolean);
    settings.start_measure = settings.qtc_measures[0] || null;
  }

  if (own && module === 'time-to-event') {
    settings.event_filters = fieldSpecs(EVENT_FILTERS, 'ae', mappings, manifest);
    settings.filters = fieldSpecs(['ARM'], 'subject', mappings, manifest);
  }

  return settings;
}

/**
 * The data to hand one chart's `init`. A chart whose entry names its tables
 * (manifest format 2, #181) takes an object of them, each the rows of its
 * domain's file as loaded; an optional table with no file is left out. Most
 * other charts take the rows of the one domain they read. safety.viz's
 * time-to-event explorer takes two tables: the adverse
 * events without the all-blank placeholder rows that stand for event-free
 * participants, and the subject-level table as its population — with the
 * participant column carried under the events' name when the two files call
 * it differently, because the chart takes one name for both.
 * @param {string} module The module name, as keyed in the manifest.
 * @param {Object<string, {rows: Object[]}>} files The parsed file for each loaded domain.
 * @param {Object<string, Object>} mappings The mapping for each loaded domain.
 * @param {Object} manifest The portfolio manifest.
 * @returns {?(Object[]|Object<string, Object[]>)} The data, or null for a chart that is not drawn in the main pane.
 */
export function chartData(module, files, mappings, manifest) {
  if (!isDestination(module, manifest)) return null;
  const entry = manifest.modules[module];
  if (entry.tables) {
    const tables = {};
    for (const [name, table] of Object.entries(entry.tables)) {
      if (files[table.domain]) tables[name] = files[table.domain].rows;
    }
    return tables;
  }
  if (!isOwn(entry) || module !== 'time-to-event') return files[entry.domains[0]].rows;

  const term = mapped(mappings, 'ae', 'AEDECOD') || mapped(mappings, 'ae', 'AETERM');
  const events = term ? files.ae.rows.filter((row) => row[term] !== '') : files.ae.rows;
  const eventId = mapped(mappings, 'ae', 'USUBJID');
  const populationId = mapped(mappings, 'subject', 'USUBJID');
  const population =
    eventId && populationId && eventId !== populationId
      ? files.subject.rows.map((row) => ({ ...row, [eventId]: row[populationId] }))
      : files.subject.rows;
  return { events, population };
}
