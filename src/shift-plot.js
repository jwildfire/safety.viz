// Public entrypoint for the shift-plot module (#14): a baseline-versus-
// comparison scatter that reuses the lifecycle API, control shell, and linked
// listing proven by the histogram pilot. Behavior tracks the original
// RhoInc/safety-shift-plot renderer (measure + baseline/comparison visit
// controls, per-participant shift pairing, identity line, brush-to-list
// selection, participant counts, invalid-result note) without depending on its
// Webcharts/d3 internals. Internals follow the histogram module flow
// (checkInputs → configure → structureData → getScales/getPlugins → new Chart).

import { Chart, ScatterController, PointElement, LinearScale, Tooltip, Legend } from 'chart.js';

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import { syncSettings } from './shift-plot/configure.js';
import { checkInputs } from './shift-plot/checkInputs.js';
import {
  applyFilters,
  cleanData,
  computeDomain,
  computeShiftPairs,
  listVisits,
  measureLabel,
  unique
} from './shift-plot/structureData.js';
import { buildScales } from './shift-plot/getScales.js';
import {
  brushBoxPlugin,
  COLORS,
  identityLinePlugin,
  pointColors,
  tooltipLines
} from './shift-plot/getPlugins.js';
import { renderListing } from './histogram/listing.js';

Chart.register(ScatterController, PointElement, LinearScale, Tooltip, Legend);

const INITIAL_FOOTNOTE = 'Click and drag across the points to list the selected participants.';

/**
 * Interactive safety shift plot: a Chart.js scatter of each participant's
 * baseline-visit value (x) against their comparison-visit value (y) for a
 * chosen measure, with an identity reference line, measure and baseline/
 * comparison visit controls, configurable filters, participant counts, and a
 * brush selection that opens a linked participant listing. Construct via the
 * shiftPlot() factory rather than directly; the constructor renders the
 * control shell immediately and waits for data.
 */
class SafetyShiftPlot {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Shift Plot target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanData = [];
    this.chartPairs = [];
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.brushing = false;
    this.chart = null;
    this.state = {
      measure: this.settings.start_value,
      baselineVisits: this.settings.baseline_visits,
      comparisonVisits: this.settings.comparison_visits,
      baselineStat: this.settings.baseline_stat,
      comparisonStat: this.settings.comparison_stat,
      filters: {},
      domain: null
    };
    this.renderShell();
  }

  /**
   * Build the static DOM shell the scatter and listing render into.
   * @private
   */
  renderShell() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-shift-plot',
        onToggle: () => this.resize()
      })
    );
    this.footnote.textContent = INITIAL_FOOTNOTE;
  }

  /**
   * Load data and render: an alias for setData that keeps the pilot's
   * two-step create-then-init call shape working (SSP-DATA-003).
   * @param {Object[]} data Long-format result records matching the shift-plot data contract.
   * @returns {SafetyShiftPlot} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. The data is validated against the
   * settings mapping (throwing, and rendering the message into the target
   * element, when required columns are missing), rows with missing or
   * non-numeric results are removed with a console warning, and the controls
   * are rebuilt from the new data's measures and visits.
   * @param {Object[]} data Long-format result records matching the shift-plot data contract.
   * @returns {SafetyShiftPlot} The instance, for chaining.
   */
  setData(data) {
    this.rawData = Array.isArray(data) ? data : [];
    this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Merge setting overrides onto the current settings, re-normalize them (same
   * rules as the factory), rebuild the controls, and re-render.
   * @param {ShiftPlotSettings} settings Setting overrides to merge.
   * @returns {SafetyShiftPlot} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    this.state.baselineStat = this.settings.baseline_stat;
    this.state.comparisonStat = this.settings.comparison_stat;
    if (settings.baseline_visits !== undefined)
      this.state.baselineVisits = this.settings.baseline_visits;
    if (settings.comparison_visits !== undefined)
      this.state.comparisonVisits = this.settings.comparison_visits;
    this.resolveVisits();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data against the settings mapping and drop unusable rows,
   * then resolve the default measure and visit selections.
   * @private
   */
  validateAndCleanData() {
    try {
      checkInputs(this.rawData, this.settings);
    } catch (error) {
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    const { rows, removed } = cleanData(this.rawData, this.settings);
    this.cleanData = rows;
    this.removedRecords = removed;
    if (removed) console.warn(`${removed} missing or non-numeric results have been removed.`);
    const measures = this.measures();
    if (this.state.measure && !measures.includes(this.state.measure)) {
      console.warn(
        `The initial measure [${this.state.measure}] does not exist. Defaulting to the first measure.`
      );
    }
    this.state.measure = measures.includes(this.state.measure) ? this.state.measure : measures[0];
    this.resolveVisits();
  }

  /**
   * Sorted distinct measure labels present in the cleaned data.
   * @private
   */
  measures() {
    return unique(this.cleanData.map((row) => measureLabel(row, this.settings))).sort();
  }

  /**
   * Ordered distinct visit labels present in the cleaned data.
   * @private
   */
  visits() {
    return listVisits(this.cleanData, this.settings);
  }

  /**
   * Resolve the baseline/comparison visit selections against the current data:
   * an unset baseline defaults to the first visit, an unset comparison to
   * every visit after the baseline, and selections naming absent visits are
   * dropped (SSP-CFG-004/005).
   * @private
   */
  resolveVisits() {
    const visits = this.visits();
    let baseline = (this.state.baselineVisits || []).filter((visit) => visits.includes(visit));
    if (!baseline.length) baseline = visits.length ? [visits[0]] : [];
    let comparison = (this.state.comparisonVisits || []).filter((visit) => visits.includes(visit));
    if (!comparison.length) comparison = visits.filter((visit) => !baseline.includes(visit));
    this.state.baselineVisits = baseline;
    this.state.comparisonVisits = comparison;
  }

  /**
   * Rebuild the measure, baseline/comparison visit, and filter controls from
   * data + state.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);
    const visits = this.visits();

    const measure = addControl('Measure', document.createElement('select'));
    this.measures().forEach((value) => option(measure, value, value, value === this.state.measure));
    measure.onchange = () => {
      this.state.measure = measure.value;
      this.render();
    };

    const visitSection = addSection('Visits');
    const baseline = addControl(
      'Baseline visit(s)',
      document.createElement('select'),
      visitSection
    );
    baseline.multiple = true;
    baseline.size = Math.min(Math.max(visits.length, 2), 6);
    visits.forEach((visit) =>
      option(baseline, visit, visit, this.state.baselineVisits.includes(visit))
    );
    baseline.onchange = () => {
      this.state.baselineVisits = Array.from(baseline.selectedOptions).map((opt) => opt.value);
      this.render();
    };

    const comparison = addControl(
      'Comparison visit(s)',
      document.createElement('select'),
      visitSection
    );
    comparison.multiple = true;
    comparison.size = Math.min(Math.max(visits.length, 2), 6);
    visits.forEach((visit) =>
      option(comparison, visit, visit, this.state.comparisonVisits.includes(visit))
    );
    comparison.onchange = () => {
      this.state.comparisonVisits = Array.from(comparison.selectedOptions).map((opt) => opt.value);
      this.render();
    };

    const filterSpecs = this.settings.filters.filter((filter) => {
      const exists = this.cleanData.some((row) => row[filter.value_col] !== undefined);
      if (!exists)
        console.warn(
          `The [ ${filter.label} ] filter has been removed because the variable does not exist.`
        );
      return exists;
    });
    if (filterSpecs.length) {
      const filterParent = addSection('Filters');
      filterSpecs.forEach((filter) => {
        const select = addControl(filter.label, document.createElement('select'), filterParent);
        option(select, '__all__', 'All', !this.state.filters[filter.value_col]);
        unique(this.cleanData.map((row) => row[filter.value_col]))
          .sort()
          .forEach((value) =>
            option(select, value, value, this.state.filters[filter.value_col] === value)
          );
        select.onchange = () => {
          this.state.filters[filter.value_col] = select.value === '__all__' ? null : select.value;
          this.render();
        };
      });
    }
  }

  /**
   * Cleaned rows for the selected measure.
   * @private
   */
  currentMeasureData() {
    return this.cleanData.filter((row) => measureLabel(row, this.settings) === this.state.measure);
  }

  /**
   * Cleaned rows for the selected measure after the active filters.
   * @private
   */
  currentFilteredData() {
    return applyFilters(this.currentMeasureData(), this.state.filters);
  }

  /**
   * The baseline/comparison pairs for the current measure, visits, and filters.
   * @private
   */
  computePairs() {
    return computeShiftPairs({
      rows: this.currentFilteredData(),
      measure: this.state.measure,
      baselineVisits: this.state.baselineVisits,
      comparisonVisits: this.state.comparisonVisits,
      baselineStat: this.state.baselineStat,
      comparisonStat: this.state.comparisonStat,
      settings: this.settings
    });
  }

  /**
   * Redraw everything from the current data, settings, and control state:
   * destroys the live chart, clears the listing and any brush selection, then
   * draws the scatter, the identity line, and the participant-count notes.
   * Called automatically by the controls and the data/settings setters; call
   * it directly only after mutating state by hand.
   * @returns {void}
   */
  render() {
    this.destroyChart();
    this.listingWrap.innerHTML = '';
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.footnote.textContent = INITIAL_FOOTNOTE;
    this.notes.innerHTML = '';
    this.chartPairs = this.computePairs();
    this.state.domain = computeDomain(this.chartPairs);
    this.updateNotes();
    if (!this.chartPairs.length) {
      this.footnote.textContent =
        'No participant has both a baseline and a comparison value for the current selection.';
      return;
    }
    this.drawChart();
  }

  /**
   * Draw the Chart.js scatter with tooltips, the identity line, and the brush
   * selection.
   * @private
   */
  drawChart() {
    const chart = new Chart(this.canvas.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: this.state.measure,
            data: this.chartPairs.map((pair) => ({ x: pair.x, y: pair.y })),
            backgroundColor: COLORS.point,
            borderColor: COLORS.border,
            borderWidth: 1,
            pointRadius: 4,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => tooltipLines(this.chartPairs[ctx.dataIndex], this.settings.id_col)
            }
          }
        },
        scales: buildScales(this.state.domain, this.state.measure)
      },
      plugins: [identityLinePlugin(this), brushBoxPlugin()]
    });
    this.chart = chart;
    this.attachBrush(chart);
  }

  /**
   * Wire the click-drag brush on the chart canvas: dragging paints the gray
   * selection rectangle; releasing selects the enclosed points (or clears the
   * selection when the drag is an empty click) (SSP-REQ-003, SSP-REG-004/012).
   * @private
   */
  attachBrush(chart) {
    const canvas = chart.canvas;
    const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
    const position = (event) => {
      const rect = canvas.getBoundingClientRect();
      const area = chart.chartArea;
      return {
        x: clamp(event.clientX - rect.left, area.left, area.right),
        y: clamp(event.clientY - rect.top, area.top, area.bottom)
      };
    };
    let start = null;
    const onDown = (event) => {
      start = position(event);
      this.brushing = true;
    };
    const onMove = (event) => {
      if (!this.brushing || !start) return;
      const point = position(event);
      chart.$sspBrush = {
        left: Math.min(start.x, point.x),
        right: Math.max(start.x, point.x),
        top: Math.min(start.y, point.y),
        bottom: Math.max(start.y, point.y)
      };
      chart.draw();
    };
    const onUp = (event) => {
      if (!this.brushing || !start) return;
      this.brushing = false;
      const point = position(event);
      const rect = {
        left: Math.min(start.x, point.x),
        right: Math.max(start.x, point.x),
        top: Math.min(start.y, point.y),
        bottom: Math.max(start.y, point.y)
      };
      start = null;
      if (rect.right - rect.left < 3 && rect.bottom - rect.top < 3) {
        this.clearSelection();
        return;
      }
      this.selectInPixelRect(rect);
    };
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    chart.$sspBrushCleanup = () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }

  /**
   * Select every point whose pixel position falls inside a rectangle, opening
   * the listing (or clearing when the rectangle catches nothing).
   * @param {{left:number,right:number,top:number,bottom:number}} rect Pixel rectangle.
   * @returns {void}
   */
  selectInPixelRect(rect) {
    if (!this.chart) return;
    const meta = this.chart.getDatasetMeta(0);
    const selected = new Set();
    meta.data.forEach((element, index) => {
      if (
        element.x >= rect.left &&
        element.x <= rect.right &&
        element.y >= rect.top &&
        element.y <= rect.bottom
      )
        selected.add(index);
    });
    if (!selected.size) {
      this.clearSelection();
      return;
    }
    this.showSelection(selected, rect);
  }

  /**
   * Select points inside a data-space rectangle. The programmatic entry point
   * the R widget bindings and tests use in place of a mouse drag.
   * @param {number} x0 One baseline-axis bound of the rectangle.
   * @param {number} x1 The other baseline-axis bound.
   * @param {number} y0 One comparison-axis bound of the rectangle.
   * @param {number} y1 The other comparison-axis bound.
   * @returns {void}
   */
  brushValues(x0, x1, y0, y1) {
    if (!this.chart) return;
    const { scales } = this.chart;
    this.selectInPixelRect({
      left: scales.x.getPixelForValue(Math.min(x0, x1)),
      right: scales.x.getPixelForValue(Math.max(x0, x1)),
      top: scales.y.getPixelForValue(Math.max(y0, y1)),
      bottom: scales.y.getPixelForValue(Math.min(y0, y1))
    });
  }

  /**
   * Record the selection, de-emphasize the unselected points, draw the gray
   * box, and open the listing (SSP-REQ-003/006/007, SSP-REG-004).
   * @private
   */
  showSelection(selected, rect) {
    const dataset = this.chart.data.datasets[0];
    dataset.backgroundColor = pointColors(this.chartPairs.length, selected, COLORS.point);
    dataset.borderColor = pointColors(this.chartPairs.length, selected, COLORS.border);
    this.chart.$sspBrush = rect;
    this.chart.$sspSelected = selected;
    this.chart.update('none');
    this.currentTableData = [...selected].map((index) => this.chartPairs[index]);
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    renderListing(this);
    this.footnote.textContent = `Selected ${this.currentTableData.length} participant(s).`;
    this.dispatchSelected(this.currentTableData.map((pair) => pair[this.settings.id_col]));
  }

  /**
   * Clear the brush selection: restore uniform point colors, hide the gray box
   * and the listing, and dispatch an empty participantsSelected event
   * (SSP-REG-011).
   * @returns {void}
   */
  clearSelection() {
    if (this.chart) {
      const dataset = this.chart.data.datasets[0];
      dataset.backgroundColor = COLORS.point;
      dataset.borderColor = COLORS.border;
      this.chart.$sspBrush = null;
      this.chart.$sspSelected = null;
      this.chart.update('none');
    }
    this.currentTableData = [];
    this.listingWrap.innerHTML = '';
    this.footnote.textContent = INITIAL_FOOTNOTE;
    this.dispatchSelected([]);
  }

  /**
   * Dispatch the participantsSelected event on the target element with the
   * selected IDs (SSP-API-003).
   * @private
   */
  dispatchSelected(ids) {
    this.element.dispatchEvent(
      new CustomEvent('participantsSelected', { detail: { data: ids }, bubbles: true })
    );
  }

  /**
   * Refresh the shown/total participant counts and the removed-record note
   * (SSP-COUNT-001, SSP-REG-005/020).
   * @private
   */
  updateNotes() {
    const totalParticipants = unique(this.cleanData.map((row) => row[this.settings.id_col])).length;
    const shownParticipants = this.chartPairs.length;
    const pct = totalParticipants
      ? ((shownParticipants / totalParticipants) * 100).toFixed(1)
      : '0.0';
    const removedNote = this.removedRecords
      ? `<span class="sv-warning">${this.removedRecords} missing or non-numeric results removed.</span>`
      : '';
    this.notes.innerHTML = `<span>${shownParticipants} of ${totalParticipants} participants shown (${pct}%).</span>${removedNote}`;
  }

  /**
   * Resize the live chart to its container. For host layouts that change the
   * container size without a window resize — e.g. the R htmlwidget bindings.
   * @returns {void}
   */
  resize() {
    if (this.chart) this.chart.resize();
  }

  /**
   * Destroy the live Chart.js instance and detach its brush listeners without
   * touching the shell.
   * @private
   */
  destroyChart() {
    if (this.chart) {
      if (this.chart.$sspBrushCleanup) this.chart.$sspBrushCleanup();
      this.chart.destroy();
      this.chart = null;
    }
  }

  /**
   * Tear the shift plot down: destroy the Chart.js instance and empty the
   * target element. The instance cannot be reused afterwards — create a new
   * one via the factory instead.
   * @returns {void}
   */
  destroy() {
    this.destroyChart();
    this.element.innerHTML = '';
  }
}

/**
 * Create a safety shift plot inside a container element. The control shell
 * renders immediately; pass long-format result records to setData (or init) on
 * the returned instance to validate the data and draw the scatter.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {ShiftPlotSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyShiftPlot} The live shift-plot instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function shiftPlot(element = 'body', settings = {}) {
  return new SafetyShiftPlot(element, settings);
}
