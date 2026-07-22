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
//
// THIS FILE IS THE ORCHESTRATOR (obot.roadmap#43, safety.viz#91). It owns the
// public lifecycle API, the shell, data validation, the controls scaffold, the
// render preamble, and — in exactly one place, the VIEWS registry below — the
// choice of which view draws. Everything view-specific lives in
// src/hep-explorer/views/*.js against the contract documented at the top of
// views/scatter.js; the participant-selection layer both views share lives in
// src/hep-explorer/selection.js and knows nothing about views; the injected
// stylesheet lives in src/hep-explorer/styles.js.
//
// PUBLIC METHODS MAY NOT LEAVE THIS FILE. scripts/api/extract.mjs derives a
// module's documented surface as ['src/<module>.js', 'src/<module>/configure.js']
// — anything public that moved out would silently vanish from the API reference
// and break the site build. Only @private internals were extracted.

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

import {
  controlBuilders,
  createElement,
  option,
  renderShell,
  renderViewSelector
} from './shell.js';
import { VIEW_MODES, syncSettings, cutFor } from './hep-explorer/configure.js';
import { checkInputs } from './hep-explorer/checkInputs.js';
import {
  assignSequence,
  cleanData,
  deriveBaseline,
  maxRRatio,
  measureSummary,
  participantMeasureSeries,
  unique,
  visitPathSeries
} from './hep-explorer/structureData.js';
import { axisSuffix, formatNumber } from './hep-explorer/getScales.js';
import { groupColorScale } from './hep-explorer/getPlugins.js';
import { TRACE_HEADER_HINT, createSelection } from './hep-explorer/selection.js';
import { applyModuleStyles } from './hep-explorer/styles.js';
import scatterView from './hep-explorer/views/scatter.js';
import compositeView from './hep-explorer/views/composite.js';
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

// THE VIEW REGISTRY — the module's only view dispatch (HEP-COMP-006). Keyed by
// state.view; every entry implements the view contract documented at the top of
// hep-explorer/views/scatter.js. Nothing else in the module — and in particular
// nothing in the shared selection layer — may branch on which view is active.
const VIEWS = {
  scatter: scatterView,
  composite: compositeView
};

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
    // The view-agnostic participant-selection layer (HEP-SELECT-001,
    // HEP-COMP-007): the sidebar's Participants control, the shared trace
    // header, the HEP-SELECT-006 carrier, and the participantsSelected event.
    // The active view is bound to it once per render.
    this.selection = createSelection(this);
    // Composite-view participant cross-linking (HEP-COMP-007): the charts to
    // restyle together, the shown subjects, the transient hover id, the sticky
    // multi-selection (participant ids toggled by clicking), the trace header,
    // and the sidebar's participant multi-select (its Participants section is
    // built by buildControls, the dropdown itself by the selection layer) that
    // mirrors the selection.
    this.compositeCharts = [];
    this.compositeSubjectsShown = [];
    this.compositeHoverId = null;
    this.compositeSelectedIds = [];
    this.compositeHeaderEl = null;
    this.compositeSelectEl = null;
    this.compositeSelectSection = null;
    this.compositeClearBtn = null;
    // Scatter-view multi-highlight driven by the shared Participants control
    // (clicks stay single-select there): the highlighted participant ids.
    this.scatterSelectedIds = [];
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
      hoverId: null,
      xCut: null,
      yCut: null
    };
    this.renderShell();
  }

  /**
   * The active view component — the module's ONLY view dispatch (HEP-COMP-006).
   * Every other file resolves view-specific behaviour through the contract
   * rather than by testing state.view.
   * @private
   */
  activeView() {
    return VIEWS[this.state.view] || VIEWS.scatter;
  }

  /**
   * Point the shared Participants control at the active view (HEP-SELECT-001,
   * HEP-COMP-007). The selection layer holds no view knowledge, so the view
   * injects the three things the control needs: what its sticky selection is,
   * what a selection change means, and what a clear means. This is the only
   * place the two are wired together.
   * @private
   */
  bindSelection(view) {
    this.selection.bind({
      selectedIds: () => view.selectedIds(this),
      changed: (ids) => view.onParticipantsChanged(this, ids),
      cleared: () => view.clearSelection(this)
    });
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

    // Shared participant-trace header, shown above the plots in EVERY view:
    // names the hovered participant, the single selection, or counts a multiple
    // one, else shows the idle hint (HEP-SELECT-001, HEP-COMP-007).
    this.compositeHeaderEl = createElement('div', 'hep-composite-header');
    this.compositeHeaderEl.textContent = TRACE_HEADER_HINT;
    this.main.insertBefore(this.compositeHeaderEl, this.legendEl);

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

    applyModuleStyles();
    this.footnote.textContent = this.baseFootnote();
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
   * Render the View selector into its own section as a visible list of options
   * (HEP-COMP-006): one styled, clickable row per view mode with the active mode
   * highlighted, so both the eDISH/mDISH scatter and the composite plot are
   * always shown rather than hidden inside a dropdown. Delegates to the shared
   * shell builder (#76 / VIEW-2) so the option list + CSS live in one place.
   * @param {Function} addSection The shell's section builder.
   * @private
   */
  buildViewControl(addSection) {
    renderViewSelector(addSection, {
      options: VIEW_MODES,
      active: this.state.view,
      onChange: (value) => {
        this.state.view = value;
        this.buildControls();
        this.render();
      }
    });
  }

  /**
   * Rebuild the settings/filters controls from data + state (HEP-CTRL-*). The
   * shared controls (View, Group, the categorical filters, Participants, Reset)
   * are built here; the active view contributes the controls it alone drives.
   * Only controls with ≥2 meaningful options are rendered: the Y-measure picker
   * is dropped when a single option, Group when only None, and the R-Ratio
   * filter when r_ratio_filter is false or the view does not use it.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addRow, addControl } = controlBuilders(this.controls);
    const view = this.activeView();

    // View selector in its own section (HEP-COMP-006), rendered as a visible
    // list of options rather than a dropdown so both views are always in view.
    this.buildViewControl(addSection);

    const settingsParent = addSection('Settings');

    // The active view's own settings controls (HEP-CTRL-001..008 for the
    // scatter; none for the composite plot).
    view.contributeControls(this, { addSection, addRow, addControl, settingsParent });

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

    // Filters section (HEP-CTRL-011) plus, for the views that filter on it, the
    // R-Ratio range filter (HEP-CTRL-010).
    const filterSpecs = this.activeFilterSpecs();
    const showRRatio = this.settings.r_ratio_filter && view.usesRRatioFilter;
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
      if (showRRatio) view.contributeFilters(this, { addRow, addControl }, filterParent);
    }

    // Participants section (every view): the selection layer fills it with the
    // participant multi-select once the shown participants are known
    // (HEP-SELECT-001, HEP-COMP-007).
    this.compositeSelectSection = addSection('Participants');

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
   * Show the shell containers the active view occupies and hide the rest, per
   * the view's declared slots (HEP-COMP-006).
   * @private
   */
  setViewVisibility(view) {
    const slots = new Set(view.slots);
    this.chartWrap.style.display = slots.has('chart') ? '' : 'none';
    // The legend is laid out with inline display:flex (set in renderShell), so
    // restore 'flex' rather than '' for the views that show it.
    this.legendEl.style.display = slots.has('legend') ? 'flex' : 'none';
    this.quadrantWrap.style.display = slots.has('quadrantSummary') ? '' : 'none';
    this.compositeWrap.style.display = slots.has('composite') ? '' : 'none';
  }

  /**
   * Redraw everything from the current data, settings, and control state:
   * destroys the live charts, clears the listing, legend, quadrant summary,
   * and any selection, then hands off to the active view, which recomputes its
   * own data and draws (the scatter, its legend and quadrant summary table, or
   * the composite panels — or an empty-data message). A live participant
   * selection survives the redraw: when the participant is still shown, every
   * coordinated panel — scatter highlight, visit path, lab-over-time chart,
   * summary table, and listing — is re-rendered from the same selection in the
   * active display units (HEP-SELECT-006); otherwise the selection is cleared
   * and listeners are notified. Called automatically by the controls and the
   * data/settings setters.
   * @returns {void}
   */
  render() {
    const view = this.activeView();
    this.bindSelection(view);
    // Remember the live selection (the last participantsSelected dispatch —
    // covering every view) so control-driven redraws AND view switches restore
    // it instead of dropping it (HEP-SELECT-006): the coordinated participant
    // panels reopen in the new units, and a selection made in one view arrives
    // selected in the other.
    const carriedIds = this.selection.carried();
    this.destroyCharts();
    this.listingWrap.innerHTML = '';
    this.legendEl.innerHTML = '';
    this.quadrantWrap.innerHTML = '';
    this.compositeWrap.innerHTML = '';
    // Empty (and hide) the sidebar's Participants section; each view re-mounts
    // it with the freshly shown participants (HEP-COMP-007).
    this.selection.mount(this.compositeSelectSection, []);
    this.detailWrap.innerHTML = '';
    this.detailWrap.style.display = 'none';
    this.currentTableData = [];
    this.listingSearch = '';
    this.listingSort = null;
    this.page = 1;
    this.state.selectedId = null;
    this.state.hoverId = null;
    this.scatterSelectedIds = [];
    this.participantsSelected = [];
    this.notes.innerHTML = '';
    this.mainAnnotation.textContent = '';
    this.footnote.textContent = this.baseFootnote();
    this.selection.updateTraceHeader(null, []);

    this.setViewVisibility(view);

    this.state.xCut = cutFor(this.state.cuts, this.state.measureX, this.state.display);
    this.state.yCut = cutFor(this.state.cuts, this.state.measureY, this.state.display);

    if (!this.cleanRows.length) {
      this.notes.innerHTML = '<span>No data selected. Provide records to draw the chart.</span>';
      if (carriedIds.length) this.selection.dispatch([]);
      return;
    }

    view.teardown(this);
    view.render(this, { carriedIds });
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
    this.scatterSelectedIds = [String(id)];
    this.selection.sync(this.scatterSelectedIds);
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
    const annotation = this.selection.annotationText(id, true);
    this.mainAnnotation.textContent = annotation;
    this.footnote.textContent = annotation;
    this.selection.updateTraceHeader(this.state.hoverId, this.scatterSelectedIds);
    this.selection.dispatch([id]);
  }

  /**
   * Close the single-participant drill-down: erase the visit-path overlay, tear
   * down the detail chart, close the listing, and restore the base
   * annotation/footnote — without touching the multi-highlight or notifying
   * listeners (HEP-SELECT-007).
   * @private
   */
  closeDrillDown() {
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
  }

  /**
   * Clear any participant selection — the clicked drill-down and the
   * Participants-control multi-highlight: erase the visit-path overlay, close
   * the detail panels and listing, restore the base annotation/footnote and
   * idle header, and notify listeners (HEP-SELECT-007).
   * @returns {void}
   */
  clearSelection() {
    if (this.state.selectedId == null && !this.scatterSelectedIds.length) return;
    this.scatterSelectedIds = [];
    this.closeDrillDown();
    this.selection.sync([]);
    this.selection.updateTraceHeader(this.state.hoverId, this.scatterSelectedIds);
    this.selection.dispatch([]);
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
