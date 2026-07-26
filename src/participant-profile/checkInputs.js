// Standalone-only input validation for the participant-profile module (#98,
// PPRF-1). The docked mount skips this entirely — it consumes a host chart's
// already-cleaned rows verbatim — so this guard exists for the standalone data
// path, which ingests the raw long-lab contract. Each required mapped column
// must name a column present in at least one row, or a single Error names every
// missing variable (the delta-delta / hep-explorer idiom); the module renders
// the thrown message into the target element as a `.sv-warning`.

/** The settings keys whose mapped columns the standalone data path requires. */
export const REQUIRED_COLUMN_SETTINGS = ['id_col', 'measure_col', 'value_col', 'normal_col_high'];

/**
 * Validate raw records against the module's required column mappings.
 * @param {Object[]} data The raw long-format records.
 * @param {Object} settings Normalized settings.
 * @returns {void}
 * @throws {Error} When any required mapped column is absent from every row.
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
