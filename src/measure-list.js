// Shared measure-list resolution for the Measure control (#136,
// obot.roadmap#33).
//
// Before this, five renderers each built the control's options from one
// identical line — `unique(rows.map(measureLabel)).sort()`: every measure the
// data carried, alphabetically. Two long-standing requests from the original
// renderers' users fall out of that single line. Four trackers asked in 2016
// to subset the dropdown so a study only offers the measures it cares about;
// five asked in 2021 to order it by something other than the alphabet. One
// ordered whitelist answers both, exactly as qt-explorer's `measures` setting
// already does.
//
//   settings.measures == null / []   -> every measure in the data, sorted
//                                       (the pre-change behaviour, unchanged)
//   settings.measures == [a, b, c]   -> exactly those, in that order
//
// The whitelist filters the CONTROL, not the data: rows for a measure that is
// not offered stay in the cleaned data, they are simply unreachable. Nothing
// downstream filters by this list, so record counts, listings and
// normal-range derivation are untouched.

/**
 * A measure as the Measure control sees it: the label it displays, and the raw
 * `measure_col` value behind it.
 * @typedef {Object} PresentMeasure
 * @property {string} label What the Measure control shows — the module's measureLabel output.
 * @property {string} name The raw settings.measure_col value.
 */

/**
 * Normalize a `measures` setting to an array: nullish and empty string mean
 * "unconfigured", a bare string is a one-entry list.
 * @param {?(string|string[])} configured The measures setting.
 * @returns {string[]} The configured entries, possibly empty.
 * @private
 */
function entries(configured) {
  if (configured === undefined || configured === null || configured === '') return [];
  return Array.isArray(configured) ? configured : [configured];
}

/**
 * Resolve the Measure control's options from what the data carries and the
 * configured whitelist.
 *
 * Matching is by displayed label first — so the same string that `start_value`
 * takes also works here — falling back to the raw measure name for entries
 * that match no label. That fallback means `'Albumin'` resolves when the
 * control shows `'Albumin (g/dL)'`, and picks up every unit variant of that
 * measure, in the whitelist's position.
 *
 * A configured measure absent from the data is dropped with a warning naming
 * it; when none of them is present the control falls back to every measure in
 * the data rather than going blank, because an empty Measure control is a
 * broken chart and a mistyped setting should not produce one.
 *
 * @param {PresentMeasure[]} present Distinct measures in the cleaned data, in first-seen order.
 * @param {?(string|string[])} configured The `measures` setting; nullish or empty means every measure.
 * @param {Object} [options] Resolution options.
 * @param {boolean} [options.warn=true] Emit console warnings for entries that match nothing.
 * @returns {string[]} The labels to offer: the configured order, or every label sorted when unconfigured or when nothing matched.
 */
export function resolveMeasureList(present, configured, { warn = true } = {}) {
  const labels = (present || []).map((measure) => measure.label);
  const sorted = [...labels].sort();
  const configuredEntries = entries(configured);
  if (!configuredEntries.length) return sorted;

  const chosen = [];
  const missing = [];
  configuredEntries.forEach((entry) => {
    const byLabel = labels.filter((label) => label === entry);
    const matched = byLabel.length
      ? byLabel
      : present.filter((measure) => measure.name === entry).map((measure) => measure.label);
    if (!matched.length) {
      if (!missing.includes(entry)) missing.push(entry);
      return;
    }
    matched.forEach((label) => {
      if (!chosen.includes(label)) chosen.push(label);
    });
  });

  if (warn && missing.length) {
    const plural = missing.length > 1;
    console.warn(
      `The configured measure${plural ? 's' : ''} [ ${missing.join(', ')} ] ` +
        `${plural ? 'do' : 'does'} not exist in the data and ${plural ? 'have' : 'has'} been ` +
        'removed from the Measure control.'
    );
  }
  if (!chosen.length) {
    if (warn && labels.length)
      console.warn(
        'No configured measure exists in the data. Falling back to every measure in the data.'
      );
    return sorted;
  }
  return chosen;
}

/**
 * Build the {@link PresentMeasure} list a module hands to
 * {@link resolveMeasureList}: distinct measures in the cleaned rows, in
 * first-seen order, blank labels skipped.
 * @param {Object[]} rows Cleaned rows.
 * @param {Object} settings The module's synced settings — only `measure_col` is read.
 * @param {function(Object, Object): string} label The module's measureLabel function.
 * @returns {PresentMeasure[]} The present measures, in first-seen order.
 */
export function presentMeasures(rows, settings, label) {
  const seen = new Map();
  (rows || []).forEach((row) => {
    const text = label(row, settings);
    if (text === undefined || text === null || text === '') return;
    if (!seen.has(text)) seen.set(text, { label: text, name: row[settings.measure_col] });
  });
  return [...seen.values()];
}
