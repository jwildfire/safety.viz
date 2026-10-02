// Portfolio app: one recipe per chart (#150, obot.roadmap#352). The charts take
// their column names as settings, so a mapping never rewrites the user's data:
// it becomes a settings object. This module is that translation, plus the few
// places where charts differ in how they are handed their data.
//
// What a recipe adds beyond the manifest's column settings mirrors what the
// site's own demo pages pass each chart (site/demo/<module>.js): filters and
// groups over the demographic columns, the key measure names, and the columns
// the railed participant profile reads.

import { MEASURES } from './mapping.js';

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
 *   visit and study-day columns and the liver panel.
 * - `studyDay`: what to pass when the study day is unmapped. `'visit order'`
 *   passes the visit-order column instead, as the site's demos do for a labs
 *   extract with no study day; `'none'` passes null, for a chart that would
 *   otherwise print a visit number as a study day.
 */
export const RECIPES = {
  histogram: { filters: true, groups: true, rail: true, measures: LIVER },
  'outlier-explorer': { filters: true, groups: true, rail: true, measures: LIVER },
  'results-over-time': { filters: true, groups: true },
  'shift-plot': { filters: true, rail: true, measures: LIVER },
  'delta-delta': { filters: true, rail: true, measures: LIVER },
  'hep-explorer': {
    filters: true,
    groups: true,
    rail: true,
    measures: LIVER,
    studyDay: 'visit order'
  },
  'hep-waterfall': { filters: true, measures: LIVER, studyDay: 'visit order' },
  'nep-explorer': { filters: true, measures: ['CREAT'], studyDay: 'none' },
  'qt-explorer': {},
  'ae-explorer': {},
  'ae-timelines': {},
  'time-to-event': {}
};

/** Event descriptor columns the time-to-event explorer offers as event filters. */
const EVENT_FILTERS = ['AEBODSYS', 'AEDECOD', 'AESER', 'AESEV'];

const asList = (value) => [].concat(value);

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

/**
 * Whether a chart is drawn in the page's main pane. The participant profile is
 * not: it is the rail that opens beside the charts that host it. Nor is a chart
 * that reads domains outside the standard set.
 * @param {string} module The module name, as keyed in the manifest.
 * @param {Object} manifest The portfolio manifest.
 * @returns {boolean} True when the chart has a recipe.
 */
export function isDestination(module, manifest) {
  return Boolean(RECIPES[module]) && !manifest.modules[module].externalDomains;
}

/**
 * Turn the mappings into one chart's settings.
 *
 * Every column setting the manifest lists is set to the user's mapped column.
 * A setting whose column is unmapped is left out, so the chart keeps its own
 * default and degrades as it does for any absent optional column. Nested
 * settings (`color.value_col`) become nested objects.
 * @param {string} module The module name, as keyed in the manifest.
 * @param {Object<string, Object>} mappings The mapping for each loaded domain.
 * @param {Object} manifest The portfolio manifest.
 * @returns {Object} Settings to pass the chart's factory.
 */
export function chartSettings(module, mappings, manifest) {
  const entry = manifest.modules[module];
  const recipe = RECIPES[module] || {};
  const settings = {};

  for (const [key, setting] of Object.entries(entry.settings)) {
    if (setting.column === null) continue;
    const domain = asList(setting.domain).find((id) => mappings[id]);
    const value = domain ? mapped(mappings, domain, setting.column) : null;
    if (value === null) continue;
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
      ['visitn_col', 'VISITNUM']
    ]) {
      const value = mapped(mappings, domain, column);
      if (value) settings[key] = value;
    }
    settings.profile_details = fieldSpecs(['SEX', 'RACE', 'ARM'], domain, mappings, manifest);
  }

  if (recipe.rail || recipe.studyDay) {
    const studyDay = mapped(mappings, domain, 'DY');
    if (studyDay) settings.studyday_col = studyDay;
    else if (recipe.studyDay === 'none') settings.studyday_col = null;
    else if (mapped(mappings, domain, 'VISITNUM')) {
      settings.studyday_col = mapped(mappings, domain, 'VISITNUM');
    }
  }

  if (module === 'qt-explorer') {
    const measures = ['QTcF', 'QTcB', 'HR'].map((key) => mappedMeasure(mappings, key));
    settings.measures = measures.filter(Boolean);
    settings.qtc_measures = measures.slice(0, 2).filter(Boolean);
    settings.start_measure = settings.qtc_measures[0] || null;
  }

  if (module === 'time-to-event') {
    settings.event_filters = fieldSpecs(EVENT_FILTERS, 'ae', mappings, manifest);
    settings.filters = fieldSpecs(['ARM'], 'subject', mappings, manifest);
  }

  return settings;
}

/**
 * The data to hand one chart's `init`. Most charts take the rows of the one
 * domain they read. The time-to-event explorer takes two tables: the adverse
 * events without the all-blank placeholder rows that stand for event-free
 * participants, and the subject-level table as its population — with the
 * participant column carried under the events' name when the two files call
 * it differently, because the chart takes one name for both.
 * @param {string} module The module name, as keyed in the manifest.
 * @param {Object<string, {rows: Object[]}>} files The parsed file for each loaded domain.
 * @param {Object<string, Object>} mappings The mapping for each loaded domain.
 * @param {Object} manifest The portfolio manifest.
 * @returns {?(Object[]|{events: Object[], population: Object[]})} The data, or null for a chart that is not drawn in the main pane.
 */
export function chartData(module, files, mappings, manifest) {
  if (!isDestination(module, manifest)) return null;
  if (module !== 'time-to-event') return files[manifest.modules[module].domains[0]].rows;

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
