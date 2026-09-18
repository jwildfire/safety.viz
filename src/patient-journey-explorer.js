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
  anchoredTicks,
  axisTicks,
  formatTick,
  toElapsed
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
import {
  cardTitle,
  renderNarrativeCard,
  renderNarrativeRequest
} from './patient-journey-explorer/narratives.js';
import { createDataService } from './patientJourneyNarratives/dataService.js';
import { createScope } from './patientJourneyNarratives/index.js';
import { normalizeRowId } from './patientJourneyNarratives/tools/index.js';
import { NARRATIVE_KINDS, SLUG_BY_SLOT } from './patientJourneyNarratives/kinds.js';

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
  'pjeNarrativeAction',
  'participantsSelected'
];
const CALLBACK_BY_EVENT = {
  pjeSubjectSelected: (settings, detail) => settings.on_select_subject?.(detail.subject, detail),
  pjeEventAnchored: (settings, detail) => settings.on_anchor_event?.(detail.anchor, detail.context),
  pjeContextChanged: (settings, detail) => settings.on_context_change?.(detail),
  pjeNarrativeAction: (settings, detail) => settings.on_narrative_action?.(detail)
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
const NO_LANE_NOTE = 'Every lane is turned off. Turn on a lane to see marks.';
const CUE_LEAD = 'Click any mark in the chart to show its associated events.';
const CUE_DETAIL =
  'Time anchors on that mark, and the panel beside the chart lists the con-meds, labs, dose changes and earlier same-term events recorded around it, each linked to its source row. Keyboard: Tab into a lane, arrow keys to move, Enter to select.';
const CUE_ANCHORED_DETAIL =
  'Click another mark to move the anchor; Escape or the Clear anchor control releases it.';

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
 * integer, or the fallback when blank or not finite. A cleared number field
 * sends '' — that restores the configured width, never a ±0 window.
 * @private
 */
function coerceWindowDays(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
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
    this.footnoteEvent = null;
    this.suppressTooltip = false;
    this.sourceLinkWarned = false;
    this.lastEffectiveMode = null;
    this.narrativeEntries = new Map();
    this.narrativeSeq = 0;
    this.citedMarkId = null;
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
    this.cueEl = createElement('div', 'sv-pje-cue');
    this.cueEl.setAttribute('role', 'note');
    this.cueEl.hidden = true;
    // The participant-summary narrative card sits above the cue and the lanes
    // (#146, PJE-NARR-009); empty until a slot is bound and a draft arrives.
    this.narrativeBannerEl = createElement('div', 'sv-pje-narrative-banner');
    this.chartWrap.insertBefore(this.narrativeBannerEl, this.mainAnnotation);
    this.chartWrap.insertBefore(this.cueEl, this.mainAnnotation);
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
      describe: (event, sameDay) => this.describeMark(event, sameDay),
      isAnchored: (id) => this.state.anchorId === id,
      onActivate: (id) => {
        if (this.state.anchorId === id) this.anchor(null);
        else {
          this.anchor(id);
          this.revealPanel();
        }
      },
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
   * The mode the axis, tooltips and panel actually show: the user's
   * preference (`state.mode`) when a reference date resolves for the current
   * subject, else day mode. The preference is kept, so calendar dates return
   * when a subject that has a reference date is selected again; the title,
   * the ticks, the select and getTimeMode() all read this, never the raw
   * preference, so "Calendar date" is never printed over study-day numbers.
   * @private
   */
  effectiveMode() {
    if (this.state.mode !== 'date') return 'day';
    return this.structured && this.structured.refDate ? 'date' : 'day';
  }

  /**
   * The display options every text builder takes: the mode and the subject's
   * reference date.
   * @private
   */
  display() {
    return {
      mode: this.effectiveMode(),
      refDate: this.structured && this.structured.refDate ? this.structured.refDate.date : null
    };
  }

  /**
   * The accessible name of a mark: the event's sentence, plus the other
   * records stacked on the same day when the mark stands for several.
   * @private
   */
  describeMark(event, sameDay = []) {
    const base = laneAriaLabel(event, this.settings, this.display());
    if (!sameDay.length) return base;
    return `${base} Also on this day, ${plural(sameDay.length, 'more record')} at this mark: ${sameDay.join(', ')}. Use the arrow keys to reach each one.`;
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
      // The message is inserted as text: it embeds settings values (column
      // names) and must never become markup in the host page.
      this.element.replaceChildren(createElement('div', 'sv-warning', error.message));
      throw error;
    }
    // A failed init above replaced the element's contents with the warning;
    // a later init with usable data puts the shell back before drawing into it.
    if (!this.element.contains(this.root)) this.element.replaceChildren(this.root);
    this.domains = domains;
    this.inputDropped = dropped;
    this.state.anchorId = null;
    this.anchoredEvent = null;
    this.context = null;
    this.clearFootnote();
    this.narrativeEntries.clear();
    this.sourceLinkWarned = false;
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
    // New slot functions mean a new generator: drafts from the old one are dropped.
    if ('narratives' in overrides) this.narrativeEntries.clear();
    this.lanesEl.style.maxHeight = `${this.settings.height}px`;
    this.element.style.width = this.settings.width;
    if (!this.domains) return this;
    this.withFocusRestore(() => {
      this.liveFilterSpecs = liveFilters(this.settings.filters, this.domains);
      this.sourceLinkWarned = false;
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
   * anchor", not "dismiss the tooltip". When the control is gone or disabled
   * — the panel's Clear button after clearing, a mark whose lane was turned
   * off or whose subject changed — focus goes to the nearest sensible stop
   * instead of dropping to the document body: the previously anchored mark,
   * the lane's own tab stop, the sidebar Clear control, or the subject list.
   * @private
   */
  restoreFocus(key, { fallbackMarkId = null } = {}) {
    if (!key) return;
    const usable = (el) => el && !el.disabled && typeof el.focus === 'function';
    let target = this.root.querySelector(`[data-sv-focus="${key}"]`);
    if (!usable(target)) {
      const candidates = [];
      if (fallbackMarkId) candidates.push(`[data-sv-focus="mark-${fallbackMarkId}"]`);
      if (key.startsWith('mark-')) candidates.push('.sv-pje-mark[tabindex="0"]');
      if (key === 'clear-anchor' || key === 'clear-anchor-control' || key === 'reset') {
        candidates.push('.sv-pje-mark[tabindex="0"]', '[data-sv-focus="subject"]');
      }
      candidates.push('[data-sv-focus="subject"]');
      target = candidates.map((selector) => this.root.querySelector(selector)).find(usable) || null;
    }
    if (!target) return;
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
    const reset = addReset(() => {
      this.withFocusRestore(() => {
        this.state = this.seedState();
        this.clearFootnote();
        this.buildControls();
        this.render();
      });
    });
    reset.setAttribute('data-sv-focus', 'reset');
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
    this.modeSelect.value = this.effectiveMode();
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
    const previousAnchorId = this.anchoredEvent ? this.anchoredEvent.id : null;
    this.destroyCharts();
    this.hideTooltip();
    const settings = this.effectiveSettings();
    this.structured = structureData(this.domains, settings, {
      subject: this.state.subject,
      filters: this.state.filters,
      lanes: this.state.lanes,
      mode: this.state.mode,
      filterSpecs: this.liveFilterSpecs
    });
    this.structured.mode = this.effectiveMode();
    this.subject = this.structured.subject;
    this.state.subject = this.subject;
    this.participantsSelected = this.subject === null ? [] : [this.subject];
    if (this.state.mode === 'date' && this.effectiveMode() === 'day') {
      if (this.lastEffectiveMode !== 'day') {
        warn(
          `no reference date resolves for participant ${this.subject}; showing study days until one does.`
        );
      }
    }

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

    // The footnote mirrors the last hovered mark; it is cleared when that mark
    // is no longer part of what is drawn (another subject, its lane off, a
    // filter) and rewritten when the anchor changed, so its "+N days from
    // anchor" fragment never goes stale.
    if (this.footnoteEvent) {
      const stillShown = this.structured.events.some((event) => event.id === this.footnoteEvent.id);
      if (!stillShown) this.clearFootnote();
      else if ((this.anchoredEvent ? this.anchoredEvent.id : null) !== previousAnchorId) {
        this.writeFootnote(this.footnoteEvent);
      }
    }

    this.updateNotes();
    this.citedMarkId = null;
    this.syncNarratives();
    // The panel first: showing or hiding the rail changes the main column's
    // width, and the lane charts must be sized to the layout they will live in.
    this.renderPanel();
    this.buildLanes();
    // The cards after the lanes: a citation chip says whether its mark is on
    // the timeline, which only the rebuilt overlay can answer.
    this.renderNarrativeBanner();
    this.mountPanelNarrative();
    this.mountLaneNarratives();
    this.renderSourceDrawer();
    this.renderAnnotation();
    this.renderCue();
    this.syncControls();
    this.restoreFocus(focusKey, { fallbackMarkId: previousAnchorId });
    const effective = this.effectiveMode();
    if (this.lastEffectiveMode !== null && this.lastEffectiveMode !== effective) {
      this.emit('pjeTimeModeChanged', {
        mode: effective,
        refDate: this.structured.refDate ? this.structured.refDate.date : null
      });
    }
    this.lastEffectiveMode = effective;
  }

  /**
   * The notice above the lane stack. Before any anchor it says that clicking
   * any mark shows the events associated with it, and names the keyboard
   * path; once a mark is anchored it says which one and how to move or
   * release the anchor. Hidden when nothing is drawn or every lane is off, so
   * the stack never opens on a prompt about marks that are not there.
   * @private
   */
  renderCue() {
    this.cueEl.innerHTML = '';
    const anyLane = LANE_KEYS.some((key) => this.state.lanes[key]);
    if (!this.structured.domain || !anyLane) {
      this.cueEl.hidden = true;
      return;
    }
    this.cueEl.hidden = false;
    if (!this.anchoredEvent) {
      this.cueEl.append(
        createElement('strong', null, CUE_LEAD),
        createElement('span', null, CUE_DETAIL)
      );
      return;
    }
    const event = this.anchoredEvent;
    const when = Number.isFinite(event.day) ? ` (day ${event.day})` : '';
    this.cueEl.append(
      createElement('strong', null, `Anchored on ${event.label}${when}.`),
      createElement('span', null, CUE_ANCHORED_DETAIL)
    );
  }

  /**
   * The line beneath the axis strip: empty until a mark is anchored (the
   * notice above the lanes carries the hint), then the anchor's four counts
   * with a control that brings the context panel into view — on a stacked
   * (phone) layout the panel renders below the lanes, the footnote and the
   * drawer, and a tap on a mark would otherwise show nothing beyond the
   * highlight.
   * @private
   */
  renderAnnotation() {
    this.mainAnnotation.innerHTML = '';
    if (!this.structured.domain || !this.anchoredEvent) return;
    const c = this.context.counts;
    this.mainAnnotation.append(
      createElement(
        'span',
        null,
        `Anchored on ${this.anchoredEvent.label}: ${plural(c.conMeds, 'con-med')} active, ` +
          `${plural(c.abnormalLabs, 'abnormal lab')}, ${plural(c.doseChanges, 'dose change')}, ` +
          `${plural(c.priorEvents, 'earlier or same-day event')} with this term.`
      )
    );
    const show = createElement('button', 'sv-pje-annotation-link', 'Show the context panel');
    show.type = 'button';
    show.setAttribute('data-sv-focus', 'show-panel');
    show.onclick = () => this.revealPanel(true);
    this.mainAnnotation.append(show);
  }

  /**
   * Bring the context panel into view when the layout has stacked it below
   * the main column and it is entirely off-screen (a phone), or always when
   * asked for explicitly.
   * @private
   */
  revealPanel(always = false) {
    if (!this.context || this.railWrap.hidden) return;
    if (typeof this.railWrap.scrollIntoView !== 'function') return;
    if (!always) {
      if (
        typeof window === 'undefined' ||
        typeof this.railWrap.getBoundingClientRect !== 'function'
      )
        return;
      const rail = this.railWrap.getBoundingClientRect();
      const main = this.main.getBoundingClientRect();
      const stacked = rail.top >= main.bottom - 1;
      const offScreen = rail.top >= (window.innerHeight || 0);
      if (!stacked || !offScreen) return;
    }
    this.railWrap.scrollIntoView({ block: 'start' });
    const title = this.railWrap.querySelector('.sv-pje-panel-title');
    if (title && typeof title.focus === 'function' && always) title.focus({ preventScroll: true });
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
    if (!groups.length) {
      this.lanesEl.append(createElement('p', 'sv-pje-note', NO_LANE_NOTE));
      this.stackHeight = this.lanesEl.scrollHeight;
      this.overlay.sync([]);
      this.renderAxis();
      return;
    }
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
        // The gutter ellipsises long labels; the full text rides on the lane.
        laneEl.title = [lane.label, lane.title || lane.sublabel].filter(Boolean).join(' — ');
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
        // An on-demand narrative slot under the lanes that have one (#146,
        // PJE-NARR-014): one lab test, the exposure course, the disposition.
        const narrativeSlot =
          lane.key === 'labs' && lane.test
            ? { slot: 'labTrajectory', key: lane.test }
            : lane.key === 'exposure'
              ? { slot: 'doseJourney', key: '' }
              : lane.key === 'disposition'
                ? { slot: 'disposition', key: '' }
                : null;
        if (narrativeSlot && this.narrativeSlot(narrativeSlot.slot)) {
          const host = createElement('div', 'sv-pje-ai-slot');
          host.dataset.slot = narrativeSlot.slot;
          host.dataset.key = narrativeSlot.key;
          body.append(host);
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
    if (!domain) return;
    const anchorDay = this.anchoredEvent ? this.anchoredEvent.day : null;
    const title = this.anchoredEvent
      ? ANCHOR_AXIS_TITLE
      : this.effectiveMode() === 'date'
        ? 'Calendar date'
        : 'Study day';
    this.axisEl.append(createElement('div', 'sv-pje-axis-title', title));
    const track = createElement('div', 'sv-pje-axis-track');
    // Anchored, the ticks are round offsets from the anchor (−30 · 0 · +30),
    // not the study-day ticks relabelled (−16 · 0 · +43): PJE-ANCH-004.
    const anchorElapsed = anchorDay === null ? null : toElapsed(anchorDay);
    const ticks = anchorElapsed === null ? axisTicks(domain) : anchoredTicks(domain, anchorElapsed);
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
    // What the lanes will draw is data (structureData's per-lane `drawn` and
    // `byLane`), so the panel can reconcile its whole-record lists against the
    // timeline before the charts exist, and say why a record is not on it.
    const drawState = (event) => this.drawState(event);
    const anchorState = drawState(this.anchoredEvent);
    renderPanel(this.railWrap, this.context, {
      settings: this.effectiveSettings(),
      ...this.display(),
      drawState,
      anchorHidden: anchorState === 'drawn' || anchorState === 'row cap' ? null : anchorState,
      labPool: this.structured.allEvents.filter((event) => event.domain === 'LB'),
      expanded: this.root.classList.contains('sv-rail-expanded'),
      onClear: () => this.anchor(null),
      onExpand: (expanded) => this.setExpanded(expanded),
      onJump: (anchorId) => this.jumpToSource(anchorId)
    });
    this.railWrap.hidden = false;
    this.mountPanelNarrative();
  }

  // ---------------------------------------------------------------------------
  // AI narratives (#146, obot.roadmap#351, PJE-NARR-009 … 014). The orchestrator
  // owns the entries — which narrative is requested for the current subject,
  // its draft, the scope hash at request time — and narratives.js draws the
  // cards. A slot with no function bound requests nothing and renders nothing.
  // ---------------------------------------------------------------------------

  /**
   * The bound slot function for a narrative kind, or null.
   * @private
   */
  narrativeSlot(slot) {
    const slots = this.settings.narratives;
    return slots && typeof slots[slot] === 'function' ? slots[slot] : null;
  }

  /**
   * The scope helper over this instance's live record: the same grounding
   * tool and hash the runtime uses, so a draft's `input_hash` and the
   * renderer's staleness check agree (PJE-NARR-012).
   * @private
   */
  narrativeScope() {
    return createScope(
      createDataService({
        domains: this.domains || {},
        settings: this.settings,
        structured: (subject) =>
          this.structured && this.structured.subject === subject ? this.structured : null
      })
    );
  }

  /**
   * The run() inputs of a slot for a key (the anchor id or the lab test).
   * @private
   */
  narrativeInputs(slot, key) {
    const subject = this.subject;
    switch (slot) {
      case 'eventContext':
        return { subject, anchor_row_id: key, window_days: this.state.windowDays };
      case 'labTrajectory':
        return { subject, test: key };
      default:
        return { subject };
    }
  }

  /**
   * Request a narrative from its slot function and keep the entry; the card
   * shows a pending state until the promise settles. A later request for the
   * same slot and key supersedes an earlier one still in flight.
   * @private
   */
  requestNarrative(slot, key = null) {
    const fn = this.narrativeSlot(slot);
    if (!fn || !this.subject) return null;
    const inputs = this.narrativeInputs(slot, key);
    const slug = SLUG_BY_SLOT[slot];
    let hash = null;
    try {
      hash = this.narrativeScope().scopeHash(slug, inputs);
    } catch (error) {
      warn(`could not hash the ${slug} scope: ${error && error.message}`);
    }
    const id = `${this.uid}-ai-${(this.narrativeSeq += 1)}`;
    const labelEvent = slot === 'eventContext' ? this.findEvent(key) : null;
    const entry = {
      id,
      slot,
      kind: slug,
      subject: this.subject,
      key: key === null || key === undefined ? null : String(key),
      label: labelEvent ? labelEvent.label : slot === 'labTrajectory' ? String(key) : null,
      inputs,
      hash,
      status: 'loading',
      draft: null,
      stale: false,
      expanded: slot !== 'subjectSummary',
      collapsible: slot === 'subjectSummary',
      editing: false,
      error: null
    };
    this.narrativeEntries.set(`${slot}|${entry.key ?? ''}`, entry);
    const args =
      slot === 'eventContext'
        ? [this.subject, key, { windowDays: this.state.windowDays, hash }]
        : slot === 'labTrajectory'
          ? [this.subject, key, { hash }]
          : [this.subject, { hash }];
    Promise.resolve()
      .then(() => fn(...args))
      .then((draft) => {
        if (this.destroyed || this.narrativeEntries.get(`${slot}|${entry.key ?? ''}`) !== entry)
          return;
        if (!draft || typeof draft !== 'object' || !Array.isArray(draft.sentences)) {
          throw new Error('the narrative slot did not return a draft');
        }
        entry.draft = draft;
        entry.status = 'ready';
        entry.error = null;
        this.refreshNarrativeCards();
        this.announce(`AI narrative ready: ${cardTitle(entry)}.`);
      })
      .catch((error) => {
        if (this.destroyed || this.narrativeEntries.get(`${slot}|${entry.key ?? ''}`) !== entry)
          return;
        entry.status = 'error';
        entry.error = `The narrative could not be drafted: ${error && error.message ? error.message : error}`;
        warn(
          `the ${slug} narrative slot failed: ${error && error.message ? error.message : error}`
        );
        this.refreshNarrativeCards();
      });
    return entry;
  }

  /**
   * Reconcile the narrative entries with the render state: drop another
   * subject's entries and a stale anchor's card, request the participant
   * summary and the anchored event's context when their slots are bound,
   * re-request the event context when the window width changed (emitting a
   * regenerate action), and recompute staleness for every ready entry.
   * @private
   */
  syncNarratives() {
    const entries = this.narrativeEntries;
    for (const [key, entry] of [...entries]) {
      if (entry.subject !== this.subject) entries.delete(key);
    }
    if (!this.settings.narratives || !this.subject) {
      entries.clear();
      return;
    }
    if (this.narrativeSlot('subjectSummary') && !entries.has('subjectSummary|')) {
      this.requestNarrative('subjectSummary');
    }
    const anchorId = this.anchoredEvent ? this.anchoredEvent.id : null;
    for (const [key, entry] of [...entries]) {
      if (entry.slot === 'eventContext' && entry.key !== anchorId) entries.delete(key);
    }
    if (anchorId && this.narrativeSlot('eventContext')) {
      const existing = entries.get(`eventContext|${anchorId}`);
      if (!existing) this.requestNarrative('eventContext', anchorId);
      else if (existing.inputs.window_days !== this.state.windowDays) {
        this.emitNarrativeAction('regenerate', existing, { reason: 'window' });
        this.requestNarrative('eventContext', anchorId);
      }
    }
    let scope = null;
    for (const entry of entries.values()) {
      if (entry.status !== 'ready' || !entry.hash) continue;
      try {
        scope = scope || this.narrativeScope();
        entry.stale = scope.scopeHash(entry.kind, entry.inputs) !== entry.hash;
      } catch {
        entry.stale = false;
      }
    }
  }

  /**
   * The card handlers narratives.js calls back into.
   * @private
   */
  narrativeHandlers() {
    return {
      describe: (rowId) => {
        const id = normalizeRowId(rowId);
        const event = this.findEvent(id);
        // A lab record's label is its value; the chip names the test too.
        const label = !event
          ? id
          : event.domain === 'LB' && event.test
            ? `${event.test} ${event.label}`
            : event.label;
        return { label, onTimeline: Boolean(this.markButton(id)) };
      },
      onCite: (rowId, options) => this.citeRow(rowId, options),
      onAction: (type, entry) => this.handleNarrativeAction(type, entry),
      onToggle: (entry, expanded) => {
        entry.expanded = expanded;
        this.withFocusRestore(() => this.refreshNarrativeCards());
      },
      onEditSave: (entry, sentences) => {
        entry.editing = false;
        entry.draft = { ...entry.draft, sentences, status: 'edited' };
        this.emitNarrativeAction('edit', entry, { editedSentences: sentences });
        this.withFocusRestore(() => this.refreshNarrativeCards());
      }
    };
  }

  /**
   * Draw one entry's card.
   * @private
   */
  narrativeCard(entry) {
    return renderNarrativeCard(entry, this.narrativeHandlers());
  }

  /**
   * The mark button for an event id, or null when it is not on the timeline.
   * @private
   */
  markButton(id) {
    return this.lanesEl.querySelector(
      `.sv-pje-mark[data-event-id="${String(id).replace(/"/g, '')}"]`
    );
  }

  /**
   * Light the cited mark on the timeline and move keyboard focus to it, or
   * open the row's source record when the mark is not drawn (its lane is off,
   * a filter removed it, the row cap) or when asked to jump (PJE-NARR-011).
   * @param {string} rowId The cited row id (`AE-7`).
   * @param {Object} [options] Options: `jump` (boolean) opens the source record instead of lighting the mark.
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  citeRow(rowId, { jump = false } = {}) {
    const id = normalizeRowId(rowId);
    const button = this.markButton(id);
    const event = this.findEvent(id);
    if (jump || !button) {
      if (event) this.jumpToSource(event.sourceAnchorId);
      if (!button)
        this.announce(
          `${event ? event.label : id} is not on the timeline; opened its source record.`
        );
      return this;
    }
    this.clearCitedMark();
    button.classList.add('is-cited');
    this.citedMarkId = id;
    if (typeof button.scrollIntoView === 'function') button.scrollIntoView({ block: 'nearest' });
    this.overlay.focusMark(button);
    this.announce(`Cited: ${event ? event.label : id}.`);
    return this;
  }

  /**
   * Remove the citation highlight.
   * @private
   */
  clearCitedMark() {
    if (!this.citedMarkId) return;
    for (const lit of this.lanesEl.querySelectorAll('.sv-pje-mark.is-cited'))
      lit.classList.remove('is-cited');
    this.citedMarkId = null;
  }

  /**
   * A reviewer action on a card: accept, reject and regenerate emit and leave
   * the draft as it is (the host application decides what accepting means and
   * passes the accepted draft back through refreshNarrative); edit opens the
   * in-place form; regenerate also re-requests the draft.
   * @private
   */
  handleNarrativeAction(type, entry) {
    if (type === 'edit') {
      entry.editing = true;
      this.withFocusRestore(() => this.refreshNarrativeCards());
      return;
    }
    if (type === 'cancel-edit') {
      entry.editing = false;
      this.withFocusRestore(() => this.refreshNarrativeCards());
      return;
    }
    if (type === 'regenerate') {
      this.emitNarrativeAction('regenerate', entry, { reason: entry.stale ? 'stale' : 'manual' });
      this.withFocusRestore(() => {
        this.requestNarrative(entry.slot, entry.key);
        this.refreshNarrativeCards();
      });
      return;
    }
    if (type === 'accept' || type === 'reject') this.emitNarrativeAction(type, entry);
  }

  /**
   * Emit a narrative action on the three channels (PJE-NARR-013).
   * @private
   */
  emitNarrativeAction(type, entry, extra = {}) {
    this.emit('pjeNarrativeAction', {
      type,
      kind: entry.kind,
      subject: entry.subject,
      row_id: entry.key,
      draft: entry.draft,
      ...extra
    });
  }

  /**
   * Replace a narrative's draft with one the host passes back — the accepted
   * copy, an edited copy, or a fresh generation — and redraw its card. The
   * draft is matched by kind, subject and key (the anchor row id or the lab
   * test); an unmatched draft warns and changes nothing.
   * @param {Object} draft A narrative draft (with `status: 'accepted'` to mark it accepted).
   * @returns {SafetyPatientJourneyExplorer} The instance, for chaining.
   */
  refreshNarrative(draft) {
    if (!draft || typeof draft !== 'object') return this;
    const slot = NARRATIVE_KINDS[draft.kind];
    const key =
      draft.kind === 'event-context'
        ? normalizeRowId(draft.anchor && draft.anchor.row_id)
        : draft.kind === 'lab-trajectory'
          ? String(draft.test ?? '')
          : null;
    const entry = this.narrativeEntries.get(`${slot}|${key ?? ''}`);
    if (!entry || String(entry.subject) !== String(draft.subject)) {
      warn(
        `refreshNarrative: no ${draft.kind} card for ${draft.subject}${key ? ` / ${key}` : ''}.`
      );
      return this;
    }
    entry.draft = draft;
    entry.status = 'ready';
    entry.error = null;
    entry.editing = false;
    this.withFocusRestore(() => this.refreshNarrativeCards());
    return this;
  }

  /**
   * Redraw every mounted narrative card from the entries: the banner above
   * the lanes, the card at the top of the panel body, the lane slots.
   * @private
   */
  refreshNarrativeCards() {
    this.renderNarrativeBanner();
    this.mountPanelNarrative();
    this.mountLaneNarratives();
  }

  /**
   * The participant-summary card above the lanes (PJE-NARR-009).
   * @private
   */
  renderNarrativeBanner() {
    this.narrativeBannerEl.innerHTML = '';
    const entry = this.narrativeEntries.get('subjectSummary|');
    if (entry) this.narrativeBannerEl.append(this.narrativeCard(entry));
  }

  /**
   * The event-context card at the top of the panel body (PJE-NARR-010).
   * @private
   */
  mountPanelNarrative() {
    const body = this.railWrap.querySelector('.sv-pje-panel-body');
    if (!body) return;
    for (const old of body.querySelectorAll(':scope > .sv-pje-ai')) old.remove();
    const anchorId = this.anchoredEvent ? this.anchoredEvent.id : null;
    const entry = anchorId ? this.narrativeEntries.get(`eventContext|${anchorId}`) : null;
    if (entry) body.prepend(this.narrativeCard(entry));
  }

  /**
   * The on-demand cards on the lanes (PJE-NARR-014): each slot element
   * buildLanes placed shows its card when requested, else the request control.
   * @private
   */
  mountLaneNarratives() {
    for (const host of this.lanesEl.querySelectorAll('.sv-pje-ai-slot')) {
      const { slot, key } = host.dataset;
      host.innerHTML = '';
      if (!this.narrativeSlot(slot)) continue;
      const entry = this.narrativeEntries.get(`${slot}|${key || ''}`);
      if (entry) {
        host.append(this.narrativeCard(entry));
        continue;
      }
      const label =
        slot === 'labTrajectory'
          ? `Draft the ${key} narrative`
          : slot === 'doseJourney'
            ? 'Draft the dose-journey narrative'
            : 'Draft the disposition narrative';
      host.append(
        renderNarrativeRequest({ slot, label, focusKey: `ai-request-${slot}-${key || ''}` }, () => {
          this.requestNarrative(slot, key || null);
          this.withFocusRestore(() => this.refreshNarrativeCards());
        })
      );
    }
  }

  /**
   * The narrative entries for the current subject: kind, key, status, draft,
   * stale flag and scope hash. A read model for hosts and tests.
   * @type {Object[]}
   */
  get narratives() {
    return [...this.narrativeEntries.values()].map((entry) => ({
      kind: entry.kind,
      slot: entry.slot,
      subject: entry.subject,
      key: entry.key,
      status: entry.status,
      draft: entry.draft,
      stale: entry.stale,
      hash: entry.hash,
      expanded: entry.expanded,
      error: entry.error
    }));
  }

  /**
   * Whether an event of the current subject is on the timeline, and if not,
   * why: its lane is off, a filter removed it, or the row cap left it undrawn.
   * @param {?Object} event An EventRecord of the current subject.
   * @returns {'drawn'|'lane off'|'filtered out'|'row cap'} The state.
   * @private
   */
  drawState(event) {
    if (!event || !this.structured) return 'filtered out';
    const lane = this.structured.lanes[event.lane];
    if (!lane || !lane.enabled) return 'lane off';
    if (!(this.structured.byLane[event.lane] || []).some((e) => e.id === event.id))
      return 'filtered out';
    if (!lane.drawn.some((e) => e.id === event.id)) return 'row cap';
    return 'drawn';
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
      open: wasOpen,
      warn: !this.sourceLinkWarned
    });
    this.sourceLinkWarned = true;
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
    const lines = this.tooltipText(event, button);
    this.hoveredEvent = event;
    this.writeFootnote(event, lines);
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
   * The tooltip lines of a mark, with the records stacked on the same day
   * (from the overlay's `data-same-day`) named before the gesture line.
   * @private
   */
  tooltipText(event, button) {
    const lines = tooltipLines(event, this.effectiveSettings(), {
      ...this.display(),
      anchor: this.anchoredEvent
    });
    const stacked = button && button.dataset ? button.dataset.sameDay : '';
    if (stacked) {
      const n = Number(button.dataset.sameDayCount) || stacked.split('; ').length;
      lines.splice(
        lines.length - 1,
        0,
        `and ${plural(n, 'more record')} on this day: ${stacked.split('; ').join(', ')}`
      );
    }
    return lines;
  }

  /**
   * Write a mark's text into the footnote with the Open source record button.
   * @private
   */
  writeFootnote(event, lines) {
    const text =
      lines ||
      tooltipLines(event, this.effectiveSettings(), {
        ...this.display(),
        anchor: this.anchoredEvent
      });
    this.footnoteEvent = event;
    this.footnote.innerHTML = '';
    this.footnote.append(
      createElement(
        'span',
        'sv-pje-footnote-text',
        text.filter((line) => line !== GESTURE_LINE).join(' · ')
      )
    );
    const open = createElement('button', 'sv-pje-open-source', 'Open source record');
    open.type = 'button';
    open.setAttribute('data-sv-focus', 'open-source');
    open.onclick = () => this.jumpToSource(event.sourceAnchorId);
    this.footnote.append(open);
  }

  /**
   * Empty the footnote: the mark it described is no longer on the page.
   * @private
   */
  clearFootnote() {
    this.footnoteEvent = null;
    if (this.footnote) this.footnote.innerHTML = '';
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
    // Escape in a text field keeps its native meaning (clear the search, leave
    // the number field), unless a tooltip is up.
    const target = event.target;
    const textEntry =
      target &&
      ((target.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/i.test(target.type)) ||
        target.tagName === 'TEXTAREA');
    if (textEntry && this.tooltipEl.hidden) return;
    this.clearCitedMark();
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
    this.clearFootnote();
    this.render();
    const { counts, extent } = this.structured;
    this.emit('pjeSubjectSelected', {
      subject: this.subject,
      previous,
      counts: { ...counts },
      domainDays: extent ? [extent[0], extent[1]] : null
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
        `${plural(c.doseChanges, 'dose change')}, ${plural(c.priorEvents, 'earlier or same-day event')} with this term.`
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
    return this.effectiveMode();
  }

  /**
   * Register a listener for one of the module events (pjeSubjectSelected,
   * pjeEventAnchored, pjeContextChanged, pjeLaneToggled, pjeFilterChanged,
   * pjeTimeModeChanged, pjeNarrativeAction, participantsSelected); the handler receives the
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
    this.narrativeEntries.clear();
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
    return this.effectiveMode();
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
