// Public entrypoint for the participant-profile module (#98, obot.roadmap#45,
// v2 obot.roadmap#75): the shared eDISH-style drill-down — participant header,
// standardized-labs spaghetti, adverse-event tracks, measure table with
// sparklines + inset — as one module with two mounts (PPRF-1).
//
// Standalone (this file's default factory) it renders the house shell, ingests
// the standard long-lab contract through the shared hep-core cleaners, and
// listens for `participantsSelected` on a configurable target (PPRF-6).
//
// Railed (profileRail) it renders into a host chart's `sv-rail` shell slot — a
// right-hand rail opposite the control sidebar — consumes the host's
// pre-cleaned rows verbatim (no second ingest) and is driven imperatively via
// show/clear. The rail is v2's default surfacing (decision D1); it replaces the
// dock below the chart, which is removed outright (decision D4) and reached
// only by the shell's under-900px stacking.
//
// Outbound coordination is callbacks only (on_clear, on_step); the module
// never dispatches a selection event. Class shape mirrors SafetyDeltaDelta
// (init/setData/setSettings/render/resize/destroy).

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  LogarithmicScale,
  Tooltip,
  Legend
} from 'chart.js';

import { controlBuilders, createElement, renderShell } from './shell.js';
import { syncSettings } from './participant-profile/configure.js';
import { checkInputs } from './participant-profile/checkInputs.js';
import { cleanData, deriveBaseline } from './hep-core/rows.js';
import { buildProfileModel, rankParticipants } from './participant-profile/structureData.js';
import { renderHeader } from './participant-profile/header.js';
import { renderSpaghetti } from './participant-profile/spaghetti.js';
import { renderMeasureTable, renderRecordListing } from './participant-profile/measureTable.js';
import { renderStepper } from './participant-profile/stepper.js';
import { displayControl, labControl } from './participant-profile/controls.js';
import { applyProfileStyles } from './participant-profile/styles.js';
import {
  syncAeSettings,
  cleanAeRecords,
  participantEvents,
  aeDomain,
  unionDomain
} from './participant-profile/ae.js';
import { renderAeTracks } from './participant-profile/aeTracks.js';

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  LogarithmicScale,
  Tooltip,
  Legend
);

/**
 * The day span the visible lab series occupy — half of the union domain
 * (PPRF-AXIS-001).
 * @param {Object} spaghetti The spaghetti model ({ series }).
 * @returns {?number[]} [min, max], or null when no series carries a finite day.
 * @private
 */
function labDomain(spaghetti) {
  const days = [];
  ((spaghetti && spaghetti.series) || []).forEach((entry) => {
    (entry.points || []).forEach((point) => {
      if (Number.isFinite(point.day)) days.push(point.day);
    });
  });
  if (!days.length) return null;
  return [Math.min(...days), Math.max(...days)];
}

/**
 * Resolve the standalone event target (PPRF-6): an Element passes through, a
 * selector string resolves against the document, and null/undefined (or a
 * selector with no match) falls back to the document itself.
 * @param {?(Element|string)} listenTo The configured listen_to setting.
 * @returns {EventTarget} The resolved target.
 * @private
 */
function resolveListenTarget(listenTo) {
  if (!listenTo) return document;
  if (typeof listenTo === 'string') return document.querySelector(listenTo) || document;
  return listenTo;
}

/**
 * A human-readable label for the listen target, for the idle note.
 * @param {?(Element|string)} listenTo The configured listen_to setting.
 * @param {EventTarget} target The resolved target.
 * @returns {string} The label.
 * @private
 */
function listenTargetLabel(listenTo, target) {
  if (typeof listenTo === 'string') return listenTo;
  if (!listenTo || target === document) return 'document';
  if (listenTo.id) return `#${listenTo.id}`;
  return (listenTo.tagName || 'element').toLowerCase();
}

/**
 * The shared participant-profile drill-down: header, labs-over-time spaghetti,
 * and measure table with sparklines and expandable insets, for one participant
 * at a time, with a worst-first cohort stepper when the selection holds more
 * (PPRF-5). Construct standalone via the participantProfile() factory (renders
 * the control shell, ingests raw long-lab records, listens for
 * participantsSelected) or railed via profileRail() (renders into a host
 * chart's rail slot, fed the host's pre-cleaned rows imperatively).
 */
class SafetyParticipantProfile {
  constructor(element = 'body', settings = {}, { mode = 'standalone' } = {}) {
    this.mode = mode;
    this.element = typeof element === 'string' ? document.querySelector(element) : element;
    if (!this.element) throw new Error(`Safety Participant Profile target not found: ${element}`);
    this.settings = syncSettings(settings);
    this.rawData = [];
    this.cleanRows = [];
    this.removedRecords = 0;
    this.model = null;
    this.spaghettiChart = null;
    this.spaghettiHost = null;
    this.tableController = null;
    this.listenTarget = null;
    this.listenHandler = null;
    this.liveRegion = null;
    this.state = {
      display: this.settings.display,
      showExtras: false,
      labs: null,
      ids: [],
      index: 0,
      expanded: false,
      cohortOpen: false
    };
    // The AE domain is opt-in: without settings.ae the profile is exactly the
    // v1 lab-only block (PPRF-AE-001).
    this.aeSettings = this.settings.ae ? syncAeSettings(this.settings.ae) : null;
    this.aeEvents = [];
    this.aeRemoved = 0;
    if (this.aeSettings && Array.isArray(this.settings.ae.data)) {
      this.setAeData(this.settings.ae.data);
    }
    applyProfileStyles();
    if (this.mode === 'standalone') {
      this.renderChrome();
      this.listen();
      this.setIdle();
    } else {
      this.renderRailChrome();
    }
  }

  /**
   * Ingest adverse-event records once (PPRF-AE-002). Hosts that already hold
   * cleaned AE rows may pass them here instead of through settings.ae.data;
   * either way the cleaning runs once per call, never per gesture.
   * @param {Object[]} records Raw adverse-event records.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  setAeData(records) {
    if (!this.aeSettings) return this;
    const { events, removed } = cleanAeRecords(records, this.aeSettings);
    this.aeEvents = events;
    this.aeRemoved = removed;
    return this;
  }

  /**
   * Build the rail chrome (decisions D1/D2/D3/D8): a header naming the current
   * participant with Expand and Close, a stepper strip pinned so it survives
   * scrolling the rail, and a scrolling body the profile block renders into.
   * @private
   */
  renderRailChrome() {
    this.element.innerHTML = '';
    const rail = createElement('div', 'sv-profile-rail');

    const head = createElement('div', 'sv-profile-rail-head');
    const heading = createElement('div', 'sv-profile-rail-heading');
    this.railTitle = createElement('h2', 'sv-profile-rail-title', 'Participant profile');
    this.railSub = createElement('p', 'sv-profile-rail-sub', 'Nothing selected');
    heading.append(this.railTitle, this.railSub);

    const actions = createElement('div', 'sv-profile-rail-actions');
    this.expandButton = createElement('button', 'sv-profile-rail-btn', 'Expand');
    this.expandButton.type = 'button';
    this.expandButton.setAttribute('data-sv-focus', 'rail-expand');
    this.expandButton.setAttribute('aria-pressed', 'false');
    this.expandButton.onclick = () => this.setExpanded(!this.state.expanded);
    const close = createElement('button', 'sv-profile-rail-btn sv-profile-rail-close', '\u2715');
    close.type = 'button';
    close.setAttribute('aria-label', 'Close the participant profile');
    close.setAttribute('data-sv-focus', 'rail-close');
    close.onclick = () => this.handleClear();
    actions.append(this.expandButton, close);
    head.append(heading, actions);

    this.stepperWrap = createElement('div', 'sv-profile-rail-stepper');
    this.railBody = createElement('div', 'sv-profile-rail-body');
    rail.append(head, this.stepperWrap, this.railBody);
    this.element.append(rail);
    this.railRoot = rail;
    this.profileHost = this.railBody;

    // Escape leaves the expanded state rather than trapping the reviewer in it
    // (decision D3).
    /** @private */
    this.railKeyHandler = (event) => {
      if (event.key === 'Escape' && this.state.expanded) {
        event.stopPropagation();
        this.setExpanded(false);
      }
    };
    rail.addEventListener('keydown', this.railKeyHandler);
  }

  /**
   * Expand the rail to fill the host renderer's own container, or collapse it
   * back (decision D3). Deliberately NOT a viewport overlay or the native
   * Fullscreen API: the same module has to behave identically inside a
   * gsm.safety htmlwidget and an open.gismo panel, where escaping the container
   * is either impossible or rude.
   * @param {boolean} expanded The target state.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  setExpanded(expanded) {
    const next = Boolean(expanded);
    this.state.expanded = next;
    const shellRoot = this.element.closest ? this.element.closest('.sv-root') : null;
    if (shellRoot) shellRoot.classList.toggle('sv-rail-expanded', next);
    if (this.railRoot) this.railRoot.classList.toggle('is-expanded', next);
    if (this.expandButton) {
      this.expandButton.textContent = next ? 'Collapse' : 'Expand';
      this.expandButton.setAttribute('aria-pressed', String(next));
    }
    this.resize();
    return this;
  }

  /**
   * Update the rail header for the current selection.
   * @private
   */
  updateRailHead() {
    if (!this.railTitle) return;
    const id = this.state.ids[this.state.index];
    this.railTitle.textContent = id === undefined ? 'Participant profile' : String(id);
    this.railSub.textContent =
      id === undefined
        ? 'Nothing selected'
        : this.state.ids.length > 1
          ? `${this.state.ids.length} selected \u00b7 stepping worst first`
          : 'Selected from the chart';
    if (this.railRoot) this.railRoot.classList.toggle('is-empty', id === undefined);
  }

  /**
   * Build the standalone shell chrome: the shared sidebar/main layout with the
   * chart card hidden, the profile block owning the main column. The rail slot
   * stays empty here — standalone IS the expanded reading, so there is nothing
   * to put beside itself.
   * @private
   */
  renderChrome() {
    Object.assign(
      this,
      renderShell(this.element, {
        moduleClass: 'safety-participant-profile',
        onToggle: () => this.resize()
      })
    );
    this.chartWrap.style.display = 'none';
    this.profileHost = createElement('div', 'sv-profile');
    this.main.insertBefore(this.profileHost, this.multiplesWrap);
  }

  /**
   * Install the standalone `participantsSelected` listener on the configured
   * target (PPRF-6). The handler reads `event.detail?.data ?? []`, coerces the
   * ids to strings, and shows the selection — or clears to idle when it is
   * empty. The docked mount installs no listener.
   * @private
   */
  listen() {
    this.listenTarget = resolveListenTarget(this.settings.listen_to);
    this.listenLabel = listenTargetLabel(this.settings.listen_to, this.listenTarget);
    /** @private */
    this.listenHandler = (event) => {
      const data = event && event.detail ? event.detail.data : null;
      const ids = (Array.isArray(data) ? data : []).map(String);
      if (ids.length) this.show(ids);
      else this.clear();
    };
    this.listenTarget.addEventListener('participantsSelected', this.listenHandler);
  }

  /**
   * Show the standalone idle note: waiting for a selection on the listen
   * target.
   * @private
   */
  setIdle() {
    if (this.notes)
      this.notes.textContent = `Waiting for selection — listening on ${this.listenLabel}.`;
  }

  /**
   * Load data and render: an alias for setData that keeps the two-step
   * create-then-init call shape working.
   * @param {Object[]} data Long-format lab records matching the profile data contract.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  init(data) {
    this.setData(data);
    return this;
  }

  /**
   * Replace the bound data and re-render (standalone ingest path). The data is
   * validated against the settings mapping (throwing, and rendering the message
   * into the target element, when required columns are missing), then cleaned
   * and baseline-derived through the shared hep-core reducers.
   * @param {Object[]} data Long-format lab records matching the profile data contract.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  setData(data) {
    this.rawData = Array.isArray(data) ? data : [];
    this.validateAndCleanData();
    this.render();
    return this;
  }

  /**
   * Merge setting overrides onto the current settings without re-rendering:
   * the merge half of setSettings, also used by a docked host to refresh
   * live pass-through settings (cuts, axis type, display) before its own
   * selection re-dispatch re-renders the block (PPRF-7).
   * @param {Object} settings Setting overrides to merge.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  applySettings(settings) {
    if ('display' in settings) this.state.display = settings.display;
    this.settings = syncSettings({ ...this.settings, ...settings });
    return this;
  }

  /**
   * Merge setting overrides onto the current settings, adopt a provided display
   * mode into the live state, re-clean any bound data, and re-render.
   * @param {Object} settings Setting overrides to merge.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  setSettings(settings) {
    this.applySettings(settings);
    if (this.mode === 'standalone' && this.rawData.length) this.validateAndCleanData();
    this.render();
    return this;
  }

  /**
   * Validate and clean the raw data (standalone only): checkInputs guards the
   * long-lab contract, cleanData derives the __hep_* columns, deriveBaseline
   * fills the ×Baseline field.
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
    this.cleanRows = rows;
    this.removedRecords = removed;
    if (removed)
      console.warn(
        `${removed} missing or non-numeric result${removed > 1 ? 's have' : ' has'} been removed.`
      );
  }

  /**
   * Programmatic selection: the same path the participantsSelected listener
   * takes (PPRF-6). A non-empty list ranks and shows the cohort; an empty list
   * clears.
   * @param {Array<string|number>} ids The selected participant ids.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  setSelected(ids) {
    const list = (Array.isArray(ids) ? ids : []).map(String);
    if (list.length) this.show(list);
    else this.clear();
    return this;
  }

  /**
   * Show a selection: rank the ids worst-first (PPRF-5) and render the profile
   * for the first. The docked mount passes the host's pre-cleaned rows, which
   * are consumed verbatim — no checkInputs, no cleanData (PPRF-1).
   * @param {Array<string|number>} ids The selected participant ids.
   * @param {Object[]} [cleanRows] Pre-cleaned rows carrying the __hep_* columns (dock contract).
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  show(ids, cleanRows) {
    if (cleanRows !== undefined) this.cleanRows = Array.isArray(cleanRows) ? cleanRows : [];
    const list = (Array.isArray(ids) ? ids : []).map(String);
    if (!list.length) return this.clear();
    const ranked = rankParticipants(this.cleanRows, list, this.settings);
    // Re-shows of the SAME cohort (host control redraws re-dispatch the carried
    // selection) keep the stepper position instead of snapping back to 1 of N.
    const sameCohort =
      ranked.length === this.state.ids.length &&
      ranked.every((id, index) => String(id) === String(this.state.ids[index]));
    this.state.ids = ranked;
    this.state.index = sameCohort ? Math.min(this.state.index, ranked.length - 1) : 0;
    this.renderProfile();
    return this;
  }

  /**
   * Clear the profile block: destroy the live charts, empty the slot (the
   * shell's `.sv-profile:empty` rule hides it), and return the standalone
   * mount to its idle note.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  clear() {
    this.destroyContent();
    this.state.ids = [];
    this.state.index = 0;
    this.profileHost.innerHTML = '';
    this.liveRegion = null;
    if (this.stepperWrap) this.stepperWrap.innerHTML = '';
    if (this.mode === 'standalone') {
      if (this.controls) this.controls.innerHTML = '';
      this.setIdle();
    } else {
      this.state.expanded = false;
      this.setExpanded(false);
      this.updateRailHead();
    }
    return this;
  }

  /**
   * The Clear affordance (PPRF-2/6): docked, the host owns the selection, so
   * Clear delegates to on_clear (falling back to a local clear when the host
   * wired none); standalone, the module clears its own block and then notifies
   * on_clear so a host can sync.
   * @private
   */
  handleClear() {
    if (this.mode === 'rail') {
      if (this.settings.on_clear) this.settings.on_clear();
      else this.clear();
      return;
    }
    this.clear();
    if (this.settings.on_clear) this.settings.on_clear();
  }

  /**
   * Step the cohort to another index (PPRF-5): re-render the full profile for
   * the target participant and report the id through on_step so the host keeps
   * its chart highlight in sync — the module itself dispatches nothing.
   * @param {number} index The clamped target index.
   * @private
   */
  step(index) {
    if (index < 0 || index >= this.state.ids.length) return;
    this.state.index = index;
    this.renderProfile();
    if (this.settings.on_step) this.settings.on_step(this.state.ids[index]);
  }

  /**
   * Re-render from the current state: the profile when a selection is live,
   * the idle/empty state otherwise.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  render() {
    if (this.state.ids.length) this.renderProfile();
    else this.clear();
    return this;
  }

  /**
   * Render the full profile block for the current participant: stepper (N > 1),
   * header, controls, spaghetti card, measure table, and the optional record
   * listing (PPRF-2/3/4/5). The rebuild is keyboard-safe (PPRF-8): the focused
   * control's data-sv-focus key is captured first and focus is restored onto
   * its recreated counterpart, and a persistent aria-live region (never torn
   * down between renders) announces the current participant.
   * @private
   */
  renderProfile() {
    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const ownsFocus =
      activeEl &&
      (this.profileHost.contains(activeEl) || (this.controls && this.controls.contains(activeEl)));
    const focusKey = ownsFocus ? activeEl.getAttribute('data-sv-focus') : null;

    this.destroyContent();
    if (!this.liveRegion || this.liveRegion.parentElement !== this.profileHost) {
      this.profileHost.innerHTML = '';
      this.liveRegion = createElement('div', 'sv-profile-live');
      this.liveRegion.setAttribute('aria-live', 'polite');
      this.profileHost.append(this.liveRegion);
    } else {
      [...this.profileHost.children].forEach((child) => {
        if (child !== this.liveRegion) child.remove();
      });
    }

    const id = this.state.ids[this.state.index];
    const model = buildProfileModel(this.cleanRows, id, this.settings, this.state);
    this.model = model;

    this.aeRows = this.aeSettings ? participantEvents(this.aeEvents, id) : [];
    // With no laboratory records the header has nothing to read its
    // demographics from, so the AE records stand in — they carry the same
    // participant-level columns.
    if (!model.spaghetti.series.length && this.aeRows.length) {
      const first = this.aeRows[0];
      model.participant.details = (this.settings.details || []).map((spec) => ({
        label: spec.label,
        value: first[spec.value_col]
      }));
    }

    const root = createElement('div', 'sv-profile-root');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', `Participant ${id} profile`);
    this.profileHost.append(root);

    // The cohort stepper is pinned to the rail head rather than drawn inside
    // the scrolling block (decision D8) — in a rail it would otherwise leave
    // the viewport the moment the reviewer reaches the measure table.
    const stepper =
      this.state.ids.length > 1
        ? renderStepper(this.state.ids, this.state.index, {
            onStep: (index) => this.step(index),
            onToggleList: () => {
              this.state.cohortOpen = !this.state.cohortOpen;
              this.renderProfile();
            },
            listOpen: this.state.cohortOpen,
            ranked: this.state.cohortOpen ? this.cohortRows() : null
          })
        : null;
    if (this.stepperWrap) {
      this.stepperWrap.innerHTML = '';
      if (stepper) this.stepperWrap.append(stepper);
    } else if (stepper) {
      root.append(stepper);
    }

    root.append(
      renderHeader(model.participant, this.settings, { onClear: () => this.handleClear() })
    );

    // The lab domain is optional in v2 (decision D9): ae-explorer and
    // ae-timelines mount the profile with adverse events and no laboratory
    // records at all, and the block reads as the AE story rather than as an
    // empty spaghetti and an empty table.
    const hasLabs = model.spaghetti.series.length > 0;

    // The Measures control lists only the AVAILABLE measures — extras join the
    // list when the extras toggle reveals them — so its selection state always
    // matches what the spaghetti draws (PPRF-3).
    const keys = model.spaghetti.series
      .filter((entry) => this.state.showExtras || entry.isKey)
      .map((entry) => entry.key);
    if (hasLabs) {
      if (this.mode === 'rail') root.append(this.buildInlineControls(keys));
      else this.buildSidebarControls(keys);
    } else if (this.mode === 'standalone' && this.controls) {
      this.controls.innerHTML = '';
    }

    // The shared study-day domain (decision D7): labs and adverse events
    // rescale together so an event running past the last lab draw stays
    // visible instead of clipping at the edge.
    this.domain = this.aeSettings
      ? unionDomain(labDomain(model.spaghetti), aeDomain(this.aeRows))
      : null;

    if (hasLabs) {
      this.spaghettiHost = createElement('div', 'sv-profile-spaghetti');
      root.append(this.spaghettiHost);
      this.drawSpaghetti();
    }

    // Directly under the labs chart, before the measure table (decision D5):
    // the shared axis only pays off if the two time tracks touch.
    if (this.aeSettings) {
      root.append(renderAeTracks(this.aeRows, this.domain, this.aeSettings));
    }

    if (hasLabs)
      this.tableController = renderMeasureTable(root, model.measures, this.settings, this.state, {
        // The extras toggle changes both the table AND the control surface
        // (Measures options, spaghetti series), so it re-renders the block;
        // focus restoration keeps the checkbox focused (PPRF-8).
        onToggleExtras: (showExtras) => {
          this.state.showExtras = showExtras;
          this.renderProfile();
        }
      });

    if (this.settings.listing) {
      const participantRows = this.cleanRows.filter(
        (row) => String(row[this.settings.id_col]) === String(id)
      );
      renderRecordListing(root, participantRows, this.settings);
    }

    if (this.mode === 'standalone' && this.notes) {
      const n = this.state.ids.length;
      this.notes.textContent =
        n > 1 ? `Profiling ${n} selected participants.` : `Profiling participant ${id}.`;
    }

    const n = this.state.ids.length;
    this.liveRegion.textContent =
      n > 1 ? `Participant ${id}, ${this.state.index + 1} of ${n}` : `Participant ${id}`;
    this.updateRailHead();
    this.restoreFocus(focusKey);
  }

  /**
   * The ranked cohort as rows for the stepper's expandable list (decision D8):
   * every selected participant, worst-first, with the current one marked — so
   * "which twelve am I stepping through?" is answerable without leaving the
   * rail.
   * @returns {Array<{id: string, index: number, current: boolean}>} The rows.
   * @private
   */
  cohortRows() {
    return this.state.ids.map((id, index) => ({
      id: String(id),
      index,
      current: index === this.state.index
    }));
  }

  /**
   * Restore keyboard focus after a rebuild (PPRF-8): find the recreated
   * control carrying the captured data-sv-focus key and focus it; when a
   * stepper button came back disabled (the cohort end was reached), focus the
   * stepper strip instead so arrow-key navigation keeps working.
   * @param {?string} focusKey The captured data-sv-focus key, or null.
   * @private
   */
  restoreFocus(focusKey) {
    if (!focusKey) return;
    const find = (key) =>
      this.profileHost.querySelector(`[data-sv-focus="${key}"]`) ||
      (this.controls ? this.controls.querySelector(`[data-sv-focus="${key}"]`) : null);
    let target = find(focusKey);
    if (target && target.disabled) target = find('stepper') || target;
    if (target && !target.disabled && typeof target.focus === 'function') target.focus();
  }

  /**
   * (Re)draw the spaghetti card from the current model and control state,
   * destroying any previous chart first.
   * @private
   */
  drawSpaghetti() {
    if (this.spaghettiChart) this.spaghettiChart.destroy();
    this.spaghettiChart = null;
    if (!this.spaghettiHost || !this.model) return;
    this.spaghettiHost.innerHTML = '';
    this.spaghettiChart = renderSpaghetti(
      this.spaghettiHost,
      this.model.spaghetti,
      this.state,
      this.domain
    );
  }

  /**
   * Build the standalone sidebar controls (house convention): Display and Labs
   * sections through the shared control builders.
   * @param {string[]} keys The measure keys of the current profile.
   * @private
   */
  buildSidebarControls(keys) {
    this.controls.innerHTML = '';
    const { addSection, addControl } = controlBuilders(this.controls);
    const displayParent = addSection('Display');
    addControl(
      'Standardization',
      displayControl(this.settings, this.state, (value) => this.onDisplayChange(value)),
      displayParent
    );
    const labParent = addSection('Labs');
    addControl(
      'Measures',
      labControl(keys, this.state, (labs) => this.onLabsChange(labs)),
      labParent
    );
  }

  /**
   * Build the dock's compact inline controls strip: the same builders as the
   * sidebar, placed inside the block (section 6 of the module spec).
   * @param {string[]} keys The measure keys of the current profile.
   * @returns {HTMLElement} The controls strip.
   * @private
   */
  buildInlineControls(keys) {
    const strip = createElement('div', 'sv-profile-controls');
    const displayField = createElement('div', 'sv-profile-field');
    displayField.append(
      createElement('label', null, 'Standardization'),
      displayControl(this.settings, this.state, (value) => this.onDisplayChange(value))
    );
    const labField = createElement('div', 'sv-profile-field');
    labField.append(
      createElement('label', null, 'Measures'),
      labControl(keys, this.state, (labs) => this.onLabsChange(labs))
    );
    strip.append(displayField, labField);
    return strip;
  }

  /**
   * Display-toggle change (PPRF-3): switch the standardization field and
   * rebuild the profile (series values, cuts, and y-label all change).
   * @param {string} value The chosen display mode.
   * @private
   */
  onDisplayChange(value) {
    this.state.display = value;
    this.renderProfile();
  }

  /**
   * Lab-subsetter change (PPRF-3): filter the spaghetti datasets to the
   * selected measure keys.
   * @param {string[]} labs The selected measure keys.
   * @private
   */
  onLabsChange(labs) {
    this.state.labs = labs;
    this.drawSpaghetti();
  }

  /**
   * Resize the live charts to their containers — the spaghetti card and any
   * open measure-table insets. For host layouts that change the container size
   * without a window resize (e.g. the R htmlwidget bindings).
   * @returns {void}
   */
  resize() {
    if (this.spaghettiChart) this.spaghettiChart.resize();
    if (this.tableController) this.tableController.open.forEach((entry) => entry.chart.resize());
  }

  /**
   * Destroy the live Chart.js instances (spaghetti + open insets) without
   * touching the block's DOM.
   * @private
   */
  destroyContent() {
    if (this.spaghettiChart) this.spaghettiChart.destroy();
    this.spaghettiChart = null;
    this.spaghettiHost = null;
    if (this.tableController) this.tableController.destroy();
    this.tableController = null;
  }

  /**
   * Tear the profile down: destroy the charts, remove the standalone event
   * listener, and empty the mount element. The instance cannot be reused
   * afterwards — create a new one via the factory instead.
   * @returns {void}
   */
  destroy() {
    this.destroyContent();
    if (this.railRoot && this.railKeyHandler)
      this.railRoot.removeEventListener('keydown', this.railKeyHandler);
    if (this.listenTarget && this.listenHandler)
      this.listenTarget.removeEventListener('participantsSelected', this.listenHandler);
    this.listenTarget = null;
    this.listenHandler = null;
    this.element.innerHTML = '';
  }
}

/**
 * Create a standalone participant profile inside a container element (PPRF-1).
 * The control shell renders immediately and the module starts listening for
 * `participantsSelected` on the configured target; pass long-format lab
 * records here (or to setData/init on the returned instance) to bind the data.
 * @param {string|HTMLElement} [element='body'] Container node, or a CSS selector for it.
 * @param {?Object[]} [data=null] Optional long-format lab records; when omitted, call setData/init later.
 * @param {Object} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyParticipantProfile} The live profile instance.
 * @throws {Error} When no element matches the target selector.
 */
export default function participantProfile(element = 'body', data = null, settings = {}) {
  const instance = new SafetyParticipantProfile(element, settings);
  if (data) instance.setData(data);
  return instance;
}

/**
 * Create a railed participant profile inside a host chart's rail slot
 * (PPRF-1, decision D1): no shell, no ingest, no event listener. The host
 * drives it imperatively — `show(ids, cleanRows)` with its own retained
 * pre-cleaned rows (carrying the __hep_* columns), `clear()` to empty the rail
 * (which then auto-hides), plus `resize()`/`destroy()`. Clear and stepper
 * navigation report through settings.on_clear / settings.on_step.
 *
 * This replaces v1's `profileDock`: the dock below the chart is removed
 * outright (decision D4), and under the shell's 900px breakpoint the rail
 * stacks below the main column, which is where the dock used to be.
 * @param {string|HTMLElement} container The host's rail slot (the shell's railWrap).
 * @param {Object} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyParticipantProfile} The live rail instance.
 * @throws {Error} When no element matches the container selector.
 */
export function profileRail(container, settings = {}) {
  return new SafetyParticipantProfile(container, settings, { mode: 'rail' });
}
