// Data preparation for the ae-timelines module (#26): cleaning, color-domain
// ordering, participant sorting, and timeline-row building — a Chart.js
// reimplementation of the original renderer's onInit pipeline (cleanData,
// checkColorBy, defineColorDomain, calculatePopulationSize) and onDraw
// sortYdomain. Generic row filtering is shared with the histogram module.

import { unique } from '../histogram/structureData.js';

export { applyFilters, unique } from '../histogram/structureData.js';

// Matches the original's "has content" test for verbatim terms and color
// values: at least one character that is not whitespace, '*', or '$'.
const HAS_CONTENT = /[^\s*$]/;
// Start days must be integers (the original's cleanData filter).
const INTEGER_DAY = /^-?\d+$/;

// The color assigned to normalized-missing color values (the original's
// addNAToColorScale).
export const NA_COLOR = '#999999';

/**
 * Count the population denominator: every participant in the raw data,
 * including AE-free participants present only as placeholder rows.
 */
export function populationCount(rawData, settings) {
  return unique(rawData.map((row) => row[settings.id_col])).length;
}

/**
 * Clean the raw records the way the original renderer does: remove records
 * with blank verbatim terms (which drops AE-free placeholder rows from the
 * chart) and records with non-integer start days, each with a reported
 * count; normalize blank color values to 'N/A'; and coerce the study days
 * (__aet_stdy always an integer, __aet_endy null when unusable).
 */
export function cleanData(rawData, settings) {
  let removedTerm = 0;
  let removedDay = 0;
  const rows = rawData
    .filter((row) => {
      const keep = HAS_CONTENT.test(row[settings.term_col]);
      if (!keep) removedTerm += 1;
      return keep;
    })
    .filter((row) => {
      const keep = INTEGER_DAY.test(row[settings.stdy_col]);
      if (!keep) removedDay += 1;
      return keep;
    })
    .map((row) => ({
      ...row,
      [settings.color.value_col]: HAS_CONTENT.test(row[settings.color.value_col])
        ? row[settings.color.value_col]
        : 'N/A',
      __aet_stdy: Number(row[settings.stdy_col]),
      __aet_endy: INTEGER_DAY.test(row[settings.endy_col]) ? Number(row[settings.endy_col]) : null
    }));
  return { rows, removedTerm, removedDay };
}

/**
 * The ordered color domain: every configured level (in configured order,
 * whether or not present in the data, so the legend is stable), then
 * unexpected levels found in the data sorted alphabetically, with 'N/A'
 * always last — the original's defineColorDomain.
 */
export function colorDomain(rows, colorSettings) {
  const extras = unique(rows.map((row) => row[colorSettings.value_col]))
    .filter((value) => !colorSettings.values.includes(value))
    .sort((a, b) => {
      if (a === 'N/A') return 1;
      if (b === 'N/A') return -1;
      return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
    });
  return [...colorSettings.values, ...extras];
}

/**
 * The color for a domain value: configured colors by domain position, with
 * 'N/A' always gray (the original's addNAToColorScale).
 */
export function colorFor(value, domain, colors) {
  if (value === 'N/A') return NA_COLOR;
  return colors[domain.indexOf(value) % colors.length];
}

/**
 * Sorted participant IDs, top row first. 'earliest' orders by each
 * participant's first adverse-event onset (ties by ID); the original builds
 * its y domain bottom-to-top, so its descending comparators read — and are
 * asserted here — as ascending from the top. 'alphabetical-descending'
 * (the original's label) therefore reads alphabetically from the top.
 */
export function sortSubjects(rows, settings, order) {
  const ids = unique(rows.map((row) => row[settings.id_col]));
  if (order === 'alphabetical-descending') {
    return ids.sort((a, b) => String(a).localeCompare(String(b)));
  }
  const firstDay = new Map();
  rows.forEach((row) => {
    const id = row[settings.id_col];
    if (!firstDay.has(id) || row.__aet_stdy < firstDay.get(id)) {
      firstDay.set(id, row.__aet_stdy);
    }
  });
  return ids.sort(
    (a, b) => firstDay.get(a) - firstDay.get(b) || String(a).localeCompare(String(b))
  );
}

/**
 * Build one timeline event per cleaned record: participant, sequence,
 * start/end study days (zero-length at the start day when the stop day is
 * unusable), the color value, and the serious flag from the highlight
 * configuration.
 */
export function buildTimelineRows(rows, settings) {
  return rows.map((row) => ({
    subject: row[settings.id_col],
    seq: row[settings.seq_col],
    start: row.__aet_stdy,
    end: row.__aet_endy === null ? row.__aet_stdy : row.__aet_endy,
    term: row[settings.term_col],
    color: row[settings.color.value_col],
    serious: Boolean(
      settings.highlight && row[settings.highlight.value_col] === settings.highlight.value
    ),
    record: row
  }));
}
