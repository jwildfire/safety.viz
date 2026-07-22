// Colour, canvas plugins and tooltip text for the hep-waterfall module (#93).
//
// The colour rule is SEMANTIC and fixed — placebo blue, active bronze, green
// for new-onset jaundice in either arm — and its hexes live in
// src/hep-core/arms.js so the waterfall, the migration Sankey and any later
// hepatic view cannot drift apart. It is deliberately NOT the cycling group
// palette, whose index-based assignment would silently swap blue and bronze if
// the arm ordering changed.
//
// Requirement groups: HWF-COLOR-*, HWF-AXIS-004, HWF-SELECT-001.

import { ARM_SIDE_COLORS, JAUNDICE_COLOR } from '../hep-core/arms.js';
import { formatNumber } from './getScales.js';

/** The baseline trace's colour: the paper's black line (HWF-BAR-003). */
export const TRACE_COLOR = '#111827';

/** The arm-divider rule and its captions (HWF-COLOR-003). */
export const DIVIDER_COLOR = '#475569';

/** The reference-range band and line (HWF-AXIS-004). */
export const ULN_COLOR = '#94a3b8';

/**
 * The legend's precedence sentence (HWF-COLOR-004). Stated out loud because a
 * reader who does not know that green wins will miscount the arms: a jaundiced
 * active-arm participant is drawn green, not bronze.
 * @type {string}
 */
export const JAUNDICE_PRECEDENCE =
  'Green takes precedence over the arm colour: a participant who developed new-onset jaundice is green in either arm.';

/**
 * The bar colour for one participant (HWF-COLOR-001, HWF-COLOR-002): the arm
 * colour, OVERRIDDEN by green for new-onset jaundice, exactly as the paper's
 * caption describes.
 * @param {Object} subject A plotted participant.
 * @returns {string} The bar colour.
 */
export function barColor(subject) {
  if (!subject) return ARM_SIDE_COLORS.placebo;
  if (subject.newOnsetJaundice) return JAUNDICE_COLOR;
  return ARM_SIDE_COLORS[subject.side] || DIVIDER_COLOR;
}

/**
 * The per-bar colour array for the floating-bar dataset.
 * @param {Object[]} subjects The ordered participants.
 * @returns {string[]} One colour per participant.
 */
export function barColors(subjects) {
  return (subjects || []).map(barColor);
}

/**
 * The legend rows, in draw precedence order (HWF-COLOR-004).
 * @param {{placeboLabel: string, activeLabel: string, jaundiceCount: number}} labels The arm labels and the jaundice count.
 * @returns {Array<{color: string, label: string}>} The legend rows.
 */
export function legendItems({
  placeboLabel = 'Placebo',
  activeLabel = 'Active',
  jaundiceCount = 0
} = {}) {
  return [
    { color: ARM_SIDE_COLORS.placebo, label: placeboLabel },
    { color: ARM_SIDE_COLORS.active, label: activeLabel },
    {
      color: JAUNDICE_COLOR,
      label: `Developed new-onset jaundice (either arm, n=${jaundiceCount})`
    }
  ];
}

/**
 * The cohort's reference-range span (HWF-AXIS-004). ALT's upper limit of normal
 * genuinely varies across a real study, so a single line on an absolute axis is
 * undefined; this reports the span and whether it collapses to one value.
 * @param {Object[]} subjects The plotted participants.
 * @returns {{min: number, max: number, single: boolean, values: number[]}} The span.
 */
export function ulnRange(subjects) {
  const values = [
    ...new Set(
      (subjects || []).map((subject) => Number(subject && subject.uln)).filter(Number.isFinite)
    )
  ].sort((a, b) => a - b);
  if (!values.length) return { min: NaN, max: NaN, single: false, values };
  return { min: values[0], max: values[values.length - 1], single: values.length === 1, values };
}

/**
 * The reference-range caption (HWF-AXIS-004).
 * @param {{min: number, max: number, single: boolean}} range From ulnRange.
 * @param {string} unit The resolved unit.
 * @returns {string} e.g. `ULN (40 U/L)` or `ULN range (32–43 U/L)`.
 */
export function ulnLabel(range, unit) {
  if (!range || !Number.isFinite(range.min)) return '';
  if (range.single || range.min === range.max) {
    return `ULN (${formatNumber(range.min)} ${unit})`;
  }
  return `ULN range (${formatNumber(range.min)}–${formatNumber(range.max)} ${unit})`;
}

/** Half the width of one category slot, in pixels. @private */
function halfSlot(chart, count) {
  const { left, right } = chart.chartArea;
  if (count > 1) {
    return Math.abs(chart.scales.x.getPixelForValue(1) - chart.scales.x.getPixelForValue(0)) / 2;
  }
  return (right - left) / 2;
}

/**
 * The arm divider (HWF-COLOR-003): a vertical rule at the placebo/active seam
 * with each half captioned by its arm name and participant count. A one-sided
 * cohort draws no rule — there is no seam — but still names the arm it drew, so
 * the reader is never left to infer which half they are looking at.
 * @param {Object} instance The live renderer, whose `waterfall` the plugin reads.
 * @returns {Object} A Chart.js plugin object.
 */
export function armDividerPlugin(instance) {
  return {
    id: 'hwf-arm-divider',
    afterDatasetsDraw(chart) {
      const waterfall = instance.waterfall;
      if (!waterfall || !waterfall.ordered.length) return;
      const { placebo, active, placeboLabel, activeLabel } = waterfall;
      const { top, bottom, left, right } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 11px system-ui, -apple-system, sans-serif';
      ctx.textBaseline = 'top';
      ctx.textAlign = 'center';

      if (placebo.length && active.length) {
        const seam =
          (chart.scales.x.getPixelForValue(placebo.length - 1) +
            chart.scales.x.getPixelForValue(placebo.length)) /
          2;
        ctx.strokeStyle = DIVIDER_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(seam, top);
        ctx.lineTo(seam, bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = DIVIDER_COLOR;
        ctx.fillText(`${placeboLabel} (n=${placebo.length})`, (left + seam) / 2, top + 4);
        ctx.fillText(`${activeLabel} (n=${active.length})`, (seam + right) / 2, top + 4);
      } else {
        const only = placebo.length
          ? `${placeboLabel} (n=${placebo.length})`
          : `${activeLabel} (n=${active.length})`;
        ctx.fillStyle = DIVIDER_COLOR;
        ctx.fillText(only, (left + right) / 2, top + 4);
      }
      ctx.restore();
    }
  };
}

/**
 * The reference range on the absolute axis (HWF-AXIS-004), drawn UNDER the bars:
 *
 *   * `band` — a shaded band from the cohort's minimum to its maximum upper
 *     limit of normal, labelled with the span; it collapses to a single dashed
 *     line when every participant shares one limit;
 *   * `per_subject` — each participant's own limit as a short dash above their
 *     bar slot, for cohorts where the variation matters;
 *   * `none` — nothing.
 *
 * A cohort with no usable reference range draws nothing at all rather than a
 * phantom line at NaN.
 * @param {Object} instance The live renderer, whose `waterfall` and `state` the plugin reads.
 * @returns {Object} A Chart.js plugin object.
 */
export function ulnBandPlugin(instance) {
  return {
    id: 'hwf-uln-band',
    beforeDatasetsDraw(chart) {
      const waterfall = instance.waterfall;
      const mode = instance.state ? instance.state.ulnDisplay : 'band';
      if (!waterfall || mode === 'none') return;
      const range = waterfall.uln;
      if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return;
      const { top, bottom, left, right } = chart.chartArea;
      const ctx = chart.ctx;
      const yOf = (value) => chart.scales.y.getPixelForValue(value);
      const clamp = (y) => Math.max(top, Math.min(bottom, y));

      ctx.save();
      ctx.strokeStyle = ULN_COLOR;
      ctx.fillStyle = ULN_COLOR;
      ctx.lineWidth = 1;

      if (mode === 'per_subject') {
        const half = halfSlot(chart, waterfall.ordered.length);
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        waterfall.ordered.forEach((subject, index) => {
          if (!Number.isFinite(subject.uln)) return;
          const x = chart.scales.x.getPixelForValue(index);
          const y = clamp(yOf(subject.uln));
          ctx.moveTo(x - half, y);
          ctx.lineTo(x + half, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }

      const label = ulnLabel(range, waterfall.unit);
      if (range.single || range.min === range.max) {
        const y = clamp(yOf(range.min));
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        const upper = clamp(yOf(range.max));
        const lower = clamp(yOf(range.min));
        ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.fillRect(left, upper, right - left, lower - upper);
      }
      ctx.fillStyle = DIVIDER_COLOR;
      ctx.font = '11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, left + 4, clamp(yOf(range.max)) - 2);
      ctx.restore();
    }
  };
}

/** A signed change, e.g. `+200` / `-40`. @private */
function signed(value) {
  if (!Number.isFinite(value)) return '';
  return `${value > 0 ? '+' : ''}${formatNumber(value)}`;
}

/**
 * The tooltip lines for one bar (HWF-SELECT-001): the participant, their arm,
 * the baseline and the maximum on-treatment value with its study day, the
 * change in both absolute and ×baseline terms, the peak total bilirubin, and
 * the jaundice flag when it is set.
 * @param {Object} subject A plotted participant.
 * @param {{measure: string, unit: string}} options The plotted measure and its unit.
 * @returns {string[]} The tooltip lines.
 */
export function waterfallTooltip(subject, { measure = 'ALT', unit = 'U/L' } = {}) {
  if (!subject) return [];
  const day = Number.isFinite(subject.peakDay) ? ` (day ${subject.peakDay})` : '';
  const fold =
    subject.baseline > 0 ? ` (${formatNumber(subject.peak / subject.baseline, 2)}×baseline)` : '';
  const lines = [
    String(subject.id),
    `Arm: ${subject.arm || '(not reported)'}`,
    `Baseline ${measure}: ${formatNumber(subject.baseline)} ${unit}`,
    `Maximum on-treatment ${measure}: ${formatNumber(subject.peak)} ${unit}${day}`,
    `Change: ${signed(subject.peak - subject.baseline)} ${unit}${fold}`
  ];
  if (Number.isFinite(subject.peakBiliULN)) {
    lines.push(`Peak total bilirubin: ${formatNumber(subject.peakBiliULN, 2)}×ULN`);
  }
  if (subject.newOnsetJaundice) lines.push('Developed new-onset jaundice');
  return lines;
}
