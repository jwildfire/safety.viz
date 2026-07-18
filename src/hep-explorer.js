// Public entrypoint for the hep-explorer module (#43): the eDISH/mDISH hepatic
// safety explorer, a Chart.js reimplementation of the SafetyGraphics
// hep-explorer (originally D3v3 + Webcharts). One point per participant plots
// that participant's peak standardized ALT (x) against peak standardized total
// bilirubin (y); two Hy's-Law cut-lines split the plot into four labeled
// quadrants; and clicking a point drives the coordinated participant
// drill-down views — a visit-path overlay on the scatter, a companion
// lab-over-time line chart, a per-measure summary table, and the shared linked
// listing, all in the active display units. Same lifecycle API as the other
// modules (init, setData, setSettings, render, resize, destroy) and the same
// gsm.viz-style module flow (checkInputs → configure → structureData →
// getScales/getPlugins → new Chart). Requirement groups: HEP-CHART-* (scatter/
// axes), HEP-QUAD-* (quadrants/cutpoints), HEP-CTRL-* (controls), HEP-DISPLAY-*
// (eDISH/mDISH), HEP-SELECT-* (participant detail/visit path), HEP-DATA-*,
// HEP-API-*.

import {
  Chart,
  ScatterController,
  LineController,
  PointElement,
  LineElement,
  LinearScale,
  LogarithmicScale,
  Tooltip,
  Legend
} from 'chart.js';

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import {
  GROUP_NONE,
  DISPLAY_MODES,
  VIEW_MODES,
  AXIS_TYPES,
  POINT_SIZE_OPTIONS,
  syncSettings,
  cutFor
} from './hep-explorer/configure.js';
import { checkInputs } from './hep-explorer/checkInputs.js';
import {
  applyFilters,
  assignSequence,
  buildPoints,
  classifyQuadrants,
  cleanData,
  deriveBaseline,
  maxRRatio,
  measureSummary,
  participantMeasureSeries,
  unique,
  visitPathSeries
} from './hep-explorer/structureData.js';
import { axisSuffix, buildScales, edishDomain, formatNumber } from './hep-explorer/getScales.js';
import {
  GROUP_COLORS,
  SELECTION_COLOR,
  groupColorScale,
  hexToRgba,
  pointTooltip,
  quadrantPlugin,
  referenceLinePlugin
} from './hep-explorer/getPlugins.js';
import {
  ALT_ULN_CUT,
  BILI_ULN_CUT,
  BLN_LINES,
  COMPOSITE_QUADRANTS,
  CONCERN_COLORS,
  QUADRANT_STYLE,
  buildCompositeSubjects,
  byArmSummary,
  concernOf,
  migrationMatrix
} from './hep-explorer/composite.js';
import { renderListing } from './histogram/listing.js';

Chart.register(
  ScatterController,
  LineController,
  PointElement,
  LineElement,
  LinearScale,
  LogarithmicScale,
  Tooltip,
  Legend
);

// Base point color when no grouping is active (HEP-CTRL-009 default).
const BASE_POINT_COLOR = GROUP_COLORS[0];

// The idle prompt for the composite view's participant-trace header, shown when
// no participant is hovered or selected (HEP-COMP-007).
const COMPOSITE_HEADER_HINT =
  'Hover a point to trace a participant across every panel; click to keep it selected.';

/**
 * Interactive hepatic safety explorer: a Chart.js eDISH scatter of peak
 * standardized ALT vs peak standardized total bilirubin — one point per
 * participant — with Hy's-Law quadrant cut-lines, a quadrant summary table,
 * eDISH/mDISH display modes, linear/log axes, R-Ratio and timing controls,
 * color-by grouping, and click-to-inspect participant panels (a visit-path
 * overlay, a lab-over-time companion chart, a measure summary table, and the
 * shared linked listing). Construct via the hepExplorer() factory rather than
 * directly; the constructor renders the control shell immediately and waits
 * for data.
 */
class SafetyHepExplorer {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Hep Explorer target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanRows = [];
    this.removedRecords = 0;
    this.droppedParticipants = 0;
    this.allPoints = [];
    this.points = [];
    this.rRatioMax = 0;
    this.groupValues = [];
    this.colorScale = new Map();
    this.quadrants = { counts: {}, labels: [] };
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.charts = [];
    this.chart = null;
    // Composite-view participant cross-linking (HEP-COMP-007): the charts to
    // restyle together, the shown subjects, the transient hover id and the
    // sticky (clicked) selection id, and the trace header element.
    this.compositeCharts = [];
    this.compositeSubjectsShown = [];
    this.compositeHoverId = null;
    this.compositeSelectedId = null;
    this.compositeHeaderEl = null;
    this.participantsSelected = [];
    this.state = {
      view: this.settings.view === 'composite' ? 'composite' : 'scatter',
      measureX: this.settings.x_default,
      measureY: this.settings.y_default,
      display: 'relative_uln',
      axisType: 'linear',
      pointSize: 'Uniform',
      visitWindow: this.settings.visit_window,
      groupBy: this.settings.group_by,
      filters: {},
      rRatio: [...this.settings.r_ratio],
      cuts: JSON.parse(JSON.stringify(this.settings.cuts)),
      selectedId: null,
      xCut: null,
      yCut: null
    };
    this.renderShell();
  }

  /**
   * Build the static DOM shell the scatter, legend, quadrant summary,
   * participant-detail panels, and listing render into.
   * @private
   */
  renderShell() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-hep-explorer',
        onToggle: () => this.resize()
      })
    );
    this.legendEl = createElement('div', 'hep-legend');
    this.legendEl.style.cssText =
      'display:flex;flex-wrap:wrap;gap:.35rem .9rem;font-size:.8rem;color:#52616f;margin:0 0 .5rem';
    this.main.insertBefore(this.legendEl, this.chartWrap);

    // Quadrant summary table sits directly below the chart footnote.
    this.quadrantWrap = createElement('div', 'hep-quadrant-summary');
    this.main.insertBefore(this.quadrantWrap, this.multiplesWrap);

    // Composite plot container (pretreatment/on-treatment eDISH panels, the
    // four-panel ×Baseline shift plot, and the migration table), hidden until
    // the composite view is selected (HEP-COMP-*).
    this.compositeWrap = createElement('div', 'hep-composite');
    this.compositeWrap.style.display = 'none';
    this.main.insertBefore(this.compositeWrap, this.multiplesWrap);

    // Participant drill-down container (lab-over-time chart + measure summary),
    // hidden until a point is selected (HEP-SELECT-002, HEP-SELECT-005).
    this.detailWrap = createElement('div', 'hep-detail');
    this.detailWrap.style.display = 'none';
    this.main.insertBefore(this.detailWrap, this.listingWrap);

    this.applyModuleStyles();
    this.footnote.textContent = this.baseFootnote();
  }

  /**
   * Inject the module-specific stylesheet (quadrant summary + detail panels)
   * once per document; the shared shell stylesheet stays module-agnostic.
   * @private
   */
  applyModuleStyles() {
    const id = 'safety-viz-hep-explorer-styles';
    if (typeof document === 'undefined' || document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
.safety-hep-explorer .hep-quadrant-summary{margin-top:1rem}
.safety-hep-explorer .hep-quadrant-summary table{width:100%;max-width:420px;border-collapse:collapse;font-size:.85rem;background:#fff}
.safety-hep-explorer .hep-quadrant-summary th,.safety-hep-explorer .hep-quadrant-summary td{border-bottom:1px solid #e3e8ee;padding:.4rem .55rem;text-align:left}
.safety-hep-explorer .hep-quadrant-summary th{border-bottom:2px solid #d8dee4;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f}
.safety-hep-explorer .hep-quadrant-summary td.hep-num,.safety-hep-explorer .hep-quadrant-summary th.hep-num{text-align:right;font-variant-numeric:tabular-nums}
.safety-hep-explorer .hep-detail{margin-top:1.25rem;border-top:2px solid #111827;padding-top:.75rem}
.safety-hep-explorer .hep-detail-title{font-size:.95rem;margin:0 0 .5rem}
.safety-hep-explorer .hep-detail-chart{height:220px;position:relative;border:1px solid #d8dee4;border-radius:10px;padding:.75rem;background:#fff}
.safety-hep-explorer .hep-summary-table{width:100%;max-width:520px;border-collapse:collapse;font-size:.85rem;background:#fff;margin-top:.9rem}
.safety-hep-explorer .hep-summary-table th,.safety-hep-explorer .hep-summary-table td{border-bottom:1px solid #e3e8ee;padding:.4rem .55rem;text-align:left}
.safety-hep-explorer .hep-summary-table th{border-bottom:2px solid #d8dee4;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em;color:#52616f}
.safety-hep-explorer .hep-summary-table td.hep-num,.safety-hep-explorer .hep-summary-table th.hep-num{text-align:right;font-variant-numeric:tabular-nums}
.safety-hep-explorer .hep-composite{margin-top:.5rem}
.safety-hep-explorer .hep-composite-header{font-size:.85rem;color:#52616f;background:#f6f8fa;border:1px solid #e3e8ee;border-radius:8px;padding:.4rem .6rem;margin:0 0 .6rem;min-height:1.2rem}
.safety-hep-explorer .hep-composite-header.is-active{color:#1f2933;font-weight:600;border-color:#b8c0cc;background:#eef2f6}
.safety-hep-explorer .hep-composite-legend{display:flex;flex-wrap:wrap;gap:.35rem 1rem;font-size:.8rem;color:#52616f;margin:0 0 .75rem}
.safety-hep-explorer .hep-composite-legend .hep-legend-item{display:inline-flex;align-items:center;gap:.3rem}
.safety-hep-explorer .hep-composite-section-title{font-size:.9rem;margin:1rem 0 .5rem;color:#1f2933}
.safety-hep-explorer .hep-composite-edish{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:1rem}
.safety-hep-explorer .hep-composite-panels{display:grid;grid-template-columns:1fr 1fr;gap:.75rem;max-width:760px}
.safety-hep-explorer .hep-composite-card{border:1px solid #d8dee4;border-radius:10px;padding:.6rem .7rem;background:#fff}
.safety-hep-explorer .hep-composite-card h4{font-size:.82rem;margin:0 0 .4rem;color:#52616f;font-weight:600}
.safety-hep-explorer .hep-composite-canvas{height:280px;position:relative}
.safety-hep-explorer .hep-composite-panel-canvas{height:210px;position:relative}
.safety-hep-explorer .hep-migration{margin-top:1.25rem}
.safety-hep-explorer .hep-migration table{border-collapse:collapse;font-size:.82rem;background:#fff}
.safety-hep-explorer .hep-migration th,.safety-hep-explorer .hep-migration td{border:1px solid #d8dee4;padding:.35rem .55rem;text-align:center}
.safety-hep-explorer .hep-migration th{font-size:.72rem;text-transform:uppercase;letter-spacing:.02em;color:#52616f;font-weight:700}
.safety-hep-explorer .hep-migration td.hep-rowhead{text-align:left;font-weight:600;color:#1f2933;white-space:nowrap}
.safety-hep-explorer .hep-migration td.hep-total,.safety-hep-explorer .hep-migration th.hep-total{background:#f6f8fa;font-weight:700}
.safety-hep-explorer .hep-migration caption{caption-side:top;text-align:left;font-size:.82rem;color:#52616f;margin-bottom:.35rem}
.safety-hep-explorer .hep-concern-legend{display:flex;flex-wrap:wrap;gap:.35rem .9rem;font-size:.76rem;color:#52616f;margin:.5rem 0 0}
.safety-hep-explorer .hep-concern-legend .hep-legend-item{display:inline-flex;align-items:center;gap:.3rem}
.safety-hep-explorer .hep-concern-swatch{display:inline-block;width:.8rem;height:.8rem;border:1px solid #b8c0cc;border-radius:2px}`;
    document.head.append(style);
  }

  /**
   * The base footnote: usage hint plus the timing-window sentence explaining
   * filled vs hollow points (HEP-DISPLAY-005).
   * @private
   */
  baseFootnote() {
    return (
      'Use controls to update the chart or click a point to see participant details. ' +
      `Points are filled when a participant's peak ${this.state.measureX} and peak ` +
      `${this.state.measureY} occur within ${this.state.visitWindow} days of each other.`
    );
  }

  /**
   * Load data and render: an alias for setData that keeps the two-step
   * create-then-init call shape working (HEP-API-001).
   * @param {Object[]} data Long-format lab records matching the hep-explorer data contract.
   * @returns {SafetyHepExplorer} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. The data is validated against the
   * settings mapping (throwing, and rendering the message into the target
   * element, when required columns are missing), rows with missing or
   * non-numeric values/ULN are removed with a console warning, baselines are
   * derived for the mDISH view, and the controls are rebuilt from the new data.
   * @param {Object[]} data Long-format lab records matching the hep-explorer data contract.
   * @returns {SafetyHepExplorer} The instance, for chaining.
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
   * rules as the factory), re-seed the affected control state, rebuild the
   * controls, and re-render.
   * @param {HepExplorerSettings} settings Setting overrides to merge.
   * @returns {SafetyHepExplorer} The instance, for chaining.
   */
  setSettings(settings) {
    this.settings = syncSettings({ ...this.settings, ...settings });
    if ('view' in settings)
      this.state.view = this.settings.view === 'composite' ? 'composite' : 'scatter';
    if ('x_default' in settings) this.state.measureX = this.settings.x_default;
    if ('y_default' in settings) this.state.measureY = this.settings.y_default;
    if ('visit_window' in settings) this.state.visitWindow = this.settings.visit_window;
    if ('group_by' in settings) this.state.groupBy = this.settings.group_by;
    if ('cuts' in settings) this.state.cuts = JSON.parse(JSON.stringify(this.settings.cuts));
    if ('r_ratio' in settings) this.state.rRatio = [...this.settings.r_ratio];
    this.state.filters = {};
    if (this.rawData.length) this.validateAndCleanData();
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Validate the raw data against the settings mapping, drop unusable rows,
   * derive baselines, resolve the active measure selections, and derive the
   * linked-listing columns when none were supplied.
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
    deriveBaseline(rows, this.settings);
    // Number each participant × measure record in input order, the timing
    // fallback used when the data carries no usable study day (HEP-DATA-004).
    assignSequence(rows, this.settings);
    this.cleanRows = rows;
    this.removedRecords = removed;
    // Precompute the data-derived R-Ratio maximum so the R-Ratio range filter's
    // max input seeds correctly on the first buildControls, before render()
    // populates this.allPoints (HEP-CTRL-010).
    this.rRatioMax = maxRRatio(rows, this.settings);
    if (removed)
      console.warn(
        `${removed} missing or non-numeric result${removed > 1 ? 's have' : ' has'} been removed.`
      );

    const xOptions = this.settings.x_options;
    const yOptions = this.settings.y_options;
    if (!xOptions.includes(this.state.measureX)) this.state.measureX = xOptions[0];
    if (!yOptions.includes(this.state.measureY)) this.state.measureY = yOptions[0];

    if (!this.settings.details.length) {
      this.settings.details = [
        { value_col: this.settings.id_col, label: 'Participant' },
        { value_col: this.settings.measure_col, label: 'Measure' },
        { value_col: '__hep_dayLabel', label: 'Study Day' },
        { value_col: this.settings.value_col, label: 'Result' },
        { value_col: this.settings.normal_col_high, label: 'ULN' },
        { value_col: '__hep_relText', label: '×ULN' }
      ];
    }
  }

  /**
   * The categorical filters whose column is present in the data; absent-column
   * filters are dropped with a console warning (HEP-CTRL-011).
   * @private
   */
  activeFilterSpecs() {
    return this.settings.filters.filter((filter) => {
      const exists = this.cleanRows.some((row) => row[filter.value_col] !== undefined);
      if (!exists)
        console.warn(
          `The [ ${filter.label} ] filter has been removed because the variable does not exist.`
        );
      return exists;
    });
  }

  /**
   * The R-Ratio [min, max] range in effect, resolving a null max to the largest
   * finite participant R-Ratio in the data (HEP-CTRL-010).
   * @private
   */
  effectiveRRatio() {
    const values = this.allPoints.map((point) => point.rRatio).filter(Number.isFinite);
    // Before render() builds this.allPoints (e.g. the first buildControls in
    // setData), fall back to the data-derived maximum computed at clean time so
    // the max input never seeds to 0 (HEP-CTRL-010).
    const dataMax = values.length ? Math.max(...values) : this.rRatioMax || 0;
    const min = Number.isFinite(this.state.rRatio[0]) ? this.state.rRatio[0] : 0;
    const max = Number.isFinite(this.state.rRatio[1]) ? this.state.rRatio[1] : dataMax;
    return { min, max, dataMax };
  }

  /**
   * Rebuild the settings/filters controls from data + state (HEP-CTRL-*). Only
   * controls with ≥2 meaningful options are rendered: the Y-measure picker is
   * dropped when a single option, Group when only None, and the R-Ratio filter
   * when r_ratio_filter is false.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addRow, addControl } = controlBuilders(this.controls);
    const settingsParent = addSection('Settings');

    // View: scatter (eDISH/mDISH) or the baseline-referenced composite plot
    // (HEP-COMP-006). The composite view replaces the single scatter and its
    // scatter-only controls with the composite panels + migration table.
    const scatter = this.state.view !== 'composite';
    const view = addControl('View', document.createElement('select'), settingsParent);
    VIEW_MODES.forEach((mode) =>
      option(view, mode.value, mode.label, mode.value === this.state.view)
    );
    view.onchange = () => {
      this.state.view = view.value === 'composite' ? 'composite' : 'scatter';
      this.buildControls();
      this.render();
    };

    // X-axis Measure (HEP-CTRL-001).
    if (scatter) {
      const measureX = addControl(
        'X-axis Measure',
        document.createElement('select'),
        settingsParent
      );
      this.settings.x_options.forEach((key) =>
        option(measureX, key, key, key === this.state.measureX)
      );
      measureX.onchange = () => {
        this.state.measureX = measureX.value;
        this.buildControls();
        this.render();
      };

      // Y-axis Measure — dropped when only one option (HEP-CTRL-002).
      if (this.settings.y_options.length > 1) {
        const measureY = addControl(
          'Y-axis Measure',
          document.createElement('select'),
          settingsParent
        );
        this.settings.y_options.forEach((key) =>
          option(measureY, key, key, key === this.state.measureY)
        );
        measureY.onchange = () => {
          this.state.measureY = measureY.value;
          this.buildControls();
          this.render();
        };
      }

      // Reference lines (the Hy's-Law cutpoints) for each axis (HEP-QUAD-001).
      this.addCutControl(addControl, settingsParent, 'measureX');
      this.addCutControl(addControl, settingsParent, 'measureY');

      // Display Type: eDISH / mDISH (HEP-DISPLAY-001).
      const display = addControl('Display Type', document.createElement('select'), settingsParent);
      DISPLAY_MODES.forEach((mode) =>
        option(display, mode.value, mode.label, mode.value === this.state.display)
      );
      display.onchange = () => {
        this.state.display = display.value;
        this.buildControls();
        this.render();
      };

      // Axis Type: linear / log (HEP-CTRL-006).
      const axisType = addControl('Axis Type', document.createElement('select'), settingsParent);
      AXIS_TYPES.forEach((type) => option(axisType, type, type, type === this.state.axisType));
      axisType.onchange = () => {
        this.state.axisType = axisType.value;
        this.render();
      };

      // Point Size: uniform / rRatio-scaled (HEP-CTRL-007).
      const pointSize = addControl('Point Size', document.createElement('select'), settingsParent);
      POINT_SIZE_OPTIONS.forEach((value) =>
        option(pointSize, value, value, value === this.state.pointSize)
      );
      pointSize.onchange = () => {
        this.state.pointSize = pointSize.value;
        this.render();
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
      window.value = this.state.visitWindow;
      window.onchange = () => {
        const value = Number(window.value);
        this.state.visitWindow = Number.isFinite(value) && value >= 0 ? value : 0;
        window.value = this.state.visitWindow;
        this.render();
      };
    }

    // Group / color-by — dropped when only the None option (HEP-CTRL-009). In
    // the composite view this drives the by-arm concern/benefit summary.
    if (this.settings.groups.length > 1) {
      const group = addControl('Group', document.createElement('select'), settingsParent);
      this.settings.groups.forEach((spec) =>
        option(group, spec.value_col, spec.label, spec.value_col === this.state.groupBy)
      );
      group.onchange = () => {
        this.state.groupBy = group.value;
        this.render();
      };
    }

    // Filters section (HEP-CTRL-011) plus the R-Ratio range filter (HEP-CTRL-010).
    const filterSpecs = this.activeFilterSpecs();
    const showRRatio = this.settings.r_ratio_filter && scatter;
    if (filterSpecs.length || showRRatio) {
      const filterParent = addSection('Filters');
      filterSpecs.forEach((filter) => {
        const select = addControl(filter.label, document.createElement('select'), filterParent);
        option(select, '__all__', 'All', !this.state.filters[filter.value_col]);
        unique(this.cleanRows.map((row) => row[filter.value_col]))
          .sort()
          .forEach((value) =>
            option(
              select,
              value,
              value,
              String(this.state.filters[filter.value_col]) === String(value)
            )
          );
        select.onchange = () => {
          this.state.filters[filter.value_col] = select.value === '__all__' ? null : select.value;
          this.render();
        };
      });
      if (showRRatio) this.addRRatioControl(addRow, addControl, filterParent);
    }

    // Reset Chart (HEP-CTRL-012).
    const reset = addControl(' ', document.createElement('button'), this.controls);
    reset.type = 'button';
    reset.textContent = 'Reset Chart';
    reset.className = 'hep-reset';
    reset.style.cssText =
      'width:100%;margin-top:.75rem;padding:.35rem .45rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.82rem;cursor:pointer';
    reset.onclick = () => this.resetChart();
  }

  /**
   * Add a reference-line (cutpoint) number input for one axis; edits write the
   * per-measure, per-display cut into state.cuts and clamp it to ≥ 0 so it
   * cannot fall below the axis minimum (HEP-QUAD-001).
   * @private
   */
  addCutControl(addControl, parent, axisKey) {
    const measureKey = this.state[axisKey];
    const input = addControl(
      `${measureKey} Reference Line`,
      document.createElement('input'),
      parent
    );
    input.type = 'number';
    input.step = '0.1';
    input.min = '0';
    const current = cutFor(this.state.cuts, measureKey, this.state.display);
    input.value = Number.isFinite(current) ? current : '';
    input.onchange = () => {
      const value = Math.max(0, Number(input.value) || 0);
      if (!this.state.cuts[measureKey]) this.state.cuts[measureKey] = {};
      this.state.cuts[measureKey][this.state.display] = value;
      input.value = value;
      this.render();
    };
  }

  /**
   * Add the R-Ratio range filter: min/max number inputs plus a Reset button
   * that restores the initial range (HEP-CTRL-010).
   * @private
   */
  addRRatioControl(addRow, addControl, parent) {
    const { max, dataMax } = this.effectiveRRatio();
    const row = addRow(parent);
    const min = addControl('R Ratio min', document.createElement('input'), row);
    min.type = 'number';
    min.step = '0.1';
    min.value = Number.isFinite(this.state.rRatio[0]) ? this.state.rRatio[0] : 0;
    min.onchange = () => {
      this.state.rRatio[0] = min.value === '' ? 0 : Number(min.value);
      this.render();
    };
    const maxInput = addControl('R Ratio max', document.createElement('input'), row);
    maxInput.type = 'number';
    maxInput.step = '0.1';
    maxInput.value = formatNumber(max) || dataMax;
    maxInput.onchange = () => {
      this.state.rRatio[1] = maxInput.value === '' ? null : Number(maxInput.value);
      this.render();
    };
    const reset = addControl(' ', document.createElement('button'), parent);
    reset.type = 'button';
    reset.textContent = 'Reset R Ratio';
    reset.style.cssText =
      'width:100%;padding:.3rem .45rem;border:1px solid #b8c0cc;border-radius:6px;background:#fff;font:inherit;font-size:.8rem;cursor:pointer';
    reset.onclick = () => {
      this.state.rRatio = [...this.settings.r_ratio];
      this.buildControls();
      this.render();
    };
  }

  /**
   * Reset the cutpoints, display mode, axis type, point size, filters, and
   * R-Ratio range to their initial values, then rebuild and redraw
   * (HEP-CTRL-012).
   * @private
   */
  resetChart() {
    this.state.cuts = JSON.parse(JSON.stringify(this.settings.cuts));
    this.state.display = 'relative_uln';
    this.state.axisType = 'linear';
    this.state.pointSize = 'Uniform';
    this.state.visitWindow = this.settings.visit_window;
    this.state.filters = {};
    this.state.rRatio = [...this.settings.r_ratio];
    this.buildControls();
    this.render();
  }

  /**
   * The shown scatter points after the categorical filters and the R-Ratio
   * range (HEP-CTRL-010, HEP-CTRL-011). Points with an unknown (NA) R-Ratio are
   * retained.
   * @private
   */
  filteredPoints() {
    const filtered = applyFilters(this.allPoints, this.state.filters);
    const { min, max } = this.effectiveRRatio();
    return filtered.filter((point) => {
      if (!Number.isFinite(point.rRatio)) return true;
      return point.rRatio >= min && point.rRatio <= max;
    });
  }

  /**
   * Redraw everything from the current data, settings, and control state:
   * destroys the live charts, clears the listing, legend, quadrant summary,
   * and any selection, recomputes the per-participant points and quadrants,
   * then draws the scatter, legend, and quadrant summary table (or an
   * empty-data message). A live participant selection survives the redraw:
   * when the participant is still shown, every coordinated panel — scatter
   * highlight, visit path, lab-over-time chart, summary table, and listing —
   * is re-rendered from the same selection in the active display units
   * (HEP-SELECT-006); otherwise the selection is cleared and listeners are
   * notified. Called automatically by the controls and the data/settings
   * setters.
   * @returns {void}
   */
  render() {
    // Remember a live selection so control-driven redraws (display type, axis
    // type, cutpoints, timing window, …) restore the coordinated participant
    // panels in the new units instead of dropping them (HEP-SELECT-006).
    const previousSelectedId = this.state.selectedId;
    this.destroyCharts();
    this.listingWrap.innerHTML = '';
    this.legendEl.innerHTML = '';
    this.quadrantWrap.innerHTML = '';
    this.compositeWrap.innerHTML = '';
    this.detailWrap.innerHTML = '';
    this.detailWrap.style.display = 'none';
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.state.selectedId = null;
    this.participantsSelected = [];
    this.notes.innerHTML = '';
    this.mainAnnotation.textContent = '';
    this.footnote.textContent = this.baseFootnote();

    const composite = this.state.view === 'composite';
    this.setViewVisibility(composite);

    this.state.xCut = cutFor(this.state.cuts, this.state.measureX, this.state.display);
    this.state.yCut = cutFor(this.state.cuts, this.state.measureY, this.state.display);

    if (!this.cleanRows.length) {
      this.notes.innerHTML = '<span>No data selected. Provide records to draw the chart.</span>';
      if (previousSelectedId != null) this.dispatchSelection([]);
      return;
    }

    if (composite) {
      this.renderComposite();
      if (previousSelectedId != null) this.dispatchSelection([]);
      return;
    }

    const built = buildPoints(this.cleanRows, this.settings, this.state);
    this.allPoints = built.points;
    this.droppedParticipants = built.droppedParticipants;
    this.points = this.filteredPoints();
    this.updateNotes();

    if (!this.points.length) {
      this.mainAnnotation.textContent = 'No participants to plot for the current selection.';
      if (previousSelectedId != null) this.dispatchSelection([]);
      return;
    }

    const grouped = this.state.groupBy && this.state.groupBy !== GROUP_NONE;
    this.groupValues = grouped
      ? unique(this.points.map((point) => point.group))
          .filter((value) => value !== null && value !== undefined)
          .map(String)
          .sort()
      : [];
    this.colorScale = groupColorScale(this.groupValues);

    this.quadrants = classifyQuadrants(this.points, this.state.xCut, this.state.yCut);
    this.drawScatter();
    this.drawLegend();
    this.drawQuadrantSummary();
    if (previousSelectedId != null) this.restoreSelection(previousSelectedId);
  }

  /**
   * Re-apply a participant selection that was live before a redraw. When the
   * participant is still among the shown points, selectParticipant re-renders
   * every coordinated panel — visit path, lab-over-time chart, measure summary
   * table, and listing — in the active display units and re-announces the
   * selection (HEP-SELECT-006); when the participant is no longer shown (for
   * example filtered out, or dropped by the mDISH view for lacking a
   * baseline), the already-cleared selection is confirmed to listeners with an
   * empty participantsSelected event.
   * @param {string|number} id The previously selected participant identifier.
   * @private
   */
  restoreSelection(id) {
    const shown = this.points.some((point) => String(point.id) === String(id));
    if (shown) this.selectParticipant(id);
    else this.dispatchSelection([]);
  }

  /**
   * Refresh the shown/total participant counts, the removed-record note, and
   * the dropped-participant note (HEP-DATA-003, HEP-DISPLAY-004).
   * @private
   */
  updateNotes() {
    const totalParticipants = unique(this.cleanRows.map((row) => row[this.settings.id_col])).length;
    const shown = this.points.length;
    const pct = totalParticipants ? ((shown / totalParticipants) * 100).toFixed(1) : '0.0';
    const removedNote = this.removedRecords
      ? `<span class="sv-warning">${this.removedRecords} missing or non-numeric results removed.</span>`
      : '';
    const dropReason =
      this.state.display === 'relative_baseline'
        ? `missing ${this.state.measureX}/${this.state.measureY} peak or baseline`
        : `missing ${this.state.measureX}/${this.state.measureY} peak`;
    const droppedNote = this.droppedParticipants
      ? `<span class="sv-warning">${this.droppedParticipants} participants dropped (${dropReason}).</span>`
      : '';
    this.notes.innerHTML =
      `<span>${shown} of ${totalParticipants} participants shown (${pct}%).</span>` +
      removedNote +
      droppedNote;
  }

  /**
   * Whether a point is the currently selected participant.
   * @private
   */
  isSelected(point) {
    return this.state.selectedId != null && String(point.id) === String(this.state.selectedId);
  }

  /**
   * The palette color for a point given the active grouping (HEP-CTRL-009).
   * @private
   */
  colorFor(point) {
    if (this.groupValues.length && point.group != null) {
      return this.colorScale.get(String(point.group)) || BASE_POINT_COLOR;
    }
    return BASE_POINT_COLOR;
  }

  /**
   * The point radius for the active Point Size mode (HEP-CTRL-007): a uniform
   * radius, or a radius scaled by the participant R-Ratio.
   * @private
   */
  radiusFor(point) {
    if (this.state.pointSize !== 'rRatio') return 5;
    const values = this.points.map((candidate) => candidate.rRatio).filter(Number.isFinite);
    const rMax = values.length ? Math.max(...values) : 0;
    if (!Number.isFinite(point.rRatio) || rMax <= 0) return 3;
    return 3 + 7 * (point.rRatio / rMax);
  }

  /**
   * Draw the Chart.js eDISH scatter: dataset 0 = participant points styled by
   * group, timing, and selection; dataset 1 = the (initially empty) visit-path
   * line overlay. The quadrant plugin draws the cut-lines and labels; clicking
   * a point selects the participant, clicking empty space clears the selection.
   * @private
   */
  drawScatter() {
    const points = this.points;
    const data = points.map((point) => ({ x: point.x, y: point.y }));
    const type = this.state.axisType === 'log' ? 'log' : 'linear';
    const xDomain = edishDomain(
      points.map((point) => point.x),
      this.state.xCut,
      type
    );
    const yDomain = edishDomain(
      points.map((point) => point.y),
      this.state.yCut,
      type
    );

    const fill = (ctx) => {
      const point = points[ctx.dataIndex];
      if (!point) return 'rgba(0,0,0,0)';
      const selected = this.isSelected(point);
      if (!point.withinWindow && !selected) return 'rgba(0,0,0,0)';
      const color = selected ? SELECTION_COLOR : this.colorFor(point);
      const opacity = this.state.selectedId != null ? (selected ? 1 : 0.15) : 0.75;
      return hexToRgba(color, opacity);
    };
    const border = (ctx) => {
      const point = points[ctx.dataIndex];
      if (!point) return 'rgba(0,0,0,0)';
      const selected = this.isSelected(point);
      const color = selected ? SELECTION_COLOR : this.colorFor(point);
      const opacity = this.state.selectedId != null ? (selected ? 1 : 0.25) : 0.9;
      return hexToRgba(color, opacity);
    };

    const chart = new Chart(this.canvas.getContext('2d'), {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Participants',
            data,
            pointBackgroundColor: fill,
            pointBorderColor: border,
            pointBorderWidth: (ctx) => (this.isSelected(points[ctx.dataIndex]) ? 2.5 : 1.25),
            pointRadius: (ctx) =>
              this.radiusFor(points[ctx.dataIndex]) +
              (this.isSelected(points[ctx.dataIndex]) ? 2 : 0),
            pointHoverRadius: (ctx) => this.radiusFor(points[ctx.dataIndex]) + 2
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
                  ? pointTooltip(points[ctx.dataIndex], this.state, this.settings.measure_values)
                  : ''
            }
          }
        },
        scales: buildScales(this.state, xDomain, yDomain, this.settings.measure_values),
        onHover: (event, active) => {
          const target = event?.native?.target;
          if (target) target.style.cursor = active.length ? 'pointer' : 'default';
        },
        onClick: (event, active) => {
          const hit = active.find((element) => element.datasetIndex === 0);
          if (hit) this.selectParticipant(points[hit.index].id);
          else this.clearSelection();
        }
      },
      plugins: [quadrantPlugin(this)]
    });
    this.chart = chart;
    this.charts.push(chart);
  }

  /**
   * Render the color-by legend for the active grouping (HEP-CTRL-009).
   * @private
   */
  drawLegend() {
    this.legendEl.innerHTML = '';
    if (!this.groupValues.length) return;
    const groupLabel =
      (this.settings.groups.find((spec) => spec.value_col === this.state.groupBy) || {}).label ||
      this.state.groupBy;
    this.legendEl.append(createElement('strong', null, `${groupLabel}:`));
    this.groupValues.forEach((value) => {
      const chip = createElement('span', 'hep-legend-item');
      chip.style.cssText = 'display:inline-flex;align-items:center;gap:.3rem';
      const swatch = createElement('span');
      swatch.style.cssText = `display:inline-block;width:.75rem;height:.75rem;border-radius:2px;background:${this.colorScale.get(
        String(value)
      )}`;
      chip.append(swatch, document.createTextNode(String(value)));
      this.legendEl.append(chip);
    });
  }

  /**
   * Render the quadrant summary table (Quadrant | # | %) below the chart from
   * the live classification (HEP-QUAD-005).
   * @private
   */
  drawQuadrantSummary() {
    this.quadrantWrap.innerHTML = '';
    const table = createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.append(createElement('th', null, 'Quadrant'));
    headRow.append(createElement('th', 'hep-num', '#'));
    headRow.append(createElement('th', 'hep-num', '%'));
    thead.append(headRow);
    table.append(thead);
    const tbody = document.createElement('tbody');
    this.quadrants.labels.forEach((entry) => {
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
    this.quadrantWrap.append(table);
  }

  /**
   * Show either the scatter chrome (single canvas, legend, quadrant summary) or
   * the composite container, per the active view (HEP-COMP-006).
   * @private
   */
  setViewVisibility(composite) {
    this.chartWrap.style.display = composite ? 'none' : '';
    // The legend is laid out with inline display:flex (set in renderShell), so
    // restore 'flex' rather than '' when returning to the scatter view.
    this.legendEl.style.display = composite ? 'none' : 'flex';
    this.quadrantWrap.style.display = composite ? 'none' : '';
    this.compositeWrap.style.display = composite ? '' : 'none';
  }

  /**
   * Render the composite plot into the composite container (HEP-COMP-001..006):
   * a baseline-quadrant legend, the pretreatment and peak on-treatment eDISH
   * panels (each point colored/shaped by its baseline quadrant so migration is
   * visible), the four-panel ×Baseline shift plot (one panel per on-treatment
   * quadrant, with 1×/3×/5× reference lines), the pretreatment × on-treatment
   * migration table with concern coding, and the by-arm concern/benefit
   * summary. Degrades to an explanatory note when no participant in the current
   * selection has a usable baseline and on-treatment ALT and total bilirubin.
   * @private
   */
  renderComposite() {
    const { subjects, excluded } = buildCompositeSubjects(this.cleanRows, this.settings);
    const shown = applyFilters(subjects, this.state.filters);

    // Reset the participant cross-linking state for this fresh render
    // (HEP-COMP-007); the charts register themselves as they are built.
    this.compositeCharts = [];
    this.compositeSubjectsShown = shown;
    this.compositeHoverId = null;
    this.compositeSelectedId = null;
    this.compositeHeaderEl = null;

    const totalParticipants = unique(this.cleanRows.map((row) => row[this.settings.id_col])).length;
    const excludedNote = excluded
      ? `<span class="sv-warning">${excluded} participant${
          excluded > 1 ? 's' : ''
        } excluded (missing baseline or on-treatment ALT/total bilirubin).</span>`
      : '';
    this.notes.innerHTML =
      `<span>${shown.length} of ${totalParticipants} participants shown in the composite plot.</span>` +
      excludedNote;
    this.footnote.textContent =
      'Composite plot (Tesfaldet et al., Drug Safety 2024): symbol color and shape mark each ' +
      'participant’s baseline (pretreatment) eDISH quadrant, carried through every panel so ' +
      'migration is visible. ×Baseline = peak on-treatment value ÷ the participant’s own baseline.';

    if (!shown.length) {
      const note = createElement('div', 'sv-warning');
      note.textContent =
        'The composite plot needs baseline and on-treatment ALT and total bilirubin for at ' +
        'least one participant. No participant in the current selection qualifies.';
      this.compositeWrap.append(note);
      return;
    }

    // Participant-trace header: shows the hovered/selected participant id and
    // its migration, or the idle hint (HEP-COMP-007).
    this.compositeHeaderEl = createElement('div', 'hep-composite-header');
    this.compositeHeaderEl.textContent = COMPOSITE_HEADER_HINT;
    this.compositeWrap.append(this.compositeHeaderEl);

    this.compositeWrap.append(this.buildCompositeLegend());

    this.compositeWrap.append(
      createElement('h3', 'hep-composite-section-title', 'Baseline → on-treatment eDISH (×ULN)')
    );
    const edishRow = createElement('div', 'hep-composite-edish');
    edishRow.append(this.buildEdishCard('Pretreatment (baseline)', shown, 'pretreat'));
    edishRow.append(this.buildEdishCard('Peak on-treatment', shown, 'ontreat'));
    this.compositeWrap.append(edishRow);

    this.compositeWrap.append(
      createElement(
        'h3',
        'hep-composite-section-title',
        'Peak on-treatment relative to own baseline (×Baseline)'
      )
    );
    this.compositeWrap.append(this.buildCompositePanels(shown));

    this.compositeWrap.append(this.buildMigrationTable(shown));
    this.compositeWrap.append(this.buildByArmSummary(shown));
  }

  /**
   * The baseline-quadrant legend for the composite plot: the four quadrants,
   * each with its coded color and symbol (HEP-COMP-001).
   * @private
   */
  buildCompositeLegend() {
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
   * keep the ALT 3×ULN / BILI 2×ULN cut-lines in view.
   * @private
   */
  compositeEdishScales(xValues, yValues) {
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
   * Build one composite eDISH scatter card (pretreatment or peak on-treatment):
   * peak/baseline ALT (x) vs total bilirubin (y) in ×ULN, each point colored and
   * shaped by its baseline quadrant, with the ALT 3×ULN / BILI 2×ULN cut-lines
   * (HEP-COMP-001, HEP-COMP-002).
   * @private
   */
  buildEdishCard(title, subjects, which) {
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
        datasets: [{ data, ...this.compositeDatasetStyle(subjects, 5) }]
      },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: () => '',
              label: (ctx) => this.compositeTooltip(subjects[ctx.dataIndex], which)
            }
          }
        },
        scales: this.compositeEdishScales(
          subjects.map((subject) => subject[xKey]),
          subjects.map((subject) => subject[yKey])
        ),
        ...this.compositeInteractionOptions()
      },
      plugins: [
        referenceLinePlugin({
          vLines: [{ value: ALT_ULN_CUT, label: `${ALT_ULN_CUT}×ULN` }],
          hLines: [{ value: BILI_ULN_CUT, label: `${BILI_ULN_CUT}×ULN` }]
        })
      ]
    });
    this.registerCompositeChart(chart, subjects, canvas);
    return card;
  }

  /**
   * A log-log ×Baseline domain over a set of values, always including the
   * 1×/3×/5× reference lines and padded so no point sits on the frame.
   * @private
   */
  blnDomain(values) {
    const positives = [...values.filter(Number.isFinite), ...BLN_LINES].filter((v) => v > 0);
    if (!positives.length) return [0.5, 5];
    const min = Math.min(...positives, 0.5);
    const max = Math.max(...positives);
    return [min / 1.3, max * 1.3];
  }

  /**
   * Build the four-panel ×Baseline shift plot (HEP-COMP-003): one panel per
   * on-treatment quadrant, arranged in the eDISH spatial layout (Cholestasis
   * upper-left, Hy's Law upper-right, Normal & NN lower-left, Temple's Corollary
   * lower-right, matching the paper's Figs 4–6). Each point is the participant's
   * peak ALT vs total bilirubin as multiples of its own baseline, colored/shaped
   * by baseline quadrant, over shared axes with 1×/3×/5× reference lines.
   * @private
   */
  buildCompositePanels(subjects) {
    const grid = createElement('div', 'hep-composite-panels');
    const order = ['Cholestasis', "Hy's Law", 'Normal & NN', "Temple's Corollary"];
    const xDomain = this.blnDomain(subjects.map((subject) => subject.peakAltBLN));
    const yDomain = this.blnDomain(subjects.map((subject) => subject.peakBiliBLN));
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
          datasets: [{ data, ...this.compositeDatasetStyle(members, 4.5) }]
        },
        options: {
          maintainAspectRatio: false,
          responsive: true,
          animation: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: () => '',
                label: (ctx) => this.compositeTooltip(members[ctx.dataIndex], 'bln')
              }
            }
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
          ...this.compositeInteractionOptions()
        },
        plugins: [referenceLinePlugin({ vLines: refLines, hLines: refLines })]
      });
      this.registerCompositeChart(chart, members, canvas);
      grid.append(card);
    });
    return grid;
  }

  /**
   * Tooltip line for a composite point: the participant id, the panel-relevant
   * standardized values, and the baseline → on-treatment migration.
   * @private
   */
  compositeTooltip(subject, which) {
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
   * The participant currently traced across the composite panels: the hovered
   * participant takes priority over the clicked (sticky) selection, or null when
   * neither is active (HEP-COMP-007).
   * @private
   */
  compositeActiveId() {
    return this.compositeHoverId != null ? this.compositeHoverId : this.compositeSelectedId;
  }

  /**
   * Whether a composite subject is the one currently traced (HEP-COMP-007).
   * @private
   */
  compositeIsActive(subject) {
    const id = this.compositeActiveId();
    return id != null && subject != null && String(subject.id) === String(id);
  }

  /**
   * Scriptable point styling shared by every composite chart (HEP-COMP-007): each
   * point keeps its baseline-quadrant color and shape; when a participant is
   * traced, that participant's point(s) render full-opacity with a dark ring and
   * a larger radius while every other point dims, so the traced participant
   * stands out in each panel it appears in. With no trace active the styling is
   * the module's default (0.8 opacity, quadrant-colored border).
   * @param {Object[]} subjects The subjects backing this chart's single dataset.
   * @param {number} baseRadius The unemphasized point radius.
   * @private
   */
  compositeDatasetStyle(subjects, baseRadius) {
    return {
      pointStyle: subjects.map((subject) => QUADRANT_STYLE[subject.pretreatQuadrant].pointStyle),
      pointBackgroundColor: (ctx) => {
        const subject = subjects[ctx.dataIndex];
        if (!subject) return 'rgba(0, 0, 0, 0)';
        const color = QUADRANT_STYLE[subject.pretreatQuadrant].color;
        if (this.compositeActiveId() == null) return hexToRgba(color, 0.8);
        return hexToRgba(color, this.compositeIsActive(subject) ? 1 : 0.12);
      },
      pointBorderColor: (ctx) => {
        const subject = subjects[ctx.dataIndex];
        if (!subject) return 'rgba(0, 0, 0, 0)';
        const color = QUADRANT_STYLE[subject.pretreatQuadrant].color;
        if (this.compositeIsActive(subject)) return SELECTION_COLOR;
        return this.compositeActiveId() == null ? color : hexToRgba(color, 0.2);
      },
      pointBorderWidth: (ctx) => (this.compositeIsActive(subjects[ctx.dataIndex]) ? 2 : 1),
      pointRadius: (ctx) =>
        baseRadius + (this.compositeIsActive(subjects[ctx.dataIndex]) ? 2.5 : 0),
      pointHoverRadius: baseRadius + 2
    };
  }

  /**
   * The hover/click handlers shared by every composite chart (HEP-COMP-007):
   * hovering a point traces its participant everywhere; clicking a point toggles
   * a sticky selection; clicking empty space clears the selection.
   * @private
   */
  compositeInteractionOptions() {
    const idFor = (element) => {
      const subjects = element?.chart?.$compositeSubjects;
      const subject = subjects && subjects[element.index];
      return subject ? subject.id : null;
    };
    return {
      onHover: (event, active) => {
        const target = event?.native?.target;
        if (target) target.style.cursor = active.length ? 'pointer' : 'default';
        this.setCompositeHover(active.length ? idFor(active[0]) : null);
      },
      onClick: (event, active) => {
        if (!active.length) {
          this.setCompositeSelection(null);
          return;
        }
        const id = idFor(active[0]);
        if (id == null) return;
        const same =
          this.compositeSelectedId != null && String(this.compositeSelectedId) === String(id);
        this.setCompositeSelection(same ? null : id);
      }
    };
  }

  /**
   * Register a freshly built composite chart for teardown, resize, and
   * cross-linking: it joins this.charts and this.compositeCharts, remembers its
   * backing subjects for the interaction handlers, and clears the hover trace
   * when the pointer leaves its canvas (HEP-COMP-007).
   * @private
   */
  registerCompositeChart(chart, subjects, canvas) {
    chart.$compositeSubjects = subjects;
    this.charts.push(chart);
    this.compositeCharts.push(chart);
    canvas.addEventListener('pointerleave', () => this.setCompositeHover(null));
  }

  /**
   * Set the transient hovered participant and restyle the panels + header when it
   * changes (HEP-COMP-007).
   * @private
   */
  setCompositeHover(id) {
    if (String(id ?? '') === String(this.compositeHoverId ?? '')) return;
    this.compositeHoverId = id ?? null;
    this.refreshCompositeHighlight();
  }

  /**
   * Set the sticky (clicked) participant selection, restyle the panels + header,
   * and dispatch the participantsSelected event so host apps stay in sync
   * (HEP-COMP-007, HEP-API-003).
   * @private
   */
  setCompositeSelection(id) {
    this.compositeSelectedId = id ?? null;
    this.refreshCompositeHighlight();
    this.dispatchSelection(this.compositeSelectedId == null ? [] : [this.compositeSelectedId]);
  }

  /**
   * Restyle every composite chart to the current trace and refresh the header.
   * Uses Chart.js's no-animation update so the highlight tracks the pointer
   * without flicker (HEP-COMP-007).
   * @private
   */
  refreshCompositeHighlight() {
    this.compositeCharts.forEach((chart) => chart.update('none'));
    this.updateCompositeHeader();
  }

  /**
   * Update the participant-trace header to name the traced participant and its
   * migration, or the idle hint when nothing is traced (HEP-COMP-007).
   * @private
   */
  updateCompositeHeader() {
    if (!this.compositeHeaderEl) return;
    const id = this.compositeActiveId();
    if (id == null) {
      this.compositeHeaderEl.textContent = COMPOSITE_HEADER_HINT;
      this.compositeHeaderEl.classList.remove('is-active');
      return;
    }
    const subject = this.compositeSubjectsShown.find((entry) => String(entry.id) === String(id));
    const selected =
      this.compositeSelectedId != null && String(this.compositeSelectedId) === String(id);
    const migration = subject ? ` — ${subject.pretreatQuadrant} → ${subject.onTreatQuadrant}` : '';
    this.compositeHeaderEl.textContent = `Participant ${id}${
      selected ? ' (selected — click again to clear)' : ''
    }${migration}`;
    this.compositeHeaderEl.classList.add('is-active');
  }

  /**
   * Build the pretreatment × on-treatment migration table (HEP-COMP-004): counts
   * with row/column totals, each interior cell shaded by its level of DILI
   * concern (red/yellow/green/gray), plus the concern legend.
   * @private
   */
  buildMigrationTable(subjects) {
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
    wrap.append(this.buildConcernLegend());
    return wrap;
  }

  /**
   * The concern color legend for the migration table (HEP-COMP-004).
   * @private
   */
  buildConcernLegend() {
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
   * Build the by-arm concern/benefit summary table (HEP-COMP-005): per value of
   * the active Group column (or all participants when no grouping), the count of
   * subjects whose migration is a concern (red), potential concern (yellow), no
   * concern / benefit (green), or no migration (gray), with the arm total.
   * @private
   */
  buildByArmSummary(subjects) {
    const armCol =
      this.state.groupBy && this.state.groupBy !== GROUP_NONE ? this.state.groupBy : null;
    const armLabel = armCol
      ? (this.settings.groups.find((group) => group.value_col === armCol) || {}).label || armCol
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

  /**
   * The selected participant's cleaned lab records, augmented with the derived
   * display columns the linked listing shows.
   * @private
   */
  participantRecords(id) {
    return this.cleanRows
      .filter((row) => String(row[this.settings.id_col]) === String(id))
      .map((row) => ({
        ...row,
        __hep_dayLabel: Number.isFinite(row.__hep_day) ? row.__hep_day : '',
        __hep_relText: formatNumber(row.__hep_relative_uln)
      }));
  }

  /**
   * Select a participant and drive every coordinated view (HEP-SELECT-001..006):
   * highlight the point, trace the visit path on the scatter, draw the
   * lab-over-time companion chart and the measure summary table, open the
   * linked listing of the participant's raw records, annotate the chart, and
   * dispatch the participantsSelected event — all in the active display units.
   * @param {string|number} id The participant identifier.
   * @returns {void}
   */
  selectParticipant(id) {
    this.state.selectedId = id;
    if (this.chart) {
      const path = visitPathSeries(this.cleanRows, id, this.settings, this.state);
      this.chart.data.datasets[1].data = path.map((entry) => ({ x: entry.x, y: entry.y }));
      this.chart.update();
    }
    this.currentTableData = this.participantRecords(id);
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    renderListing(this);
    this.drawDetail(id);
    this.mainAnnotation.textContent = `Participant ${id} selected.`;
    this.footnote.textContent = `Participant ${id} selected.`;
    this.dispatchSelection([id]);
  }

  /**
   * Clear any participant selection: erase the visit-path overlay, close the
   * detail panels and listing, and restore the base annotation/footnote
   * (HEP-SELECT-007).
   * @returns {void}
   */
  clearSelection() {
    if (this.state.selectedId == null) return;
    this.state.selectedId = null;
    if (this.chart) {
      this.chart.data.datasets[1].data = [];
      this.chart.update();
    }
    // Tear down the detail chart (kept on this.charts) but leave the scatter.
    this.charts = this.charts.filter((chart) => {
      if (chart === this.chart) return true;
      chart.destroy();
      return false;
    });
    this.currentTableData = [];
    this.listingWrap.innerHTML = '';
    this.detailWrap.innerHTML = '';
    this.detailWrap.style.display = 'none';
    this.mainAnnotation.textContent = '';
    this.footnote.textContent = this.baseFootnote();
    this.dispatchSelection([]);
  }

  /**
   * Draw the participant drill-down panels into the detail container: the
   * "Standardized Lab Values by Study Day" line chart (one line per measure in
   * the active display units) and the Measure | N | Min | Median | Max summary
   * table (HEP-SELECT-002, HEP-SELECT-005).
   * @private
   */
  drawDetail(id) {
    // Selecting a second participant without an intervening background click
    // must not leak the previous detail chart. Tear down every chart that is
    // not the main scatter before building the new one (the exact teardown
    // clearSelection() uses), so this.charts holds only the scatter plus this
    // one detail chart (HEP-SELECT-002).
    this.charts = this.charts.filter((chart) => {
      if (chart === this.chart) return true;
      chart.destroy();
      return false;
    });
    this.detailWrap.innerHTML = '';
    this.detailWrap.style.display = '';
    this.detailWrap.append(
      createElement('h3', 'hep-detail-title', 'Standardized Lab Values by Study Day')
    );

    const chartWrap = createElement('div', 'hep-detail-chart');
    const canvas = createElement('canvas', 'hep-detail-canvas');
    chartWrap.append(canvas);
    this.detailWrap.append(chartWrap);

    const series = participantMeasureSeries(this.cleanRows, id, this.settings, this.state);
    const colors = groupColorScale(series.map((entry) => entry.key));
    const datasets = series.map((entry) => ({
      label: entry.label,
      data: entry.points.map((point) => ({
        x: Number.isFinite(point.day) ? point.day : null,
        y: point.value
      })),
      borderColor: colors.get(entry.key),
      backgroundColor: colors.get(entry.key),
      showLine: true,
      spanGaps: true,
      borderWidth: 1.5,
      pointRadius: 2.5,
      pointHoverRadius: 4
    }));

    const suffix = axisSuffix(this.state.display);
    const detailChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { datasets },
      options: {
        maintainAspectRatio: false,
        responsive: true,
        animation: false,
        plugins: {
          legend: { display: true, position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) =>
                `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y)}${suffix} @ day ${ctx.parsed.x}`
            }
          }
        },
        scales: {
          x: { type: 'linear', title: { display: true, text: 'Study Day' } },
          y: {
            type: this.state.axisType === 'log' ? 'logarithmic' : 'linear',
            title: { display: true, text: `Standardized value${suffix}` }
          }
        }
      }
    });
    this.charts.push(detailChart);

    this.detailWrap.append(this.buildSummaryTable(id));
  }

  /**
   * Build the per-measure raw-value summary table (Measure | N | Min | Median |
   * Max) for the selected participant (HEP-SELECT-005).
   * @private
   */
  buildSummaryTable(id) {
    const table = createElement('table', 'hep-summary-table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    headRow.append(createElement('th', null, 'Measure'));
    ['N', 'Min', 'Median', 'Max'].forEach((label) =>
      headRow.append(createElement('th', 'hep-num', label))
    );
    thead.append(headRow);
    table.append(thead);
    const tbody = document.createElement('tbody');
    measureSummary(this.cleanRows, id, this.settings).forEach((row) => {
      const tr = document.createElement('tr');
      tr.append(createElement('td', null, row.label));
      tr.append(createElement('td', 'hep-num', String(row.n)));
      tr.append(createElement('td', 'hep-num', formatNumber(row.min)));
      tr.append(createElement('td', 'hep-num', formatNumber(row.median)));
      tr.append(createElement('td', 'hep-num', formatNumber(row.max)));
      tbody.append(tr);
    });
    table.append(tbody);
    return table;
  }

  /**
   * Dispatch the custom participantsSelected event on the shell root with the
   * selected IDs (HEP-API-003).
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
   * Resize the live charts to their containers. For host layouts that change
   * the container size without a window resize — e.g. the R htmlwidget
   * bindings.
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
    this.compositeCharts = [];
    this.chart = null;
  }

  /**
   * Tear the hep explorer down: destroy the Chart.js instances and empty the
   * target element. The instance cannot be reused afterwards — create a new one
   * via the factory instead.
   * @returns {void}
   */
  destroy() {
    this.destroyCharts();
    this.element.innerHTML = '';
  }
}

/**
 * Create a safety hep explorer inside a container element. The control shell
 * renders immediately; pass long-format lab records to setData (or init) on the
 * returned instance to validate the data and draw the eDISH scatter.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {HepExplorerSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyHepExplorer} The live hep-explorer instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function hepExplorer(element = 'body', settings = {}) {
  return new SafetyHepExplorer(element, settings);
}
