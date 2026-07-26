// Cohort, ordering, datasets and summary specs for the hep-waterfall module
// (#93): the modified waterfall of Amirzadegan et al., Drug Safety
// 2025;48(5):443-453, Figure 5.
//
// THE REDUCTION IS NOT REIMPLEMENTED HERE. `reduceMeasure` in
// src/hep-core/subjects.js is the single per-participant hepatic reduction the
// composite plot, the migration Sankey and this waterfall all share, and it
// already solves the two traps this figure is exposed to:
//
//   1. the absolute maximum is maximised over the RAW value, independently of
//      the ×ULN maximum — the ×ULN-maximising record is a different record
//      whenever the reference range moves between visits, and ALT's does
//      (32/34/35/40/43 U/L in the vendored demo data);
//   2. the on-treatment set excludes the resolved baseline BY IDENTITY, not
//      merely by day > 0 — participants with no day-0 record fall back to an
//      unscheduled early visit, and counting that record as on-treatment would
//      make their peak unable to fall below their own baseline, silently
//      erasing exactly the "bars dropping below baseline" signal this figure
//      exists to show.
//
// Requirement groups: HWF-DATA-*, HWF-ORDER-*, HWF-BAR-* (dataset half),
// HWF-BOX-003/004, HWF-CTRL-003.

import { buildHepSubjects, reduceMeasure } from '../hep-core/subjects.js';
import { boxStats } from '../hep-core/stats.js';
import {
  assignSequence,
  cleanData,
  deriveBaseline,
  resolveMeasureRows
} from '../hep-explorer/structureData.js';
import { TRACE_COLOR, barColors } from './getPlugins.js';

/**
 * Clean the raw records and derive the per-row columns the reduction reads:
 * the numeric value, the reference range, the study day and the ×ULN column
 * (HWF-DATA-008 counts what that drops). Shares hep-explorer's pipeline
 * verbatim, so a record that reaches the eDISH scatter reaches the waterfall.
 * @param {Object[]} rawData The raw long-format records.
 * @param {Object} settings Normalized settings.
 * @returns {{rows: Object[], removed: number}} The cleaned rows and the drop count.
 */
export function prepareData(rawData, settings) {
  const { rows, removed } = cleanData(Array.isArray(rawData) ? rawData : [], settings);
  deriveBaseline(rows, settings);
  assignSequence(rows, settings);
  return { rows, removed };
}

/**
 * Reduce each participant's records for the PLOTTED measure to their baseline
 * and maximum on-treatment values, via the shared hep-core reduction
 * (HWF-DATA-001, HWF-DATA-002).
 * @param {Object[]} cleanRows Rows from prepareData.
 * @param {Object} settings Normalized settings (`measure` selects the analyte).
 * @returns {Map<string, Object>} participant id -> the reduction, or absent when unusable.
 * @private
 */
function measureReduction(cleanRows, settings) {
  const byId = new Map();
  cleanRows.forEach((row) => {
    const id = row[settings.id_col];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(row);
  });
  const reduced = new Map();
  byId.forEach((rows, id) => {
    const reduction = reduceMeasure(resolveMeasureRows(rows, settings, settings.measure), settings);
    if (reduction) reduced.set(id, reduction);
  });
  return reduced;
}

/** '1 participant' / '12 participants'. @private */
function count(n, noun) {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Order the plotted participants into the paper's mountain (HWF-ORDER-001..004):
 * the placebo arm ascending by baseline left to right, then the active arm
 * descending, so the highest baselines of the two arms meet at the seam and the
 * black baseline trace is unimodal with its mode at the arm boundary.
 *
 * The caption's two clauses contradict each other read literally — "active drug
 * subjects run right-to-center highest-to-lowest" puts the LOWEST active
 * baselines at the centre, while the same sentence says the highest baselines
 * meet in the centre. We take the latter as the controlling intent (plan §E.3,
 * open judgement call O3), because it is the arrangement that makes the figure
 * readable: the two arms' comparable participants sit next to each other.
 *
 * Ties break on the participant identifier, which is what makes repeated
 * renders pixel-identical rather than dependent on input order (HWF-ORDER-004).
 * @param {Object[]} subjects The eligible participants, each with `side` and `baseline`.
 * @returns {Object[]} The ordered participants.
 */
export function orderWaterfall(subjects) {
  const byId = (a, b) => String(a.id).localeCompare(String(b.id));
  const placebo = (subjects || [])
    .filter((subject) => subject.side === 'placebo')
    .sort((a, b) => a.baseline - b.baseline || byId(a, b));
  const active = (subjects || [])
    .filter((subject) => subject.side === 'active')
    .sort((a, b) => b.baseline - a.baseline || byId(a, b));
  return [...placebo, ...active];
}

/**
 * Keep only participants matching every active categorical filter
 * (HWF-CTRL-003); an unset filter matches everything. Values are compared
 * against the participant-level meta the reduction retained.
 * @param {Object[]} subjects The plotted participants.
 * @param {Object} filters Map of column -> selected value.
 * @returns {Object[]} The retained participants.
 */
export function applyFilters(subjects, filters) {
  const active = Object.entries(filters || {}).filter(
    ([, value]) => value !== null && value !== ''
  );
  if (!active.length) return [...(subjects || [])];
  return (subjects || []).filter((subject) =>
    active.every(([col, value]) => String(subject.raw ? subject.raw[col] : '') === String(value))
  );
}

/**
 * Build the waterfall's cohort, ordering and notes (HWF-DATA-001..005,
 * HWF-DATA-008, HWF-ORDER-*).
 *
 * The cohort is the paper's Table 1: participants whose arm is designated
 * neither placebo nor active are dropped, then — when `apply_tb_cohort` is on —
 * participants whose baseline total bilirubin exceeds `baseline_tb_max`, the
 * baseline-jaundiced population the migration and composite views require and
 * this one excludes. The two counts are reported SEPARATELY so the
 * applicability rule is demonstrable evidence rather than a claim. They are
 * disjoint by construction: the arm rule is applied first, so a participant
 * excluded for both is counted once, under the arm.
 * @param {Object[]} cleanRows Rows from prepareData.
 * @param {Object} settings Normalized settings, with the live control values merged in.
 * @param {Object} [context] `{ removed, filters }` — the cleaning drop count and the active filters.
 * @returns {Object} The cohort: `ordered`, `placebo`, `active`, `excluded`, `notes`, and the arm designation.
 */
export function buildWaterfall(cleanRows, settings, { removed = 0, filters = {} } = {}) {
  const rows = cleanRows || [];
  const built = buildHepSubjects(rows, { ...settings, groups: [] });
  const reduction = measureReduction(rows, settings);

  const excluded = { arm: 0, bilirubin: 0, measurement: built.excluded };
  const eligible = [];
  built.subjects.forEach((subject) => {
    if (!subject.side) {
      excluded.arm += 1;
      return;
    }
    if (settings.apply_tb_cohort && subject.baselineJaundice) {
      excluded.bilirubin += 1;
      return;
    }
    const plotted = reduction.get(subject.id);
    if (
      !plotted ||
      !Number.isFinite(plotted.baselineValue) ||
      !Number.isFinite(plotted.peakValue)
    ) {
      excluded.measurement += 1;
      return;
    }
    eligible.push({
      ...subject,
      baseline: plotted.baselineValue,
      peak: plotted.peakValue,
      peakDay: plotted.peakDay,
      baselineDay: plotted.baselineDay,
      uln: plotted.uln,
      change: plotted.peakValue - plotted.baselineValue,
      foldChange: plotted.peakBLN
    });
  });

  const shown = applyFilters(eligible, filters);
  const ordered = orderWaterfall(shown);
  const placebo = ordered.filter((subject) => subject.side === 'placebo');
  const active = ordered.filter((subject) => subject.side === 'active');
  const placeboLabel = built.placeboArm || 'Placebo';
  const activeArms = [...new Set(active.map((subject) => subject.arm).filter(Boolean))];
  const activeLabel = activeArms.length ? activeArms.join(', ') : 'Active';

  const notes = [];
  notes.push({
    tone: 'note',
    text: `${count(ordered.length, 'participant')} plotted (${placeboLabel} n=${placebo.length}, ${activeLabel} n=${active.length}).`
  });
  if (excluded.bilirubin) {
    notes.push({
      tone: 'note',
      text: `${count(excluded.bilirubin, 'participant')} excluded: abnormal baseline bilirubin (paper Table 1).`
    });
  }
  if (!settings.apply_tb_cohort) {
    notes.push({
      tone: 'warning',
      text: "The paper's Table-1 baseline-bilirubin exclusion is off: baseline-jaundiced participants are plotted."
    });
  }
  if (excluded.arm) {
    notes.push({
      tone: 'note',
      text: `${count(excluded.arm, 'participant')} excluded: arm not designated placebo or active.`
    });
  }
  if (excluded.measurement) {
    notes.push({
      tone: 'note',
      text: `${count(excluded.measurement, 'participant')} excluded: no usable baseline or on-treatment measurement.`
    });
  }
  if (removed) {
    notes.push({
      tone: 'note',
      text: `${count(removed, 'record')} removed: missing result or missing/non-positive reference range.`
    });
  }
  if (built.armWarning) notes.push({ tone: 'warning', text: built.armWarning });

  return {
    subjects: ordered,
    ordered,
    placebo,
    active,
    eligible,
    excluded,
    notes,
    placeboLabel,
    activeLabel,
    arms: built.arms,
    sides: built.sides,
    placeboArm: built.placeboArm,
    armCol: built.armCol,
    armWarning: built.armWarning,
    jaundiceCount: ordered.filter((subject) => subject.newOnsetJaundice).length
  };
}

/**
 * The two Chart.js datasets (HWF-BAR-001..004): a floating bar per participant
 * carrying the [baseline, maximum on-treatment] pair — Chart.js v4 reads a
 * two-element array as [base, top] natively, so a bar points up on a rise and
 * down on a fall with no extra machinery — and the black baseline trace.
 *
 * The trace takes the LOWER `order`. Chart.js draws its order-sorted datasets in
 * reverse, so the lower value is painted last and therefore on top, keeping the
 * baseline visible where bars cross it (HWF-BAR-004).
 * @param {Object[]} ordered The ordered participants.
 * @param {{measure: string}} options The plotted measure key, for the dataset labels.
 * @returns {Object[]} The [bars, trace] datasets.
 */
export function waterfallDatasets(ordered, { measure = 'ALT' } = {}) {
  const subjects = ordered || [];
  return [
    {
      type: 'bar',
      order: 2,
      yAxisID: 'y',
      label: `Maximum on-treatment ${measure}`,
      data: subjects.map((subject) => [subject.baseline, subject.peak]),
      backgroundColor: barColors(subjects),
      borderColor: barColors(subjects),
      borderWidth: subjects.map(() => 0),
      barPercentage: 1,
      categoryPercentage: 1
    },
    {
      type: 'line',
      order: 1,
      yAxisID: 'y',
      label: `Baseline ${measure}`,
      data: subjects.map((subject) => subject.baseline),
      borderColor: TRACE_COLOR,
      backgroundColor: TRACE_COLOR,
      borderWidth: 1.5,
      pointRadius: 0,
      pointHitRadius: 0,
      tension: 0,
      fill: false
    }
  ];
}

/**
 * Stage the box-and-whisker specs for one flanking panel (HWF-BOX-003/004), in
 * the shape src/box-whisker.js draws: `{ stats, color, x, halfWidth }`.
 *
 * Two boxes by default — baseline and maximum on-treatment — because the
 * panel's job is to summarize the SHIFT, which is what the bars show one
 * participant at a time; `summary: 'peak'` gives the single-box reading (open
 * judgement call O2). Statistics come from the shared R-7 `boxStats`.
 * @param {Object[]} subjects One arm's plotted participants.
 * @param {{summary: string, color: string, halfWidth: number}} options The panel options.
 * @returns {Array<{stats: Object, color: string, x: number, halfWidth: number, label: string}>} The specs.
 */
export function boxSpecs(subjects, { summary = 'baseline_peak', color, halfWidth = 0.3 } = {}) {
  const rows = subjects || [];
  const peak = {
    label: 'Peak',
    stats: boxStats(rows.map((subject) => subject.peak)),
    color,
    halfWidth
  };
  if (summary === 'peak') return [{ ...peak, x: 0 }];
  return [
    {
      label: 'Baseline',
      stats: boxStats(rows.map((subject) => subject.baseline)),
      color,
      halfWidth,
      x: 0
    },
    { ...peak, x: 1 }
  ];
}
