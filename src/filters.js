// The shared filter contract (#136, obot.roadmap#33).
//
// In 2021 the maintainer of the original safetyGraphics renderers filed the
// same issue against six of them: "webcharts supports start/all/multiple but
// the filters in most of the safety explorer modules are hard coded with only
// the value_col and label properties - even if other properties are
// specified." Five years on it was still true of this port: twelve modules
// each built their own filter dropdown, and only outlier-explorer and
// ae-explorer read anything beyond `{ value_col, label }`.
//
// This module is the single place that decides what a filter spec means, so
// declaring one is the same act in every renderer:
//
//   { value_col }                            a dropdown of every value, plus All
//   { value_col, start: 'Placebo' }          opens on Placebo, and offers no All
//   { value_col, start: 'Placebo', all: true }   opens on Placebo, All still offered
//   { value_col, all: false }                no All: one value is always selected
//   { value_col, multiple: true }            a checkbox multiselect, any number of values
//
// Two rules are load-bearing and are pinned by tests rather than by comments:
//
//   - `all` is never truthiness-tested. `false` is the value that does
//     something, which is exactly what makes the naive `if (spec.all)` wrong.
//   - `start` is never truthiness-tested either. `0` and `false` are real
//     column values, and collapsing them to "no start" is the same bug in a
//     different key.
//
// The selection state a module holds is `null` for no restriction, a string
// for a single value, or an array for a `multiple` filter — the same shape the
// shell's multiSelect already speaks, so the two compose without a translator.

import { multiSelect, option } from './shell.js';

/** The option value standing for "no restriction" in a single-value filter. */
export const ALL_VALUE = '__all__';

/**
 * Whether a spec's `start` names a value, as opposed to being absent.
 * Deliberately not a truthiness test: 0 and false are legitimate values.
 * @param {*} start The raw start value from the spec.
 * @returns {boolean} True when the spec opens on a value.
 * @private
 */
function hasStart(start) {
  if (start === undefined || start === null || start === '') return false;
  if (Array.isArray(start)) return start.length > 0;
  return true;
}

/**
 * Normalize one filter entry to the shared filter contract. A bare column name
 * becomes a filter with an All option and a single selection; a spec object
 * keeps every extra key it carries (a module's own `type`, for instance).
 * @param {string|Object} value Column name, or a spec object.
 * @param {string} [fallbackLabel] Label to use when the entry is a bare string.
 * @returns {{value_col: string, label: string, start: ?(string|string[]), all: boolean, multiple: boolean}} The normalized spec.
 */
export function normalizeFilterSpec(value, fallbackLabel) {
  if (typeof value === 'string') {
    return {
      value_col: value,
      label: fallbackLabel || value,
      start: null,
      all: true,
      multiple: false
    };
  }
  const spec = { ...value, value_col: value.value_col, label: value.label || value.value_col };
  const multiple = spec.multiple === true;
  const started = hasStart(spec.start);
  let start = null;
  if (started) {
    const raw = Array.isArray(spec.start) ? spec.start : [spec.start];
    start = multiple ? raw.map(String) : String(raw[0]);
  }
  // A start value means the chart opens filtered, so All is off unless the
  // spec asks for it back. `all: false` on its own is honoured as written.
  const all = spec.all === undefined ? !started : spec.all !== false;
  return { ...spec, start, all, multiple };
}

/**
 * Seed a module's `state.filters` from its normalized specs: the start values,
 * and null (no restriction) for every filter that does not declare one.
 * @param {Object[]} specs Normalized filter specs.
 * @returns {Object<string, ?(string|string[])>} The opening filter state.
 */
export function initFilterState(specs) {
  const state = {};
  (specs || []).forEach((spec) => {
    state[spec.value_col] = spec.start === undefined ? null : spec.start;
  });
  return state;
}

/**
 * Does one row's value satisfy one filter's current selection? This is the
 * predicate every module's applyFilters delegates to, so `multiple` works
 * everywhere the moment a module renders the control.
 * @param {*} rowValue The row's value for the filtered column.
 * @param {*} selection The active selection: null/undefined/'' = no restriction, an array = membership, anything else = equality.
 * @returns {boolean} Whether the row passes this filter.
 */
export function filterMatches(rowValue, selection) {
  if (selection === null || selection === undefined || selection === '') return true;
  if (Array.isArray(selection))
    return selection.some((value) => String(value) === String(rowValue));
  return String(rowValue) === String(selection);
}

/**
 * Build one filter control from its spec: a `<select>` with an optional "All"
 * option, or the shell's shared multiselect when the spec declares `multiple`.
 * The control is returned detached; the caller places it with the shell's
 * addControl so the sidebar layout stays in one place.
 * @param {Object} config Control configuration.
 * @param {Object} config.spec A normalized filter spec.
 * @param {Array<string|number>} config.values The selectable values, in display order.
 * @param {*} config.selected The current selection for this column.
 * @param {(next: ?(string|string[])) => void} config.onChange Called with the next selection; null means no restriction.
 * @returns {HTMLElement} The detached control element.
 */
export function renderFilterControl({ spec, values, selected, onChange }) {
  if (spec.multiple) {
    // multiSelect owns its own "All" master row, so `all` has nothing to
    // suppress here — every multiselect can already express "everything".
    return multiSelect({
      values: values.map(String),
      selected: Array.isArray(selected) ? selected.map(String) : null,
      onChange
    });
  }
  const select = document.createElement('select');
  select.dataset.filter = spec.value_col;
  const unset = selected === null || selected === undefined || selected === '';
  if (spec.all) option(select, ALL_VALUE, 'All', unset);
  values.forEach((value) =>
    option(select, value, value, !unset && String(selected) === String(value))
  );
  select.onchange = () => onChange(select.value === ALL_VALUE ? null : select.value);
  return select;
}
