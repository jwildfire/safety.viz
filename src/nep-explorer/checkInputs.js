// Input validation against the JSON data contract in
// src/data/schema/nep-explorer.json (#120). Mirrors the delta-delta guard:
// throw when a required mapped column is absent from every row. The main
// module renders the thrown message into the target element and tears the
// chart down. Requirement group: NEP-DATA-006.
//
// The creatinine measure is checked separately and does NOT throw: a lab
// extract with no creatinine is a legitimate dataset for which this chart has
// nothing to say, and the module reports that in the notes rather than failing
// the page.

import schema from '../data/schema/nep-explorer.json';

const REQUIRED_COLUMN_SETTINGS = schema.properties.settings.required;

/**
 * Throw when any required mapped column is missing from every row.
 * @param {Object[]} data The raw records.
 * @param {Object} settings Normalized settings.
 * @throws {Error} Naming every missing column.
 */
export function checkInputs(data, settings) {
  const rows = Array.isArray(data) ? data : [];
  const missing = REQUIRED_COLUMN_SETTINGS.map((key) => settings[key]).filter(
    (col) => !rows.some((row) => row[col] !== undefined)
  );
  if (missing.length) {
    throw new Error(`Required variable(s) missing: ${missing.join(', ')}`);
  }
}

/**
 * Whether the data carries any record for the configured creatinine measure
 * (NEP-DATA-006). Absence is reported, not thrown.
 * @param {Object[]} data The raw records.
 * @param {Object} settings Normalized settings.
 * @returns {boolean} True when at least one creatinine record is present.
 */
export function hasCreatinine(data, settings) {
  const measure = settings.measure_values && settings.measure_values.CREAT;
  if (!measure) return false;
  return (Array.isArray(data) ? data : []).some(
    (row) => String(row[settings.measure_col]) === String(measure)
  );
}
