// Public entrypoint for the participant-profile module (#98, obot.roadmap#45):
// the shared eDISH-style drill-down — participant header, standardized-labs
// spaghetti, measure table with sparklines + inset — as one module with two
// mounts (PPRF-1). Standalone (this file's default factory) it renders the
// house shell, ingests the standard long-lab contract through the shared
// hep-core cleaners, and listens for `participantsSelected` on a configurable
// target (PPRF-6). Docked (profileDock) it renders the same block into a host
// chart's `sv-profile` shell slot, consumes the host's pre-cleaned rows
// verbatim — no second ingest — and is driven imperatively via show/clear.
// Outbound coordination is callbacks only (on_clear, on_step); the module
// never dispatches a selection event. Class shape mirrors SafetyDeltaDelta
// (init/setData/setSettings/render/resize/destroy).

import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
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

Chart.register(LineController, LineElement, PointElement, LinearScale, Tooltip, Legend);

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
 * participantsSelected) or docked via profileDock() (renders into a host
 * chart's profile slot, fed the host's pre-cleaned rows imperatively).
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
    this.state = {
      display: this.settings.display,
      showExtras: false,
      labs: null,
      ids: [],
      index: 0
    };
    applyProfileStyles();
    if (this.mode === 'standalone') {
      this.renderChrome();
      this.listen();
      this.setIdle();
    } else {
      this.profileHost = this.element;
    }
  }

  /**
   * Build the standalone shell chrome: the shared sidebar/main layout with the
   * chart card hidden (the profile block owns the main column via the
   * profileWrap slot — the per-view slot-visibility precedent from
   * hep-explorer).
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
    this.profileHost = this.profileWrap;
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
   * Merge setting overrides onto the current settings, adopt a provided display
   * mode into the live state, re-clean any bound data, and re-render.
   * @param {Object} settings Setting overrides to merge.
   * @returns {SafetyParticipantProfile} The instance, for chaining.
   */
  setSettings(settings) {
    if ('display' in settings) this.state.display = settings.display;
    this.settings = syncSettings({ ...this.settings, ...settings });
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
    this.state.ids = rankParticipants(this.cleanRows, list, this.settings);
    this.state.index = 0;
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
    if (this.mode === 'standalone') {
      if (this.controls) this.controls.innerHTML = '';
      this.setIdle();
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
    if (this.mode === 'dock') {
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
   * listing (PPRF-2/3/4/5).
   * @private
   */
  renderProfile() {
    this.destroyContent();
    this.profileHost.innerHTML = '';
    const id = this.state.ids[this.state.index];
    const model = buildProfileModel(this.cleanRows, id, this.settings, this.state);
    this.model = model;

    const root = createElement('div', 'sv-profile-root');
    this.profileHost.append(root);

    if (this.state.ids.length > 1) {
      root.append(
        renderStepper(this.state.ids, this.state.index, { onStep: (index) => this.step(index) })
      );
    }

    root.append(
      renderHeader(model.participant, this.settings, { onClear: () => this.handleClear() })
    );

    const keys = model.spaghetti.series.map((entry) => entry.key);
    if (this.mode === 'dock') root.append(this.buildInlineControls(keys));
    else this.buildSidebarControls(keys);

    this.spaghettiHost = createElement('div', 'sv-profile-spaghetti');
    root.append(this.spaghettiHost);
    this.drawSpaghetti();

    this.tableController = renderMeasureTable(root, model.measures, this.settings, this.state, {
      onToggleExtras: (showExtras) => {
        this.state.showExtras = showExtras;
        this.drawSpaghetti();
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
    this.spaghettiChart = renderSpaghetti(this.spaghettiHost, this.model.spaghetti, this.state);
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
 * Create a docked participant profile inside a host chart's profile slot
 * (PPRF-1): no shell, no ingest, no event listener. The host drives it
 * imperatively — `show(ids, cleanRows)` with its own retained pre-cleaned rows
 * (carrying the __hep_* columns), `clear()` to empty the slot (which then
 * auto-hides), plus `resize()`/`destroy()`. Clear and stepper navigation
 * report through settings.on_clear / settings.on_step.
 * @param {string|HTMLElement} container The host's profile slot (e.g. the shell's profileWrap).
 * @param {Object} [settings={}] Setting overrides, merged onto DEFAULT_SETTINGS and normalized.
 * @returns {SafetyParticipantProfile} The live dock instance.
 * @throws {Error} When no element matches the container selector.
 */
export function profileDock(container, settings = {}) {
  return new SafetyParticipantProfile(container, settings, { mode: 'dock' });
}
