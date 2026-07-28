// Data preparation for the nep-explorer KDIGO creatinine scatter (#120):
// cleaning, per-record unit resolution, baseline identification, the
// per-participant reduction, and the stage summary. Kept as pure functions so
// the staging is unit-testable against hand-computed fixtures, which is the
// point — the R source this ports gets its own staging wrong, and the only way
// to be sure this one does not is to compute it against numbers by hand.
//
// Requirement groups: NEP-DATA-* (baseline, maxima, dropped records),
// NEP-UNIT-002/003 (conversion and the refuse-to-guess path), NEP-STAGE-*
// (the ladders and the >= 4.0 mg/dL rule), NEP-TBL-* (the summary).

import { normalizeUnit } from './configure.js';

/** The one internal column the dropped-row export keeps, because it is the answer. */
export const DROP_REASON_COLUMN = '__nep_dropReason';

const REASON_NON_NUMERIC = 'Missing or non-numeric creatinine result';
const REASON_NO_USABLE = 'No usable creatinine result';
const REASON_NO_POST_BASELINE = 'No post-baseline creatinine record';
const REASON_MIXED_UNITS = 'Records use more than one unit and cannot be compared';

/** Distinct, non-empty values in first-seen order. */
export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

/**
 * The KDIGO fold-change stage for a ratio (NEP-STAGE-001), read WORST-FIRST.
 *
 * The reading order is the whole point. The R source stages absolute change
 * with a `case_when` whose arms ascend — `> .3 ~ "Stage 1"`, `> 1.5 ~ "Stage
 * 2"`, `> 2.5 ~ "Stage 3"` — and `case_when` returns the first match, so its
 * Stage 2 and Stage 3 arms are unreachable and every value above the lowest cut
 * is labelled Stage 1. Its own chart paints the same three numbers descending,
 * which is why the shipped app plots a participant in the orange Stage-2 zone
 * and labels them "Stage 1" in the table beside it (design §3.2).
 * @param {number} fold value / baseline.
 * @param {number[]} cuts The ascending three-cut ladder.
 * @returns {?number} 0-3, or null when the fold change is not computable.
 */
export function foldStage(fold, cuts) {
  if (!Number.isFinite(fold)) return null;
  const [one, two, three] = cuts;
  if (fold >= three) return 3;
  if (fold >= two) return 2;
  if (fold >= one) return 1;
  return 0;
}

/**
 * The KDIGO absolute-change stage (NEP-STAGE-002). The change axis carries
 * exactly ONE KDIGO cut-point — 0.3 mg/dL — and it only ever produces Stage 1;
 * there is no KDIGO Stage 2 or Stage 3 defined on absolute change.
 * @param {?number} delta The maximum absolute change, in the target unit.
 * @param {number} trigger The Stage-1 cut-point.
 * @returns {?number} 0, 1, or null when the unit is unknown and no absolute claim can be made.
 */
export function deltaStage(delta, trigger) {
  if (delta === null || !Number.isFinite(delta)) return null;
  return delta >= trigger ? 1 : 0;
}

/**
 * The stage the zones show: the worse of the two axes, raised to 3 by the
 * absolute-value rule (NEP-STAGE-003, NEP-STAGE-004). A suppressed delta stage
 * cannot lower the fold stage.
 * @param {?number} fold The fold stage.
 * @param {?number} delta The delta stage.
 * @param {boolean} absoluteRule Whether the maximum reached the absolute cut-point.
 * @returns {?number} The combined stage.
 */
export function combinedStage(fold, delta, absoluteRule) {
  if (absoluteRule) return 3;
  const stages = [fold, delta].filter((stage) => stage !== null && stage !== undefined);
  if (!stages.length) return null;
  return Math.max(...stages);
}

/**
 * Resolve one record's unit against the factor table (NEP-UNIT-002).
 * @param {*} raw The raw unit value.
 * @param {Object} units The normalized units setting.
 * @returns {{key: string, factor: ?number}} The normalized key and its multiplier, or null when unrecognized.
 */
export function resolveUnit(raw, units) {
  const key = normalizeUnit(raw);
  const factor =
    key && Object.prototype.hasOwnProperty.call(units.factors, key) ? units.factors[key] : null;
  return { key, factor };
}

/**
 * The participant's baseline record (NEP-DATA-001, NEP-DATA-002, D7).
 *
 * An explicit `baseline_col` / `baseline_value` pair wins when it resolves —
 * the vocabulary hep-explorer already ships, so reviewers meet one spelling.
 * Otherwise, and for a participant whose flag matches nothing, the earliest
 * record is used: study day first, then visit number, then input order.
 *
 * The source takes `value[1L]` after `arrange(desc(baseline_flag))`, which works
 * because "Y" sorts before "N" but silently picks an arbitrary record when a
 * participant has two flagged rows, and depends on the flag's coding. This
 * takes the first flagged record explicitly and reports when it fell back, so
 * the number of participants resolved by heuristic is visible rather than
 * assumed.
 * @param {Object[]} records The participant's records.
 * @param {Object} settings Normalized settings.
 * @returns {?{record: Object, fallback: boolean}} The baseline record and whether the fallback resolved it.
 */
export function resolveBaseline(records, settings) {
  if (!records || !records.length) return null;
  if (settings.baseline_col) {
    const flagged = records.find(
      (row) => String(row[settings.baseline_col]) === String(settings.baseline_value ?? 'Y')
    );
    if (flagged) return { record: flagged, fallback: false };
  }
  const key = (row, column) => {
    if (!column) return null;
    const value = Number(row[column]);
    return Number.isFinite(value) ? value : null;
  };
  const ordered = records
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const days = [key(a.row, settings.studyday_col), key(b.row, settings.studyday_col)];
      if (days[0] !== null && days[1] !== null && days[0] !== days[1]) return days[0] - days[1];
      const visits = [key(a.row, settings.visitn_col), key(b.row, settings.visitn_col)];
      if (visits[0] !== null && visits[1] !== null && visits[0] !== visits[1])
        return visits[0] - visits[1];
      return a.index - b.index;
    });
  return { record: ordered[0].row, fallback: true };
}

/**
 * Keep the creatinine records, coerce their results, and separate the rows that
 * cannot be used (NEP-DATA-005). Dropped rows carry their reason and their own
 * source columns, so the export answers "which data left, and why" rather than
 * only "how much".
 * @param {Object[]} rawData The raw records.
 * @param {Object} settings Normalized settings.
 * @returns {{rows: Object[], droppedRows: Object[]}} The usable creatinine rows and the dropped ones.
 */
export function cleanData(rawData, settings) {
  const measure = settings.measure_values && settings.measure_values.CREAT;
  const rows = [];
  const droppedRows = [];
  (Array.isArray(rawData) ? rawData : []).forEach((row, index) => {
    if (String(row[settings.measure_col]) !== String(measure)) return;
    const raw = row[settings.value_col];
    const value = Number(raw);
    if (raw === '' || raw === null || raw === undefined || !Number.isFinite(value)) {
      droppedRows.push({ ...row, [DROP_REASON_COLUMN]: REASON_NON_NUMERIC });
      return;
    }
    const unit = resolveUnit(settings.unit_col ? row[settings.unit_col] : null, settings.units);
    rows.push({
      ...row,
      __nep_index: index,
      __nep_raw: value,
      __nep_unitKey: unit.key,
      __nep_factor: unit.factor
    });
  });
  return { rows, droppedRows };
}

/**
 * Reduce the cleaned rows to one staged point per participant.
 *
 * The unit mode is decided FIRST, over the whole kept set, because suppression
 * is a display decision: an axis cannot be labelled mg/dL for some points and
 * not others. Inside the resolved mode conversion is strictly per record, so a
 * participant whose records mix mg/dL and µmol/L stages correctly — mixed units
 * within one measure are not hypothetical, the demo BDS file carries bilirubin
 * in both (design §4).
 * @param {Object[]} rows Cleaned creatinine rows.
 * @param {Object} settings Normalized settings.
 * @returns {Object} The points, the drops, the unit mode, and the fallback count.
 */
export function buildParticipants(rows, settings) {
  const unitsResolved = rows.every((row) => row.__nep_factor !== null);
  const nativeUnit = unitsResolved
    ? settings.units.target
    : unique(
        rows
          .filter((row) => row.__nep_factor === null)
          .map((row) => (settings.unit_col ? row[settings.unit_col] : ''))
      )[0] || '(unit not recorded)';

  const byId = new Map();
  rows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });

  const metaCols = unique([
    ...settings.filters.map((filter) => filter.value_col),
    ...settings.details.map((detail) => detail.value_col),
    settings.arm_col,
    settings.id_col
  ]);

  const points = [];
  const droppedParticipants = [];
  let baselineFallbacks = 0;

  byId.forEach((participantRows, id) => {
    // In the suppressed mode nothing converts, so a participant whose own
    // records disagree has no computable fold change. Guessing which unit was
    // meant is exactly what design §4 refuses to do.
    if (!unitsResolved && unique(participantRows.map((row) => row.__nep_unitKey)).length > 1) {
      droppedParticipants.push({ id, reason: REASON_MIXED_UNITS });
      return;
    }
    const valueOf = (row) => (unitsResolved ? row.__nep_raw * row.__nep_factor : row.__nep_raw);
    const resolved = resolveBaseline(participantRows, settings);
    if (!resolved) {
      droppedParticipants.push({ id, reason: REASON_NO_USABLE });
      return;
    }
    const baselineRow = resolved.record;
    const baseline = valueOf(baselineRow);
    const post = participantRows.filter((row) => row !== baselineRow);
    if (!post.length) {
      droppedParticipants.push({ id, reason: REASON_NO_POST_BASELINE });
      return;
    }
    // Counted only for participants who make it onto the plot: the note sits
    // beside the plotted-participant count, so it has to describe the same
    // population.
    if (resolved.fallback) baselineFallbacks += 1;
    let maxRow = post[0];
    post.forEach((row) => {
      if (valueOf(row) > valueOf(maxRow)) maxRow = row;
    });
    const max = valueOf(maxRow);
    const fold = baseline > 0 ? max / baseline : NaN;
    // The delta is always plotted, so the cloud keeps its shape; in the
    // suppressed mode it is simply in the native unit and carries no staging.
    const delta = max - baseline;
    const absoluteRule = unitsResolved && max >= settings.stages.absolute;
    const fStage = foldStage(fold, settings.stages.fold);
    const dStage = unitsResolved ? deltaStage(delta, settings.stages.delta) : null;
    const day = settings.studyday_col ? Number(maxRow[settings.studyday_col]) : NaN;
    const meta = {};
    metaCols.forEach((col) => {
      meta[col] = baselineRow[col] === undefined ? '' : String(baselineRow[col]);
    });

    points.push({
      id,
      baseline,
      baselineVisit: baselineRow[settings.visit_col] ?? '',
      baselineFallback: resolved.fallback,
      max,
      maxVisit: maxRow[settings.visit_col] ?? '',
      maxDay: Number.isFinite(day) ? day : null,
      fold,
      delta,
      foldStage: fStage,
      deltaStage: dStage,
      stage: combinedStage(fStage, dStage, absoluteRule),
      absoluteRule,
      unit: unitsResolved ? settings.units.target : nativeUnit,
      arm: settings.arm_col ? (baselineRow[settings.arm_col] ?? '') : '',
      meta
    });
  });

  // Drops report in a stable order so a note and its export agree run to run.
  droppedParticipants.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    points,
    droppedParticipants,
    baselineFallbacks,
    unitsResolved,
    nativeUnit
  };
}

/**
 * Records to plottable points: the whole per-setData reduction (NEP-DATA-003).
 * @param {Object[]} rawData The raw records.
 * @param {Object} settings Normalized settings.
 * @returns {Object} points, droppedRows, droppedParticipants, baselineFallbacks, unitsResolved, nativeUnit.
 */
export function structureData(rawData, settings) {
  const { rows, droppedRows } = cleanData(rawData, settings);
  const built = buildParticipants(rows, settings);
  // A participant whose every creatinine result was unusable survives only in
  // the dropped-row export, so name them at the participant level too — the
  // question a reviewer asks is "who is missing from the plot".
  const plotted = new Set(built.points.map((point) => point.id));
  const accounted = new Set(built.droppedParticipants.map((entry) => entry.id));
  const missing = unique(droppedRows.map((row) => row[settings.id_col])).filter(
    (id) => !plotted.has(id) && !accounted.has(id)
  );
  const droppedParticipants = [
    ...built.droppedParticipants,
    ...missing.map((id) => ({ id, reason: REASON_NO_USABLE }))
  ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return { ...built, droppedRows, droppedParticipants };
}

/**
 * Keep only points matching every active filter (NEP-CFG-006); an unset filter
 * (null) matches everything.
 * @param {Object[]} points The plotted points.
 * @param {Object} filters column -> selected value (or null).
 * @returns {Object[]} The matching points.
 */
export function applyFilters(points, filters) {
  return points.filter((point) =>
    Object.entries(filters || {}).every(
      ([key, value]) => !value || String(point.meta[key]) === String(value)
    )
  );
}

/**
 * The stage summary (NEP-TBL-001, NEP-TBL-002): Stage 0-3 down the side, then N
 * and % for the fold staging, the delta staging, and the combined stage the
 * zones show.
 *
 * This is NOT a cross-tabulation — the R app's table is two marginal
 * distributions sharing a stage row label, and the port keeps that shape,
 * adding the combined column because with the KDIGO ladder that is what a
 * reviewer reads off the chart (design §6.4).
 *
 * The delta column's Stage 2 and Stage 3 cells are `null`, not `0`. Those
 * stages do not EXIST on the absolute-change axis, and a zero would read as
 * "nobody qualified" — the exact misreading the R source's unreachable
 * `case_when` arms invite.
 * @param {Object[]} points The plotted points.
 * @returns {{total: number, rows: Object[]}} The summary.
 */
export function stageSummary(points) {
  const rows = points || [];
  const total = rows.length;
  const cell = (n) => ({ n, percent: total ? (n / total) * 100 : 0 });
  const count = (key, stage) => rows.filter((point) => point[key] === stage).length;
  return {
    total,
    rows: [0, 1, 2, 3].map((stage) => ({
      stage,
      fold: cell(count('foldStage', stage)),
      delta: stage <= 1 ? cell(count('deltaStage', stage)) : { n: null, percent: null },
      combined: cell(count('stage', stage))
    }))
  };
}
