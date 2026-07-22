// The composite-plot view of the hep-explorer module (obot.roadmap#43,
// safety.viz#91): the baseline-referenced composite for participants with
// abnormal baseline liver tests (Tesfaldet et al., Drug Safety 2024;47:699-710)
// — the pretreatment and peak on-treatment eDISH panels, the four-panel
// xBaseline shift plot, the pretreatment x on-treatment migration table with
// its concern coding, and the by-arm concern/benefit summary. Moved VERBATIM
// out of src/hep-explorer.js; the shared hepatic domain it reduces with lives
// in src/hep-core/.
//
// Implements the same view contract as every other file in this directory (see
// the contract block at the top of views/scatter.js). Views are SIBLINGS: this
// file must not import another file in views/ — pinned by
// tests/unit/hep-explorer/views-isolation.test.js.
//
// Requirement groups: HEP-COMP-001 .. HEP-COMP-007.

import { Chart } from 'chart.js';

import { createElement } from '../../shell.js';
import {
  ALT_ULN_CUT,
  BILI_ULN_CUT,
  BLN_LINES,
  COMPOSITE_QUADRANTS,
  CONCERN_COLORS,
  QUADRANT_STYLE,
  concernOf
} from '../../hep-core/quadrants.js';
import { buildCompositeSubjects } from '../../hep-core/subjects.js';
import { byArmSummary, migrationMatrix } from '../../hep-core/migration.js';
import { GROUP_NONE } from '../configure.js';
import { applyFilters, unique } from '../structureData.js';
import { edishDomain, formatNumber } from '../getScales.js';
import { SELECTION_COLOR, hexToRgba, referenceLinePlugin } from '../getPlugins.js';
import { HIGHLIGHT } from '../selection.js';

/**
 * The baseline-quadrant legend for the composite plot: the four quadrants, each
 * with its coded color and symbol (HEP-COMP-001).
 * @private
 */
function buildLegend() {
  const legend = createElement('div', 'hep-composite-legend');
  legend.append(createElement('strong', null, 'Baseline quadrant:'));
  COMPOSITE_QUADRANTS.forEach((quadrant) => {
    const style = QUADRANT_STYLE[quadrant];
    const item = createElement('span', 'hep-legend-item');
    const swatch = createElement('span');
    swatch.style.cssText = `display:inline-block;width:.7rem;height:.7rem;border-radius:${
      style.pointStyle === 'circle' ? '50%' : '2px'
    };background:${style.color}`;
    item.append(swatch, document.createTextNode(quadrant));
    legend.append(item);
  });
  return legend;
}

/**
 * Log-log Chart.js scale configs for the composite eDISH scatters, widened to
 * keep the ALT 3xULN / BILI 2xULN cut-lines in view.
 * @private
 */
function edishScales(xValues, yValues) {
  const xDomain = edishDomain(xValues, ALT_ULN_CUT, 'log');
  const yDomain = edishDomain(yValues, BILI_ULN_CUT, 'log');
  return {
    x: {
      type: 'logarithmic',
      min: xDomain[0],
      max: xDomain[1],
      title: { display: true, text: 'ALT [×ULN]' },
      grid: { color: 'rgba(148, 163, 184, 0.25)' }
    },
    y: {
      type: 'logarithmic',
      min: yDomain[0],
      max: yDomain[1],
      title: { display: true, text: 'Total Bilirubin [×ULN]' },
      grid: { color: 'rgba(148, 163, 184, 0.25)' }
    }
  };
}

/**
 * A log-log xBaseline domain over a set of values, always including the 1x/3x/5x
 * reference lines and padded so no point sits on the frame.
 * @private
 */
function blnDomain(values) {
  const positives = [...values.filter(Number.isFinite), ...BLN_LINES].filter((v) => v > 0);
  if (!positives.length) return [0.5, 5];
  const min = Math.min(...positives, 0.5);
  const max = Math.max(...positives);
  return [min / 1.3, max * 1.3];
}

/**
 * Tooltip line for a composite point: the participant id, the panel-relevant
 * standardized values, and the baseline -> on-treatment migration.
 * @private
 */
function tooltipLine(subject, which) {
  if (!subject) return '';
  if (which === 'bln') {
    return (
      `${subject.id}: ALT ${formatNumber(subject.peakAltBLN)}×BLN, ` +
      `TB ${formatNumber(subject.peakBiliBLN)}×BLN (baseline ${subject.pretreatQuadrant})`
    );
  }
  const alt = which === 'pretreat' ? subject.baselineAltULN : subject.peakAltULN;
  const bili = which === 'pretreat' ? subject.baselineBiliULN : subject.peakBiliULN;
  return (
    `${subject.id}: ALT ${formatNumber(alt)}×ULN, TB ${formatNumber(bili)}×ULN — ` +
    `${subject.pretreatQuadrant} → ${subject.onTreatQuadrant}`
  );
}

/**
 * Tooltip config for a composite chart (HEP-COMP-007): when more than two points
 * overlap under the cursor (dense panels), the tooltip collapses to a
 * "N participants" count instead of stacking a line per participant, so the box
 * stays small and does not cover the points beneath it. With one or two points
 * it lists each participant's detail line.
 * @param {Object[]} subjects The subjects backing this chart's single dataset.
 * @param {string} which The panel kind ('pretreat' | 'ontreat' | 'bln').
 * @private
 */
function tooltipConfig(subjects, which) {
  // The filter runs over the full item set before the body callbacks, so it
  // is where we learn how many points the cursor caught; keeping only the
  // first item when there are more than two makes the label fire once.
  let itemCount = 0;
  return {
    filter: (item, index, items) => {
      itemCount = items.length;
      return items.length > 2 ? index === 0 : true;
    },
    callbacks: {
      title: () => '',
      label: (ctx) =>
        itemCount > 2 ? `${itemCount} participants` : tooltipLine(subjects[ctx.dataIndex], which)
    }
  };
}

/**
 * Whether any participant is currently traced — hovered, or in the sticky
 * multi-selection (HEP-COMP-007).
 * @private
 */
function anyActive(host) {
  return host.compositeHoverId != null || host.compositeSelectedIds.length > 0;
}

/**
 * Whether a composite subject is currently traced: hovered, or one of the
 * clicked multi-selection (HEP-COMP-007).
 * @private
 */
function isActive(host, subject) {
  if (!subject) return false;
  const id = String(subject.id);
  if (host.compositeHoverId != null && String(host.compositeHoverId) === id) return true;
  return host.compositeSelectedIds.includes(id);
}

/**
 * Scriptable point styling shared by every composite chart (HEP-COMP-007): each
 * point keeps its baseline-quadrant color and shape; when a participant is
 * traced, that participant's point(s) render full-opacity with a dark ring and a
 * larger radius while every other point dims, so the traced participant stands
 * out in each panel it appears in. With no trace active the styling is the
 * module's default (0.8 opacity, quadrant-colored border).
 * @param {Object} host The live hep-explorer instance.
 * @param {Object[]} subjects The subjects backing this chart's single dataset.
 * @param {number} baseRadius The unemphasized point radius.
 * @private
 */
function datasetStyle(host, subjects, baseRadius) {
  return {
    pointStyle: subjects.map((subject) => QUADRANT_STYLE[subject.pretreatQuadrant].pointStyle),
    pointBackgroundColor: (ctx) => {
      const subject = subjects[ctx.dataIndex];
      if (!subject) return 'rgba(0, 0, 0, 0)';
      const color = QUADRANT_STYLE[subject.pretreatQuadrant].color;
      if (!anyActive(host)) return hexToRgba(color, 0.8);
      return hexToRgba(color, isActive(host, subject) ? 1 : HIGHLIGHT.DIM_FILL);
    },
    pointBorderColor: (ctx) => {
      const subject = subjects[ctx.dataIndex];
      if (!subject) return 'rgba(0, 0, 0, 0)';
      const color = QUADRANT_STYLE[subject.pretreatQuadrant].color;
      if (isActive(host, subject)) return SELECTION_COLOR;
      return !anyActive(host) ? color : hexToRgba(color, HIGHLIGHT.DIM_BORDER);
    },
    pointBorderWidth: (ctx) =>
      isActive(host, subjects[ctx.dataIndex]) ? HIGHLIGHT.BORDER_WIDTH : 1,
    pointRadius: (ctx) =>
      baseRadius + (isActive(host, subjects[ctx.dataIndex]) ? HIGHLIGHT.RADIUS_BOOST : 0),
    pointHoverRadius: baseRadius + 2
  };
}

/**
 * Restyle every composite chart to the current trace and refresh the header.
 * Uses Chart.js's no-animation update so the highlight tracks the pointer
 * without flicker (HEP-COMP-007).
 * @private
 */
function refreshHighlight(host) {
  host.compositeCharts.forEach((chart) => chart.update('none'));
  host.selection.updateTraceHeader(host.compositeHoverId, host.compositeSelectedIds);
}

/**
 * Sync the dropdown and its Clear selection button to the current
 * multi-selection, restyle the panels + header, and dispatch the
 * participantsSelected event so host apps stay in sync (HEP-COMP-007,
 * HEP-API-003).
 * @private
 */
function afterSelectionChange(host) {
  host.selection.sync(host.compositeSelectedIds);
  refreshHighlight(host);
  host.selection.dispatch([...host.compositeSelectedIds]);
}

/**
 * Set the transient hovered participant and restyle the panels + header when it
 * changes (HEP-COMP-007).
 * @private
 */
function setHover(host, id) {
  const norm = id == null ? null : String(id);
  if (String(norm ?? '') === String(host.compositeHoverId ?? '')) return;
  host.compositeHoverId = norm;
  refreshHighlight(host);
}

/**
 * Toggle a participant in the click-driven multi-selection (HEP-COMP-007).
 * @private
 */
function toggleSelection(host, id) {
  const key = String(id);
  const index = host.compositeSelectedIds.indexOf(key);
  if (index >= 0) host.compositeSelectedIds.splice(index, 1);
  else host.compositeSelectedIds.push(key);
  afterSelectionChange(host);
}

/**
 * Clear the whole multi-selection (e.g. a click on empty plot space)
 * (HEP-COMP-007).
 * @private
 */
function clearSelection(host) {
  if (!host.compositeSelectedIds.length) return;
  host.compositeSelectedIds = [];
  afterSelectionChange(host);
}

/**
 * The hover/click handlers shared by every composite chart (HEP-COMP-007):
 * hovering a point traces its participant everywhere; clicking a point toggles
 * that participant in the multi-selection; clicking empty space clears the
 * selection. Chart.js passes the chart as the THIRD handler argument (the active
 * elements carry no chart reference), so the backing subjects are looked up from
 * that chart.
 * @private
 */
function interactionOptions(host) {
  const idAt = (chart, element) => {
    const subjects = chart && chart.$compositeSubjects;
    const subject = subjects && element && subjects[element.index];
    return subject ? subject.id : null;
  };
  return {
    onHover: (event, active, chart) => {
      const target = event?.native?.target;
      if (target) target.style.cursor = active.length ? 'pointer' : 'default';
      setHover(host, active.length ? idAt(chart, active[0]) : null);
    },
    onClick: (event, active, chart) => {
      if (!active.length) {
        clearSelection(host);
        return;
      }
      const id = idAt(chart, active[0]);
      if (id != null) toggleSelection(host, id);
    }
  };
}

/**
 * Register a freshly built composite chart for teardown, resize, and
 * cross-linking: it joins host.charts and host.compositeCharts, remembers its
 * backing subjects for the interaction handlers, and clears the hover trace when
 * the pointer leaves its canvas (HEP-COMP-007).
 * @private
 */
function registerChart(host, chart, subjects, canvas) {
  chart.$compositeSubjects = subjects;
  host.charts.push(chart);
  host.compositeCharts.push(chart);
  canvas.addEventListener('pointerleave', () => setHover(host, null));
}

/**
 * Build one composite eDISH scatter card (pretreatment or peak on-treatment):
 * peak/baseline ALT (x) vs total bilirubin (y) in xULN, each point colored and
 * shaped by its baseline quadrant, with the ALT 3xULN / BILI 2xULN cut-lines
 * (HEP-COMP-001, HEP-COMP-002).
 * @private
 */
function buildEdishCard(host, title, subjects, which) {
  const card = createElement('div', 'hep-composite-card');
  card.append(createElement('h4', null, title));
  const wrap = createElement('div', 'hep-composite-canvas');
  const canvas = document.createElement('canvas');
  wrap.append(canvas);
  card.append(wrap);

  const xKey = which === 'pretreat' ? 'baselineAltULN' : 'peakAltULN';
  const yKey = which === 'pretreat' ? 'baselineBiliULN' : 'peakBiliULN';
  const data = subjects.map((subject) => ({ x: subject[xKey], y: subject[yKey] }));

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [{ data, ...datasetStyle(host, subjects, 5) }]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: tooltipConfig(subjects, which)
      },
      scales: edishScales(
        subjects.map((subject) => subject[xKey]),
        subjects.map((subject) => subject[yKey])
      ),
      ...interactionOptions(host)
    },
    plugins: [
      referenceLinePlugin({
        vLines: [{ value: ALT_ULN_CUT, label: `${ALT_ULN_CUT}×ULN` }],
        hLines: [{ value: BILI_ULN_CUT, label: `${BILI_ULN_CUT}×ULN` }]
      })
    ]
  });
  registerChart(host, chart, subjects, canvas);
  return card;
}

/**
 * Build the four-panel xBaseline shift plot (HEP-COMP-003): one panel per
 * on-treatment quadrant, arranged in the eDISH spatial layout (Cholestasis
 * upper-left, Hy's Law upper-right, Normal & NN lower-left, Temple's Corollary
 * lower-right, matching the paper's Figs 4-6). Each point is the participant's
 * peak ALT vs total bilirubin as multiples of its own baseline, colored/shaped
 * by baseline quadrant, over shared axes with 1x/3x/5x reference lines.
 * @private
 */
function buildPanels(host, subjects) {
  const grid = createElement('div', 'hep-composite-panels');
  const order = ['Cholestasis', "Hy's Law", 'Normal & NN', "Temple's Corollary"];
  const xDomain = blnDomain(subjects.map((subject) => subject.peakAltBLN));
  const yDomain = blnDomain(subjects.map((subject) => subject.peakBiliBLN));
  const refLines = BLN_LINES.map((value) => ({ value, label: `${value}×` }));

  order.forEach((quadrant) => {
    const members = subjects.filter((subject) => subject.onTreatQuadrant === quadrant);
    const card = createElement('div', 'hep-composite-card');
    card.append(createElement('h4', null, `${quadrant} (${members.length})`));
    const wrap = createElement('div', 'hep-composite-panel-canvas');
    const canvas = document.createElement('canvas');
    wrap.append(canvas);
    card.append(wrap);

    const data = members.map((subject) => ({ x: subject.peakAltBLN, y: subject.peakBiliBLN }));

    const chart = new Chart(canvas.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [{ data, ...datasetStyle(host, members, 4.5) }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: tooltipConfig(members, 'bln')
        },
        scales: {
          x: {
            type: 'logarithmic',
            min: xDomain[0],
            max: xDomain[1],
            title: { display: true, text: 'ALT [×Baseline]' },
            grid: { color: 'rgba(148, 163, 184, 0.2)' }
          },
          y: {
            type: 'logarithmic',
            min: yDomain[0],
            max: yDomain[1],
            title: { display: true, text: 'TB [×Baseline]' },
            grid: { color: 'rgba(148, 163, 184, 0.2)' }
          }
        },
        ...interactionOptions(host)
      },
      plugins: [referenceLinePlugin({ vLines: refLines, hLines: refLines })]
    });
    registerChart(host, chart, members, canvas);
    grid.append(card);
  });
  return grid;
}

/**
 * The concern color legend for the migration table (HEP-COMP-004).
 * @private
 */
function buildConcernLegend() {
  const legend = createElement('div', 'hep-concern-legend');
  const items = [
    ['red', 'Migration of concern'],
    ['yellow', 'Migration of potential concern'],
    ['green', 'Migration of no concern (potential benefit)'],
    ['gray', 'No migration']
  ];
  items.forEach(([key, label]) => {
    const item = createElement('span', 'hep-legend-item');
    const swatch = createElement('span', 'hep-concern-swatch');
    swatch.style.background = CONCERN_COLORS[key];
    item.append(swatch, document.createTextNode(label));
    legend.append(item);
  });
  return legend;
}

/**
 * Build the pretreatment x on-treatment migration table (HEP-COMP-004): counts
 * with row/column totals, each interior cell shaded by its level of DILI
 * concern (red/yellow/green/gray), plus the concern legend.
 * @private
 */
function buildMigrationTable(subjects) {
  const wrap = createElement('div', 'hep-migration');
  const matrix = migrationMatrix(subjects);
  const table = createElement('table');
  table.append(
    createElement(
      'caption',
      null,
      'Migration table — pretreatment (rows) × on-treatment (columns) quadrant counts'
    )
  );

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(createElement('th', null, 'Baseline ↓ / On-treatment →'));
  COMPOSITE_QUADRANTS.forEach((quadrant) => headRow.append(createElement('th', null, quadrant)));
  headRow.append(createElement('th', 'hep-total', 'Total'));
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  COMPOSITE_QUADRANTS.forEach((pre) => {
    const tr = document.createElement('tr');
    tr.append(createElement('td', 'hep-rowhead', pre));
    COMPOSITE_QUADRANTS.forEach((post) => {
      const td = createElement('td', null, String(matrix.counts[pre][post]));
      td.style.background = CONCERN_COLORS[concernOf(pre, post)];
      tr.append(td);
    });
    tr.append(createElement('td', 'hep-total', String(matrix.rowTotals[pre])));
    tbody.append(tr);
  });
  const totalRow = document.createElement('tr');
  totalRow.append(createElement('td', 'hep-rowhead hep-total', 'Total'));
  COMPOSITE_QUADRANTS.forEach((post) =>
    totalRow.append(createElement('td', 'hep-total', String(matrix.colTotals[post])))
  );
  totalRow.append(createElement('td', 'hep-total', String(matrix.total)));
  tbody.append(totalRow);
  table.append(tbody);

  wrap.append(table);
  wrap.append(buildConcernLegend());
  return wrap;
}

/**
 * Build the by-arm concern/benefit summary table (HEP-COMP-005): per value of
 * the active Group column (or all participants when no grouping), the count of
 * subjects whose migration is a concern (red), potential concern (yellow), no
 * concern / benefit (green), or no migration (gray), with the arm total.
 * @private
 */
function buildByArmSummary(host, subjects) {
  const armCol =
    host.state.groupBy && host.state.groupBy !== GROUP_NONE ? host.state.groupBy : null;
  const armLabel = armCol
    ? (host.settings.groups.find((group) => group.value_col === armCol) || {}).label || armCol
    : null;
  const rows = byArmSummary(subjects, armCol);

  const wrap = createElement('div', 'hep-migration');
  const table = createElement('table');
  table.append(
    createElement(
      'caption',
      null,
      armCol
        ? `Concern vs. benefit summary by ${armLabel}`
        : 'Concern vs. benefit summary (all participants)'
    )
  );

  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  [
    armCol ? armLabel : 'Group',
    'Concern',
    'Potential concern',
    'No concern / benefit',
    'No migration',
    'Total'
  ].forEach((label) => headRow.append(createElement('th', null, label)));
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  const cell = (count, key) => {
    const td = createElement('td', null, String(count));
    td.style.background = CONCERN_COLORS[key];
    return td;
  };
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    tr.append(createElement('td', 'hep-rowhead', String(row.arm)));
    tr.append(cell(row.red, 'red'));
    tr.append(cell(row.yellow, 'yellow'));
    tr.append(cell(row.green, 'green'));
    tr.append(cell(row.gray, 'gray'));
    tr.append(createElement('td', 'hep-total', String(row.total)));
    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  return wrap;
}

/** The composite-plot view component (see THE VIEW CONTRACT in views/scatter.js). */
const compositeView = {
  id: 'composite',
  label: 'Composite plot',

  // The composite view owns the whole main column: its panels, tables and
  // legends render into the composite container (HEP-COMP-006).
  slots: ['composite'],

  // The R-Ratio range filter is a scatter-pipeline control; the composite
  // cohort is defined by baseline availability instead (HEP-COMP-006).
  usesRRatioFilter: false,

  /** The composite view adds no Settings controls; Group (shared) drives it. */
  contributeControls() {},

  /** The composite view adds no Filters controls beyond the shared categorical ones. */
  contributeFilters() {},

  /**
   * Reset the participant cross-linking state for a fresh render
   * (HEP-COMP-007); the charts register themselves as they are built.
   */
  teardown(host) {
    host.compositeCharts = [];
    host.compositeHoverId = null;
    host.compositeSelectedIds = [];
    host.compositeSelectEl = null;
    host.compositeClearBtn = null;
  },

  /**
   * Render the composite plot into the composite container (HEP-COMP-001..006):
   * a baseline-quadrant legend, the pretreatment and peak on-treatment eDISH
   * panels (each point colored/shaped by its baseline quadrant so migration is
   * visible), the four-panel xBaseline shift plot (one panel per on-treatment
   * quadrant, with 1x/3x/5x reference lines), the pretreatment x on-treatment
   * migration table with concern coding, and the by-arm concern/benefit summary.
   * Degrades to an explanatory note when no participant in the current selection
   * has a usable baseline and on-treatment ALT and total bilirubin. A live
   * selection carried in from another view (HEP-SELECT-006) arrives selected for
   * the participants that are part of the composite cohort; when none survive
   * the selection is cleared and listeners notified.
   */
  render(host, { carriedIds = [] } = {}) {
    const { subjects, excluded } = buildCompositeSubjects(host.cleanRows, host.settings);
    const shown = applyFilters(subjects, host.state.filters);
    host.compositeSubjectsShown = shown;

    // Participant multi-select tied to the click event (HEP-COMP-007): it lives
    // in the sidebar's Participants section; clicking a point toggles that
    // participant here, and editing this selection restyles the panels. Kept in
    // sync with the plot in both directions.
    host.selection.mount(host.compositeSelectSection, shown);

    const totalParticipants = unique(host.cleanRows.map((row) => row[host.settings.id_col])).length;
    const excludedNote = excluded
      ? `<span class="sv-warning">${excluded} participant${
          excluded > 1 ? 's' : ''
        } excluded (missing baseline or on-treatment ALT/total bilirubin).</span>`
      : '';
    host.notes.innerHTML =
      `<span>${shown.length} of ${totalParticipants} participants shown in the composite plot.</span>` +
      excludedNote;
    host.footnote.textContent =
      'Composite plot (Tesfaldet et al., Drug Safety 2024): symbol color and shape mark each ' +
      'participant’s baseline (pretreatment) eDISH quadrant, carried through every panel so ' +
      'migration is visible. ×Baseline = peak on-treatment value ÷ the participant’s own baseline.';

    if (!shown.length) {
      const note = createElement('div', 'sv-warning');
      note.textContent =
        'The composite plot needs baseline and on-treatment ALT and total bilirubin for at ' +
        'least one participant. No participant in the current selection qualifies.';
      host.compositeWrap.append(note);
      if (carriedIds.length) host.selection.dispatch([]);
      return;
    }

    host.compositeWrap.append(buildLegend());

    host.compositeWrap.append(
      createElement('h3', 'hep-composite-section-title', 'Baseline → on-treatment eDISH (×ULN)')
    );
    const edishRow = createElement('div', 'hep-composite-edish');
    edishRow.append(buildEdishCard(host, 'Pretreatment (baseline)', shown, 'pretreat'));
    edishRow.append(buildEdishCard(host, 'Peak on-treatment', shown, 'ontreat'));
    host.compositeWrap.append(edishRow);

    host.compositeWrap.append(
      createElement(
        'h3',
        'hep-composite-section-title',
        'Peak on-treatment relative to own baseline (×Baseline)'
      )
    );
    host.compositeWrap.append(buildPanels(host, shown));

    host.compositeWrap.append(buildMigrationTable(shown));
    host.compositeWrap.append(buildByArmSummary(host, shown));

    // Carry a live selection into the freshly built composite view
    // (HEP-SELECT-006): seed the multi-selection with the carried participants
    // still in the cohort so the panels, dropdown, header, and listeners all
    // pick them up; when none survive the selection clears instead.
    if (carriedIds.length) {
      const shownIds = new Set(shown.map((subject) => String(subject.id)));
      const survivors = carriedIds.map(String).filter((id) => shownIds.has(id));
      if (survivors.length) {
        host.compositeSelectedIds = survivors;
        afterSelectionChange(host);
      } else {
        host.selection.dispatch([]);
      }
    }
  },

  /** The composite view's sticky selection: the click-driven multi-selection. */
  selectedIds(host) {
    return host.compositeSelectedIds;
  },

  /** The shared Participants control set a new multi-selection (HEP-COMP-007). */
  onParticipantsChanged(host, ids) {
    host.compositeSelectedIds = ids;
    afterSelectionChange(host);
  },

  /** The Clear selection gesture: drop the whole multi-selection. */
  clearSelection(host) {
    clearSelection(host);
  },

  /** Restyle every composite panel to the current trace and refresh the header. */
  highlight(host) {
    refreshHighlight(host);
  }
};

export default compositeView;
