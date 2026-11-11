// The x-axis toggle (#368, obot.roadmap#436): every chart that shows change over
// time plots either by visit or by study day, chosen with one "X-axis" control
// and configured with one setting of the same shape in every chart:
//
//   x_axis: {
//     options: [
//       { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
//       { key: 'day',   col: 'DY',                           type: 'linear',  title: 'Study day' }
//     ],
//     default: 'visit'
//   }
//
// When a chart is given no `x_axis`, it is built from the settings the charts
// took before the toggle — `visitn_col` and `visit_col` for the visit option,
// `studyday_col` for the day option — so nothing a host passes today stops
// working. The axis title and tooltips always name what is plotted; an option
// whose column the data lacks is greyed out and says why; with neither, the
// chart shows NO_TIME_AXIS instead of a chart.

import { createElement } from './shell.js';

/** The message a chart shows instead of a chart when the data has neither column. */
export const NO_TIME_AXIS =
  'This data has no visit or study day, so there is no time axis to plot.';

// What each known option is when the setting leaves a field out.
const KNOWN = {
  visit: { type: 'ordinal', title: 'Visit', reason: 'No visit in this data' },
  day: { type: 'linear', title: 'Study day', reason: 'No study day in this data' }
};

const blank = (value) => value === undefined || value === null || String(value).trim() === '';

function fillOption(option) {
  const known = KNOWN[option.key] || {};
  return {
    key: String(option.key),
    col: option.col ?? null,
    label_col: option.label_col ?? null,
    type: option.type ?? known.type ?? 'ordinal',
    title: option.title ?? known.title ?? String(option.key)
  };
}

/**
 * Read a chart's `x_axis` setting into its full shape: each option with its key,
 * column, label column, type and title, and the default view. Without `x_axis`,
 * the setting is built from `visitn_col`, `visit_col` and `studyday_col`.
 * @param {Object} settings The chart's settings.
 * @param {Object} [options] Reading options.
 * @param {string} [options.fallback='visit'] The chart's own default view, when the setting names none.
 * @returns {{options: Object[], default: string}} The normalized setting.
 */
export function normalizeXAxis(settings = {}, { fallback = 'visit' } = {}) {
  const given = settings.x_axis;
  if (given && Array.isArray(given.options) && given.options.length) {
    return {
      options: given.options.filter((option) => option && !blank(option.key)).map(fillOption),
      default: given.default ?? fallback
    };
  }
  const options = [];
  const visitCol = settings.visitn_col || settings.visit_col || null;
  if (visitCol)
    options.push(
      fillOption({ key: 'visit', col: visitCol, label_col: settings.visit_col || null })
    );
  if (settings.studyday_col) options.push(fillOption({ key: 'day', col: settings.studyday_col }));
  return { options, default: (given && given.default) ?? fallback };
}

function hasValues(option, rows) {
  if (blank(option.col)) return false;
  return rows.some((row) => {
    const value = row ? row[option.col] : undefined;
    if (blank(value)) return false;
    return option.type === 'linear' ? Number.isFinite(Number(value)) : true;
  });
}

/**
 * Check each option against the data and pick the view to show: the one asked
 * for when the data can draw it, else the setting's default, else the first
 * option the data can draw. An option the data cannot draw is unavailable and
 * carries the reason its control shows.
 * @param {{options: Object[], default: string}} xAxis The normalized setting.
 * @param {Object[]} rows The data.
 * @param {?string} [requested=null] The view asked for (the control's state), if any.
 * @returns {{options: Object[], active: ?string, message: ?string}} Each option with `available` and `reason`, the active key, and NO_TIME_AXIS when no option is available.
 */
export function resolveXAxis(xAxis, rows, requested = null) {
  const data = Array.isArray(rows) ? rows : [];
  const options = (xAxis.options || []).map((option) => {
    const available = hasValues(option, data);
    const reason = available
      ? null
      : (KNOWN[option.key] && KNOWN[option.key].reason) || `No ${option.title} in this data`;
    return { ...option, available, reason };
  });
  const usable = (key) => options.find((option) => option.key === key && option.available);
  const pick = usable(requested) || usable(xAxis.default) || options.find((o) => o.available);
  return {
    options,
    active: pick ? pick.key : null,
    message: pick ? null : NO_TIME_AXIS
  };
}

/**
 * The option a resolved setting has active, or null.
 * @param {{options: Object[], active: ?string}} resolved A resolved setting.
 * @returns {?Object} The active option.
 */
export function activeXAxis(resolved) {
  return resolved.options.find((option) => option.key === resolved.active) || null;
}

/**
 * A row's position on an option's axis: its visit number or its study day.
 * @param {Object} option An x-axis option.
 * @param {Object} row A data row.
 * @returns {number} The position, NaN when the row has none.
 */
export function xAxisValue(option, row) {
  const value = row ? row[option.col] : undefined;
  return blank(value) ? NaN : Number(value);
}

/**
 * A row's tick label on an option's axis: the visit name for a visit option,
 * "Day N" for a study-day option.
 * @param {Object} option An x-axis option.
 * @param {Object} row A data row.
 * @returns {string} The label.
 */
export function xAxisTick(option, row) {
  if (option.type === 'linear') {
    const value = xAxisValue(option, row);
    return Number.isFinite(value) ? `Day ${value}` : '';
  }
  const label = option.label_col && row ? row[option.label_col] : undefined;
  return blank(label) ? String(row ? (row[option.col] ?? '') : '') : String(label);
}

/**
 * Render the "X-axis" control into a sidebar: one button per option, the active
 * one pressed, an unavailable one disabled with its reason as its title. Calls
 * `onChange(key)` when an available option other than the active one is chosen.
 * @param {HTMLElement} parent Where the control goes.
 * @param {Object} config Control configuration.
 * @param {{options: Object[], active: ?string}} config.resolved The resolved setting.
 * @param {(key: string) => void} config.onChange Called with the chosen key.
 * @param {string} [config.label='X-axis'] The control's label.
 * @returns {HTMLElement} The control's element.
 */
export function renderXAxisControl(parent, { resolved, onChange, label = 'X-axis' }) {
  const wrap = createElement('div', 'sv-control sv-xaxis-control');
  const heading = createElement('label', null, label);
  const group = createElement('div', 'sv-xaxis');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', label);
  resolved.options.forEach((option) => {
    const active = option.key === resolved.active;
    const button = createElement(
      'button',
      `sv-xaxis-option${active ? ' is-active' : ''}`,
      option.title
    );
    button.type = 'button';
    button.dataset.key = option.key;
    button.setAttribute('aria-pressed', String(active));
    if (!option.available) {
      button.disabled = true;
      button.title = option.reason;
    }
    button.onclick = () => {
      if (active || !option.available) return;
      onChange(option.key);
    };
    group.append(button);
  });
  wrap.append(heading, group);
  parent.append(wrap);
  return wrap;
}
