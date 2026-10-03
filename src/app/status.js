// Demo app: can each chart draw? (#149, obot.roadmap#352). One status per
// chart, computed from the mappings against the manifest, and priced in what is
// missing by name — "needs upper limit of normal", never a count of empty
// boxes. This is the old safetyGraphics app's chart-availability check.
//
//   ready               every domain it needs is loaded and everything required is mapped
//   missing             a domain is loaded and something required is unmapped
//   no file             no file is placed in a domain it needs — a legitimate final state
//   needs more domains  it reads domains the standard set does not supply; no
//                       chart in the manifest does (#165), and the state is kept
//                       for one that may
//
// A fifth state, `did not draw`, is set by the page when a ready chart throws:
// status is corrected by what happened, never left at ready. A sixth, `not
// loaded`, is a chart of another library (#181) that the page cannot draw: its
// library or its factory is not there, or its entry cannot be read. It says
// why in words, and comes before everything else, since no data can fix it.
//
// What a chart needs is read from its entry: its domains and its required
// settings. CHART_NEEDS adds what some of safety.viz's own charts need beyond
// their schemas; it applies to safety.viz's charts only, so a second
// library's chart is never looked up in it by name.

import { MEASURES } from './mapping.js';
import { OWN_LIBRARY, libraryOf } from './libraries.js';

/**
 * What a chart cannot draw without, beyond its schema's required settings.
 *
 * - `measures`: key measures it finds by name; each must be mapped.
 * - `anyMeasure`: key measures of which one is enough.
 * - `settings`: column settings the chart needs although its schema's required
 *   array does not list them — time-to-event's schema requires none, yet it
 *   validates its participant, onset-day and follow-up-day columns on load
 *   (TTE-DATA-001).
 */
export const CHART_NEEDS = {
  'hep-explorer': { measures: ['ALT', 'TB'] },
  'hep-waterfall': { measures: ['ALT'] },
  'nep-explorer': { measures: ['CREAT'] },
  'qt-explorer': { anyMeasure: ['QTcF', 'QTcB'] },
  'time-to-event': { settings: ['id_col', 'event_day_col', 'fu_day_col'] }
};

const measureByKey = Object.fromEntries(MEASURES.map((measure) => [measure.key, measure]));
const asList = (value) => [].concat(value);

/** What a chart needs beyond its entry: CHART_NEEDS, for safety.viz's own charts only. */
const needsOf = (module, entry) => (libraryOf(entry) === OWN_LIBRARY && CHART_NEEDS[module]) || {};

/**
 * Status of every chart in the manifest.
 * @param {Object<string, Object>} mappings The mapping for each loaded domain, keyed by domain id; a domain with no file is absent.
 * @param {Object} manifest The portfolio manifest, with any further libraries' charts merged in (libraries.js).
 * @param {Object<string, string>} [problems] For each chart that cannot be drawn whatever is loaded, the sentence that says why (libraries.js::mergeLibraries).
 * @returns {Object<string, {state: string, missing: {kind: string, domain: string, key?: string, label: string}[], message?: string}>} Per module, in manifest order: its state and what it is missing.
 */
export function chartStatus(mappings, manifest, problems = {}) {
  const status = {};
  for (const [module, entry] of Object.entries(manifest.modules)) {
    if (Object.prototype.hasOwnProperty.call(problems, module)) {
      status[module] = { state: 'not loaded', missing: [], message: problems[module] };
      continue;
    }
    if (entry.externalDomains) {
      status[module] = { state: 'needs more domains', missing: [] };
      continue;
    }
    const unloaded = entry.domains.filter((domain) => !mappings[domain]);
    if (unloaded.length) {
      status[module] = {
        state: 'no file',
        missing: unloaded.map((domain) => ({
          kind: 'domain',
          domain,
          label: manifest.domains[domain].label
        }))
      };
      continue;
    }

    const needs = needsOf(module, entry);
    const missing = [];
    const seen = new Set();
    for (const [key, setting] of Object.entries(entry.settings)) {
      if (!setting.required && !(needs.settings || []).includes(key)) continue;
      for (const domain of asList(setting.domain)) {
        // A setting may name a column in an optional domain that has no file.
        if (!mappings[domain]) continue;
        const mapped = mappings[domain].columns[setting.column];
        if ((mapped && mapped.value) || seen.has(`${domain}.${setting.column}`)) continue;
        seen.add(`${domain}.${setting.column}`);
        missing.push({
          kind: 'column',
          domain,
          key: setting.column,
          label: manifest.domains[domain].columns[setting.column].label
        });
      }
    }
    const mappedMeasure = (key) => {
      const row = mappings[measureByKey[key].domain].measures[key];
      return Boolean(row && row.value);
    };
    for (const key of needs.measures || []) {
      if (mappedMeasure(key)) continue;
      const measure = measureByKey[key];
      missing.push({ kind: 'measure', domain: measure.domain, key, label: measure.label });
    }
    if (needs.anyMeasure && !needs.anyMeasure.some(mappedMeasure)) {
      const [first] = needs.anyMeasure;
      missing.push({
        kind: 'measure',
        domain: measureByKey[first].domain,
        key: first,
        label: needs.anyMeasure.map((key) => measureByKey[key].label).join(' or ')
      });
    }
    status[module] = { state: missing.length ? 'missing' : 'ready', missing };
  }
  return status;
}

/**
 * The supported count shown above the chart list.
 * @param {Object} status The result of {@link chartStatus}.
 * @returns {{ready: number, total: number}} How many charts are ready, of how many.
 */
export function supportedCount(status) {
  const entries = Object.values(status);
  return {
    ready: entries.filter((entry) => entry.state === 'ready').length,
    total: entries.length
  };
}

/**
 * Which charts cannot draw without each mapping row: the index behind the
 * mapping table's "needed by 3 charts". A column is needed by the charts whose
 * schema requires the setting it backs, plus the settings {@link CHART_NEEDS}
 * adds; a measure by the charts that find it by name. Charts for which one of
 * several measures is enough are listed apart, since no single measure is needed.
 * A chart that cannot be drawn whatever is mapped needs nothing.
 * @param {Object} manifest The portfolio manifest, with any further libraries' charts merged in.
 * @param {Object<string, string>} [problems] The charts that cannot be drawn (libraries.js::mergeLibraries).
 * @returns {{columns: Object<string, Object<string, string[]>>, measures: Object<string, string[]>, anyMeasure: {keys: string[], charts: string[]}[]}} Chart titles per domain column and per measure key, in manifest order.
 */
export function neededBy(manifest, problems = {}) {
  const columns = Object.fromEntries(
    Object.entries(manifest.domains).map(([domain, definition]) => [
      domain,
      Object.fromEntries(Object.keys(definition.columns).map((column) => [column, []]))
    ])
  );
  const measures = Object.fromEntries(MEASURES.map((measure) => [measure.key, []]));
  const anyMeasure = [];
  for (const [module, entry] of Object.entries(manifest.modules)) {
    if (Object.prototype.hasOwnProperty.call(problems, module)) continue;
    const needs = needsOf(module, entry);
    for (const [key, setting] of Object.entries(entry.settings)) {
      if (!setting.required && !(needs.settings || []).includes(key)) continue;
      for (const domain of asList(setting.domain)) {
        const charts = columns[domain][setting.column];
        if (charts && !charts.includes(entry.title)) charts.push(entry.title);
      }
    }
    for (const key of needs.measures || []) measures[key].push(entry.title);
    if (needs.anyMeasure) {
      const group = anyMeasure.find((item) => item.keys.join() === needs.anyMeasure.join());
      if (group) group.charts.push(entry.title);
      else anyMeasure.push({ keys: [...needs.anyMeasure], charts: [entry.title] });
    }
  }
  return { columns, measures, anyMeasure };
}
