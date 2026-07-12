// Input validation against the JSON data contract in
// src/data/schema/shift-plot.json (#14), mirroring the histogram's
// checkInputs.js. The thrown message matches the histogram's wording so hosts
// handle both modules the same way (SSP-DATA-001).

import schema from '../data/schema/shift-plot.json';

const REQUIRED_COLUMN_SETTINGS = schema.properties.settings.required;

/**
 * Throw when a required column mapping names a column that is absent from
 * every data row.
 * @param {Object[]} data Long-format result records.
 * @param {import('./configure.js').ShiftPlotSettings} settings Column mappings.
 * @throws {Error} When one or more required columns are missing.
 * @returns {void}
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
