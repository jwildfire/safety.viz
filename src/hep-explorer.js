// Public entrypoint for the hep-explorer module (#43): the eDISH/mDISH hepatic
// safety explorer, a Chart.js reimplementation of the SafetyGraphics
// hep-explorer (originally D3v3 + Webcharts). One point per participant plots
// that participant's peak standardized ALT (x) against peak standardized total
// bilirubin (y); two Hy's-Law cut-lines split the plot into four labeled
// quadrants; and clicking a point drives the coordinated participant
// drill-down views — a visit-path overlay on the scatter, the docked
// participant-profile module (header, labs-over-time spaghetti, measure table
// with sparklines; #98, PPRF-7), and the shared linked listing, all in the
// active display units. Same lifecycle API as the other
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
import { resolveArmCol } from './hep-core/arms.js';
import { checkInputs } from './hep-explorer/checkInputs.js';
import {
  assignSequence,
  cleanData,
  deriveBaseline,
  maxRRatio,
  unique,
  visitPathSeries
} from './hep-explorer/structureData.js';
import { formatNumber } from './hep-explorer/getScales.js';
import { profileDock } from './participant-profile.js';
import { TRACE_HEADER_HINT, createSelection } from './hep-explorer/selection.js';
import { applyModuleStyles } from './hep-explorer/styles.js';
import scatterView from './hep-explorer/views/scatter.js';
import migrationView from './hep-explorer/views/migration.js';
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
  migration: migrationView,
  composite: compositeView
};

/**
 * Resolve a `view` setting to a registered view id, falling back to the scatter
 * (HEP-COMP-006, HEP-MIG-001). One helper rather than a chain of equality tests
 * so registering a view is a single edit to VIEWS + VIEW_MODES.
 * @param {?string} value The requested view id.
 * @returns {string} A registered view id.
 * @private
 */
function resolveViewId(value) {
  return Object.prototype.hasOwnProperty.call(VIEWS, value) ? value : 'scatter';
}

/**
 * Interactive hepatic safety explorer: a Chart.js eDISH scatter of peak
 * standardized ALT vs peak standardized total bilirubin — one point per
 * participant — with Hy's-Law quadrant cut-lines, a quadrant summary table,
 * eDISH/mDISH display modes, linear/log axes, R-Ratio and timing controls,
 * color-by grouping, and click-to-inspect participant panels (a visit-path
 * overlay, the docked participant-profile module, and the shared linked
 * listing). Construct via the hepExplorer() factory rather than directly; the
 * constructor renders the control shell immediately and waits for data.
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
    // Migration-view (Sankey) state (HEP-MIG-*, HEP-STEP-*): the selected
    // flow's participants, the `${side}|${pre}|${post}` key of that flow (the
    // one both a ribbon click and a cross-table cell click set), the transient
    // hovered flow, the per-cell participant index, the cohort the plot shows,
    // and the live svg + tooltip nodes.
    this.migrationSelectedIds = [];
    this.migrationSelectedKey = null;
    this.migrationHoverKey = null;
    this.migrationCellIndex = new Map();
    this.migrationShown = [];
    this.migrationSvgEl = null;
    this.migrationTipEl = null;
    this.participantsSelected = [];
    // The docked participant-profile module (#98, PPRF-7): the shared
    // drill-down (header / spaghetti / measure table) rendered into the
    // shell's profile slot and fed by every selection path through the ONE
    // choke point — selection.dispatch()'s participantsSelected event on the
    // shell root. profileKey is the idempotency guard: repeated dispatches of
    // the identical id list never rebuild the profile DOM; the render preamble
    // resets it so a control-driven redraw re-feeds fresh rows.
    this.profile = null;
    this.profileFeed = null;
    this.profileKey = null;
    // Header demographics for the docked profile (PPRF-2): the caller's OWN
    // details specs, snapshotted before validateAndCleanData back-fills
    // settings.details with the linked-listing columns (per-row fields, not
    // demographics).
    this.profileDetails = null;
    this.state = {
      view: resolveViewId(this.settings.view),
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
      // Migration-view controls (HEP-MIG-013, HEP-ARM-003): suppress the
      // no-migration diagonal, and narrow the right-hand side to one active arm.
      hideUnchanged: this.settings.hide_unchanged,
      activeArms: this.settings.active_arms,
      selectedId: null,
      hoverId: null,
      xCut: null,
      yCut: null
    };
    this.profileDetails = this.settings.details;
    this.renderShell();
    this.mountProfileDock();
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

    // Migration (Sankey) container: the mirrored baseline → on-treatment
    // diagram, the per-arm cross tables and the two-step hand-off, hidden until
    // the migration view is selected (HEP-MIG-*, HEP-XTAB-*).
    this.migrationWrap = createElement('div', 'hep-migration-view');
    this.migrationWrap.style.display = 'none';
    this.main.insertBefore(this.migrationWrap, this.multiplesWrap);

    // Composite plot container (pretreatment/on-treatment eDISH panels, the
    // four-panel ×Baseline shift plot, and the migration table), hidden until
    // the composite view is selected (HEP-COMP-*).
    this.compositeWrap = createElement('div', 'hep-composite');
    this.compositeWrap.style.display = 'none';
    this.main.insertBefore(this.compositeWrap, this.multiplesWrap);

    applyModuleStyles();
    this.footnote.textContent = this.baseFootnote();
  }

  /**
   * The settings handed to the docked participant-profile module (#98,
   * PPRF-7): the shared long-lab column mappings and cutpoints pass through
   * verbatim so the dock consumes this chart's pre-cleaned rows with no second
   * ingest (PPRF-1); details are the caller's own demographics snapshot;
   * display seeds from the live display mode; and the two outbound callbacks
   * wire Clear to the host's own clear path (PPRF-2) and stepper navigation to
   * transient chart emphasis (PPRF-5).
   * @private
   */
  profileSettings() {
    const settings = this.settings;
    return {
      id_col: settings.id_col,
      measure_col: settings.measure_col,
      value_col: settings.value_col,
      unit_col: settings.unit_col,
      normal_col_high: settings.normal_col_high,
      normal_col_low: settings.normal_col_low,
      studyday_col: settings.studyday_col,
      visit_col: settings.visit_col,
      visitn_col: settings.visitn_col,
      baseline_col: settings.baseline_col,
      baseline_value: settings.baseline_value,
      measure_values: settings.measure_values,
      // LIVE control state, not the construction-time settings: user-edited
      // reference lines and the Axis-type control reach the dock so the
      // coordinated panels always agree on the active cuts and scale (PPRF-7).
      cuts: this.state.cuts,
      axis_type: this.state.axisType === 'log' ? 'log' : 'linear',
      details:
        settings.profile_details && settings.profile_details.length
          ? settings.profile_details
          : this.profileDetails || [],
      participantProfileURL: settings.participantProfileURL ?? null,
      p_alt_col: settings.p_alt_col ?? null,
      measureBounds: settings.measureBounds,
      display: this.state.display,
      on_clear: () => this.selection.clear(),
      on_step: (id) => this.emphasizeParticipant(id)
    };
  }

  /**
   * Mount the docked participant-profile module into the shell's profile slot
   * and subscribe it to the participantsSelected event on the shell root —
   * the selection layer's SOLE dispatcher, so every selection path (scatter
   * click, Participants control, composite click/selector, migration
   * hand-off, carried selections, and every clear) feeds the dock with zero
   * view edits (#98, PPRF-7). No-op when the `profile` setting is false or a
   * dock is already live.
   * @private
   */
  mountProfileDock() {
    if (!this.settings.profile || this.profile) return;
    this.profile = profileDock(this.profileWrap, this.profileSettings());
    /**
     * Feed one participantsSelected dispatch into the docked profile.
     * @private
     */
    this.profileFeed = (event) => {
      const data = event && event.detail ? event.detail.data : null;
      const ids = (Array.isArray(data) ? data : []).map(String);
      const key = ids.join('\u0000');
      // Idempotency guard: control redraws re-dispatch the carried selection;
      // identical back-to-back payloads must not thrash the profile DOM.
      if (key === this.profileKey) return;
      this.profileKey = key;
      if (!ids.length) {
        this.profile.clear();
        return;
      }
      // Keep the dock in the host's live display units (HEP-SELECT-006
      // parity: the coordinated panels reopen in the new units after a
      // display change); the dock's own toggle may diverge until then.
      this.profile.state.display = this.state.display;
      this.profile.show(ids, this.cleanRows);
    };
    this.root.addEventListener('participantsSelected', this.profileFeed);
  }

  /**
   * Tear the docked profile down: unsubscribe the feed, destroy the module's
   * charts, and empty the slot (the shell's `:empty` rule then hides it).
   * @private
   */
  unmountProfileDock() {
    if (!this.profile) return;
    this.root.removeEventListener('participantsSelected', this.profileFeed);
    this.profileFeed = null;
    this.profile.destroy();
    this.profile = null;
    this.profileKey = null;
  }

  /**
   * Reconcile the docked profile with the current settings: mount or unmount
   * on a `profile` toggle, else refresh the dock's pass-through settings.
   * Called by setSettings before the re-render re-dispatches any carried
   * selection.
   * @private
   */
  syncProfileDock() {
    if (!this.settings.profile) {
      this.unmountProfileDock();
      return;
    }
    if (!this.profile) {
      this.mountProfileDock();
      return;
    }
    this.profileKey = null;
    // Hand the dock the CURRENT retained rows before its settings-driven
    // re-render, so the transient render never uses a stale row set.
    this.profile.cleanRows = this.cleanRows;
    this.profile.setSettings(this.profileSettings());
  }

  /**
   * Transient chart emphasis for the profile stepper (PPRF-5): treat the
   * stepped participant as the hovered one and restyle through the active
   * view's highlight() contract — no selection change, no event dispatch.
   * @private
   */
  emphasizeParticipant(id) {
    const norm = id == null ? null : String(id);
    this.state.hoverId = norm;
    this.compositeHoverId = norm;
    this.activeView().highlight(this);
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
    if ('view' in settings) this.state.view = resolveViewId(this.settings.view);
    if ('hide_unchanged' in settings) this.state.hideUnchanged = this.settings.hide_unchanged;
    if ('active_arms' in settings) this.state.activeArms = this.settings.active_arms;
    if ('x_default' in settings) this.state.measureX = this.settings.x_default;
    if ('y_default' in settings) this.state.measureY = this.settings.y_default;
    if ('visit_window' in settings) this.state.visitWindow = this.settings.visit_window;
    if ('group_by' in settings) this.state.groupBy = this.settings.group_by;
    if ('cuts' in settings) this.state.cuts = JSON.parse(JSON.stringify(this.settings.cuts));
    if ('r_ratio' in settings) this.state.rRatio = [...this.settings.r_ratio];
    if ('details' in settings) this.profileDetails = this.settings.details;
    this.state.filters = {};
    if (this.rawData.length) this.validateAndCleanData();
    this.syncProfileDock();
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
    const section = renderViewSelector(addSection, {
      options: VIEW_MODES,
      active: this.state.view,
      onChange: (value) => this.switchView(value)
    });

    // The migration Sankey is meaningless without a treatment arm to mirror
    // about, so when arm_col resolves to nothing the option is DISABLED with an
    // explanatory tooltip rather than left clickable into an empty diagram
    // (HEP-ARM-005). The shared selector builder stays view-agnostic; the
    // module that knows what a view needs applies the state.
    if (resolveArmCol(this.cleanRows, this.settings)) return;
    const options = [...section.querySelectorAll('.sv-view-option')];
    const migration = options[VIEW_MODES.findIndex((mode) => mode.value === 'migration')];
    if (!migration) return;
    migration.disabled = true;
    migration.classList.add('is-disabled');
    migration.title =
      'The migration Sankey needs a treatment-arm column. Map arm_col (or add ARM, ACTARM, ' +
      'TRT01A, TREATMENT or TRTA to the data) to enable it.';
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
    this.state.hideUnchanged = this.settings.hide_unchanged;
    this.state.activeArms = this.settings.active_arms;
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
    this.migrationWrap.style.display = slots.has('migration') ? '' : 'none';
    this.compositeWrap.style.display = slots.has('composite') ? '' : 'none';
  }

  /**
   * Switch to another registered view and redraw (HEP-STEP-003). The migration
   * view's "review these in the composite plot" hand-off calls this rather than
   * writing state.view itself: the module's only view dispatch lives in this
   * file, and the existing carriedIds mechanism then restores exactly the
   * selected participants, highlighted, in the composite panels.
   * @param {string} view The view id to switch to.
   * @returns {void}
   * @private
   */
  switchView(view) {
    const next = resolveViewId(view);
    if (next === this.state.view) return;
    this.state.view = next;
    this.buildControls();
    this.render();
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
    this.migrationWrap.innerHTML = '';
    // Drop the previous Sankey geometry so a stale $hepSankey can never be read
    // after a view switch or a filter change (HEP-MIG-015).
    if (this.root) this.root.$hepSankey = null;
    this.compositeWrap.innerHTML = '';
    // Empty (and hide) the sidebar's Participants section; each view re-mounts
    // it with the freshly shown participants (HEP-COMP-007).
    this.selection.mount(this.compositeSelectSection, []);
    // Re-arm the docked profile's idempotency guard: the carried selection is
    // re-dispatched below (or by the view), and the dock must rebuild from the
    // fresh rows/units rather than no-op (#98, PPRF-7). The dock's pass-through
    // settings refresh FIRST (merge only, no render) so control-driven redraws
    // — edited reference lines, the Axis-type toggle, display changes — reach
    // the re-shown profile.
    if (this.profile) this.profile.applySettings(this.profileSettings());
    this.profileKey = null;
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
   * highlight the point, trace the visit path on the scatter, open the linked
   * listing of the participant's raw records, annotate the chart, and dispatch
   * the participantsSelected event — which feeds the docked participant
   * profile (#98, PPRF-7) — all in the active display units.
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
    const annotation = this.selection.annotationText(id, true);
    this.mainAnnotation.textContent = annotation;
    this.footnote.textContent = annotation;
    this.selection.updateTraceHeader(this.state.hoverId, this.scatterSelectedIds);
    this.selection.dispatch([id]);
  }

  /**
   * Close the single-participant drill-down: erase the visit-path overlay,
   * close the listing, and restore the base annotation/footnote — without
   * touching the multi-highlight or notifying listeners (HEP-SELECT-007). The
   * docked profile empties on the dispatch([]) that follows a full clear; its
   * charts are module-owned, so there is nothing to tear down here (#98).
   * @private
   */
  closeDrillDown() {
    this.state.selectedId = null;
    if (this.chart) {
      this.chart.data.datasets[1].data = [];
      this.chart.update();
    }
    this.currentTableData = [];
    this.listingWrap.innerHTML = '';
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
    this.unmountProfileDock();
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
