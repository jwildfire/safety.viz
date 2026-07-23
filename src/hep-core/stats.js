// Small numeric helpers shared by the safety.viz hepatic tools
// (obot.roadmap#43, safety.viz#91), moved VERBATIM out of
// src/hep-explorer/structureData.js. Kept in hep-core so that the migration
// Sankey (Amirzadegan 2025 Fig 3) and the ALT waterfall (Fig 5) can summarize
// distributions without pulling in the eDISH data pipeline.
//
// Requirement groups: HEP-CORE-*.

export function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return NaN;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

// Linear-interpolated quantile (R-7 / d3.quantile), matching the other modules.
export function quantile(values, p) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return NaN;
  const sorted = [...nums].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(values) {
  return quantile(values, 0.5);
}

/**
 * Box-and-whisker summary of a numeric sample (HEP-CORE-009), in the exact shape
 * `drawBoxWhisker` in src/box-whisker.js consumes — `n`, `q5`, `q25`, `median`,
 * `q75`, `q95`, `mean` — plus `min`/`max` for labelling. Quantiles are R-7
 * interpolated, matching every other module. Non-numeric values are dropped; an
 * empty sample returns n 0 with NaN statistics, which the drawing code skips.
 * @param {Array<number|string>} values The sample.
 * @returns {{n: number, min: number, q5: number, q25: number, median: number, q75: number, q95: number, max: number, mean: number}}
 */
export function boxStats(values) {
  const sorted = (values || [])
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted.length ? sorted[0] : NaN,
    q5: quantile(sorted, 0.05),
    q25: quantile(sorted, 0.25),
    median: quantile(sorted, 0.5),
    q75: quantile(sorted, 0.75),
    q95: quantile(sorted, 0.95),
    max: sorted.length ? sorted[sorted.length - 1] : NaN,
    mean: mean(sorted)
  };
}
