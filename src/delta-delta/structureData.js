// Data preparation for the delta-delta scatter (#25): cleaning, measure/visit
// discovery, and the per-participant change-from-baseline transform. Ported in
// behavior from the original renderer's onInit/onPreprocess pipeline
// (cleanData, getMeasures, getVisits, flattenData → getMeasureDetails), kept as
// pure functions so the delta math is unit-testable against hand-computed
// fixtures.

// Visit-role colors reused by the sparkline (SDD-REG-023): filled blue for
// baseline visits, filled orange for comparison visits, empty gray otherwise.
export const BASELINE_COLOR = '#2563eb';
export const COMPARISON_COLOR = '#ea580c';
export const OTHER_COLOR = '#9ca3af';

export function unique(values) {
  return [
    ...new Set(values.filter((value) => value !== undefined && value !== null && value !== ''))
  ];
}

export function mean(values) {
  const nums = values.map(Number).filter(Number.isFinite);
  if (!nums.length) return NaN;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

// Removes missing/non-numeric results, reporting how many were dropped
// (SDD-CFG-005, SDD-REG-008). Adds a stable index and a coerced numeric value.
export function cleanData(rawData, settings) {
  let removed = 0;
  const rows = rawData
    .map((row, index) => ({
      ...row,
      __dd_index: index,
      __dd_value: Number(row[settings.value_col])
    }))
    .filter((row) => {
      const keep = row[settings.value_col] !== '' && Number.isFinite(row.__dd_value);
      if (!keep) removed += 1;
      return keep;
    });
  return { rows, removed };
}

// Sorted distinct measure names present in the cleaned data (SDD-CFG-004).
export function getMeasures(rows, settings) {
  return unique(rows.map((row) => row[settings.measure_col])).sort();
}

// Distinct visit labels ordered by the numeric visit column when present,
// falling back to a label sort — a port of the original getVisits (SDD-CFG-008).
export function getVisits(rows, settings) {
  const hasVisitN =
    settings.visitn_col && rows.some((row) => row[settings.visitn_col] !== undefined);
  if (!hasVisitN) return unique(rows.map((row) => row[settings.visit_col])).sort();
  const order = new Map();
  rows.forEach((row) => {
    const visit = row[settings.visit_col];
    if (visit !== undefined && visit !== null && visit !== '' && !order.has(visit))
      order.set(visit, Number(row[settings.visitn_col]));
  });
  return [...order.keys()].sort((a, b) => {
    const diff = order.get(a) - order.get(b);
    if (diff) return diff;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

// Mean of the numeric result over the records whose visit is in `visits`;
// NaN when no matching records exist (SDD-FUNC-001: multiple visits averaged).
export function visitMean(records, visits, settings) {
  const set = new Set(visits);
  const matched = records.filter((row) => set.has(row[settings.visit_col]));
  return mean(matched.map((row) => row.__dd_value));
}

// Per-measure summary for one participant: raw records (visit-ordered and
// role-tagged), the baseline/comparison means, the change (delta), and which
// axis the measure is pinned to. Sorted X-measure, Y-measure, then the rest
// alphabetically — the linked table's row order (SDD-REG-019, SDD-REG-023,
// SDD-REG-025).
export function measureDetails(participantRows, settings, state) {
  const { measureX, measureY, baseline, comparison } = state;
  const baselineSet = new Set(baseline);
  const comparisonSet = new Set(comparison);
  const byMeasure = new Map();
  participantRows.forEach((row) => {
    const key = row[settings.measure_col];
    if (!byMeasure.has(key)) byMeasure.set(key, []);
    byMeasure.get(key).push(row);
  });

  const details = [...byMeasure.entries()].map(([key, rawRecords]) => {
    const records = [...rawRecords]
      .sort((a, b) => Number(a[settings.visitn_col] ?? 0) - Number(b[settings.visitn_col] ?? 0))
      .map((row) => {
        const isBaseline = baselineSet.has(row[settings.visit_col]);
        const isComparison = comparisonSet.has(row[settings.visit_col]);
        return {
          ...row,
          baseline: isBaseline,
          comparison: isComparison,
          color: isBaseline ? BASELINE_COLOR : isComparison ? COMPARISON_COLOR : OTHER_COLOR
        };
      });
    const baselineValue = visitMean(rawRecords, baseline, settings);
    const comparisonValue = visitMean(rawRecords, comparison, settings);
    return {
      key,
      records,
      baselineValue,
      comparisonValue,
      delta: comparisonValue - baselineValue,
      axisFlag: key === measureX ? 'X' : key === measureY ? 'Y' : ''
    };
  });

  return details.sort((a, b) => {
    const rank = (detail) => (detail.axisFlag === 'X' ? 0 : detail.axisFlag === 'Y' ? 1 : 2);
    const diff = rank(a) - rank(b);
    if (diff) return diff;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

// Flatten cleaned long-format rows to one object per participant, carrying the
// per-measure details, the two axis deltas, and the participant-level metadata
// used by filters and the detail header (SDD-REG-003, SDD-FUNC-006).
export function buildParticipants(rows, settings, state) {
  const metaCols = unique([
    ...settings.filters.map((filter) => filter.value_col),
    ...settings.details.map((detail) => detail.value_col),
    settings.id_col
  ]);
  const byId = new Map();
  rows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });

  return [...byId.entries()].map(([id, participantRows]) => {
    const details = measureDetails(participantRows, settings, state);
    const xDetail = details.find((detail) => detail.key === state.measureX);
    const yDetail = details.find((detail) => detail.key === state.measureY);
    const meta = {};
    metaCols.forEach((col) => {
      meta[col] = participantRows[0][col] === undefined ? '' : String(participantRows[0][col]);
    });
    return {
      id,
      measures: details,
      delta_x: xDetail ? xDetail.delta : NaN,
      delta_y: yDetail ? yDetail.delta : NaN,
      meta
    };
  });
}

// Participants that both deltas resolve to finite numbers for — the points the
// scatter draws and the participant-count numerator (SDD-FUNC-004).
export function plottablePoints(participants) {
  return participants.filter(
    (participant) => Number.isFinite(participant.delta_x) && Number.isFinite(participant.delta_y)
  );
}

// Keep only participants matching every active filter (SDD-FUNC-003,
// SDD-REG-006); an unset filter (null) matches everything.
export function applyFilters(participants, filters) {
  return participants.filter((participant) =>
    Object.entries(filters).every(
      ([key, value]) => !value || String(participant.meta[key]) === String(value)
    )
  );
}
