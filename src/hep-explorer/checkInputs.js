// Input validation against the JSON data contract in
// src/data/schema/hep-explorer.json (#43). Mirrors the outlier-explorer guard:
// the required column settings must each name a column present in at least one
// row, or a single Error names every missing variable (HEP-DATA-005). The main
// module renders the thrown message into the target element and tears the chart
// down.

import schema from '../data/schema/hep-explorer.json';
import { resolveArmCol } from '../hep-core/arms.js';

const REQUIRED_COLUMN_SETTINGS = schema.properties.settings.required;

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
 * View-aware guard for the treatment arm (HEP-ARM-005). The arm is structural
 * for the migration view only, so it stays OUT of the schema's global required
 * list — adding it there would break the shipped scatter and composite views for
 * arm-less data. Instead this reports, without throwing, whether an arm column
 * can be resolved: the migration view renders the message as a warning and the
 * View control disables the Migration option rather than letting a reviewer
 * click into an error.
 * @param {Object[]} data The raw or cleaned records.
 * @param {Object} settings Normalized settings.
 * @returns {{ok: boolean, armCol: ?string, message: ?string}} The guard result.
 */
export function checkArmInputs(data, settings) {
  const armCol = resolveArmCol(Array.isArray(data) ? data : [], settings);
  if (armCol) return { ok: true, armCol, message: null };
  return {
    ok: false,
    armCol: null,
    message:
      'Treatment arm column not found: map it with the arm_col setting to compare arms in the migration view.'
  };
}
