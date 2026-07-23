// Axis domain, the mirrored left/right axes, and unit resolution for the
// hep-waterfall module (#93).
//
// This is the FIRST hep consumer of `unit_col`. The eDISH scatter plots ratios,
// where the unit cancels; the waterfall plots the measure's own units, so the
// unit is part of the axis title and a cohort carrying two of them for the same
// measure is not a chart — it is a warning (HWF-DATA-006, HWF-DATA-007).
//
// Requirement groups: HWF-AXIS-001/002/003, HWF-BOX-002, HWF-DATA-006/007.

import { resolveMeasureRows } from '../hep-explorer/structureData.js';

/** Fallback unit when the data carries none — the paper's own units. */
export const DEFAULT_UNIT = 'U/L';

/**
 * Format a number to a fixed precision, trimming trailing zeros; '' when not
 * finite.
 * @param {number} value The value to format.
 * @param {number} [digits=1] Maximum decimal places.
 * @returns {string} The formatted number, or ''.
 */
export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

/**
 * Resolve the unit of the plotted measure (HWF-DATA-006, HWF-DATA-007): the
 * MODAL value of `unit_col` across that measure's records, falling back to U/L
 * when the column is unmapped, absent or blank. `mixed` reports a cohort that
 * carries more than one unit for the measure, which makes an absolute axis
 * meaningless — the caller renders a warning instead of a chart.
 * @param {Object[]} cleanRows Rows from prepareData.
 * @param {Object} settings Normalized settings.
 * @param {string} measure The short measure key being plotted.
 * @returns {{unit: string, units: string[], mixed: boolean}} The resolution.
 */
export function resolveUnit(cleanRows, settings, measure) {
  const empty = { unit: DEFAULT_UNIT, units: [], mixed: false };
  if (!settings || !settings.unit_col) return empty;
  const rows = resolveMeasureRows(cleanRows || [], settings, measure);
  const counts = new Map();
  rows.forEach((row) => {
    const value = row[settings.unit_col];
    if (value === undefined || value === null || String(value).trim() === '') return;
    const unit = String(value).trim();
    counts.set(unit, (counts.get(unit) || 0) + 1);
  });
  if (!counts.size) return empty;
  const units = [...counts.keys()];
  const unit = units.reduce((best, value) => (counts.get(value) > counts.get(best) ? value : best));
  return { unit, units, mixed: units.length > 1 };
}

/**
 * The vertical domain in the measure's ABSOLUTE units (HWF-AXIS-001) — never
 * multiples of the reference range or of baseline. Padded so no bar or trace
 * sits on the frame, clamped at zero below (a negative lab result is not a
 * thing), and widened to keep any extra values — the reference-range band — in
 * view. A cohort with one distinct value still gets a non-degenerate axis.
 * @param {Array<number>} values The plotted values (baselines and peaks).
 * @param {Array<number>} [extras=[]] Values that must stay visible (e.g. the reference range).
 * @returns {number[]} The [min, max] domain.
 */
export function waterfallDomain(values, extras = []) {
  const nums = [...(values || []), ...(extras || [])].map(Number).filter(Number.isFinite);
  if (!nums.length) return [0, 1];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  const pad = span > 0 ? span * 0.06 : Math.max(Math.abs(max) * 0.1, 1);
  return [Math.max(0, min - pad), max + pad];
}

/**
 * The mirrored left/right value axes (HWF-AXIS-002, HWF-AXIS-003). Both take
 * their min and max from the SAME domain — the paper's figure is "scaled on
 * both left and right", and a mirrored axis that is not identical is a lie that
 * no screenshot would ever reveal — and both carry the measure-and-unit title.
 * The right axis has no dataset of its own, so it must not draw a second grid.
 * @param {number[]} domain The [min, max] from a single waterfallDomain call.
 * @param {string} title The axis title (measure and unit).
 * @returns {{y: Object, y1: Object}} The Chart.js scale configs.
 */
export function mirroredScales(domain, title) {
  const [min, max] = domain;
  const axis = (position) => ({
    type: 'linear',
    position,
    min,
    max,
    title: { display: true, text: title }
  });
  return {
    y: { ...axis('left'), grid: { color: 'rgba(148, 163, 184, 0.25)' } },
    y1: { ...axis('right'), display: true, grid: { drawOnChartArea: false } }
  };
}

/**
 * The axis title: the measure and its unit (HWF-AXIS-003).
 * @param {string} measure The short measure key.
 * @param {string} unit The resolved unit.
 * @returns {string} e.g. `ALT (U/L)`.
 */
export function axisTitle(measure, unit) {
  return `${measure} (${unit || DEFAULT_UNIT})`;
}

/**
 * The participant (category) axis: one slot per participant, ticks hidden
 * because 80 identifiers cannot be read, and a title stating the ordering the
 * reader is looking at (HWF-ORDER-001/002).
 * @param {string} measure The short measure key.
 * @param {{placeboLabel: string, activeLabel: string}} labels The two arm labels.
 * @returns {Object} The Chart.js x-scale config.
 */
export function categoryScale(measure, { placeboLabel = 'Placebo', activeLabel = 'Active' } = {}) {
  return {
    type: 'category',
    offset: false,
    ticks: { display: false },
    grid: { display: false },
    title: {
      display: true,
      text: `Participants ranked by baseline ${measure} — ${placeboLabel} ascending ◀ | ▶ ${activeLabel} descending`
    }
  };
}

/**
 * Scales for a flanking summary panel (HWF-BOX-002): the value axis pinned to
 * the main chart's domain so the boxes are vertically registered with the bars,
 * and a hidden linear slot axis wide enough for the staged boxes.
 * @param {number[]} domain The [min, max] from the main chart's waterfallDomain call.
 * @param {number} [boxes=2] How many boxes the panel stages.
 * @returns {{x: Object, y: Object}} The Chart.js scale configs.
 */
export function flankScales(domain, boxes = 2) {
  const [min, max] = domain;
  return {
    x: {
      type: 'linear',
      display: false,
      min: -0.5,
      max: Math.max(boxes - 0.5, 0.5),
      grid: { display: false }
    },
    y: { type: 'linear', display: false, min, max, grid: { display: false } }
  };
}
