// Axis domains, titles and number formatting for the nep-explorer KDIGO
// creatinine scatter (#120). Kept pure for unit testing. Requirement group:
// NEP-ZONE-005 (the axis floors), with NEP-UNIT-003's native-unit y-title.

/**
 * Format a number to a fixed precision, trimming trailing zeroes; '' for a
 * non-finite value.
 * @param {number} value The value to format.
 * @param {number} [digits=2] Maximum decimal places.
 * @returns {string} The formatted number, or '' when not finite.
 */
export function formatNumber(value, digits = 2) {
  if (!Number.isFinite(value)) return '';
  return Number(value.toFixed(digits)).toString();
}

/**
 * The fold-change axis title. The axis is a ratio, so it is unit-free and stays
 * valid even when the module cannot resolve the unit (design §4).
 * @param {string} measure The creatinine measure's display name.
 * @returns {string} The axis title.
 */
export function foldAxisLabel(measure) {
  return `Maximum fold change in ${measure} (× baseline)`;
}

/**
 * The absolute-change axis title, in whichever unit the values are actually in
 * — the target unit when every record resolved, the native unit when the module
 * refused to guess (NEP-UNIT-003).
 * @param {string} measure The creatinine measure's display name.
 * @param {string} unit The unit the deltas are expressed in.
 * @returns {string} The axis title.
 */
export function deltaAxisLabel(measure, unit) {
  return `Maximum absolute change in ${measure} (${unit})`;
}

/**
 * The fold-change domain (NEP-ZONE-005): always from 0 and always past the last
 * cut-point, so all three fold zones are on screen even for a study where
 * nothing happened.
 *
 * That floor is the R chart's and worth keeping: it makes an all-Stage-0 study
 * read as "nothing here" rather than "nothing plotted" — which matters, because
 * an all-Stage-0 study is what the pharmaverseadam demo was before the AKI
 * cohort landed.
 * @param {number[]} values The plotted fold changes.
 * @param {number[]} cuts The fold ladder.
 * @returns {number[]} The [min, max] domain.
 */
export function foldDomain(values, cuts) {
  const nums = (values || []).filter(Number.isFinite);
  // Half a fold past the Stage-3 cut — 3.5× under the KDIGO default — so the
  // last zone is a band a reader can see into, not a sliver at the frame.
  const floor = cuts[cuts.length - 1] + 0.5;
  const observed = nums.length ? Math.max(...nums) * 1.05 : 0;
  return [0, Math.max(floor, observed)];
}

/**
 * The absolute-change domain (NEP-ZONE-005, D6): always covering zero and the
 * Stage-1 trigger, and extended BELOW zero when the data goes there.
 *
 * The source starts this axis at zero, so a participant whose creatinine only
 * ever fell is dropped by ggplot rather than drawn at the floor — 21 of 110 in
 * the RhoInc data. They are the reference cloud that makes the flagged corner
 * readable, so the domain follows the data down.
 * @param {number[]} values The plotted absolute changes.
 * @param {number} trigger The Stage-1 cut-point.
 * @returns {number[]} The [min, max] domain.
 */
export function deltaDomain(values, trigger) {
  const nums = (values || []).filter(Number.isFinite);
  const lo = Math.min(0, ...nums);
  const hi = Math.max(trigger * 1.35, ...nums);
  const pad = (hi - lo) * 0.08 || 0.05;
  return [lo - pad, hi + pad];
}

/**
 * Merge the staging cut-points into a Chart.js tick list, so the numbers a
 * reviewer is reading against are labelled on the axis itself rather than
 * inferred from the zone edges. Cut-points outside the current domain are not
 * re-added.
 * @private
 */
function withCutTicks(cuts, domain, format) {
  return (axis) => {
    const present = new Set(axis.ticks.map((tick) => tick.value));
    cuts.forEach((cut) => {
      if (cut < domain[0] || cut > domain[1] || present.has(cut)) return;
      axis.ticks.push({ value: cut, label: format(cut), major: true });
    });
    axis.ticks.sort((a, b) => a.value - b.value);
  };
}

/**
 * Chart.js linear scales for both axes, titled and tick-labelled at the stage
 * cut-points (NEP-ZONE-005).
 * @param {Object} config Axis configuration.
 * @param {number[]} config.foldDomain The x [min, max].
 * @param {number[]} config.deltaDomain The y [min, max].
 * @param {number[]} config.cuts The fold ladder.
 * @param {number} config.deltaTrigger The absolute-change Stage-1 cut-point.
 * @param {string} config.measure The measure's display name.
 * @param {string} config.unit The unit the deltas are in.
 * @returns {{x: Object, y: Object}} The Chart.js scale configs.
 */
export function buildScales({
  foldDomain: xDomain,
  deltaDomain: yDomain,
  cuts,
  deltaTrigger,
  measure,
  unit
}) {
  return {
    x: {
      type: 'linear',
      min: xDomain[0],
      max: xDomain[1],
      title: { display: true, text: foldAxisLabel(measure) },
      grid: { color: 'rgba(148, 163, 184, 0.25)' },
      afterBuildTicks: withCutTicks(cuts, xDomain, (cut) => `${formatNumber(cut)}×`)
    },
    y: {
      type: 'linear',
      min: yDomain[0],
      max: yDomain[1],
      title: { display: true, text: deltaAxisLabel(measure, unit) },
      grid: { color: 'rgba(148, 163, 184, 0.25)' },
      afterBuildTicks: withCutTicks(
        [deltaTrigger],
        yDomain,
        (cut) => `${formatNumber(cut)} ${unit}`
      )
    }
  };
}
