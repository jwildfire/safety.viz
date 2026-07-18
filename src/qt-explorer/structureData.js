// Data preparation + statistics for the qt-explorer module (#68): cleaning,
// baseline/change derivation, per-arm central-tendency change series (Δ and the
// placebo-corrected ΔΔ) with a two-sided CI, the ICH-E14 metric, per-subject
// post-baseline extremes, and the by-arm threshold-exceedance classification.
// Pure and unit-testable; the entrypoint stages the results and the plugins draw
// them. The percentile/mean/sd statistics copy the results-over-time module's
// R-7 (d3.quantile) helpers so the central-tendency summaries match the rest of
// the library. Requirement IDs use the condensed QT-* scheme.

import { zForCi, resolvePlaceboArm } from './configure.js';

/**
 * Distinct, non-empty values in first-seen order.
 * @param {Array} values Values to dedupe.
 * @returns {Array} The distinct values.
 */
export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

/**
 * The arithmetic mean of a numeric sample.
 * @param {number[]} values Numeric sample.
 * @returns {number} The mean, or NaN for an empty sample.
 */
export function mean(values) {
  if (!values.length) return Number.NaN;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * The sample (n-1) standard deviation, matching d3.deviation — NaN for samples
 * smaller than two.
 * @param {number[]} values Numeric sample.
 * @returns {number} The standard deviation, or NaN when n < 2.
 */
export function sd(values) {
  if (values.length < 2) return Number.NaN;
  const m = mean(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + Math.pow(value - m, 2), 0) / (values.length - 1)
  );
}

/**
 * The p-quantile of a numeric sample by the R-7 rule (d3.quantile).
 * @param {number[]} values Numeric sample (need not be sorted).
 * @param {number} p Probability in [0, 1].
 * @returns {number} The interpolated quantile, or NaN for an empty sample.
 */
export function quantile(values, p) {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * The median of a numeric sample.
 * @param {number[]} values Numeric sample.
 * @returns {number} The median, or NaN for an empty sample.
 */
export function median(values) {
  return quantile(values, 0.5);
}

const isFiniteNum = (v) => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));

/**
 * Clean the raw records to the analysis rows the views read (QT-DATA-003/004):
 * drops rows whose value is missing or non-numeric, and stages the numeric
 * value, the baseline, the change (the source change column when finite, else
 * value − baseline), the arm, the visit, and a post-baseline flag. A row is
 * post-baseline when it is not the baseline record: by the baseline_flag_col
 * ('Y') when that column is present in the data, otherwise by a zero change (the
 * fallback used only when no baseline-flag column is present). Derived fields
 * carry the `__qt_` prefix.
 * @param {Object[]} data Raw long-format records.
 * @param {QtExplorerSettings} settings Column mappings.
 * @returns {{rows: Object[], removed: number}} The staged rows and the removed count.
 */
export function cleanData(data, settings) {
  const source = Array.isArray(data) ? data : [];
  // Decide once whether the configured baseline-flag column is actually present
  // in the data (the "in at least one row" idiom checkInputs uses). When it is,
  // the flag is authoritative and a missing/blank per-row flag means "not the
  // baseline record" (post-baseline); the change===0 heuristic is only a fallback
  // for data that carries no baseline-flag column at all — otherwise a genuine
  // post-baseline reading that happens to return exactly to baseline (change 0)
  // would be wrongly dropped from the exceedance denominators (QT-DATA-005).
  const hasFlagCol =
    !!settings.baseline_flag_col &&
    source.some((row) => row[settings.baseline_flag_col] !== undefined);
  const rows = [];
  let removed = 0;
  for (const row of source) {
    const rawValue = row[settings.value_col];
    if (!isFiniteNum(rawValue)) {
      removed += 1;
      continue;
    }
    const value = Number(rawValue);
    const baselineRaw = row[settings.baseline_col];
    const baseline = isFiniteNum(baselineRaw) ? Number(baselineRaw) : Number.NaN;
    const changeRaw = settings.change_col ? row[settings.change_col] : undefined;
    const change = isFiniteNum(changeRaw)
      ? Number(changeRaw)
      : Number.isFinite(baseline)
        ? value - baseline
        : Number.NaN;
    const flag = hasFlagCol ? row[settings.baseline_flag_col] : undefined;
    const isBaseline = hasFlagCol
      ? flag === 'Y' || flag === 'y'
      : Number.isFinite(change) && change === 0;
    rows.push({
      ...row,
      __qt_measure: row[settings.measure_col],
      __qt_value: value,
      __qt_baseline: baseline,
      __qt_change: change,
      __qt_arm: row[settings.arm_col],
      __qt_visit: row[settings.visit_col],
      __qt_postBaseline: !isBaseline
    });
  }
  return { rows, removed };
}

/**
 * Rows whose measure column matches the given measure name.
 * @param {Object[]} rows Cleaned rows.
 * @param {string} measure The measure name to select.
 * @returns {Object[]} The matching rows.
 */
export function forMeasure(rows, measure) {
  return rows.filter((row) => row.__qt_measure === measure);
}

/**
 * Distinct measure names present in the cleaned data, in first-seen order.
 * @param {Object[]} rows Cleaned rows.
 * @returns {string[]} The measures.
 */
export function measuresPresent(rows) {
  return unique(rows.map((row) => row.__qt_measure));
}

/**
 * Distinct arms present, ordered with the placebo arm first (so it takes a
 * stable color and reads as the reference), then the remaining arms sorted.
 * @param {Object[]} rows Cleaned rows.
 * @param {?string} placeboArm The resolved placebo arm, if any.
 * @returns {string[]} The ordered arms.
 */
export function armsPresent(rows, placeboArm) {
  const arms = unique(rows.map((row) => row.__qt_arm)).map(String);
  const rest = arms.filter((arm) => arm !== placeboArm).sort();
  return placeboArm && arms.includes(placeboArm) ? [placeboArm, ...rest] : rest;
}

/**
 * Distinct visits ordered by the numeric visit column when present, else in
 * first-seen order.
 * @param {Object[]} rows Cleaned rows.
 * @param {QtExplorerSettings} settings Column mappings.
 * @returns {string[]} The ordered visit labels.
 */
export function orderVisits(rows, settings) {
  const seen = new Map();
  for (const row of rows) {
    const visit = row.__qt_visit;
    if (visit === undefined || visit === null || visit === '') continue;
    if (!seen.has(visit)) {
      const n = settings.visitn_col ? Number(row[settings.visitn_col]) : Number.NaN;
      seen.set(visit, Number.isFinite(n) ? n : Number.POSITIVE_INFINITY);
    }
  }
  return [...seen.keys()].sort((a, b) => {
    const na = seen.get(a);
    const nb = seen.get(b);
    if (na === nb) return String(a).localeCompare(String(b));
    return na - nb;
  });
}

/**
 * Apply the active categorical filter selections to rows (QT-CTRL-003). A filter
 * value of '' / undefined ("All") does not constrain.
 * @param {Object[]} rows Cleaned rows.
 * @param {Object<string,string>} filterState Map of filter column -> selected value.
 * @returns {Object[]} The rows passing every active filter.
 */
export function applyFilters(rows, filterState) {
  const active = Object.entries(filterState || {}).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );
  if (!active.length) return rows;
  return rows.filter((row) => active.every(([col, value]) => String(row[col]) === String(value)));
}

/**
 * Per-arm per-visit summary of the change-from-baseline for one measure, in Δ
 * (change) or ΔΔ (placebo-corrected) mode (QT-CT-001/004/005). Each visit's
 * per-arm sample is the change values of the subjects with a reading at that
 * visit; the point value is the mean or median. In mean mode a two-sided CI is
 * attached (value ± z·SE, SE = sd/√n). In ΔΔ mode the point is meanΔ(arm) −
 * meanΔ(placebo) with SE = √(SE_arm² + SE_placebo²); the placebo arm is dropped
 * (it is the reference ≡ 0) and median mode carries no CI. The CI is a
 * large-sample normal approximation intended for exploratory screening, not the
 * regulatory ANCOVA/MMRM bound.
 * @param {Object[]} measureRows Cleaned rows already filtered to one measure.
 * @param {Object} options Options.
 * @param {'mean'|'median'} options.statistic The central-tendency statistic.
 * @param {'delta'|'deltadelta'} options.mode The display mode.
 * @param {string[]} options.arms Ordered arms.
 * @param {string[]} options.visitOrder Ordered visits.
 * @param {?string} options.placeboArm The placebo arm (required for ΔΔ).
 * @param {number} [options.ciLevel=0.9] Confidence level for the CI.
 * @returns {{mode:string, statistic:string, visitOrder:string[], placeboArm:?string, series:Array}}
 */
export function centralTendencySeries(measureRows, options) {
  const {
    statistic = 'mean',
    mode = 'delta',
    arms = [],
    visitOrder = [],
    placeboArm = null
  } = options;
  const z = zForCi(options.ciLevel);

  // visit -> arm -> { values, mean, sd, n, se, median }
  const cells = new Map();
  for (const visit of visitOrder) cells.set(visit, new Map());
  for (const row of measureRows) {
    if (!Number.isFinite(row.__qt_change)) continue;
    const visit = row.__qt_visit;
    if (!cells.has(visit)) continue;
    const armMap = cells.get(visit);
    const arm = String(row.__qt_arm);
    if (!armMap.has(arm)) armMap.set(arm, []);
    armMap.get(arm).push(row.__qt_change);
  }
  const stat = (visit, arm) => {
    const values = (cells.get(visit) || new Map()).get(arm) || [];
    if (!values.length) return null;
    const n = values.length;
    const m = mean(values);
    const s = sd(values);
    const se = Number.isFinite(s) ? s / Math.sqrt(n) : Number.NaN;
    return { n, mean: m, median: median(values), sd: s, se };
  };

  const armsForSeries = mode === 'deltadelta' ? arms.filter((arm) => arm !== placeboArm) : arms;
  const series = armsForSeries.map((arm) => {
    const points = [];
    for (const visit of visitOrder) {
      const cell = stat(visit, arm);
      if (!cell) continue;
      if (mode === 'deltadelta') {
        const pbo = stat(visit, placeboArm);
        if (!pbo) continue;
        const value = statistic === 'median' ? cell.median - pbo.median : cell.mean - pbo.mean;
        const seDiff = Math.sqrt(cell.se * cell.se + pbo.se * pbo.se);
        const ci =
          statistic === 'mean' && Number.isFinite(seDiff)
            ? { lo: value - z * seDiff, hi: value + z * seDiff }
            : { lo: Number.NaN, hi: Number.NaN };
        points.push({ visit, value, n: cell.n, lo: ci.lo, hi: ci.hi });
      } else {
        const value = statistic === 'median' ? cell.median : cell.mean;
        const ci =
          statistic === 'mean' && Number.isFinite(cell.se)
            ? { lo: value - z * cell.se, hi: value + z * cell.se }
            : { lo: Number.NaN, hi: Number.NaN };
        points.push({ visit, value, n: cell.n, lo: ci.lo, hi: ci.hi });
      }
    }
    return { arm, points };
  });

  return { mode, statistic, visitOrder, placeboArm, series };
}

/**
 * The ICH-E14 exploratory metric (QT-CT-005): for each arm's ΔΔ series, the
 * largest upper bound of the two-sided CI for the mean difference across visits,
 * flagged against the reference threshold. Only meaningful in mean + ΔΔ mode; for
 * other combinations returns an empty list.
 * @param {{mode:string, statistic:string, series:Array}} tendency The centralTendencySeries result.
 * @param {number} referenceThreshold The reference threshold (msec), e.g. 10.
 * @returns {Array<{arm:string, maxUpper:number, visit:?string, exceeds:boolean}>}
 */
export function ichE14Metric(tendency, referenceThreshold) {
  if (!tendency || tendency.mode !== 'deltadelta' || tendency.statistic !== 'mean') return [];
  return tendency.series.map(({ arm, points }) => {
    let maxUpper = Number.NEGATIVE_INFINITY;
    let visit = null;
    for (const point of points) {
      if (Number.isFinite(point.hi) && point.hi > maxUpper) {
        maxUpper = point.hi;
        visit = point.visit;
      }
    }
    const has = Number.isFinite(maxUpper);
    return {
      arm,
      maxUpper: has ? maxUpper : Number.NaN,
      visit,
      exceeds: has && maxUpper >= referenceThreshold
    };
  });
}

/**
 * The peak-effect visit per arm (QT-CT-006): the visit at which the arm's plotted
 * statistic reaches its maximum. Replaces the PK "Tmax" term; the peak is taken
 * over the ΔΔ series in ΔΔ mode.
 * @param {{series:Array}} tendency The centralTendencySeries result.
 * @returns {Map<string,{visit:string, value:number}>} arm -> peak point.
 */
export function peakVisits(tendency) {
  const peaks = new Map();
  if (!tendency) return peaks;
  for (const { arm, points } of tendency.series) {
    let best = null;
    for (const point of points) {
      if (!Number.isFinite(point.value)) continue;
      if (!best || point.value > best.value) best = { visit: point.visit, value: point.value };
    }
    if (best) peaks.set(arm, best);
  }
  return peaks;
}

/**
 * The per-subject scatter point for one measure at a timepoint (QT-OUT-001/002).
 * For the "maximum post-baseline" sentinel each subject's point is the
 * post-baseline row with the greatest absolute value (aligning with the absolute
 * cut-line diagonals); for a specific visit it is that visit's row. Subjects with
 * no qualifying reading are omitted.
 * @param {Object[]} measureRows Cleaned rows filtered to one measure.
 * @param {Object} options Options.
 * @param {string} options.timepoint A visit label, or the TIMEPOINT_MAX sentinel.
 * @param {string} options.idCol The id column.
 * @returns {Array<{id:string, arm:string, baseline:number, value:number, change:number, visit:string}>}
 */
export function subjectPoints(measureRows, options) {
  const { timepoint, idCol } = options;
  const bySubject = new Map();
  for (const row of measureRows) {
    const id = row[idCol];
    if (timepoint === '__qt_max') {
      if (!row.__qt_postBaseline) continue;
      const current = bySubject.get(id);
      if (!current || row.__qt_value > current.__qt_value) bySubject.set(id, row);
    } else if (String(row.__qt_visit) === String(timepoint)) {
      bySubject.set(id, row);
    }
  }
  const points = [];
  for (const [id, row] of bySubject) {
    if (!Number.isFinite(row.__qt_baseline) || !Number.isFinite(row.__qt_change)) continue;
    points.push({
      id: String(id),
      arm: String(row.__qt_arm),
      baseline: row.__qt_baseline,
      value: row.__qt_value,
      change: row.__qt_change,
      visit: row.__qt_visit
    });
  }
  return points;
}

/**
 * Per-subject worst post-baseline extremes for one measure: the maximum absolute
 * value and the maximum change, computed independently (QT-CAT-001). A subject's
 * peak value and peak change can fall at different visits, so they are tracked
 * separately — this is why the categorical table, not the single-point scatter,
 * is authoritative for change-threshold exceedance.
 * @param {Object[]} measureRows Cleaned rows filtered to one measure.
 * @param {string} idCol The id column.
 * @returns {Map<string,{arm:string, maxValue:number, maxChange:number}>}
 */
export function subjectExtremes(measureRows, idCol) {
  const extremes = new Map();
  for (const row of measureRows) {
    if (!row.__qt_postBaseline) continue;
    const id = row[idCol];
    const entry = extremes.get(id) || {
      arm: String(row.__qt_arm),
      maxValue: Number.NEGATIVE_INFINITY,
      maxChange: Number.NEGATIVE_INFINITY
    };
    if (Number.isFinite(row.__qt_value)) entry.maxValue = Math.max(entry.maxValue, row.__qt_value);
    if (Number.isFinite(row.__qt_change))
      entry.maxChange = Math.max(entry.maxChange, row.__qt_change);
    extremes.set(id, entry);
  }
  return extremes;
}

/**
 * The by-arm threshold-exceedance classification for the categorical table
 * (QT-CAT-002/003; workflow steps 3a/3b): the count and percent of subjects per
 * arm whose maximum post-baseline absolute QTc exceeds each absolute threshold,
 * and whose maximum post-baseline change exceeds each change threshold. The
 * denominator is the subjects per arm with at least one post-baseline reading.
 * Comparisons are strictly-greater-than, matching the workflow's ">450"/">30" wording.
 * @param {Object[]} measureRows Cleaned rows filtered to one measure.
 * @param {Object} options Options.
 * @param {string} options.idCol The id column.
 * @param {string[]} options.arms Ordered arms.
 * @param {number[]} options.absoluteThresholds Absolute thresholds (msec).
 * @param {number[]} options.changeThresholds Change thresholds (msec).
 * @returns {{arms:string[], denominators:Object, rows:Array}}
 */
export function classifyThresholds(measureRows, options) {
  const { idCol, arms, absoluteThresholds = [], changeThresholds = [] } = options;
  const extremes = subjectExtremes(measureRows, idCol);
  const denominators = {};
  arms.forEach((arm) => {
    denominators[arm] = 0;
  });
  let allDenom = 0;
  for (const entry of extremes.values()) {
    if (denominators[entry.arm] === undefined) denominators[entry.arm] = 0;
    denominators[entry.arm] += 1;
    allDenom += 1;
  }
  const buildRow = (kind, threshold, pick) => {
    const byArm = {};
    let allCount = 0;
    arms.forEach((arm) => {
      byArm[arm] = 0;
    });
    for (const entry of extremes.values()) {
      if (pick(entry) > threshold) {
        if (byArm[entry.arm] === undefined) byArm[entry.arm] = 0;
        byArm[entry.arm] += 1;
        allCount += 1;
      }
    }
    const cells = {};
    arms.forEach((arm) => {
      const denom = denominators[arm] || 0;
      cells[arm] = { count: byArm[arm], denom, percent: denom ? (byArm[arm] / denom) * 100 : 0 };
    });
    cells.All = {
      count: allCount,
      denom: allDenom,
      percent: allDenom ? (allCount / allDenom) * 100 : 0
    };
    return {
      kind,
      threshold,
      label: kind === 'absolute' ? `> ${threshold} ms` : `Δ > ${threshold} ms`,
      cells
    };
  };
  const rows = [
    ...absoluteThresholds.map((t) => buildRow('absolute', t, (e) => e.maxValue)),
    ...changeThresholds.map((t) => buildRow('change', t, (e) => e.maxChange))
  ];
  return { arms, denominators, allDenom, rows };
}

/**
 * Resolve the placebo arm for the current data (delegates to configure).
 * @param {Object[]} rows Cleaned rows.
 * @param {?string} placeboSetting The settings.placebo_arm override.
 * @returns {?string} The placebo arm, or null.
 */
export function placeboArmFor(rows, placeboSetting) {
  return resolvePlaceboArm(unique(rows.map((row) => String(row.__qt_arm))), placeboSetting);
}
