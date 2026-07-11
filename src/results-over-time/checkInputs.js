// Input validation against the JSON data contract in
// src/data/schema/results-over-time.json (#27). The measure, result, and visit
// columns named in the settings must be present in the data (SROT-DATA-001).

import schema from '../data/schema/results-over-time.json';

const REQUIRED_COLUMN_SETTINGS = schema.properties.settings.required;

/**
 * Validate that every required mapped column is present in the data.
 * @param {Object[]} data Long-format result records.
 * @param {ResultsOverTimeSettings} settings Column mappings.
 * @throws {Error} When a required column named in settings is absent from every row.
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
