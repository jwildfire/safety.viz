// Portfolio-manifest helpers (#138, obot.roadmap#325). Pure functions over a
// chart's data schema; the cross-check test in tests/unit/portfolio/ uses them
// to hold src/data/portfolio.json to what the schemas say.

const typesOf = (property) => [].concat(property.type || []);

/**
 * The column-name settings a chart's data schema declares: every settings key
 * ending in `_col` (or carrying `_col_`, as normal_col_high does) whose type
 * admits a string, plus the `value_col` of a nested settings object such as
 * ae-timelines' `color`. Boolean toggles that happen to end in `_col`
 * (ae-explorer's total_col) and field lists (outlier-explorer's time_cols) are
 * not column names and are left out.
 * @param {Object} schema A chart data schema from src/data/schema/.
 * @returns {Object<string, {column: ?string, required: boolean}>} Settings key → its default column and whether the schema's required array names it.
 */
export function columnSettings(schema) {
  const settings = schema.properties.settings;
  const required = new Set(settings.required || []);
  const columns = {};
  for (const [key, property] of Object.entries(settings.properties || {})) {
    if (/_col(_|$)/.test(key) && typesOf(property).includes('string')) {
      columns[key] = { column: property.default ?? null, required: required.has(key) };
    } else if (typesOf(property).includes('object') && property.properties?.value_col) {
      columns[`${key}.value_col`] = {
        column: property.properties.value_col.default ?? null,
        required: required.has(key)
      };
    }
  }
  return columns;
}
