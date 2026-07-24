// Public entrypoint for the delta-delta module (#25): the paired
// change-from-baseline scatter, built on the histogram's proven lifecycle API
// (init, setData, setSettings, render, resize, destroy) and shared shell.
// Internals follow the same module flow as the histogram
// (checkInputs → configure → structureData → getScales/getPlugins → new Chart).
// A Chart.js reimplementation of RhoInc/safety-delta-delta, matching behavior.

import { Chart, ScatterController, PointElement, LinearScale, Tooltip } from 'chart.js';

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import { arrayify, syncSettings } from './delta-delta/configure.js';
import { checkInputs } from './delta-delta/checkInputs.js';
import {
  applyFilters,
  buildParticipants,
  getMeasures,
  getVisits,
  plottablePoints,
  unique
} from './delta-delta/structureData.js';
import { buildScales, deltaDomain, formatDelta, formatNumber } from './delta-delta/getScales.js';
import {
  linearRegression,
  participantCountText,
  quadrantLinesPlugin,
  regressionLinePlugin,
  selectionBorders
} from './delta-delta/getPlugins.js';
import {
  buildProfileRows,
  mountProfileDock,
  resetProfileDock,
  syncProfileDock,
  unmountProfileDock
} from './profile-host.js';

Chart.register(ScatterController, PointElement, LinearScale, Tooltip);

/**
 * Interactive safety delta-delta plot: a Chart.js scatter of the change in one
 * measure against the change in another, one point per participant, with
 * X/Y measure pickers, baseline/comparison visit multi-selects, configurable
 * filters, quadrant reference lines, an optional regression line, and the
 * docked participant profile opened by clicking a point (#99, PPRF-DD).
 * Construct via the deltaDelta() factory rather than directly; the
 * constructor renders the control shell immediately and waits for data.
 */
class SafetyDeltaDelta {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Delta-Delta target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanRows = [];
    this.removedRecords = 0;
    this.measures = [];
    this.visits = [];
    this.participants = [];
    this.filteredParticipants = [];
    this.points = [];
    this.regression = null;
    this.charts = [];
    this.chart = null;
    this.participantsSelected = [];
    // The docked participant-profile module (#99, PPRF-DD-002): the shared
    // drill-down rendered into the shell's profile slot, fed by the
    // point-click selection through dispatchSelection's participantsSelected
    // event on the shell root. It SUPERSEDES the renderer's bespoke
    // per-measure detail table, removed in the adopting change (PPRF-12,
    // PPRF-DD-004). profileRows is the ONE per-setData profile ingest;
    // profileKey is the idempotency guard.
    this.profile = null;
    this.profileFeed = null;
    this.profileKey = null;
    this.profileRows = [];
    this.state = {
      measureX: this.settings.measure_x,
      measureY: this.settings.measure_y,
      baseline: [...this.settings.baseline_visits],
      comparison: [...this.settings.comparison_visits],
      filters: {},
      addRegressionLine: this.settings.add_regression_line,
      selectedId: null
    };
    this.renderShell();
    mountProfileDock(this, () => this.profileSettings());
  }

  /**
   * The settings handed to the docked participant-profile module (#99,
   * PPRF-DD-002): the shared long-lab column mappings pass through verbatim;
   * `details` come from profile_details, falling back to the host `details`
   * minus the participant id (the profile header already shows it); and the
   * two outbound callbacks wire Clear to the host's own clear path and
   * stepper navigation to transient border emphasis (no dispatch).
   * @private
   */
  profileSettings() {
    const settings = this.settings;
    const profileSettings = {
      id_col: settings.id_col,
      measure_col: settings.measure_col,
      value_col: settings.value_col,
      unit_col: settings.unit_col,
      normal_col_high: settings.normal_col_high,
      normal_col_low: settings.normal_col_low,
      studyday_col: settings.studyday_col,
      visit_col: settings.visit_col,
      visitn_col: settings.visitn_col,
      details:
        settings.profile_details && settings.profile_details.length
          ? settings.profile_details
          : (settings.details || []).filter((detail) => detail.value_col !== settings.id_col),
      participantProfileURL: settings.participantProfileURL ?? null,
      on_clear: () => this.clearSelection(),
      on_step: (id) => this.emphasizeParticipant(id)
    };
    // Only forward a caller-supplied key-measure map — null keeps the profile
    // module's own ALT/AST/TB/ALP defaults.
    if (settings.measure_values) profileSettings.measure_values = settings.measure_values;
    return profileSettings;
  }

  /**
   * Transient chart emphasis for the profile stepper (PPRF-11): border-
   * highlight the stepped participant's point without touching the selection
   * state and without dispatching — the host selection still belongs to the
   * click gesture.
   * @private
   */
  emphasizeParticipant(id) {
    if (!this.chart) return;
    const index = this.points.findIndex((point) => String(point.id) === String(id));
    const borders = selectionBorders(this.points.length, index);
    const dataset = this.chart.data.datasets[0];
    dataset.pointBorderColor = borders.colors;
    dataset.pointBorderWidth = borders.widths;
    this.chart.update();
  }

  /**
   * Build the static DOM shell the chart and measure table render into.
   * @private
   */
  renderShell() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-delta-delta',
        onToggle: () => this.resize()
      })
    );
    this.footnote.textContent = 'Click a point to see details.';
  }

  /**
   * Load data and render: an alias for setData that keeps the two-step
   * create-then-init call shape working.
   * @param {Object[]} data Long-format result records matching the delta-delta data contract.
   * @returns {SafetyDeltaDelta} The instance, for chaining.
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
   * @param {Object[]} data Long-format result records matching the delta-delta data contract.
   * @returns {SafetyDeltaDelta} The instance, for chaining.
   */
  setData(data) {
    this.rawData = Array.isArray(data) ? data : [];
    this.validateAndCleanData();
    this.buildProfileRows();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Derive the docked profile's pre-cleaned rows ONCE per data/settings change
   * (#99, PPRF-DD-002) — never per gesture. The underlying rows are standard
   * long labs: the baseline-vs-comparison delta is NOT re-encoded — the
   * profile shows the full series, which is the supersession story (PPRF-12).
   * @private
   */
  buildProfileRows() {
    this.profileRows = this.settings.profile
      ? buildProfileRows(this.rawData, this.profileSettings())
      : [];
  }

  /**
   * Merge setting overrides onto the current settings, adopt any provided
   * measure/visit/regression selections into the control state, re-normalize
   * the settings, rebuild the controls, and re-render.
   * @param {DeltaDeltaSettings} settings Setting overrides to merge.
   * @returns {SafetyDeltaDelta} The instance, for chaining.
   */
  setSettings(settings) {
    if ('measure_x' in settings) this.state.measureX = settings.measure_x;
    if ('measure_y' in settings) this.state.measureY = settings.measure_y;
    if ('baseline_visits' in settings) this.state.baseline = arrayify(settings.baseline_visits);
    if ('comparison_visits' in settings)
      this.state.comparison = arrayify(settings.comparison_visits);
    if ('add_regression_line' in settings)
      this.state.addRegressionLine = settings.add_regression_line;
    this.settings = syncSettings({ ...this.settings, ...settings });
    if (this.rawData.length) this.validateAndCleanData();
    this.buildProfileRows();
    syncProfileDock(this, () => this.profileSettings());
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data against the settings mapping, drop unusable rows,
   * and refresh the measure/visit lists and their data-driven default
   * selections.
   * @private
   */
  validateAndCleanData() {
    try {
      checkInputs(this.rawData, this.settings);
    } catch (error) {
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    let removed = 0;
    const rows = this.rawData
      .map((row, index) => ({
        ...row,
        __dd_index: index,
        __dd_value: Number(row[this.settings.value_col])
      }))
      .filter((row) => {
        const keep = row[this.settings.value_col] !== '' && Number.isFinite(row.__dd_value);
        if (!keep) removed += 1;
        return keep;
      });
    this.cleanRows = rows;
    this.removedRecords = removed;
    if (removed)
      console.warn(
        `${removed} missing or non-numeric result${removed > 1 ? 's have' : ' has'} been removed.`
      );
    this.measures = getMeasures(this.cleanRows, this.settings);
    this.visits = getVisits(this.cleanRows, this.settings);
    this.resolveStateDefaults();
  }

  /**
   * Fill measure and visit selections from the data when they are unset or no
   * longer valid: x → first measure, y → second measure, baseline → first
   * visit, comparison → last visit (SDD-FUNC-001, SDD-FUNC-002).
   * @private
   */
  resolveStateDefaults() {
    const measures = this.measures;
    const visits = this.visits;
    if (!measures.includes(this.state.measureX)) this.state.measureX = measures[0] ?? null;
    if (!measures.includes(this.state.measureY))
      this.state.measureY = measures[1] ?? measures[0] ?? null;
    const validBaseline = this.state.baseline.filter((visit) => visits.includes(visit));
    this.state.baseline = validBaseline.length ? validBaseline : visits.length ? [visits[0]] : [];
    const validComparison = this.state.comparison.filter((visit) => visits.includes(visit));
    this.state.comparison = validComparison.length
      ? validComparison
      : visits.length
        ? [visits[visits.length - 1]]
        : [];
  }

  /**
   * Rebuild the visit/measure/filter/display controls from data + state.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);

    const visitParent = addSection('Visits');
    const baseline = addControl('Baseline visit(s)', document.createElement('select'), visitParent);
    baseline.multiple = true;
    baseline.size = Math.min(6, Math.max(3, this.visits.length));
    this.visits.forEach((visit) =>
      option(baseline, visit, visit, this.state.baseline.includes(visit))
    );
    baseline.onchange = () => {
      this.state.baseline = [...baseline.selectedOptions].map((opt) => opt.value);
      this.render();
    };

    const comparison = addControl(
      'Comparison visit(s)',
      document.createElement('select'),
      visitParent
    );
    comparison.multiple = true;
    comparison.size = Math.min(6, Math.max(3, this.visits.length));
    this.visits.forEach((visit) =>
      option(comparison, visit, visit, this.state.comparison.includes(visit))
    );
    comparison.onchange = () => {
      this.state.comparison = [...comparison.selectedOptions].map((opt) => opt.value);
      this.render();
    };

    const measureParent = addSection('Measures');
    const measureX = addControl('X Measure', document.createElement('select'), measureParent);
    this.measures.forEach((measure) =>
      option(measureX, measure, measure, measure === this.state.measureX)
    );
    measureX.onchange = () => {
      this.state.measureX = measureX.value;
      this.render();
    };

    const measureY = addControl('Y Measure', document.createElement('select'), measureParent);
    this.measures.forEach((measure) =>
      option(measureY, measure, measure, measure === this.state.measureY)
    );
    measureY.onchange = () => {
      this.state.measureY = measureY.value;
      this.render();
    };

    const filterSpecs = this.settings.filters.filter((filter) => {
      const exists = this.cleanRows.some((row) => row[filter.value_col] !== undefined);
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
        unique(this.cleanRows.map((row) => row[filter.value_col]))
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

    const displayParent = addSection('Display');
    const regression = document.createElement('input');
    regression.type = 'checkbox';
    regression.checked = this.state.addRegressionLine;
    regression.onchange = () => {
      this.state.addRegressionLine = regression.checked;
      this.render();
    };
    const inline = createElement('div', 'sv-control-inline');
    inline.append(regression, document.createTextNode('Show'));
    addControl('Regression Line', inline, displayParent);
  }

  /**
   * Cleaned rows for the current selection after the active filters, flattened
   * to one plottable point per participant.
   * @private
   */
  currentPoints() {
    this.participants = buildParticipants(this.cleanRows, this.settings, this.state);
    this.filteredParticipants = applyFilters(this.participants, this.state.filters);
    return plottablePoints(this.filteredParticipants);
  }

  /**
   * Redraw everything from the current data, settings, and control state:
   * destroys the live chart, clears any point selection and the docked
   * profile, recomputes the per-participant points, and draws the scatter
   * plus the participant-count and regression notes. Called automatically by
   * the controls and the data/settings setters.
   * @returns {void}
   */
  render() {
    this.destroyCharts();
    this.listingWrap.innerHTML = '';
    this.multiplesWrap.innerHTML = '';
    this.state.selectedId = null;
    this.participantsSelected = [];
    // The selection resets silently on every render, so the dock must empty in
    // the same preamble (#99, PPRF-DD-003).
    resetProfileDock(this);
    this.regression = null;
    this.footnote.textContent = '';
    this.mainAnnotation.textContent = 'Click a point to see details.';

    this.points = this.currentPoints();
    this.updateNotes();

    if (!this.points.length) {
      this.mainAnnotation.textContent = 'No participants to plot for the current selection.';
      return;
    }

    if (this.state.addRegressionLine) {
      this.regression = linearRegression(this.points.map((p) => [p.delta_x, p.delta_y]));
      if (this.regression)
        this.footnote.textContent =
          `Dashed line: simple linear regression (${this.regression.string}), ` +
          `R² = ${formatNumber(this.regression.r2)}.`;
    }

    this.drawScatter();
  }

  /**
   * Refresh the shown/total participant counts and the removed-record note.
   * @private
   */
  updateNotes() {
    const total = unique(this.cleanRows.map((row) => row[this.settings.id_col])).length;
    const removedNote = this.removedRecords
      ? `<span class="sv-warning">${this.removedRecords} missing or non-numeric results removed.</span>`
      : '';
    this.notes.innerHTML = `<span>${participantCountText(this.points.length, total)}</span>${removedNote}`;
  }

  /**
   * Draw the Chart.js scatter with quadrant lines, tooltips, point selection,
   * and the optional regression line.
   * @private
   */
  drawScatter() {
    const points = this.points;
    const data = points.map((point) => ({ x: point.delta_x, y: point.delta_y }));
    const xDomain = deltaDomain(points.map((point) => point.delta_x));
    const yDomain = deltaDomain(points.map((point) => point.delta_y));
    const borders = selectionBorders(points.length, -1);

    const chart = new Chart(this.canvas.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Participants',
            data,
            pointBackgroundColor: 'rgba(37, 99, 235, 0.75)',
            pointBorderColor: borders.colors,
            pointBorderWidth: borders.widths,
            pointRadius: 5,
            pointHoverRadius: 7
          }
        ]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        layout: { padding: 6 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) => `Participant: ${points[ctx.dataIndex].id}`,
              afterLabel: (ctx) => {
                const point = points[ctx.dataIndex];
                return (
                  `Change in ${this.state.measureX}: ${formatDelta(point.delta_x)}\n` +
                  `Change in ${this.state.measureY}: ${formatDelta(point.delta_y)}`
                );
              }
            }
          }
        },
        scales: buildScales(this.state.measureX, this.state.measureY, xDomain, yDomain),
        onHover: (event, active) => {
          const target = event?.native?.target;
          if (target) target.style.cursor = active.length ? 'pointer' : 'default';
        },
        onClick: (event, active) => {
          // An empty-canvas click is a clear gesture (#99, PPRF-DD-003) — but
          // only when something is selected, so background clicks don't spam
          // empty participantsSelected dispatches at external listeners
          // (matching hep-explorer and outlier-explorer).
          if (active.length) this.selectPoint(active[0].index);
          else if (this.state.selectedId != null) this.clearSelection();
        }
      },
      plugins: [quadrantLinesPlugin(), regressionLinePlugin(this)]
    });
    chart.$ddPoints = points;
    this.chart = chart;
    this.charts.push(chart);
  }

  /**
   * Select a scatter point: highlight it, note the participant, and dispatch
   * the selection on the shell root — the docked participant profile is the
   * detail view (SDD-REG-012/013 retargeted; #99, PPRF-DD-001/002).
   * @private
   */
  selectPoint(index) {
    const point = this.points[index];
    if (!point) return;
    this.state.selectedId = point.id;
    const borders = selectionBorders(this.points.length, index);
    const dataset = this.chart.data.datasets[0];
    dataset.pointBorderColor = borders.colors;
    dataset.pointBorderWidth = borders.widths;
    this.chart.$ddSelectedIndex = index;
    this.chart.update();
    this.mainAnnotation.textContent = `Participant ${point.id} selected.`;
    this.dispatchSelection([point.id]);
  }

  /**
   * Clear the point selection (#99, PPRF-DD-003): restore the borders, reset
   * the annotation, and dispatch the empty selection so the docked profile
   * empties. Reached from an empty-canvas click and the dock's Clear
   * affordance.
   * @returns {void}
   */
  clearSelection() {
    this.state.selectedId = null;
    if (this.chart) {
      const borders = selectionBorders(this.points.length, -1);
      const dataset = this.chart.data.datasets[0];
      dataset.pointBorderColor = borders.colors;
      dataset.pointBorderWidth = borders.widths;
      this.chart.$ddSelectedIndex = null;
      this.chart.update();
    }
    this.mainAnnotation.textContent = 'Click a point to see details.';
    this.listingWrap.innerHTML = '';
    this.dispatchSelection([]);
  }

  /**
   * Dispatch the custom participantsSelected event on the shell root with the
   * selected IDs — the house selection payload, closing this renderer's
   * dispatch gap (#88 SELN-4; #99, PPRF-DD-001).
   * @private
   */
  dispatchSelection(ids) {
    this.participantsSelected = ids;
    if (this.root) {
      this.root.dispatchEvent(
        new CustomEvent('participantsSelected', { detail: { data: ids }, bubbles: true })
      );
    }
  }

  /**
   * Resize the live chart to its container. For host layouts that change the
   * container size without a window resize — e.g. the R htmlwidget bindings.
   * @returns {void}
   */
  resize() {
    this.charts.forEach((chart) => chart.resize());
  }

  /**
   * Destroy the live Chart.js instance without touching the shell.
   * @private
   */
  destroyCharts() {
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
    this.chart = null;
  }

  /**
   * Tear the delta-delta plot down: destroy the Chart.js instance and empty
   * the target element. The instance cannot be reused afterwards — create a
   * new one via the factory instead.
   * @returns {void}
   */
  destroy() {
    unmountProfileDock(this);
    this.destroyCharts();
    this.element.innerHTML = '';
  }
}

/**
 * Create a safety delta-delta plot inside a container element. The control
 * shell renders immediately; pass long-format result records to setData (or
 * init) on the returned instance to validate the data and draw the scatter.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {DeltaDeltaSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyDeltaDelta} The live delta-delta instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function deltaDelta(element = 'body', settings = {}) {
  return new SafetyDeltaDelta(element, settings);
}
