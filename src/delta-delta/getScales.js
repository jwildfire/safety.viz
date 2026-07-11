// Axis labels, domain, and result formatting for the delta-delta scatter
// (#25). Ported from the original renderer's axis settings and the linked
// table's formatDelta (SDD-REG-021), kept pure for unit testing.

// Change-over-time value colors (SDD-REG-021): green above 0, red below 0,
// gray for exactly 0 or a missing (NA) change.
export const POSITIVE_COLOR = '#16a34a';
export const NEGATIVE_COLOR = '#dc2626';
export const ZERO_COLOR = '#6b7280';
export const NA_COLOR = '#9ca3af';

export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

// Signed, 2-decimal change value, or 'NA' when a delta is missing — matches
// the original's d3 format('+0.2f') with an isNaN → 'NA' guard (SDD-REG-022).
export function formatDelta(value) {
  if (!Number.isFinite(value)) return 'NA';
  const fixed = value.toFixed(2);
  return value >= 0 ? `+${fixed}` : fixed;
}

// Color for a change-over-time value (SDD-REG-021/022).
export function deltaColor(value) {
  if (!Number.isFinite(value)) return NA_COLOR;
  if (value > 0) return POSITIVE_COLOR;
  if (value < 0) return NEGATIVE_COLOR;
  return ZERO_COLOR;
}

// Axis title for a selected measure (SDD-REG-003 label semantics).
export function axisLabel(measure) {
  return `Change in ${measure ?? ''}`;
}

// Symmetric-ish linear domain for a set of deltas: the data extent extended to
// include 0 (so the quadrant reference lines are always in view) and padded so
// edge points are not clipped (SDD-REG-015).
export function deltaDomain(values, pad = 0.08) {
  const nums = values.filter(Number.isFinite);
  if (!nums.length) return [-1, 1];
  let lo = Math.min(0, ...nums);
  let hi = Math.max(0, ...nums);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const margin = (hi - lo) * pad;
  return [lo - margin, hi + margin];
}

// Chart.js linear scales for both axes, titled by the selected measures and
// padded so no point sits on the frame (SDD-REG-015).
export function buildScales(measureX, measureY, xDomain, yDomain) {
  return {
    x: {
      type: 'linear',
      min: xDomain[0],
      max: xDomain[1],
      title: { display: true, text: axisLabel(measureX) },
      grid: { color: 'rgba(148, 163, 184, 0.25)' }
    },
    y: {
      type: 'linear',
      min: yDomain[0],
      max: yDomain[1],
      title: { display: true, text: axisLabel(measureY) },
      grid: { color: 'rgba(148, 163, 184, 0.25)' }
    }
  };
}
