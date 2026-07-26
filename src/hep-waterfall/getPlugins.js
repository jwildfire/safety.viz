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

/**
 * The anatomy key for the flanking box-and-whisker panels (HWF-BOX-006). The
 * shared renderer draws five marks and, until this key shipped, the chart named
 * none of them — a reader could see a box without knowing whether its edges
 * were quartiles or the whisker range (obot.roadmap#83).
 * @type {string}
 */
export const BOX_ANATOMY =
  'Box: interquartile range (Q1–Q3) with the median rule; whiskers: 5th–95th percentiles; ○ mean.';

/**
 * The sentence that spells out what the two boxes in each flanking panel are
 * (HWF-BOX-006), so the abbreviated slot label is never left to be guessed.
 * @type {string}
 */
export const BOX_PANEL_NOTE =
  'Flanking panels summarize each arm: the left box is baseline, the right box is the maximum on-treatment value.';

/** Long form of a box spec's slot label. @private */
const BOX_TITLES = { Baseline: 'Baseline', Peak: 'Maximum on-treatment' };

/** How far outside a box's drawn extent a pointer still counts as on it. @private */
const HIT_PAD = 4;

/** The hover backdrop behind the active box. @private */
const HOVER_FILL = 'rgba(148, 163, 184, 0.28)';

/**
 * The slot labels for a flanking panel's value axis (HWF-BOX-006): abbreviated
 * because the panel is 110px wide, and expanded by BOX_PANEL_NOTE in the legend.
 * @param {string} summary The summary mode — `baseline_peak` or `peak`.
 * @returns {string[]} One label per staged box, in slot order.
 */
export function boxSlotLabels(summary) {
  return summary === 'peak' ? ['Max on-tx'] : ['Baseline', 'Max on-tx'];
}

/** The pixel extent of one staged box: its slot width and its whisker span. @private */
function boxBounds(chart, box) {
  const left = chart.scales.x.getPixelForValue(box.x - box.halfWidth);
  const right = chart.scales.x.getPixelForValue(box.x + box.halfWidth);
  const first = chart.scales.y.getPixelForValue(box.stats.q5);
  const second = chart.scales.y.getPixelForValue(box.stats.q95);
  return {
    left: Math.min(left, right),
    right: Math.max(left, right),
    top: Math.min(first, second),
    bottom: Math.max(first, second)
  };
}

/**
 * The staged box under a pointer (HWF-BOX-005): the slot's horizontal span
 * crossed with the whisker span, padded so the 5th/95th caps are targets rather
 * than one-pixel lines. Boxes with no participants are not targets.
 * @param {{scales: Object}} chart The flank chart (or a subset exposing scales.x/scales.y).
 * @param {Array<Object>} specs The staged box specs, in slot order.
 * @param {number} x The pointer's x position in the canvas's CSS pixels.
 * @param {number} y The pointer's y position in the canvas's CSS pixels.
 * @returns {number} The index of the box under the pointer, or -1.
 */
export function boxHitTest(chart, specs, x, y) {
  const boxes = specs || [];
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index];
    if (!box || !box.stats || !box.stats.n) continue;
    const bounds = boxBounds(chart, box);
    if (
      x >= bounds.left - HIT_PAD &&
      x <= bounds.right + HIT_PAD &&
      y >= bounds.top - HIT_PAD &&
      y <= bounds.bottom + HIT_PAD
    ) {
      return index;
    }
  }
  return -1;
}

/**
 * The tooltip lines for one staged box (HWF-BOX-005): the arm and which box it
 * is, then every statistic the shared renderer actually draws, top to bottom in
 * the order the marks appear. The reader can therefore put a number on each
 * mark; `n` and the observed range are added because a box that summarizes four
 * participants should not read like one that summarizes four hundred.
 * @param {Object} spec One staged box spec.
 * @param {{arm: string, measure: string, unit: string}} options The panel's arm and the plotted measure.
 * @returns {string[]} The tooltip lines, or [] when there is nothing to describe.
 */
export function boxTooltip(spec, { arm = '', measure = '', unit = '' } = {}) {
  if (!spec || !spec.stats || !spec.stats.n) return [];
  const stats = spec.stats;
  const value = (number) => `${formatNumber(number)}${unit ? ` ${unit}` : ''}`;
  const title = BOX_TITLES[spec.label] || spec.label || '';
  const heading = [arm, measure ? `${title} ${measure}` : title].filter(Boolean).join(' · ');
  const lines = [
    heading,
    `n = ${stats.n}`,
    `95th percentile: ${value(stats.q95)}`,
    `Q3: ${value(stats.q75)}`,
    `Median: ${value(stats.median)}`,
    `Mean: ${value(stats.mean)}`,
    `Q1: ${value(stats.q25)}`,
    `5th percentile: ${value(stats.q5)}`
  ];
  if (Number.isFinite(stats.min) && Number.isFinite(stats.max)) {
    lines.push(`Observed range: ${formatNumber(stats.min)}–${value(stats.max)}`);
  }
  return lines;
}

/**
 * The accessible description of a whole flanking panel (HWF-BOX-007): the arm
 * and each box's centre and spread as numbers, so the panel is readable without
 * a pointer or a screenshot.
 * @param {Array<Object>} specs The staged box specs.
 * @param {{arm: string, measure: string, unit: string}} options The panel's arm and the plotted measure.
 * @returns {string} The description.
 */
export function boxPanelDescription(specs, { arm = '', measure = '', unit = '' } = {}) {
  const boxes = (specs || []).filter((box) => box && box.stats && box.stats.n);
  const subject = `${arm ? `${arm} ` : ''}${measure || ''}`.trim();
  if (!boxes.length) {
    return `Box-and-whisker summary for ${subject || 'this arm'}: no participants to summarize.`;
  }
  const parts = boxes.map((box) => {
    const stats = box.stats;
    const title = (BOX_TITLES[box.label] || box.label || '').toLowerCase();
    return (
      `${title}, ${stats.n} participant${stats.n === 1 ? '' : 's'}, median ` +
      `${formatNumber(stats.median)}${unit ? ` ${unit}` : ''}, interquartile range ` +
      `${formatNumber(stats.q25)} to ${formatNumber(stats.q75)}, 5th to 95th percentile ` +
      `${formatNumber(stats.q5)} to ${formatNumber(stats.q95)}`
    );
  });
  return `Box-and-whisker summary for ${subject || 'this arm'}: ${parts.join('; ')}.`;
}

/**
 * The hover backdrop for a flanking panel (HWF-BOX-005): a translucent block
 * bracketing the active box's whisker span. It is drawn BEFORE the datasets, so
 * the shared box-and-whisker marks — whose pixels results-over-time's evidence
 * baselines are pinned to — are never repainted by the hover.
 * @param {function(): ?Array} getSpecs Returns the panel's staged box specs.
 * @param {function(): number} getActive Returns the active box index, or -1.
 * @returns {Object} A Chart.js plugin object.
 */
export function boxHoverPlugin(getSpecs, getActive) {
  return {
    id: `hwf-box-hover-${Math.random().toString(36).slice(2)}`,
    beforeDatasetsDraw(chart) {
      const specs = getSpecs() || [];
      const index = getActive();
      const box = index >= 0 ? specs[index] : null;
      if (!box || !box.stats || !box.stats.n) return;
      const bounds = boxBounds(chart, box);
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = HOVER_FILL;
      ctx.fillRect(
        bounds.left - HIT_PAD,
        bounds.top - HIT_PAD,
        bounds.right - bounds.left + HIT_PAD * 2,
        bounds.bottom - bounds.top + HIT_PAD * 2
      );
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
