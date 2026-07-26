// Mount-agnostic control builders for the participant-profile module (#98,
// PPRF-3/4): the ×ULN / ×Baseline display toggle, the lab multi-subsetter, and
// the "show N additional measures" extras checkbox. One implementation, two
// placements — the standalone mount drops them in the shell sidebar, the dock
// mount drops the same builders into the block's compact inline strip. Plain DOM
// via shell.createElement; no Chart.js. Each builder is a pure DOM factory that
// reports its change through a callback and never dispatches a selection event.

import { createElement, option } from '../shell.js';

/**
 * The ×ULN / ×Baseline display toggle (PPRF-3).
 * @param {Object} settings Normalized settings (display_options).
 * @param {Object} state The live state ({ display }).
 * @param {(value: string) => void} onChange Called with the chosen display value.
 * @returns {HTMLSelectElement} The select element.
 */
export function displayControl(settings, state, onChange) {
  const select = document.createElement('select');
  select.className = 'sv-profile-display';
  // Accessible name + focus-restoration key (PPRF-8): the visual labels are
  // unassociated siblings in both mounts, and re-renders restore focus by the
  // data-sv-focus key.
  select.setAttribute('aria-label', 'Standardization');
  select.setAttribute('data-sv-focus', 'display');
  (settings.display_options || []).forEach((opt) =>
    option(select, opt.value, opt.label, opt.value === state.display)
  );
  select.onchange = () => onChange(select.value);
  return select;
}

/**
 * The lab multi-subsetter (PPRF-3): every measure key selected when the state
 * carries no subset. Reports the selected keys.
 * @param {string[]} keys The measure keys, in display order.
 * @param {Object} state The live state ({ labs }).
 * @param {(labs: string[]) => void} onChange Called with the selected keys.
 * @returns {HTMLSelectElement} The multi-select element.
 */
export function labControl(keys, state, onChange) {
  const select = document.createElement('select');
  select.className = 'sv-profile-labs';
  select.setAttribute('aria-label', 'Measures');
  select.setAttribute('data-sv-focus', 'labs');
  select.multiple = true;
  select.size = Math.min(6, Math.max(2, keys.length));
  const active = state.labs ? new Set(state.labs) : null;
  keys.forEach((key) => option(select, key, key, active ? active.has(key) : true));
  select.onchange = () => onChange([...select.selectedOptions].map((opt) => opt.value));
  return select;
}

/**
 * The extras toggle (PPRF-3/4): "Show N additional measure(s):" checkbox that
 * reveals the non-key measures. Parity copy from the original's
 * addExtraMeasureToggle.
 * @param {number} count The number of extra (non-key) measures.
 * @param {Object} state The live state ({ showExtras }).
 * @param {(showExtras: boolean) => void} onChange Called with the toggle state.
 * @returns {HTMLElement} The labelled checkbox wrapper.
 */
export function extrasControl(count, state, onChange) {
  const wrap = createElement('label', 'sv-profile-extras');
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.setAttribute('data-sv-focus', 'extras');
  checkbox.checked = Boolean(state.showExtras);
  checkbox.onchange = () => onChange(checkbox.checked);
  wrap.append(
    checkbox,
    document.createTextNode(`Show ${count} additional measure${count === 1 ? '' : 's'}:`)
  );
  return wrap;
}
