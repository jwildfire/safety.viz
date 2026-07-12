// Public entrypoint for the results-over-time module (#27): the lifecycle API
// shared with the histogram (init, setData, setSettings, render, resize,
// destroy). A Chart.js reimplementation of RhoInc/safety-results-over-time —
// the population distribution of a measure at each visit as box-and-whisker
// marks with optional grouping and an outlier overlay. Internals follow the
// gsm.viz-style module flow (checkInputs → configure → structureData →
// getScales/getPlugins → new Chart).

import {
  Chart,
  ScatterController,
  PointElement,
  LineElement,
  LinearScale,
  LogarithmicScale,
  Tooltip,
  Legend
} from 'chart.js';

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import { Y_SCALES, syncSettings } from './results-over-time/configure.js';
import { checkInputs } from './results-over-time/checkInputs.js';
import {
  applyFilters,
  cleanData,
  computeVisitOrder,
  flagOutliers,
  isUnscheduledVisit,
  measureLabel,
  summarizeVisitGroups,
  unique
} from './results-over-time/structureData.js';
import {
  normalizeDomain,
  resolveYDomain,
  statPrecisions,
  yPrecision
} from './results-over-time/getScales.js';
import {
  boxWhiskerPlugin,
  groupColors,
  outlierTooltip,
  summaryTooltip
} from './results-over-time/getPlugins.js';

Chart.register(
  ScatterController,
  PointElement,
  LineElement,
  LinearScale,
  LogarithmicScale,
  Tooltip,
  Legend
);

// Fraction of each visit's category width used by its box plots; the rest is
// inter-visit gap. Groups split this band into equal side-by-side slots.
const BAND = 0.8;

/**
 * Interactive safety results-over-time chart: a Chart.js plot of the
 * population distribution of a measure at each visit, drawn as box-and-whisker
 * marks with optional grouping and an outlier overlay, plus
 * measure/filter/limit/scale/display controls. Construct via the
 * resultsOverTime() factory rather than directly; the constructor renders the
 * control shell immediately and waits for data.
 */
class SafetyResultsOverTime {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Results Over Time target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanData = [];
    this.filteredData = [];
    this.charts = [];
    this.boxSpecs = [];
    this.state = {
      measure: this.settings.start_value,
      filters: {},
      groupBy: this.settings.group_by,
      lower: null,
      upper: null,
      yScale: this.settings.y_scale,
      boxplots: this.settings.boxplots,
      outliers: this.settings.outliers,
      visitsWithoutData: this.settings.visits_without_data,
      unscheduledVisits: this.settings.unscheduled_visits
    };
    this.renderShell();
  }

  /**
   * Build the static DOM shell the chart renders into.
   * @private
   */
  renderShell() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-results-over-time',
        onToggle: () => this.resize()
      })
    );
    this.footnote.textContent = 'Hover over a box or outlier point for details.';
  }

  /**
   * Load data and render: an alias for setData that keeps the two-step
   * create-then-init call shape working.
   * @param {Object[]} data Long-format result records matching the results-over-time data contract.
   * @returns {SafetyResultsOverTime} The instance, for chaining.
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
   * are rebuilt from the new data's measures and filter values.
   * @param {Object[]} data Long-format result records matching the results-over-time data contract.
   * @returns {SafetyResultsOverTime} The instance, for chaining.
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
   * @param {ResultsOverTimeSettings} settings Setting overrides to merge.
   * @returns {SafetyResultsOverTime} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    this.state.groupBy = this.settings.group_by;
    this.state.yScale = this.settings.y_scale;
    this.state.boxplots = this.settings.boxplots;
    this.state.outliers = this.settings.outliers;
    this.state.visitsWithoutData = this.settings.visits_without_data;
    this.state.unscheduledVisits = this.settings.unscheduled_visits;
    if (settings.start_value !== undefined) this.state.measure = this.settings.start_value;
    this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data against the settings mapping, drop unusable rows,
   * and cache the study-wide visit order.
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
    this.allVisits = computeVisitOrder(this.cleanData, this.settings);
    const measures = this.measures();
    if (this.state.measure && !measures.includes(this.state.measure)) {
      console.warn(
        `The initial measure [${this.state.measure}] does not exist. Defaulting to the first measure.`
      );
    }
    this.state.measure = measures.includes(this.state.measure) ? this.state.measure : measures[0];
  }

  /**
   * Sorted distinct measure labels present in the cleaned data.
   * @private
   */
  measures() {
    return unique(this.cleanData.map((row) => measureLabel(row, this.settings))).sort();
  }

  /**
   * Cleaned rows for the selected measure.
   * @private
   */
  currentMeasureData() {
    return this.cleanData.filter((row) => measureLabel(row, this.settings) === this.state.measure);
  }

  /**
   * The active grouping column, or null when grouping is disabled.
   * @private
   */
  groupingColumn() {
    return this.state.groupBy && this.state.groupBy !== 'srot_none' ? this.state.groupBy : null;
  }

  /**
   * Rebuild the measure/group/filter/limit/scale/display controls from data
   * and state.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addRow, addControl } = controlBuilders(this.controls);

    const measure = addControl('Measure', document.createElement('select'));
    this.measures().forEach((value) => option(measure, value, value, value === this.state.measure));
    measure.onchange = () => {
      this.state.measure = measure.value;
      this.resetLimits(false);
      this.render();
    };

    const group = addControl('Group by', document.createElement('select'));
    this.settings.groups.forEach((spec) =>
      option(group, spec.value_col, spec.label, spec.value_col === this.state.groupBy)
    );
    group.onchange = () => {
      this.state.groupBy = group.value;
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
    const filterParent = filterSpecs.length ? addSection('Filters') : this.controls;
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

    const yParent = addSection('Y-axis Limits');
    const yRow = addRow(yParent);
    this.lowerInput = addControl('Lower', document.createElement('input'), yRow);
    this.lowerInput.type = 'number';
    this.lowerInput.step = 'any';
    this.lowerInput.value = this.state.lower == null ? '' : this.state.lower;
    this.lowerInput.onchange = () => this.onLimitChange();

    this.upperInput = addControl('Upper', document.createElement('input'), yRow);
    this.upperInput.type = 'number';
    this.upperInput.step = 'any';
    this.upperInput.value = this.state.upper == null ? '' : this.state.upper;
    this.upperInput.onchange = () => this.onLimitChange();

    const reset = createElement('button', 'sv-reset-limits', 'Reset Limits');
    reset.type = 'button';
    reset.onclick = () => this.resetLimits(true);
    const resetWrap = createElement('div', 'sv-control');
    resetWrap.append(reset);
    yParent.append(resetWrap);

    const scale = addControl('Scale', document.createElement('select'), yParent);
    Y_SCALES.forEach((value) => option(scale, value, value, value === this.state.yScale));
    scale.onchange = () => {
      this.state.yScale = scale.value;
      this.render();
    };

    const displayParent = addSection('Display');
    this.addToggle(displayParent, addControl, 'Box plots', 'boxplots');
    this.addToggle(displayParent, addControl, 'Outliers', 'outliers');
    this.addToggle(displayParent, addControl, 'Visits without data', 'visitsWithoutData');
    this.addToggle(displayParent, addControl, 'Unscheduled visits', 'unscheduledVisits');
  }

  /**
   * Add a labeled checkbox bound to a boolean state key.
   * @private
   */
  addToggle(parent, addControl, label, stateKey) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.state[stateKey];
    checkbox.onchange = () => {
      this.state[stateKey] = checkbox.checked;
      this.render();
    };
    const inline = createElement('div', 'sv-control-inline');
    inline.append(checkbox, document.createTextNode('Show'));
    addControl(label, inline, parent);
  }

  /**
   * Apply an edited y-limit: read the inputs, swap a crossed pair, reflect the
   * normalized values back into the inputs, and re-render (SROT-REG-016/017).
   * @private
   */
  onLimitChange() {
    this.state.lower = this.lowerInput.value === '' ? null : Number(this.lowerInput.value);
    this.state.upper = this.upperInput.value === '' ? null : Number(this.upperInput.value);
    normalizeDomain(this.state);
    this.lowerInput.value = this.state.lower == null ? '' : this.state.lower;
    this.upperInput.value = this.state.upper == null ? '' : this.state.upper;
    this.render();
  }

  /**
   * Clear the y-limit overrides back to the data extent (SROT-FUNC-005 /
   * SROT-REG-020); optionally sync the inputs and re-render.
   * @private
   */
  resetLimits(rerender) {
    this.state.lower = null;
    this.state.upper = null;
    if (this.lowerInput) this.lowerInput.value = '';
    if (this.upperInput) this.upperInput.value = '';
    if (rerender) this.render();
  }

  /**
   * The visits to display, in order: the study-wide visit order restricted to
   * visits with data (unless "visits without data" is on) and to scheduled
   * visits (unless "unscheduled visits" is on).
   * @private
   */
  displayVisits(rowsWithData) {
    const withData = new Set(rowsWithData.map((row) => row[this.settings.time_col]));
    return this.allVisits.filter((visit) => {
      if (!this.state.unscheduledVisits && isUnscheduledVisit(visit, this.settings)) return false;
      if (!this.state.visitsWithoutData && !withData.has(visit)) return false;
      return true;
    });
  }

  /**
   * Redraw everything from the current data, settings, and control state:
   * destroys the live chart, recomputes the per-visit-group statistics and box
   * specs, and draws the box-and-whisker plot with its outlier overlay.
   * @returns {void}
   */
  render() {
    this.destroyCharts();
    this.notes.innerHTML = '';
    this.footnote.textContent = 'Hover over a box or outlier point for details.';
    this.boxSpecs = [];
    this.currentVisits = [];
    this.currentGroups = [];

    const measureData = this.currentMeasureData();
    let filtered = applyFilters(measureData, this.state.filters);
    let nonPositive = 0;
    if (this.state.yScale === 'log') {
      const positive = filtered.filter((row) => row.__srot_value > 0);
      nonPositive = filtered.length - positive.length;
      filtered = positive;
    }
    this.filteredData = filtered;

    if (!filtered.length) {
      this.footnote.textContent = 'No records match the current filters.';
      this.updateNotes(measureData, filtered, nonPositive);
      return;
    }

    const grouping = this.groupingColumn();
    const stats = summarizeVisitGroups(filtered, {
      timeCol: this.settings.time_col,
      valueCol: '__srot_value',
      groupCol: grouping
    });
    flagOutliers(filtered, stats, { ...this.settings, outliers: this.state.outliers }, grouping);

    const visits = this.displayVisits(filtered);
    if (!visits.length) {
      this.footnote.textContent = 'No visits to display for the current settings.';
      this.updateNotes(measureData, filtered, nonPositive);
      return;
    }

    const groups = grouping ? unique(filtered.map((row) => String(row[grouping]))).sort() : ['All'];
    const colors = groupColors(groups);
    const domain = this.resolveDomain(measureData);
    const precisions = statPrecisions(yPrecision(domain).precision);
    this.currentVisits = visits;
    this.currentGroups = groups;

    this.drawChart({ visits, groups, colors, stats, domain, precisions, grouping });
    this.updateNotes(measureData, filtered, nonPositive);
  }

  /**
   * The y-domain for the current render: the measure's data extent (positive
   * only on a log scale) with either user limit applied.
   * @private
   */
  resolveDomain(measureData) {
    const values = measureData
      .map((row) => row.__srot_value)
      .filter((value) => this.state.yScale !== 'log' || value > 0);
    const domain = resolveYDomain(values, this.state.lower, this.state.upper);
    if (this.state.yScale === 'log' && domain[0] <= 0) {
      domain[0] = Math.min(...values.filter((value) => value > 0));
    }
    return domain;
  }

  /**
   * Build the per-group datasets (invisible box anchors for tooltips + visible
   * outlier points) and box specs, then create the Chart.js chart.
   * @private
   */
  drawChart({ visits, groups, colors, stats, domain, precisions, grouping }) {
    const layout = { slot: BAND / groups.length };
    const offsetFor = (groupIndex) => -BAND / 2 + layout.slot * (groupIndex + 0.5);
    const halfWidth = layout.slot * 0.4;
    const visitIndex = new Map(visits.map((visit, index) => [visit, index]));

    const datasets = groups.map((group, groupIndex) => {
      const color = colors[group];
      const offset = offsetFor(groupIndex);
      const points = [];
      visits.forEach((visit, index) => {
        const groupStats = (stats[visit] || {})[group];
        const x = index + offset;
        if (this.state.boxplots && groupStats && groupStats.n) {
          this.boxSpecs.push({ x, halfWidth, stats: groupStats, color, group, visit });
          points.push({ x, y: groupStats.median, __box: { group, visit, stats: groupStats } });
        }
      });
      this.filteredData
        .filter(
          (row) =>
            row.__srot_outlier &&
            (grouping ? String(row[grouping]) === group : true) &&
            visitIndex.has(row[this.settings.time_col])
        )
        .forEach((row) => {
          points.push({
            x: visitIndex.get(row[this.settings.time_col]) + offset,
            y: row.__srot_value,
            __outlier: row
          });
        });
      return {
        label: grouping ? group : 'All results',
        data: points,
        backgroundColor: color,
        borderColor: color,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointRadius: (ctx) => (ctx.raw && ctx.raw.__outlier ? 3 : 0),
        pointHoverRadius: (ctx) => (ctx.raw && ctx.raw.__outlier ? 5 : 0),
        pointHitRadius: (ctx) => (ctx.raw && ctx.raw.__outlier ? 4 : 14),
        showLine: false
      };
    });

    const yTitle = this.state.measure;
    const chart = new Chart(this.canvas.getContext('2d'), {
      type: 'scatter',
      data: { datasets },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        interaction: { mode: 'nearest', intersect: true },
        plugins: {
          legend: { display: Boolean(grouping), position: 'top' },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) => {
                const raw = ctx.raw || {};
                if (raw.__box) {
                  return summaryTooltip(
                    raw.__box.group,
                    raw.__box.visit,
                    raw.__box.stats,
                    precisions
                  ).split('\n');
                }
                if (raw.__outlier) {
                  return `Outlier — ${outlierTooltip(raw.__outlier, this.settings, precisions)}`;
                }
                return '';
              }
            }
          }
        },
        scales: {
          x: {
            type: 'linear',
            min: -0.5,
            max: visits.length - 0.5,
            offset: false,
            grid: { display: false },
            title: { display: true, text: this.settings.time_label },
            ticks: {
              stepSize: 1,
              autoSkip: false,
              maxRotation: 45,
              minRotation: 0,
              callback: (value) => (Number.isInteger(value) ? (visits[value] ?? '') : '')
            },
            afterBuildTicks: (axis) => {
              axis.ticks = visits.map((_, index) => ({ value: index }));
            }
          },
          y: {
            type: this.state.yScale === 'log' ? 'logarithmic' : 'linear',
            min: domain[0],
            max: domain[1],
            title: { display: true, text: yTitle }
          }
        }
      },
      plugins: [boxWhiskerPlugin(this)]
    });
    chart.$srotBoxes = this.boxSpecs;
    this.chart = chart;
    this.charts.push(chart);
  }

  /**
   * Refresh the shown/total participant counts and the removed-record notes.
   * @private
   */
  updateNotes(measureData, filtered, nonPositive) {
    const totalParticipants = unique(measureData.map((row) => row[this.settings.id_col])).length;
    const shownParticipants = unique(filtered.map((row) => row[this.settings.id_col])).length;
    const pct = totalParticipants
      ? ((shownParticipants / totalParticipants) * 100).toFixed(1)
      : '0.0';
    const removedNote = this.removedRecords
      ? `<span class="sv-warning">${this.removedRecords} missing or non-numeric results removed.</span>`
      : '';
    const nonPositiveNote = nonPositive
      ? `<span class="sv-warning">${nonPositive} nonpositive result${nonPositive > 1 ? 's' : ''} removed for the log scale.</span>`
      : '';
    this.notes.innerHTML = `<span>${shownParticipants} of ${totalParticipants} participants shown (${pct}%).</span>${removedNote}${nonPositiveNote}`;
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
   * Destroy the live Chart.js instances without touching the shell.
   * @private
   */
  destroyCharts() {
    this.charts.forEach((chart) => chart.destroy());
    this.charts = [];
    this.chart = null;
  }

  /**
   * Tear the chart down: destroy the Chart.js instance and empty the target
   * element. The instance cannot be reused afterwards — create a new one via
   * the factory instead.
   * @returns {void}
   */
  destroy() {
    this.destroyCharts();
    this.element.innerHTML = '';
  }
}

/**
 * Create a safety results-over-time chart inside a container element. The
 * control shell renders immediately; pass long-format result records to
 * setData (or init) on the returned instance to validate the data and draw the
 * chart.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {ResultsOverTimeSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyResultsOverTime} The live results-over-time instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function resultsOverTime(element = 'body', settings = {}) {
  return new SafetyResultsOverTime(element, settings);
}
