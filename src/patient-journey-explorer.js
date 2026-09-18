// Public entrypoint for the patient-journey-explorer module (#142,
// obot.roadmap#349): one participant's whole safety record on a single shared
// study-day axis — exposure and dose changes, adverse events, labs, con-meds,
// medical history and disposition as stacked lanes. Activating any mark
// anchors time on it: the axis relabels to days from the anchor, a context
// window of ±N days is highlighted, marks outside it de-emphasize, and the
// side panel lists — mechanically, with no AI — the con-meds active at that
// moment, the abnormal labs, the dose changes and the prior adverse events
// with the same preferred term, every item linking back to its raw source row.
//
// Follows the time-to-event / participant-profile orchestrator shape: a class
// + default-export factory, the shared shell, and the fixed normalizeInput →
// checkInputs → structureData → buildScales/buildLaneDatasets → new Chart
// pipeline — except that the chart is N Chart.js instances, one canvas per
// lane, aligned by construction (design §6.2), and that interaction belongs to
// a DOM overlay of real buttons rather than to Chart.js events (D2). The
// event surface (settings callbacks, instance listeners, DOM CustomEvents)
// carries the whole ContextBundle so a later consumer never reads the DOM.
// Marked Experimental pending @jwildfire's review of the design decisions.

import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  LinearScale,
  CategoryScale
} from 'chart.js';

import { controlBuilders, createElement, option, renderShell } from './shell.js';
import { initFilterState, renderFilterControl } from './filters.js';
import { csvDownloadLink, toCsv } from './hep-explorer/dropped.js';
import { LANE_KEYS, syncSettings } from './patient-journey-explorer/configure.js';
import { checkInputs } from './patient-journey-explorer/checkInputs.js';
import {
  DROP_REASON_COLUMN,
  droppedRowColumns,
  normalizeInput
} from './patient-journey-explorer/normalize.js';
import {
  liveFilters,
  structureData,
  subjectIndex
} from './patient-journey-explorer/structureData.js';
import {
  ANCHOR_AXIS_TITLE,
  buildContext,
  windowBounds
} from './patient-journey-explorer/anchor.js';
import {
  axisTicks,
  formatTick,
  toElapsed,
  toStudyDay
} from './patient-journey-explorer/getScales.js';
import {
  laneAriaLabel,
  tooltipLines,
  GESTURE_LINE
} from './patient-journey-explorer/getPlugins.js';
import { resolveTheme } from './patient-journey-explorer/palette.js';
import { applyPjeStyles } from './patient-journey-explorer/styles.js';
import {
  buildLaneChart,
  fitHeights,
  flagCheckbox,
  laneHeightPx,
  planLanes
} from './patient-journey-explorer/lanes.js';
import { MarkOverlay, createLiveRegion } from './patient-journey-explorer/keyboard.js';
import { renderPanel } from './patient-journey-explorer/panel.js';
import { renderSourceDrawer } from './patient-journey-explorer/sourceRows.js';

// Only what the lanes use: no Legend (lane labels replace it), no Tooltip
// (the overlay makes the canvas unreachable — one DOM tooltip instead, RF-6),
// no Filler (the lab band is a plugin-drawn rect, RF-14).
Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  ScatterController,
  LinearScale,
  CategoryScale
);

const EVENT_NAMES = [
  'pjeSubjectSelected',
  'pjeEventAnchored',
  'pjeContextChanged',
  'pjeLaneToggled',
  'pjeFilterChanged',
  'pjeTimeModeChanged',
  'participantsSelected'
];
const CALLBACK_BY_EVENT = {
  pjeSubjectSelected: (settings, detail) => settings.on_select_subject?.(detail.subject, detail),
  pjeEventAnchored: (settings, detail) => settings.on_anchor_event?.(detail.anchor, detail.context),
  pjeContextChanged: (settings, detail) => settings.on_context_change?.(detail)
};
const DOMAIN_NOUNS = {
  EX: 'exposure record',
  AE: 'adverse event',
  LB: 'lab result',
  CM: 'con-med',
  MH: 'medical-history record',
  DS: 'disposition record'
};
// Lane key → source domain, for the sidebar's absent-domain toggles.
const LANE_DOMAIN = {
  exposure: 'EX',
  doseChanges: 'EX',
  adverseEvents: 'AE',
  labs: 'LB',
  conMeds: 'CM',
  medicalHistory: 'MH',
  disposition: 'DS'
};
const TALLER_NOTE =
  "This participant's journey is taller than the panel; scroll or turn off a lane.";
const NO_DAY_NOTE = 'No study day resolves for this participant, so the journey cannot be drawn.';

let instanceCounter = 0;

const warn = (message) => console.warn(`patient-journey-explorer: ${message}`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const upper = (value) =>
  value === null || value === undefined ? '' : String(value).trim().toUpperCase();
const raf =
  typeof requestAnimationFrame === 'function'
    ? (fn) => requestAnimationFrame(fn)
    : (fn) => setTimeout(fn, 16);

/**
 * Coerce a context-window width the way syncSettings does: a non-negative
 * integer, or the fallback when not finite.
 * @private
 */
function coerceWindowDays(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

/**
 * Single-subject, multi-domain longitudinal safety view: seven stacked lanes on
 * one shared study-day axis, anchoring on any mark with a ±N-day context
 * window and a side panel of the con-meds, abnormal labs, dose changes and
 * prior same-term events around the anchor, each linking back to its source
 * row. Construct via the patientJourneyExplorer() factory; the shell renders
 * immediately and waits for data.
 *
 * Read-only properties (the browser suite reads these, never the DOM):
 * `subjects` (every participant id, sorted), `subject` (the selected id),
 * `anchoredEvent` (the anchored EventRecord or null), `context` (the current
 * ContextBundle or null), `events` (the subject's post-filter records in lane
 * then day order), `structured` (the whole structureData result),
 * `droppedRows` and `droppedCounts` (study-wide, reason-led),
 * `unplaceableCounts` (kept but not drawn, by domain and lane), `timeMode`
 * (`'day'` or `'date'`), `participantsSelected` (`[subject]` or `[]`),
 * `laneCharts` (a Map of live Chart.js instances keyed by chart key —
 * `'exposure'`, …, and `` `labs:${test}` `` per lab small multiple) and
 * `stackHeight` (the achieved lane-stack height in px). `state` is private.
 */
class SafetyPatientJourneyExplorer {
  constructor(element = 'body', settings = {}) {
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element)
      throw new Error(`Safety Patient Journey Explorer target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.uid = `pje-${(instanceCounter += 1)}`;
    this.domains = null;
    this.inputDropped = [];
    this.structured = null;
    this.subject = null;
    this.anchoredEvent = null;
    this.context = null;
    this.bounds = null;
    this.laneCharts = new Map();
    this.listeners = new Map();
    this.participantsSelected = [];
    this.stackHeight = 0;
    this.subjectList = [];
    this.liveFilterSpecs = [];
    this.drawer = null;
    this.hoveredEvent = null;
    this.suppressTooltip = false;
    this.destroyed = false;
    this.state = this.seedState();

    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-patient-journey',
        onToggle: () => this.resize()
      })
    );
    this.root.classList.add('sv-pje-root');
    this.element.style.width = this.settings.width;
    applyPjeStyles();

    // The shell's single canvas is unused: the lanes are N canvases inside
    // .sv-main, which is what the shell smoke test locates.
    this.canvas.remove();
    this.chartWrap.style.height = 'auto';
    this.lanesEl = createElement('div', 'sv-pje-lanes');
    this.lanesEl.style.maxHeight = `${this.settings.height}px`;
    this.axisEl = createElement('div', 'sv-pje-axis');
    this.chartWrap.insertBefore(this.lanesEl, this.mainAnnotation);
    this.chartWrap.insertBefore(this.axisEl, this.mainAnnotation);
    this.tooltipEl = createElement('div', 'sv-pje-tooltip');
    this.tooltipEl.setAttribute('role', 'tooltip');
    this.tooltipEl.hidden = true;
    this.chartWrap.append(this.tooltipEl);
    this.liveRegion = createLiveRegion();
    this.root.append(this.liveRegion);
    this.railWrap.hidden = true;
    this.mainAnnotation.textContent = 'Bind data with init() to draw a journey.';

    this.overlay = new MarkOverlay({
      describe: (event) => laneAriaLabel(event, this.settings, this.display()),
      isAnchored: (id) => this.state.anchorId === id,
      onActivate: (id) => (this.state.anchorId === id ? this.anchor(null) : this.anchor(id)),
      onJump: (id) => {
        const event = this.findEvent(id);
        if (event) this.jumpToSource(event.sourceAnchorId);
      },
      onEnter: (event, button, via) => this.showTooltip(event, button, via),
      onLeave: (via) => this.hideTooltip(via)
    });
    this.overlay.attach(this.lanesEl);

    /** @private */
    this.rootKeyHandler = (event) => this.handleEscape(event);
    this.root.addEventListener('keydown', this.rootKeyHandler);
    /** @private */
    this.resizeHandler = () => {
      if (this.resizeFrame) return;
      this.resizeFrame = raf(() => {
        this.resizeFrame = null;
        this.resize();
      });
    };
    window.addEventListener('resize', this.resizeHandler);
    // The lane column also changes width without a window resize — the rail
    // appearing on anchor, the sidebar collapsing, a host relayout — and the
    // overlay is positioned in pixels, so it follows the stack's own size.
    this.stackObserver =
      typeof ResizeObserver === 'function' ? new ResizeObserver(this.resizeHandler) : null;
    if (this.stackObserver) this.stackObserver.observe(this.lanesEl);
    this.themeQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    /** @private */
    this.themeHandler = () => {
      this.resolveThemeTokens();
      if (this.domains) this.render();
    };
    if (this.themeQuery && typeof this.themeQuery.addEventListener === 'function') {
      this.themeQuery.addEventListener('change', this.themeHandler);
    }
    this.resolveThemeTokens();
  }

  /**
   * The opening control state, derived from the settings alone: the
   * configured subject (null = first at render time), no anchor, the filter
   * start values, the lane enablement and group collapse flags, the window
   * width and the time mode. The Reset control rebuilds it at any point.
   * @returns {Object} A fresh control state.
   * @private
   */
  seedState() {
    const lanes = {};
    const groups = {};
    for (const key of LANE_KEYS) lanes[key] = Boolean(this.settings.lanes[key]?.enabled);
    for (const group of this.settings.lane_groups) groups[group.key] = Boolean(group.collapsed);
    return {
      subject: this.settings.subject,
      anchorId: null,
      filters: initFilterState(this.settings.filters),
      lanes,
      groups,
      windowDays: this.settings.context_window_days,
      mode: this.settings.time.mode
    };
  }

  /**
   * The active theme mode: the document's explicit `data-theme`, `auto` with
   * the OS preference, else light (D12).
   * @private
   */
  themeMode() {
    const attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark') return 'dark';
    if (attr === 'auto' && this.themeQuery && this.themeQuery.matches) return 'dark';
    return 'light';
  }

  /**
   * Read the palette tokens back from the module stylesheet for the canvas.
   * @private
   */
  resolveThemeTokens() {
    this.theme = resolveTheme(this.root, this.themeMode());
  }

  /**
   * The display options every text builder takes: the mode and the subject's
   * reference date.
   * @private
   */
  display() {
    return {
      mode: this.state.mode,
      refDate: this.structured && this.structured.refDate ? this.structured.refDate.date : null
    };
  }

  /**
   * The settings the pure logic sees this render: the synced settings with the
   * live window width from the control state.
   * @private
   */
  effectiveSettings() {
    return { ...this.settings, context_window_days: this.state.windowDays };
  }

  /**
   * The current subject's EventRecord for an id (pre-filter, dose changes
   * included), or null.
   * @private
   */
  findEvent(id) {
    if (!this.structured) return null;
    return this.structured.allEvents.find((event) => event.id === String(id)) || null;
  }

  /**
   * Load data and render: an alias for setData that keeps the two-step
   * create-then-init call shape working.
   * @param {Object|Object[]} data Per-domain arrays under `{ ex, ae, lb, cm, mh, ds }` keys (any case), or one merged array whose rows carry the domain column.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render. The input is split into the six
   * domains (either form), validated against the data contract (throwing, and
   * rendering the message into the target element, when a present domain is
   * missing a required column or no domain has rows), then the controls are
   * rebuilt from the data and the journey drawn for the opening subject.
   * @param {Object|Object[]} data Per-domain arrays under `{ ex, ae, lb, cm, mh, ds }` keys (any case), or one merged array whose rows carry the domain column.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  setData(data) {
    const { domains, dropped } = normalizeInput(data, this.settings);
    try {
      checkInputs(domains, this.settings);
    } catch (error) {
      this.element.innerHTML = `<div class="sv-warning">${error.message}</div>`;
      throw error;
    }
    this.domains = domains;
    this.inputDropped = dropped;
    this.state.anchorId = null;
    this.anchoredEvent = null;
    this.context = null;
    this.subjectList = subjectIndex(domains, this.settings);
    this.liveFilterSpecs = liveFilters(this.settings.filters, domains);
    this.buildControls();
    this.render();
    return this;
  }

  /**
   * Merge setting overrides onto the current settings, re-normalize, re-adopt
   * the state keys that mirror settings (the window width, lane enablement,
   * time mode, filter start values, the configured subject), rebuild the
   * controls, and re-render.
   * @param {PatientJourneyExplorerSettings} settings Setting overrides to merge.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  setSettings(settings) {
    const overrides = settings && typeof settings === 'object' ? settings : {};
    this.settings = syncSettings({ ...this.settings, ...overrides });
    if ('context_window_days' in overrides || 'contextWindowDays' in overrides) {
      this.state.windowDays = this.settings.context_window_days;
    }
    if ('lanes' in overrides) {
      for (const key of LANE_KEYS)
        this.state.lanes[key] = Boolean(this.settings.lanes[key]?.enabled);
    }
    if ('lane_groups' in overrides || 'laneGroups' in overrides) {
      this.state.groups = {};
      for (const group of this.settings.lane_groups) this.state.groups[group.key] = group.collapsed;
    }
    if ('time' in overrides) this.state.mode = this.settings.time.mode;
    if ('filters' in overrides) this.state.filters = initFilterState(this.settings.filters);
    if ('subject' in overrides && this.settings.subject) this.state.subject = this.settings.subject;
    this.lanesEl.style.maxHeight = `${this.settings.height}px`;
    this.element.style.width = this.settings.width;
    if (!this.domains) return this;
    this.withFocusRestore(() => {
      this.liveFilterSpecs = liveFilters(this.settings.filters, this.domains);
      this.buildControls();
      this.render();
    });
    return this;
  }

  /**
   * Run a rebuild with keyboard focus captured first and restored onto the
   * recreated control afterwards (PJE-KEY-004).
   * @private
   */
  withFocusRestore(fn) {
    const key = this.captureFocus();
    fn();
    this.restoreFocus(key);
  }

  /**
   * The `data-sv-focus` key of the focused control inside this instance, or
   * null.
   * @private
   */
  captureFocus() {
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    if (!active || !this.root.contains(active)) return null;
    return active.getAttribute('data-sv-focus');
  }

  /**
   * Restore keyboard focus onto the recreated control carrying the captured
   * key (PPRF-8 pattern). The tooltip is not re-shown by a restored focus: the
   * footnote still carries the mark's text, and Escape then means "clear the
   * anchor", not "dismiss the tooltip".
   * @private
   */
  restoreFocus(key) {
    if (!key) return;
    const target = this.root.querySelector(`[data-sv-focus="${key}"]`);
    if (!target || target.disabled || typeof target.focus !== 'function') return;
    this.suppressTooltip = true;
    try {
      target.focus({ preventScroll: true });
    } finally {
      this.suppressTooltip = false;
    }
  }

  /**
   * Rebuild the sidebar (design §7): the subject search + list, the lane
   * toggles, the filters, the anchor window and clear control, the time-axis
   * mode, and the reset.
   * @private
   */
  buildControls() {
    this.controls.innerHTML = '';
    const { addSection, addControl, addReset } = controlBuilders(this.controls);
    const settings = this.settings;

    // 1. Subject: a search box plus a sized list (D27).
    const subjectSection = addSection('Subject');
    const group = createElement('div', 'sv-pje-subject');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Subject');
    const listId = `${this.uid}-subject-list`;
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'sv-pje-subject-search';
    search.placeholder = 'Filter subjects…';
    search.setAttribute('aria-label', 'Filter subjects');
    search.setAttribute('aria-controls', listId);
    search.setAttribute('data-sv-focus', 'subject-search');
    const select = document.createElement('select');
    select.id = listId;
    select.size = 8;
    select.className = 'sv-pje-subject-list';
    select.setAttribute('aria-label', 'Subject');
    select.setAttribute('data-sv-focus', 'subject');
    const count = createElement('p', 'sv-pje-subject-count');
    count.setAttribute('aria-live', 'polite');
    this.subjectControl = { search, select, count };
    search.oninput = () => this.syncSubjectControl();
    select.onchange = () => {
      if (select.value && select.value !== this.subject) this.selectSubject(select.value);
    };
    group.append(search, select, count);
    const subjectWrap = createElement('div', 'sv-control');
    subjectWrap.append(group);
    subjectSection.append(subjectWrap);
    this.syncSubjectControl();

    // 2. Lanes: one checkbox per lane, disabled when the domain is absent.
    const laneSection = addSection('Lanes');
    const laneWrap = createElement('div', 'sv-control');
    this.laneToggles = {};
    for (const key of LANE_KEYS) {
      const label = createElement('label', 'sv-pje-lane-toggle');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(this.state.lanes[key]);
      input.setAttribute('data-sv-focus', `lane-${key}`);
      const domain = key === 'doseChanges' ? 'EX' : LANE_DOMAIN[key];
      const supplied = Boolean(this.domains && this.domains[domain] && this.domains[domain].length);
      if (!supplied) {
        input.disabled = true;
        input.setAttribute('aria-disabled', 'true');
        label.classList.add('is-disabled');
        label.title = `No ${DOMAIN_NOUNS[domain]} rows were supplied, so this lane has nothing to draw.`;
      }
      input.onchange = () => this.setLaneEnabled(key, input.checked);
      label.append(input, document.createTextNode(settings.lanes[key]?.label || key));
      laneWrap.append(label);
      this.laneToggles[key] = input;
    }
    laneSection.append(laneWrap);

    // 3. Filters: flag checkboxes (RF-5) and the shared multiselect.
    this.filterControls = {};
    if (this.liveFilterSpecs.length) {
      const filterSection = addSection('Filters');
      for (const spec of this.liveFilterSpecs) {
        const rows = (this.domains && this.domains[spec.domain]) || [];
        if (spec.type === 'flag') {
          let label = spec.label;
          if (String(spec.flag_value) !== '__abnormal__') {
            const n = rows.filter(
              (row) => row && upper(row[spec.value_col]) === upper(spec.flag_value)
            ).length;
            label = `${spec.label} (${n} in this study)`;
          }
          const control = flagCheckbox({
            spec,
            checked: this.state.filters[spec.value_col] != null,
            label,
            focusKey: `filter-${spec.value_col}`,
            onChange: (checked) =>
              this.updateFilter(spec.value_col, checked ? (spec.flag_value ?? 'Y') : null)
          });
          const wrap = createElement('div', 'sv-control');
          wrap.append(control);
          filterSection.append(wrap);
          this.filterControls[spec.value_col] = control.querySelector('input');
          continue;
        }
        const values = [
          ...new Set(
            rows
              .map((row) => (row ? row[spec.value_col] : undefined))
              .filter((value) => value !== undefined && value !== null && String(value) !== '')
              .map(String)
          )
        ].sort();
        const control = renderFilterControl({
          spec,
          values,
          selected: this.state.filters[spec.value_col],
          onChange: (next) => this.updateFilter(spec.value_col, next)
        });
        const focusTarget =
          control.tagName === 'DETAILS' ? control.querySelector('summary') : control;
        if (focusTarget) focusTarget.setAttribute('data-sv-focus', `filter-${spec.value_col}`);
        addControl(spec.label, control, filterSection);
        this.filterControls[spec.value_col] = control;
        if (spec.domain === 'CM' && spec.value_col === settings.cm_class_col && rows.length) {
          const uncoded = rows.filter(
            (row) => row && upper(row[spec.value_col]) === upper(settings.cm_uncoded_value)
          ).length;
          if (uncoded > 0) {
            filterSection.append(
              createElement(
                'p',
                'sv-pje-sidebar-note',
                `${Math.round((100 * uncoded) / rows.length)}% of con-med records in this study are ${settings.cm_uncoded_value}.`
              )
            );
          }
        }
      }
    }

    // 4. Anchor: the window width (committed on change) and Clear anchor.
    const anchorSection = addSection('Anchor');
    const windowInput = document.createElement('input');
    windowInput.type = 'number';
    windowInput.min = '0';
    windowInput.step = '1';
    windowInput.value = String(this.state.windowDays);
    windowInput.setAttribute('data-sv-focus', 'window-days');
    windowInput.onchange = () => this.setContextWindowDays(windowInput.value);
    addControl('Context window (days)', windowInput, anchorSection);
    const clearButton = createElement('button', 'sv-reset', 'Clear anchor');
    clearButton.type = 'button';
    clearButton.style.marginTop = '.25rem';
    clearButton.setAttribute('data-sv-focus', 'clear-anchor-control');
    clearButton.disabled = !this.state.anchorId;
    clearButton.onclick = () => this.anchor(null);
    anchorSection.append(clearButton);
    this.windowInput = windowInput;
    this.clearButton = clearButton;

    // 5. Display: the time axis mode.
    const displaySection = addSection('Display');
    const modeSelect = addControl('Time axis', document.createElement('select'), displaySection);
    modeSelect.setAttribute('data-sv-focus', 'time-mode');
    option(modeSelect, 'day', 'Study day', this.state.mode !== 'date');
    option(modeSelect, 'date', 'Calendar date', this.state.mode === 'date');
    modeSelect.onchange = () => this.setTimeMode(modeSelect.value);
    this.modeSelect = modeSelect;
    this.syncDateOption();

    // 6. Reset.
    addReset(() => {
      this.state = this.seedState();
      this.buildControls();
      this.render();
    });
  }

  /**
   * Refill the subject list from the search text: case-insensitive substring,
   * the current subject always kept and marked.
   * @private
   */
  syncSubjectControl() {
    if (!this.subjectControl) return;
    const { search, select, count } = this.subjectControl;
    const query = String(search.value || '').toLowerCase();
    const shown = this.subjectList.filter(
      (id) => id === this.subject || !query || id.toLowerCase().includes(query)
    );
    select.innerHTML = '';
    for (const id of shown) {
      option(select, id, id === this.subject ? `${id} (current)` : id, id === this.subject);
    }
    if (this.subject && shown.includes(this.subject)) select.value = this.subject;
    count.textContent = `${plural(this.subjectList.length, 'subject')} · ${shown.length} shown`;
  }

  /**
   * Enable the calendar-date option only when a reference date resolves.
   * @private
   */
  syncDateOption() {
    if (!this.modeSelect) return;
    const dateOption = this.modeSelect.options[1];
    const allowed = this.settings.time.allow_date_mode;
    const hasRef = Boolean(this.structured && this.structured.refDate);
    dateOption.disabled = !allowed || !hasRef;
    dateOption.title = !allowed
      ? 'Calendar dates are not enabled for this chart.'
      : hasRef
        ? ''
        : 'No reference date resolves for this participant, so calendar dates cannot be shown.';
    this.modeSelect.value = this.state.mode;
  }

  /**
   * Mirror the control state into the sidebar controls without rebuilding
   * them (checkbox states, the window width, the clear button, the mode).
   * @private
   */
  syncControls() {
    if (this.laneToggles) {
      for (const key of LANE_KEYS) {
        if (this.laneToggles[key]) this.laneToggles[key].checked = Boolean(this.state.lanes[key]);
      }
    }
    if (this.filterControls) {
      for (const spec of this.liveFilterSpecs) {
        const control = this.filterControls[spec.value_col];
        if (!control) continue;
        if (spec.type === 'flag') control.checked = this.state.filters[spec.value_col] != null;
        else if (control.tagName === 'SELECT') {
          const selection = this.state.filters[spec.value_col];
          control.value =
            selection === null || selection === undefined ? '__all__' : String(selection);
        }
      }
    }
    if (this.windowInput) this.windowInput.value = String(this.state.windowDays);
    if (this.clearButton) this.clearButton.disabled = !this.state.anchorId;
    this.syncDateOption();
    this.syncSubjectControl();
  }

  /**
   * Redraw everything from the current data, settings and control state:
   * destroy the lane charts, restructure for the subject and filters, resolve
   * the anchor and its context bundle, and rebuild the notes, the lane stack,
   * the axis strip, the keyboard overlay, the panel and the source drawer.
   * @returns {void}
   */
  render() {
    if (!this.domains) return;
    const focusKey = this.captureFocus();
    this.destroyCharts();
    this.hideTooltip();
    const settings = this.effectiveSettings();
    this.structured = structureData(this.domains, settings, {
      subject: this.state.subject,
      filters: this.state.filters,
      lanes: this.state.lanes,
      mode: this.state.mode
    });
    this.subject = this.structured.subject;
    this.state.subject = this.subject;
    this.participantsSelected = this.subject === null ? [] : [this.subject];

    const anchored = this.state.anchorId ? this.findEvent(this.state.anchorId) : null;
    if (this.state.anchorId && (!anchored || anchored.placeable === false)) {
      this.state.anchorId = null;
    }
    this.anchoredEvent = this.state.anchorId ? anchored : null;
    this.context = this.anchoredEvent
      ? buildContext(this.structured, this.anchoredEvent, settings)
      : null;
    this.bounds = this.anchoredEvent
      ? windowBounds(this.anchoredEvent.day, this.state.windowDays)
      : null;
    if (!this.context) {
      this.state.anchorId = null;
      this.anchoredEvent = null;
      this.bounds = null;
    }

    this.updateNotes();
    // The panel first: showing or hiding the rail changes the main column's
    // width, and the lane charts must be sized to the layout they will live in.
    this.renderPanel();
    this.buildLanes();
    this.renderSourceDrawer();
    this.mainAnnotation.textContent = this.structured.domain
      ? this.anchoredEvent
        ? ''
        : 'Select any mark to anchor time on it.'
      : '';
    this.syncControls();
    this.restoreFocus(focusKey);
  }

  /**
   * The status line above the lanes: the subject summary, the study-wide
   * data-quality sentences (end before start, date conflicts) and the
   * counted, exportable dropped rows (PJE-DATA-003).
   * @private
   */
  updateNotes() {
    this.notes.innerHTML = '';
    const { counts, subjects, flaggedCounts } = this.structured;
    const summary = this.subject
      ? `Participant ${this.subject} · ` +
        Object.keys(DOMAIN_NOUNS)
          .map((domain) => plural(counts[domain] || 0, DOMAIN_NOUNS[domain]))
          .join(', ') +
        '.'
      : 'No participant selected.';
    this.notes.append(createElement('span', null, summary));
    this.notes.append(
      createElement('span', null, `${plural(subjects.length, 'participant')} in the supplied data.`)
    );
    if (flaggedCounts.endBeforeStart > 0) {
      const n = flaggedCounts.endBeforeStart;
      this.notes.append(
        createElement(
          'span',
          'sv-warning',
          `${plural(n, 'record')} ${n === 1 ? 'has' : 'have'} an end date before ${n === 1 ? 'its' : 'their'} start date and ${n === 1 ? 'is' : 'are'} drawn as ${n === 1 ? 'a single-day mark' : 'single-day marks'}.`
        )
      );
    }
    if (flaggedCounts.dateConflict > 0) {
      const n = flaggedCounts.dateConflict;
      this.notes.append(
        createElement(
          'span',
          'sv-warning',
          `${plural(n, 'record')} ${n === 1 ? 'has' : 'have'} a recorded date that does not match ${n === 1 ? 'its' : 'their'} study day; the study day was used.`
        )
      );
    }
    this.appendDropNote();
  }

  /**
   * The counted-drop note with its click-built CSV export (study-wide: a
   * dropped row may have no usable id and so belong to no subject).
   * @private
   */
  appendDropNote() {
    const rows = this.droppedRows;
    if (!rows.length) return;
    const note = createElement('span', 'sv-warning');
    note.append(
      document.createTextNode(
        `${plural(rows.length, 'unusable record')} in the supplied data (all participants). `
      ),
      csvDownloadLink(
        () => toCsv(rows, droppedRowColumns(rows)),
        'patient-journey-explorer-dropped-rows',
        'Download records'
      )
    );
    this.notes.append(note);
  }

  /**
   * Build the lane stack and the axis strip for the current structured record
   * (design §6.1): plan the groups and lanes, fit the row and lab heights to
   * the panel (D21), build the DOM, create one chart per lane, sync the
   * keyboard overlay, and record the achieved stack height.
   * @private
   */
  buildLanes() {
    this.lanesEl.innerHTML = '';
    this.axisEl.innerHTML = '';
    this.laneEntries = [];
    const structured = this.structured;
    if (!structured.domain) {
      this.lanesEl.append(createElement('p', 'sv-pje-note', NO_DAY_NOTE));
      this.stackHeight = this.lanesEl.scrollHeight;
      this.overlay.sync([]);
      return;
    }
    const groups = planLanes(structured, this.settings, this.state);
    const { rowHeight, labHeight } = fitHeights(groups, this.settings);
    const referenceDays = structured.allEvents
      .filter(
        (event) => event.domain === 'DS' && event.placeable !== false && event.flags?.reference
      )
      .map((event) => toElapsed(event.day))
      .filter((day) => day !== null);
    const doseChangeDays = (structured.byLane.doseChanges || [])
      .filter((event) => event.placeable !== false)
      .map((event) => toElapsed(event.day))
      .filter((day) => day !== null);
    const pending = [];

    for (const group of groups) {
      const groupEl = createElement('div', 'sv-pje-group');
      groupEl.dataset.group = group.key;
      const bodyId = `${this.uid}-group-${group.key}`;
      const toggle = createElement('button', 'sv-pje-group-toggle', group.label);
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(!group.collapsed));
      toggle.setAttribute('aria-controls', bodyId);
      toggle.setAttribute('data-sv-focus', `group-${group.key}`);
      const body = createElement('div', 'sv-pje-group-body');
      body.id = bodyId;
      body.hidden = group.collapsed;
      toggle.onclick = () => {
        const collapsed = !body.hidden;
        this.state.groups[group.key] = collapsed;
        body.hidden = collapsed;
        toggle.setAttribute('aria-expanded', String(!collapsed));
        this.resize();
      };
      groupEl.append(toggle, body);
      this.lanesEl.append(groupEl);

      for (const lane of group.lanes) {
        const laneEl = createElement('div', 'sv-pje-lane');
        laneEl.dataset.lane = lane.key;
        if (lane.test) laneEl.dataset.test = lane.test;
        if (lane.chartKey) laneEl.dataset.chartKey = lane.chartKey;
        laneEl.style.height = `${laneHeightPx(lane, rowHeight, labHeight)}px`;
        const label = createElement('div', 'sv-pje-lane-label');
        label.append(createElement('strong', null, lane.label));
        if (lane.sublabel) label.append(createElement('small', null, lane.sublabel));
        laneEl.append(label);
        if (lane.kind === 'chart') {
          const canvasWrap = createElement('div', 'sv-pje-lane-canvas');
          const canvas = createElement('canvas', 'sv-pje-canvas');
          canvas.setAttribute('role', 'presentation');
          canvasWrap.append(canvas);
          const overlayEl = createElement('div', 'sv-pje-marks');
          laneEl.append(canvasWrap, overlayEl);
          pending.push({ lane, laneEl, canvas, overlayEl });
        } else {
          laneEl.append(createElement('div', 'sv-pje-lane-empty', lane.emptyText));
        }
        body.append(laneEl);
        for (const footer of lane.footers) {
          body.append(createElement('p', 'sv-pje-lane-foot', footer));
        }
      }
    }

    // Charts after the DOM is attached, so Chart.js sizes to the lane boxes.
    for (const { lane, laneEl, canvas, overlayEl } of pending) {
      const chart = buildLaneChart({
        canvas,
        lane,
        structured,
        settings: this.effectiveSettings(),
        theme: this.theme,
        bounds: this.bounds,
        anchor: this.anchoredEvent,
        referenceDays,
        doseChangeDays
      });
      this.laneCharts.set(lane.chartKey, chart);
      this.laneEntries.push({
        chartKey: lane.chartKey,
        laneKey: lane.key,
        label: lane.test ? `${lane.label} ${lane.test}` : lane.label,
        laneEl,
        overlayEl,
        chart
      });
    }
    this.renderAxis();
    this.syncOverlay();
    this.stackHeight = this.lanesEl.scrollHeight;
    if (this.stackHeight > this.lanesEl.clientHeight + 1 && this.lanesEl.clientHeight > 0) {
      this.notes.append(createElement('span', null, TALLER_NOTE));
    }
  }

  /**
   * The one shared axis strip below the stack (design §6.2): ticks from
   * axisTicks positioned by percentage inside the same gutters as the lanes,
   * labelled in the active mode, relabelled as offsets when anchored with the
   * anchor itself at 0 (PJE-ANCH-004).
   * @private
   */
  renderAxis() {
    const domain = this.structured.domain;
    const anchorDay = this.anchoredEvent ? this.anchoredEvent.day : null;
    const title = this.anchoredEvent
      ? ANCHOR_AXIS_TITLE
      : this.state.mode === 'date'
        ? 'Calendar date'
        : 'Study day';
    this.axisEl.append(createElement('div', 'sv-pje-axis-title', title));
    const track = createElement('div', 'sv-pje-axis-track');
    let ticks = axisTicks(domain);
    if (anchorDay !== null) {
      const anchorElapsed = toElapsed(anchorDay);
      const span = domain[1] - domain[0];
      if (anchorElapsed !== null && span > 0) {
        const position = ((anchorElapsed - domain[0]) / span) * 100;
        ticks = ticks.filter((tick) => Math.abs(tick.position - position) >= 4);
        ticks.push({ value: anchorDay, elapsed: anchorElapsed, position, anchor: true });
        ticks.sort((a, b) => a.elapsed - b.elapsed);
      }
    }
    const display = this.display();
    for (const tick of ticks) {
      const label = createElement(
        'span',
        `sv-pje-axis-tick${tick.anchor ? ' is-anchor' : ''}`,
        formatTick(tick.value, { ...display, anchorDay })
      );
      label.style.left = `${tick.position}%`;
      if (tick.value === 1) label.title = 'Day 1: first dose';
      if (tick.anchor) label.title = `Anchor: ${this.anchoredEvent.label}, day ${anchorDay}`;
      track.append(label);
    }
    this.axisEl.append(track);
  }

  /**
   * Rebuild every lane's mark buttons from its chart's recorded marks.
   * @private
   */
  syncOverlay() {
    this.overlay.sync(this.laneEntries || []);
  }

  /**
   * Render the anchor context panel into the rail, or hide the rail when
   * nothing is anchored.
   * @private
   */
  renderPanel() {
    if (!this.context) {
      this.railWrap.innerHTML = '';
      this.railWrap.hidden = true;
      this.setExpanded(false);
      return;
    }
    // What the lanes will draw is data (structureData's per-lane `drawn`), so
    // the panel can reconcile its counts before the charts exist.
    const drawnIds = new Set(
      Object.values(this.structured.lanes).flatMap((lane) =>
        lane.enabled ? lane.drawn.map((event) => event.id) : []
      )
    );
    renderPanel(this.railWrap, this.context, {
      settings: this.effectiveSettings(),
      ...this.display(),
      drawnIds,
      labPool: this.structured.allEvents.filter((event) => event.domain === 'LB'),
      expanded: this.root.classList.contains('sv-rail-expanded'),
      onClear: () => this.anchor(null),
      onExpand: (expanded) => this.setExpanded(expanded),
      onJump: (anchorId) => this.jumpToSource(anchorId)
    });
    this.railWrap.hidden = false;
  }

  /**
   * Expand the rail over the chart card, or collapse it back.
   * @private
   */
  setExpanded(expanded) {
    const next = Boolean(expanded);
    const was = this.root.classList.contains('sv-rail-expanded');
    this.root.classList.toggle('sv-rail-expanded', next);
    const button = this.railWrap.querySelector('[data-sv-focus="rail-expand"]');
    if (button) {
      button.textContent = next ? 'Collapse' : 'Expand';
      button.setAttribute('aria-pressed', String(next));
    }
    if (was !== next) this.resize();
  }

  /**
   * Render the source-row drawer for the current subject.
   * @private
   */
  renderSourceDrawer() {
    const wasOpen = Boolean(this.drawer && this.drawer.element.open);
    this.drawer = renderSourceDrawer(this.listingWrap, this.structured, this.settings, {
      open: wasOpen
    });
  }

  /**
   * Jump to a source row: page the drawer to it, open it, scroll the row into
   * view, focus and flash it (design §6.7).
   * @private
   */
  jumpToSource(anchorId) {
    if (!this.drawer) return false;
    return this.drawer.jumpTo(anchorId);
  }

  /**
   * Show the one DOM tooltip for a mark and mirror its text into the footnote
   * with the Open source record button (RF-6, PC-4).
   * @private
   */
  showTooltip(event, button, via) {
    const lines = tooltipLines(event, this.effectiveSettings(), {
      ...this.display(),
      anchor: this.anchoredEvent
    });
    this.hoveredEvent = event;
    this.footnote.innerHTML = '';
    this.footnote.append(
      createElement(
        'span',
        'sv-pje-footnote-text',
        lines.filter((line) => line !== GESTURE_LINE).join(' · ')
      )
    );
    const open = createElement('button', 'sv-pje-open-source', 'Open source record');
    open.type = 'button';
    open.setAttribute('data-sv-focus', 'open-source');
    open.onclick = () => this.jumpToSource(event.sourceAnchorId);
    this.footnote.append(open);
    if (via === 'focus' && this.suppressTooltip) return;
    this.tooltipVia = via;
    this.tooltipEl.textContent = lines.join('\n');
    this.tooltipEl.hidden = false;
    const wrap = this.chartWrap.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    const width = this.tooltipEl.offsetWidth || 0;
    let left = box.left - wrap.left + box.width / 2 - width / 2;
    left = Math.max(4, Math.min(left, wrap.width - width - 4));
    this.tooltipEl.style.left = `${Math.round(left)}px`;
    this.tooltipEl.style.top = `${Math.round(box.bottom - wrap.top + 6)}px`;
  }

  /**
   * Hide the tooltip; the footnote keeps the last mark's text. With `via`, only
   * the channel that showed the tooltip may hide it, so a pointer wandering
   * off a mark never dismisses the tooltip a keyboard user is reading.
   * @private
   */
  hideTooltip(via) {
    if (via && this.tooltipVia && via !== this.tooltipVia) return;
    this.tooltipEl.hidden = true;
    this.tooltipVia = null;
    this.hoveredEvent = null;
  }

  /**
   * Escape, in order (design §6.6): dismiss the tooltip; else clear the
   * anchor; else collapse the expanded rail; else do nothing.
   * @private
   */
  handleEscape(event) {
    if (event.key !== 'Escape') return;
    if (!this.tooltipEl.hidden) {
      this.hideTooltip();
    } else if (this.state.anchorId) {
      this.anchor(null);
    } else if (this.root.classList.contains('sv-rail-expanded')) {
      this.setExpanded(false);
    } else {
      return;
    }
    event.stopPropagation();
  }

  /**
   * Write to the persistent live region.
   * @private
   */
  announce(text) {
    this.liveRegion.textContent = '';
    this.liveRegion.textContent = text;
  }

  /**
   * Deliver one event on all three channels (design §3.6): the settings
   * callback (inside a try/catch that logs and continues), the instance
   * listeners, and a bubbling CustomEvent on the shell root.
   * @private
   */
  emit(name, detail) {
    if (this.destroyed) return;
    const callback = CALLBACK_BY_EVENT[name];
    if (callback) {
      try {
        callback(this.settings, detail);
      } catch (error) {
        warn(`the ${name} callback threw and was ignored: ${error && error.message}`);
      }
    }
    for (const handler of [...(this.listeners.get(name) || [])]) {
      try {
        handler(detail);
      } catch (error) {
        warn(`a ${name} listener threw and was ignored: ${error && error.message}`);
      }
    }
    if (this.root) {
      this.root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
    }
  }

  /**
   * Emit the context bundle again when it changes while anchored.
   * @private
   */
  emitContextIfAnchored() {
    if (this.anchoredEvent) this.emit('pjeContextChanged', this.context);
  }

  /**
   * Select a subject by id (string-compared). An unknown id changes nothing
   * and warns. Any anchor is cleared first (with the null anchor and context
   * events), then the journey is redrawn and pjeSubjectSelected plus the
   * library's shared participantsSelected event are dispatched.
   * @param {string|number} subjectId The participant id to select.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  selectSubject(subjectId) {
    const id = String(subjectId);
    if (!this.domains || !this.subjectList.includes(id)) {
      warn(`unknown subject "${id}"; the selection is unchanged.`);
      return this;
    }
    const previous = this.subject;
    if (this.state.anchorId) {
      this.state.anchorId = null;
      this.anchoredEvent = null;
      this.context = null;
      this.emit('pjeEventAnchored', { anchor: null, context: null });
      this.emit('pjeContextChanged', null);
    }
    this.state.subject = id;
    this.render();
    const { counts, domain } = this.structured;
    this.emit('pjeSubjectSelected', {
      subject: this.subject,
      previous,
      counts: { ...counts },
      domainDays: domain ? [toStudyDay(domain[0]), toStudyDay(domain[1])] : null
    });
    this.emit('participantsSelected', { data: [this.subject] });
    this.announce(
      `Subject ${this.subject}. ` +
        ['AE', 'LB', 'EX', 'CM']
          .map((code) => plural(counts[code] || 0, DOMAIN_NOUNS[code]))
          .join(', ') +
        '.'
    );
    return this;
  }

  /**
   * Anchor time on an event by its normalized id (`'AE-7'`): rebuild the
   * context bundle, redraw the highlight, the axis labels and the panel, and
   * emit pjeEventAnchored and pjeContextChanged. `anchor(null)` clears the
   * anchor and emits both with null. An id that is not a placeable event of
   * the current subject warns and changes nothing.
   * @param {?string} eventId The event id to anchor on, or null to clear.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  anchor(eventId) {
    if (eventId === null || eventId === undefined) {
      if (!this.state.anchorId) return this;
      this.state.anchorId = null;
      this.render();
      this.emit('pjeEventAnchored', { anchor: null, context: null });
      this.emit('pjeContextChanged', null);
      this.announce('Anchor cleared.');
      return this;
    }
    const id = String(eventId);
    const event = this.findEvent(id);
    if (!event || event.placeable === false) {
      warn(`"${id}" is not an anchorable event for participant ${this.subject}.`);
      return this;
    }
    this.state.anchorId = id;
    this.render();
    if (!this.context) return this;
    this.emit('pjeEventAnchored', { anchor: this.anchoredEvent, context: this.context });
    this.emit('pjeContextChanged', this.context);
    const c = this.context.counts;
    this.announce(
      `Anchored on ${this.anchoredEvent.label}, day ${this.anchoredEvent.day}. ` +
        `Window day ${this.context.window.startDay} to day ${this.context.window.endDay}. ` +
        `${plural(c.conMeds, 'con-med')} active, ${plural(c.abnormalLabs, 'abnormal lab')}, ` +
        `${plural(c.doseChanges, 'dose change')}, ${plural(c.priorEvents, 'prior event')} with this term.`
    );
    return this;
  }

  /**
   * Toggle one lane. An unknown key warns and is a no-op. Emits
   * pjeLaneToggled, and pjeContextChanged when anchored (the window's
   * contents depend on the enabled lanes).
   * @param {string} laneKey The lane key (`exposure`, `doseChanges`, `adverseEvents`, `labs`, `conMeds`, `medicalHistory`, `disposition`).
   * @param {boolean} enabled Whether the lane is shown.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  setLaneEnabled(laneKey, enabled) {
    if (!LANE_KEYS.includes(laneKey)) {
      warn(`"${laneKey}" is not a lane; the known lanes are ${LANE_KEYS.join(', ')}.`);
      return this;
    }
    this.state.lanes[laneKey] = Boolean(enabled);
    this.render();
    this.emit('pjeLaneToggled', {
      lane: laneKey,
      enabled: this.state.lanes[laneKey],
      lanes: { ...this.state.lanes }
    });
    this.emitContextIfAnchored();
    this.announce(
      `${this.settings.lanes[laneKey]?.label || laneKey} lane ${enabled ? 'on' : 'off'}.`
    );
    return this;
  }

  /**
   * Switch the time axis between study days and calendar dates. `'date'` is
   * refused (with a warning) when no reference date resolves for the subject
   * or date mode is not allowed. Emits pjeTimeModeChanged.
   * @param {string} mode `'day'` or `'date'`.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  setTimeMode(mode) {
    const next = mode === 'date' ? 'date' : 'day';
    if (next === 'date') {
      if (!this.settings.time.allow_date_mode) {
        warn('calendar-date mode is not allowed by the settings (time.allow_date_mode).');
        return this;
      }
      if (!this.structured || !this.structured.refDate) {
        warn(`no reference date resolves for participant ${this.subject}; staying in day mode.`);
        return this;
      }
    }
    if (next === this.state.mode) return this;
    this.state.mode = next;
    this.render();
    this.emit('pjeTimeModeChanged', {
      mode: next,
      refDate: this.structured.refDate ? this.structured.refDate.date : null
    });
    return this;
  }

  /**
   * Set the context-window half-width in elapsed days (coerced as in
   * syncSettings; 0 means the anchor day only) and re-derive the bundle when
   * anchored.
   * @param {number|string} days The half-width in days.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  setContextWindowDays(days) {
    this.state.windowDays = coerceWindowDays(days, this.settings.context_window_days);
    this.render();
    this.emitContextIfAnchored();
    return this;
  }

  /**
   * Set one filter programmatically, using the same grammar filterMatches
   * accepts (null = no restriction, an array = membership, a scalar =
   * equality; for a flag filter, its `flag_value` or null). An unknown column
   * warns and is a no-op. Re-renders, re-derives the bundle when anchored and
   * emits pjeFilterChanged.
   * @param {string} valueCol The filter's `value_col`.
   * @param {*} selection The next selection.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  setFilter(valueCol, selection) {
    const spec = this.settings.filters.find((entry) => entry.value_col === valueCol);
    if (!spec) {
      warn(`"${valueCol}" is not a configured filter column; nothing changed.`);
      return this;
    }
    this.withFocusRestore(() => {
      this.state.filters[valueCol] = selection === undefined ? null : selection;
      if (this.domains) this.buildControls();
      this.render();
    });
    this.emit('pjeFilterChanged', {
      value_col: valueCol,
      selection: this.state.filters[valueCol],
      filters: { ...this.state.filters }
    });
    this.emitContextIfAnchored();
    return this;
  }

  /**
   * A filter change from its own sidebar control: the same state change and
   * events as setFilter without rebuilding the sidebar (the control keeps its
   * own DOM under the user's pointer).
   * @private
   */
  updateFilter(valueCol, selection) {
    this.state.filters[valueCol] = selection === undefined ? null : selection;
    this.render();
    this.emit('pjeFilterChanged', {
      value_col: valueCol,
      selection: this.state.filters[valueCol],
      filters: { ...this.state.filters }
    });
    this.emitContextIfAnchored();
    const spec = this.settings.filters.find((entry) => entry.value_col === valueCol);
    if (spec) {
      const shown = this.structured.events.filter((event) => event.domain === spec.domain).length;
      const all = this.structured.allEvents.filter(
        (event) => event.domain === spec.domain && !event.flags?.derived
      ).length;
      const active = selection !== null && selection !== undefined;
      this.announce(
        `${spec.label} ${active ? 'on' : 'off'}. ${shown} of ${plural(all, DOMAIN_NOUNS[spec.domain] || 'record')} shown.`
      );
    }
  }

  /**
   * The current context bundle, or null when nothing is anchored. A read
   * model: consumers must not mutate it.
   * @returns {?ContextBundle} The bundle (the ContextBundle typedef in patient-journey-explorer/anchor.js), or null.
   */
  getContext() {
    return this.context;
  }

  /**
   * The active time-axis mode.
   * @returns {string} `'day'` or `'date'`.
   */
  getTimeMode() {
    return this.state.mode;
  }

  /**
   * Register a listener for one of the module events (pjeSubjectSelected,
   * pjeEventAnchored, pjeContextChanged, pjeLaneToggled, pjeFilterChanged,
   * pjeTimeModeChanged, participantsSelected); the handler receives the
   * event's detail.
   * @param {string} name The event name.
   * @param {Function} handler The listener.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  on(name, handler) {
    if (!EVENT_NAMES.includes(name)) {
      warn(`"${name}" is not a module event; the known events are ${EVENT_NAMES.join(', ')}.`);
      return this;
    }
    if (typeof handler !== 'function') return this;
    if (!this.listeners.has(name)) this.listeners.set(name, []);
    this.listeners.get(name).push(handler);
    return this;
  }

  /**
   * Remove a listener, or every listener for the event when no handler is
   * given.
   * @param {string} name The event name.
   * @param {Function} [handler] The listener to remove.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  off(name, handler) {
    if (!this.listeners.has(name)) return this;
    if (typeof handler !== 'function') {
      this.listeners.delete(name);
      return this;
    }
    const kept = this.listeners.get(name).filter((entry) => entry !== handler);
    if (kept.length) this.listeners.set(name, kept);
    else this.listeners.delete(name);
    return this;
  }

  /**
   * Resize every live lane chart and re-sync the keyboard overlay geometry.
   * For host layouts that change the container size without a window resize
   * — e.g. the R htmlwidget binding.
   * @returns {void}
   */
  resize() {
    for (const chart of this.laneCharts.values()) chart.resize();
    this.syncOverlay();
  }

  /**
   * Destroy the live Chart.js instances and clear the map.
   * @private
   */
  destroyCharts() {
    for (const chart of this.laneCharts.values()) chart.destroy();
    this.laneCharts.clear();
    this.laneEntries = [];
  }

  /**
   * Tear the explorer down: destroy the lane charts, remove the window-resize,
   * theme and key listeners, drop every registered event listener, and empty
   * the target element. The instance cannot be reused afterwards — create a
   * new one via the factory instead.
   * @returns {void}
   */
  destroy() {
    this.destroyCharts();
    window.removeEventListener('resize', this.resizeHandler);
    if (this.stackObserver) this.stackObserver.disconnect();
    if (this.themeQuery && typeof this.themeQuery.removeEventListener === 'function') {
      this.themeQuery.removeEventListener('change', this.themeHandler);
    }
    if (this.root) this.root.removeEventListener('keydown', this.rootKeyHandler);
    this.overlay.detach();
    this.listeners.clear();
    this.destroyed = true;
    this.structured = null;
    this.anchoredEvent = null;
    this.context = null;
    this.element.innerHTML = '';
  }

  /**
   * Every participant id present in any domain, sorted ascending.
   * @type {string[]}
   */
  get subjects() {
    return [...this.subjectList];
  }

  /**
   * The current subject's normalized events, post-filter, in lane order then
   * day order.
   * @type {Object[]}
   */
  get events() {
    return this.structured ? this.structured.events : [];
  }

  /**
   * Every dropped source row — the input-form drops and the per-domain drops
   * — each a copy carrying the reason and domain columns.
   * @type {Object[]}
   */
  get droppedRows() {
    return [...this.inputDropped, ...(this.structured ? this.structured.dropped : [])];
  }

  /**
   * The dropped-row counts, study-wide: `{ total, byDomain, byReason }`.
   * @type {Object}
   */
  get droppedCounts() {
    const base = this.structured
      ? this.structured.droppedCounts
      : { total: 0, byDomain: {}, byReason: {} };
    const counts = {
      total: base.total + this.inputDropped.length,
      byDomain: { ...base.byDomain },
      byReason: { ...base.byReason }
    };
    for (const row of this.inputDropped) {
      const reason = row[DROP_REASON_COLUMN];
      counts.byReason[reason] = (counts.byReason[reason] || 0) + 1;
    }
    return counts;
  }

  /**
   * Rows kept but not drawn for the current subject: `{ byDomain, byLane }`.
   * @type {Object}
   */
  get unplaceableCounts() {
    return this.structured ? this.structured.unplaceableCounts : { byDomain: {}, byLane: {} };
  }

  /**
   * The active time-axis mode, `'day'` or `'date'` (the getter behind
   * getTimeMode).
   * @type {string}
   */
  get timeMode() {
    return this.state.mode;
  }
}

/**
 * Create a patient journey explorer inside a container element. The control
 * shell renders immediately; pass the per-domain records (or one merged array
 * with a domain column) to setData (or init) on the returned instance to
 * validate the data and draw the lanes.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {PatientJourneyExplorerSettings} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyPatientJourneyExplorer} The live patient-journey instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function patientJourneyExplorer(element = 'body', settings = {}) {
  return new SafetyPatientJourneyExplorer(element, settings);
}
