// Presentation helpers for the ae-explorer module (#60): the group color
// scale, native-tooltip text builders, and the validation-mode summarized
// CSV — pure string/color logic; the DOM and SVG render in the module
// entry.

import { formatPercent } from './getScales.js';

/**
 * Group colors by column order, with the Total column always gray — the
 * original's colorScale (AE-CFG-006).
 * @param {string[]} groups The shown group keys.
 * @param {string[]} colors The configured palette.
 * @returns {Function} groupKey → color; 'Total' → '#777'.
 */
export function colorScale(groups, colors) {
  return (key) => {
    if (key === 'Total') return '#777';
    const index = groups.indexOf(key);
    return colors[index >= 0 ? index % colors.length : 0];
  };
}

/**
 * Group-cell hover text: numerator over denominator (AE-USER-010).
 * @param {Object} cell The {n, tot, per} cell.
 * @returns {string} 'n/tot'.
 */
export function cellTitle(cell) {
  return `${cell.n}/${cell.tot}`;
}

/**
 * Rate-dot hover text: the group and its percentage (AE-REG-016).
 * @param {string} group The group key.
 * @param {Object} cell The {n, tot, per} cell.
 * @returns {string} 'group: per%'.
 */
export function dotTitle(group, cell) {
  return `${group}: ${formatPercent(cell.per)}%`;
}

/**
 * Difference-mark hover text: the two groups compared — each with rate and
 * raw counts — and the difference between them (AE-USER-011).
 * @param {Object} diff An addDifferences entry ({group1, group2, diff}).
 * @param {Object} cells The category's per-group cells.
 * @returns {string} The comparison text.
 */
export function diffTitle(diff, cells) {
  const side = (group) =>
    `${group}: ${formatPercent(cells[group].per)}% (${cellTitle(cells[group])})`;
  return `${side(diff.group1)} vs ${side(diff.group2)} — difference ${formatPercent(diff.diff)}%`;
}

/**
 * The validation download's file name: the major and minor category columns
 * and the current summary basis (AE-REG-027).
 * @param {import('./configure.js').AEExplorerSettings} settings The synced settings.
 * @returns {string} 'major-minor-basis.csv'.
 */
export function csvName(settings) {
  return `${settings.major_col}-${settings.minor_col}-${settings.summarize_by}.csv`;
}

/**
 * The summarized data as CSV: one row per System Organ Class per group and
 * one per nested Preferred Term per group, as currently filtered and
 * summarized (AE-USER-020, AE-REG-030).
 * @param {Object[]} majors The crossTab majors being shown.
 * @param {string[]} groups The shown group keys.
 * @returns {string} The CSV text.
 */
export function summaryCsv(majors, groups) {
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = ['major,minor,group,n,total,percent'];
  const push = (majorKey, minorKey, cells) =>
    groups.forEach((group) =>
      lines.push(
        [
          quote(majorKey),
          quote(minorKey),
          quote(group),
          cells[group].n,
          cells[group].tot,
          cells[group].per
        ].join(',')
      )
    );
  majors.forEach((major) => {
    push(major.key, '', major.cells);
    major.minors.forEach((minor) => push(major.key, minor.key, minor.cells));
  });
  return lines.join('\n') + '\n';
}
