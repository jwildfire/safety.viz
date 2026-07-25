// Three of the v1.2 follow-ups carried from the upstream backlog
// (safety.viz#55, obot.roadmap#88): what the Display Type control may offer,
// how the colour-by legend is ordered, and what happens to the palette once
// there are more groups than colours.
//
// Each is small on its own; they share a file because each answers the same
// kind of question — what the chart should offer given the data it was handed,
// rather than what its defaults assume.
//
// The palette half of this batch (HEP-CTRL-016) lives in getPlugins.js beside
// GROUP_COLORS, where the palette it extends already is.
//
// Requirement groups: HEP-DISPLAY-006, HEP-CTRL-015.

/**
 * Which display modes the cleaned data can actually support (HEP-DISPLAY-006,
 * upstream #248).
 *
 * The eDISH view divides by the upper limit of normal and the mDISH view by the
 * participant's own baseline; a dataset carrying neither cannot be plotted
 * either way, and offering a mode that will draw an empty plot is worse than
 * not offering it. One usable record is enough to keep a mode: the control says
 * what the data CAN do, and the per-participant drop counts already say how
 * much of it does.
 * @param {Object[]} rows The cleaned rows, after deriveBaseline.
 * @returns {{modes: string[], note: string}} The supportable modes in menu order, and the sentence explaining any that were withdrawn.
 */
export function availableDisplays(rows) {
  const records = rows || [];
  const hasUln = records.some((row) => Number.isFinite(row.__hep_uln) && row.__hep_uln > 0);
  const hasBaseline = records.some(
    (row) => Number.isFinite(row.__hep_baseline) && row.__hep_baseline !== 0
  );
  const modes = [];
  if (hasUln) modes.push('relative_uln');
  if (hasBaseline) modes.push('relative_baseline');

  if (!hasUln && !hasBaseline) {
    return {
      modes,
      note: 'This data carries neither a usable reference range nor a derivable baseline, so neither the reference-range-adjusted (eDISH) nor the baseline-adjusted (mDISH) view can be drawn.'
    };
  }
  if (!hasBaseline) {
    return {
      modes,
      note: 'No participant has a derivable baseline, so the baseline-adjusted (mDISH) view is not offered.'
    };
  }
  if (!hasUln) {
    return {
      modes,
      note: 'No record carries a usable upper limit of normal, so the reference-range-adjusted (eDISH) view is not offered.'
    };
  }
  return { modes, note: '' };
}

/**
 * Order the colour-by groups (HEP-CTRL-015, upstream #111). Alphabetical order
 * puts "High dose" before "Low dose" before "Placebo", which is neither the
 * clinical order nor any order at all; a numeric companion column — TRTN beside
 * TRT is the usual pairing — puts the arms in the order the protocol means.
 *
 * Groups whose companion value is absent or non-numeric sort after those that
 * have one, alphabetically among themselves, rather than at an arbitrary point.
 * @param {Array<string>} groupValues The distinct group values.
 * @param {Object[]} points The plotted points, whose `raw` carries the companion column.
 * @param {?string} orderCol The numeric companion column, or null for alphabetical.
 * @returns {string[]} The group values in legend order.
 */
export function groupOrder(groupValues, points, orderCol) {
  const values = [...(groupValues || [])].map(String).sort();
  if (!orderCol) return values;
  const rank = new Map();
  (points || []).forEach((point) => {
    const key = String(point.group);
    if (rank.has(key)) return;
    const raw = point.raw ? point.raw[orderCol] : undefined;
    const value = Number(raw);
    if (raw !== undefined && raw !== '' && Number.isFinite(value)) rank.set(key, value);
  });
  return values.sort((a, b) => {
    const rankA = rank.has(a) ? rank.get(a) : Infinity;
    const rankB = rank.has(b) ? rank.get(b) : Infinity;
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });
}
