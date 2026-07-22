// The eDISH/mDISH scatter view of the hep-explorer module (obot.roadmap#43,
// safety.viz#91): one point per participant plotting that participant's peak
// standardized ALT (x) against their peak standardized total bilirubin (y),
// with the Hy's-Law quadrant cut-lines and labels, the color-by legend, the
// quadrant summary table, and the click-to-inspect visit-path overlay. Moved
// VERBATIM out of src/hep-explorer.js; the orchestrator kept the lifecycle, the
// shell, the controls scaffold and the single-participant drill-down.
//
// THE VIEW CONTRACT. Every file in this directory default-exports the same
// shape, and src/hep-explorer.js is the only place that chooses between them:
//
//   id, label                                  identity; id matches VIEW_MODES
//   slots                                      which shell containers to show
//   usesRRatioFilter                           wants the shared R-Ratio range filter
//   contributeControls(host, builders)         this view's Settings controls
//   contributeFilters(host, builders, parent)  this view's Filters controls
//   teardown(host)                             reset view-local state before a render
//   render(host, { carriedIds })               draw, restoring a carried selection
//   selectedIds(host)                          the view's sticky selection
//   onParticipantsChanged(host, ids)           the shared Participants control changed
//   clearSelection(host)                       the shared Clear selection button
//   highlight(host)                            restyle to the current hover/selection
//
// Views are SIBLINGS: no file in views/ may import another (pinned by
// tests/unit/hep-explorer/views-isolation.test.js). Whatever two views both
// need lives in ../selection.js, ../../hep-core/ or the module's helpers.
//
// Requirement groups: HEP-CHART-*, HEP-QUAD-*, HEP-CTRL-*, HEP-DISPLAY-*,
// HEP-SELECT-*.

import { Chart } from 'chart.js';

import { createElement, option } from '../../shell.js';
import { AXIS_TYPES, DISPLAY_MODES, GROUP_NONE, POINT_SIZE_OPTIONS, cutFor } from '../configure.js';
import { applyFilters, buildPoints, classifyQuadrants, unique } from '../structureData.js';
import { buildScales, edishDomain, formatNumber } from '../getScales.js';
import {
  GROUP_COLORS,
  SELECTION_COLOR,
  groupColorScale,
  hexToRgba,
  pointTooltip,
  quadrantPlugin
} from '../getPlugins.js';
import { HIGHLIGHT } from '../selection.js';

// Base point color when no grouping is active (HEP-CTRL-009 default).
const BASE_POINT_COLOR = GROUP_COLORS[0];

/**
 * Add a reference-line (cutpoint) number input for one axis; edits write the
 * per-measure, per-display cut into state.cuts and clamp it to >= 0 so it cannot
 * fall below the axis minimum (HEP-QUAD-001).
 * @private
 */
function addCutControl(host, addControl, parent, axisKey) {
  const measureKey = host.state[axisKey];
  const input = addControl(`${measureKey} Reference Line`, document.createElement('input'), parent);
  input.type = 'number';
  input.step = '0.1';
  input.min = '0';
  const current = cutFor(host.state.cuts, measureKey, host.state.display);
  input.value = Number.isFinite(current) ? current : '';
  input.onchange = () => {
    const value = Math.max(0, Number(input.value) || 0);
    if (!host.state.cuts[measureKey]) host.state.cuts[measureKey] = {};
    host.state.cuts[measureKey][host.state.display] = value;
    input.value = value;
    host.render();
  };
}

/**
 * The shown scatter points after the categorical filters and the R-Ratio range
 * (HEP-CTRL-010, HEP-CTRL-011). Points with an unknown (NA) R-Ratio are
 * retained.
 * @private
 */
function filteredPoints(host) {
  const filtered = applyFilters(host.allPoints, host.state.filters);
  const { min, max } = host.effectiveRRatio();
  return filtered.filter((point) => {
    if (!Number.isFinite(point.rRatio)) return true;
    return point.rRatio >= min && point.rRatio <= max;
  });
}

/**
 * Refresh the shown/total participant counts, the removed-record note, and the
 * dropped-participant note (HEP-DATA-003, HEP-DISPLAY-004).
 * @private
 */
function updateNotes(host) {
  const totalParticipants = unique(host.cleanRows.map((row) => row[host.settings.id_col])).length;
  const shown = host.points.length;
  const pct = totalParticipants ? ((shown / totalParticipants) * 100).toFixed(1) : '0.0';
  const removedNote = host.removedRecords
    ? `<span class="sv-warning">${host.removedRecords} missing or non-numeric results removed.</span>`
    : '';
  const dropReason =
    host.state.display === 'relative_baseline'
      ? `missing ${host.state.measureX}/${host.state.measureY} peak or baseline`
      : `missing ${host.state.measureX}/${host.state.measureY} peak`;
  const droppedNote = host.droppedParticipants
    ? `<span class="sv-warning">${host.droppedParticipants} participants dropped (${dropReason}).</span>`
    : '';
  host.notes.innerHTML =
    `<span>${shown} of ${totalParticipants} participants shown (${pct}%).</span>` +
    removedNote +
    droppedNote;
}

/**
 * The scatter participant being traced: the hovered participant takes priority
 * over the clicked (sticky) selection, or null when neither is active — the same
 * hover-over-select rule the composite view uses (HEP-SELECT-001).
 * @private
 */
function activeId(host) {
  return host.state.hoverId != null ? host.state.hoverId : host.state.selectedId;
}

/**
 * Whether any scatter participant is currently traced — hovered, or in the
 * control-driven multi-highlight (HEP-SELECT-001, HEP-COMP-007).
 * @private
 */
function anyActive(host) {
  return host.state.hoverId != null || host.scatterSelectedIds.length > 0;
}

/**
 * Whether a scatter point is currently traced: hovered, or one of the
 * Participants-control multi-highlight (a click selection is always mirrored
 * there) (HEP-SELECT-001).
 * @private
 */
function isActive(host, point) {
  if (!point) return false;
  const id = String(point.id);
  if (host.state.hoverId != null && String(host.state.hoverId) === id) return true;
  return host.scatterSelectedIds.includes(id);
}

/**
 * Whether the given participant id is the sticky (clicked) selection.
 * @private
 */
function isSelectedId(host, id) {
  return host.state.selectedId != null && String(host.state.selectedId) === String(id);
}

/**
 * Refresh the shared trace header from the scatter view's hover +
 * multi-highlight (HEP-SELECT-001).
 * @private
 */
function updateHeader(host) {
  host.selection.updateTraceHeader(host.state.hoverId, host.scatterSelectedIds);
}

/**
 * Set the transient hovered scatter participant and restyle the scatter +
 * overlay annotation when it changes, without triggering the drill-down (which
 * stays a click action). The overlay follows the hover, then reverts to the
 * sticky selection when the pointer leaves (HEP-SELECT-001).
 * @private
 */
function setHover(host, id) {
  const norm = id ?? null;
  if (String(norm ?? '') === String(host.state.hoverId ?? '')) return;
  host.state.hoverId = norm;
  if (host.chart) host.chart.update('none');
  const traced = activeId(host);
  host.mainAnnotation.textContent =
    traced == null ? '' : host.selection.annotationText(traced, isSelectedId(host, traced));
  updateHeader(host);
}

/**
 * The palette color for a point given the active grouping (HEP-CTRL-009).
 * @private
 */
function colorFor(host, point) {
  if (host.groupValues.length && point.group != null) {
    return host.colorScale.get(String(point.group)) || BASE_POINT_COLOR;
  }
  return BASE_POINT_COLOR;
}

/**
 * The point radius for the active Point Size mode (HEP-CTRL-007): a uniform
 * radius, or a radius scaled by the participant R-Ratio.
 * @private
 */
function radiusFor(host, point) {
  if (host.state.pointSize !== 'rRatio') return 5;
  const values = host.points.map((candidate) => candidate.rRatio).filter(Number.isFinite);
  const rMax = values.length ? Math.max(...values) : 0;
  if (!Number.isFinite(point.rRatio) || rMax <= 0) return 3;
  return 3 + 7 * (point.rRatio / rMax);
}

/**
 * Draw the Chart.js eDISH scatter: dataset 0 = participant points styled by
 * group, timing, and selection; dataset 1 = the (initially empty) visit-path
 * line overlay. The quadrant plugin draws the cut-lines and labels; clicking a
 * point selects the participant, clicking empty space clears the selection.
 * @private
 */
function drawScatter(host) {
  const points = host.points;
  const data = points.map((point) => ({ x: point.x, y: point.y }));
  const type = host.state.axisType === 'log' ? 'log' : 'linear';
  const xDomain = edishDomain(
    points.map((point) => point.x),
    host.state.xCut,
    type
  );
  const yDomain = edishDomain(
    points.map((point) => point.y),
    host.state.yCut,
    type
  );

  // A participant is "active" when hovered or selected (including the
  // Participants-control multi-highlight); the active points keep their color
  // with a dark ring while the rest dim — the same treatment the composite
  // view uses (HEP-SELECT-001, HEP-COMP-007).
  const traced = (point) => isActive(host, point);
  const fill = (ctx) => {
    const point = points[ctx.dataIndex];
    if (!point) return 'rgba(0,0,0,0)';
    const active = traced(point);
    if (!point.withinWindow && !active) return 'rgba(0,0,0,0)';
    const color = colorFor(host, point);
    const opacity = anyActive(host) ? (active ? 1 : HIGHLIGHT.DIM_FILL) : 0.75;
    return hexToRgba(color, opacity);
  };
  const border = (ctx) => {
    const point = points[ctx.dataIndex];
    if (!point) return 'rgba(0,0,0,0)';
    if (traced(point)) return SELECTION_COLOR;
    const opacity = anyActive(host) ? HIGHLIGHT.DIM_BORDER : 0.9;
    return hexToRgba(colorFor(host, point), opacity);
  };

  const chart = new Chart(host.canvas.getContext('2d'), {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Participants',
          data,
          pointBackgroundColor: fill,
          pointBorderColor: border,
          pointBorderWidth: (ctx) =>
            traced(points[ctx.dataIndex]) ? HIGHLIGHT.BORDER_WIDTH : 1.25,
          pointRadius: (ctx) =>
            radiusFor(host, points[ctx.dataIndex]) +
            (traced(points[ctx.dataIndex]) ? HIGHLIGHT.RADIUS_BOOST : 0),
          pointHoverRadius: (ctx) => radiusFor(host, points[ctx.dataIndex]) + 2
        },
        {
          type: 'line',
          label: 'Visit path',
          data: [],
          showLine: true,
          borderColor: hexToRgba(SELECTION_COLOR, 0.7),
          borderWidth: 1.5,
          pointRadius: 3,
          pointHoverRadius: 4,
          pointBackgroundColor: SELECTION_COLOR,
          pointBorderColor: SELECTION_COLOR
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      animation: false,
      layout: { padding: 6 },
      plugins: {
        legend: { display: false },
        tooltip: {
          // Exclude the visit-path overlay (dataset 1) so hovering the path
          // line never pops an empty tooltip box; only the participant points
          // (dataset 0) carry a tooltip (HEP-CHART-004, HEP-SELECT-003).
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: () => '',
            label: (ctx) =>
              ctx.datasetIndex === 0
                ? pointTooltip(points[ctx.dataIndex], host.state, host.settings.measure_values)
                : ''
          }
        }
      },
      scales: buildScales(host.state, xDomain, yDomain, host.settings.measure_values),
      onHover: (event, active) => {
        const target = event?.native?.target;
        if (target) target.style.cursor = active.length ? 'pointer' : 'default';
        // Trace the hovered participant point (dataset 0 only, never the
        // visit-path overlay) with the same highlight as a selection.
        const hit = active.find((element) => element.datasetIndex === 0);
        setHover(host, hit ? points[hit.index].id : null);
      },
      onClick: (event, active) => {
        const hit = active.find((element) => element.datasetIndex === 0);
        if (hit) host.selectParticipant(points[hit.index].id);
        else host.clearSelection();
      }
    },
    plugins: [quadrantPlugin(host)]
  });
  host.chart = chart;
  host.charts.push(chart);
}

/**
 * Render the color-by legend for the active grouping (HEP-CTRL-009).
 * @private
 */
function drawLegend(host) {
  host.legendEl.innerHTML = '';
  if (!host.groupValues.length) return;
  const groupLabel =
    (host.settings.groups.find((spec) => spec.value_col === host.state.groupBy) || {}).label ||
    host.state.groupBy;
  host.legendEl.append(createElement('strong', null, `${groupLabel}:`));
  host.groupValues.forEach((value) => {
    const chip = createElement('span', 'hep-legend-item');
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:.3rem';
    const swatch = createElement('span');
    swatch.style.cssText = `display:inline-block;width:.75rem;height:.75rem;border-radius:2px;background:${host.colorScale.get(
      String(value)
    )}`;
    chip.append(swatch, document.createTextNode(String(value)));
    host.legendEl.append(chip);
  });
}

/**
 * Render the quadrant summary table (Quadrant | # | %) below the chart from the
 * live classification (HEP-QUAD-005).
 * @private
 */
function drawQuadrantSummary(host) {
  host.quadrantWrap.innerHTML = '';
  const table = createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(createElement('th', null, 'Quadrant'));
  headRow.append(createElement('th', 'hep-num', '#'));
  headRow.append(createElement('th', 'hep-num', '%'));
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement('tbody');
  host.quadrants.labels.forEach((entry) => {
    const tr = document.createElement('tr');
    tr.append(createElement('td', null, entry.label));
    tr.append(createElement('td', 'hep-num', String(entry.count)));
    tr.append(
      createElement(
        'td',
        'hep-num',
        `${Number.isFinite(entry.percent) ? entry.percent.toFixed(1) : '0.0'}%`
      )
    );
    tbody.append(tr);
  });
  table.append(tbody);
  host.quadrantWrap.append(table);
}

/**
 * Re-apply the participant selection that was live before a redraw or a view
 * switch. A single surviving participant reopens every coordinated panel —
 * visit path, lab-over-time chart, measure summary table, and listing — in the
 * active display units (HEP-SELECT-006); several survivors restore the
 * multi-highlight and the Participants control without the single-participant
 * drill-down; participants no longer shown (filtered out, or dropped by the
 * mDISH view for lacking a baseline) fall out, and listeners always hear the
 * surviving selection.
 * @private
 */
function restoreSelection(host, ids) {
  const shownIds = new Set(host.points.map((point) => String(point.id)));
  const survivors = ids.map(String).filter((id) => shownIds.has(id));
  if (survivors.length === 1) {
    host.selectParticipant(survivors[0]);
    return;
  }
  host.scatterSelectedIds = survivors;
  host.selection.sync(survivors);
  if (host.chart) host.chart.update('none');
  updateHeader(host);
  host.selection.dispatch([...survivors]);
}

/** The eDISH/mDISH scatter view component (see THE VIEW CONTRACT above). */
const scatterView = {
  id: 'scatter',
  label: 'eDISH scatter',

  // The shell containers this view occupies: the single scatter canvas, the
  // color-by legend, and the quadrant summary table (HEP-COMP-006).
  slots: ['chart', 'legend', 'quadrantSummary'],

  // The R-Ratio range filter narrows the plotted points, so it belongs to this
  // view's pipeline (HEP-CTRL-010).
  usesRRatioFilter: true,

  /**
   * The scatter's own Settings controls (HEP-CTRL-001, HEP-CTRL-002,
   * HEP-QUAD-001, HEP-DISPLAY-001, HEP-CTRL-006, HEP-CTRL-007, HEP-CTRL-008),
   * appended to the shared Settings section in the order the shell renders them.
   */
  contributeControls(host, { addControl, settingsParent }) {
    // X-axis Measure (HEP-CTRL-001).
    const measureX = addControl('X-axis Measure', document.createElement('select'), settingsParent);
    host.settings.x_options.forEach((key) =>
      option(measureX, key, key, key === host.state.measureX)
    );
    measureX.onchange = () => {
      host.state.measureX = measureX.value;
      host.buildControls();
      host.render();
    };

    // Y-axis Measure — dropped when only one option (HEP-CTRL-002).
    if (host.settings.y_options.length > 1) {
      const measureY = addControl(
        'Y-axis Measure',
        document.createElement('select'),
        settingsParent
      );
      host.settings.y_options.forEach((key) =>
        option(measureY, key, key, key === host.state.measureY)
      );
      measureY.onchange = () => {
        host.state.measureY = measureY.value;
        host.buildControls();
        host.render();
      };
    }

    // Reference lines (the Hy's-Law cutpoints) for each axis (HEP-QUAD-001).
    addCutControl(host, addControl, settingsParent, 'measureX');
    addCutControl(host, addControl, settingsParent, 'measureY');

    // Display Type: eDISH / mDISH (HEP-DISPLAY-001).
    const display = addControl('Display Type', document.createElement('select'), settingsParent);
    DISPLAY_MODES.forEach((mode) =>
      option(display, mode.value, mode.label, mode.value === host.state.display)
    );
    display.onchange = () => {
      host.state.display = display.value;
      host.buildControls();
      host.render();
    };

    // Axis Type: linear / log (HEP-CTRL-006).
    const axisType = addControl('Axis Type', document.createElement('select'), settingsParent);
    AXIS_TYPES.forEach((type) => option(axisType, type, type, type === host.state.axisType));
    axisType.onchange = () => {
      host.state.axisType = axisType.value;
      host.render();
    };

    // Point Size: uniform / rRatio-scaled (HEP-CTRL-007).
    const pointSize = addControl('Point Size', document.createElement('select'), settingsParent);
    POINT_SIZE_OPTIONS.forEach((value) =>
      option(pointSize, value, value, value === host.state.pointSize)
    );
    pointSize.onchange = () => {
      host.state.pointSize = pointSize.value;
      host.render();
    };

    // Timing window (HEP-CTRL-008).
    const window = addControl(
      'Highlight Points Based on Timing',
      document.createElement('input'),
      settingsParent
    );
    window.type = 'number';
    window.min = '0';
    window.step = '1';
    window.value = host.state.visitWindow;
    window.onchange = () => {
      const value = Number(window.value);
      host.state.visitWindow = Number.isFinite(value) && value >= 0 ? value : 0;
      window.value = host.state.visitWindow;
      host.render();
    };
  },

  /**
   * The R-Ratio range filter: min/max number inputs plus a Reset button that
   * restores the initial range (HEP-CTRL-010).
   */
  contributeFilters(host, { addRow, addControl }, parent) {
    const { max, dataMax } = host.effectiveRRatio();
    const row = addRow(parent);
    const min = addControl('R Ratio min', document.createElement('input'), row);
    min.type = 'number';
    min.step = '0.1';
    min.value = Number.isFinite(host.state.rRatio[0]) ? host.state.rRatio[0] : 0;
    min.onchange = () => {
      host.state.rRatio[0] = min.value === '' ? 0 : Number(min.value);
      host.render();
    };
    const maxInput = addControl('R Ratio max', document.createElement('input'), row);
    maxInput.type = 'number';
    maxInput.step = '0.1';
    maxInput.value = formatNumber(max) || dataMax;
    maxInput.onchange = () => {
      host.state.rRatio[1] = maxInput.value === '' ? null : Number(maxInput.value);
      host.render();
    };
    const reset = addControl(' ', document.createElement('button'), parent);
    reset.type = 'button';
    reset.textContent = 'Reset R Ratio';
    reset.style.cssText =
      'width:100%;padding:.3rem .45rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.8rem;cursor:pointer';
    reset.onclick = () => {
      host.state.rRatio = [...host.settings.r_ratio];
      host.buildControls();
      host.render();
    };
  },

  /**
   * Nothing view-local survives a redraw here: the orchestrator's render
   * preamble already clears the hover, the sticky selection and the
   * multi-highlight for every view.
   */
  teardown() {},

  /**
   * Draw the scatter from the cleaned rows: build the per-participant points,
   * apply the filters, refresh the notes, resolve the grouping colors, classify
   * the quadrants, then draw the plot, the legend and the summary table, mount
   * the Participants control, and restore any carried selection
   * (HEP-SELECT-006).
   */
  render(host, { carriedIds = [] } = {}) {
    const built = buildPoints(host.cleanRows, host.settings, host.state);
    host.allPoints = built.points;
    host.droppedParticipants = built.droppedParticipants;
    host.points = filteredPoints(host);
    updateNotes(host);

    if (!host.points.length) {
      host.mainAnnotation.textContent = 'No participants to plot for the current selection.';
      if (carriedIds.length) host.selection.dispatch([]);
      return;
    }

    const grouped = host.state.groupBy && host.state.groupBy !== GROUP_NONE;
    host.groupValues = grouped
      ? unique(host.points.map((point) => point.group))
          .filter((value) => value !== null && value !== undefined)
          .map(String)
          .sort()
      : [];
    host.colorScale = groupColorScale(host.groupValues);

    host.quadrants = classifyQuadrants(host.points, host.state.xCut, host.state.yCut);
    drawScatter(host);
    drawLegend(host);
    drawQuadrantSummary(host);
    host.selection.mount(
      host.compositeSelectSection,
      unique(host.points.map((point) => String(point.id))).map((id) => ({ id }))
    );
    if (carriedIds.length) restoreSelection(host, carriedIds);
  },

  /** The scatter's sticky selection: the Participants-control multi-highlight. */
  selectedIds(host) {
    return host.scatterSelectedIds;
  },

  /**
   * Apply a Participants-control selection to the scatter view (HEP-SELECT-001,
   * HEP-COMP-007): exactly one participant opens the full drill-down (the same
   * path as clicking their point), none clears everything, and several highlight
   * those participants across the scatter — dimming the rest and counting them
   * in the header — while the single-participant drill-down closes.
   */
  onParticipantsChanged(host, ids) {
    if (ids.length === 1) {
      host.selectParticipant(ids[0]);
      return;
    }
    if (!ids.length) {
      host.clearSelection();
      return;
    }
    host.closeDrillDown();
    host.scatterSelectedIds = ids.map(String);
    host.selection.sync(host.scatterSelectedIds);
    if (host.chart) host.chart.update('none');
    updateHeader(host);
    host.selection.dispatch([...host.scatterSelectedIds]);
  },

  /** The Clear selection gesture: the module's public clearSelection. */
  clearSelection(host) {
    host.clearSelection();
  },

  /** Restyle the scatter to the current trace and refresh the header. */
  highlight(host) {
    if (host.chart) host.chart.update('none');
    updateHeader(host);
  }
};

export default scatterView;
