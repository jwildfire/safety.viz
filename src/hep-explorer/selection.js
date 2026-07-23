// The participant-selection layer of the hep-explorer module (obot.roadmap#43,
// safety.viz#91): the sidebar's Participants multi-select and its Clear
// selection button, the shared participant-trace header shown above the plots,
// the participant-highlight constants both views style their points with, the
// HEP-SELECT-006 selection carrier, and the SOLE dispatcher of the
// participantsSelected event.
//
// VIEW-AGNOSTIC BY CONSTRUCTION — this is the point of the file. Before the
// split these widgets branched on `state.view` in three places (the select's
// onchange, the Clear button's handler, and the "which selection is active"
// accessor), so a third view (the migration Sankey, Amirzadegan 2025 Fig 3,
// safety.viz#92) would have turned three binary branches into three-way ones
// inside the carry protocol. Instead the active view now INJECTS what this
// layer needs through bind(): what its sticky selection is, what to do when the
// control changes it, and what to do when it is cleared. Nothing in this file
// may name a view or read `host.state.view`; the module's only view dispatch
// lives in src/hep-explorer.js.
//
// Requirement groups: HEP-SELECT-001, HEP-SELECT-006, HEP-SELECT-007,
// HEP-COMP-007, HEP-API-003, HEP-CORE-*.

import { createElement, option } from '../shell.js';

/**
 * Shared participant-highlight styling for every view (HEP-SELECT-001,
 * HEP-COMP-007): a traced (hovered or selected) point keeps its own color,
 * gains a dark ring, and grows; every other point dims. One set of values so
 * the views cannot drift apart.
 * @type {{DIM_FILL: number, DIM_BORDER: number, RADIUS_BOOST: number, BORDER_WIDTH: number}}
 */
export const HIGHLIGHT = {
  DIM_FILL: 0.15,
  DIM_BORDER: 0.25,
  RADIUS_BOOST: 2.5,
  BORDER_WIDTH: 2.5
};

/**
 * The idle prompt for the participant-trace header, shown when no participant
 * is hovered or selected (HEP-SELECT-001, HEP-COMP-007).
 * @type {string}
 */
export const TRACE_HEADER_HINT =
  'Hover a point to trace a participant across every panel; click to keep it selected.';

// The handlers an unbound layer falls back on: no selection, and every user
// gesture is a no-op. Guarantees the widgets are safe to build before (or
// without) a view being bound, and keeps every call site free of null checks.
const UNBOUND = {
  selectedIds: () => [],
  changed: () => {},
  cleared: () => {}
};

/**
 * Create the selection layer for one hep-explorer instance. The returned object
 * owns the Participants control, the trace header and the participantsSelected
 * event; the active view is wired in with bind().
 * @param {Object} host The live hep-explorer instance (the shell owner).
 * @returns {Object} The selection layer.
 */
export function createSelection(host) {
  // The active view's injected handlers — the replacement for the three
  // `state.view` branches this layer used to carry.
  let view = UNBOUND;

  /**
   * Build the participant multi-select dropdown for the sidebar's Participants
   * section, shared by every view (HEP-SELECT-001, HEP-COMP-007): one option per
   * shown participant, plus a Clear selection button (disabled while the bound
   * view reports nothing selected) that resets the whole selection. Editing the
   * select drives the view's highlight, and the view keeps it in sync through
   * sync().
   * @param {Object[]} shown The shown participants ({id} each).
   * @returns {HTMLElement} The control wrapper.
   * @private
   */
  function buildControl(shown) {
    const wrap = createElement('div', 'hep-composite-select sv-control');
    wrap.append(createElement('label', null, 'Selected participants'));
    const select = document.createElement('select');
    select.multiple = true;
    select.size = Math.min(8, Math.max(3, shown.length));
    shown.forEach((subject) => option(select, String(subject.id), String(subject.id), false));
    select.onchange = () => api.set([...select.selectedOptions].map((opt) => opt.value));
    host.compositeSelectEl = select;
    wrap.append(select);

    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'hep-composite-clear';
    clear.textContent = 'Clear selection';
    clear.disabled = !view.selectedIds().length;
    clear.onclick = () => api.clear();
    host.compositeClearBtn = clear;
    wrap.append(clear);
    return wrap;
  }

  const api = {
    /**
     * Point the layer at the active view: the view supplies its sticky
     * selection and the two gestures the shared control can produce. Called by
     * the orchestrator's view dispatch, and by nothing else.
     * @param {{selectedIds: Function, changed: Function, cleared: Function}} handlers
     * @returns {void}
     */
    bind(handlers) {
      view = { ...UNBOUND, ...handlers };
    },

    /**
     * Mount the participant multi-select into the sidebar's Participants
     * section (HEP-SELECT-001, HEP-COMP-007): the section is created by
     * buildControls and filled here once the view's shown participants are
     * known; with nothing shown the whole section is hidden.
     * @param {?HTMLElement} section The sidebar's Participants section.
     * @param {Object[]} shown The shown participants ({id} each).
     * @returns {void}
     */
    mount(section, shown) {
      if (!section) return;
      [...section.querySelectorAll('.sv-control')].forEach((el) => el.remove());
      section.style.display = shown.length ? '' : 'none';
      if (shown.length) section.append(buildControl(shown));
    },

    /**
     * Mirror a view's sticky selection into the shared control: the dropdown's
     * selected options and the Clear button's enabled state (HEP-SELECT-001,
     * HEP-COMP-007).
     * @param {Array<string|number>} ids The view's selected participant ids.
     * @returns {void}
     */
    sync(ids) {
      if (host.compositeSelectEl) {
        const set = new Set(ids.map(String));
        [...host.compositeSelectEl.options].forEach((opt) => {
          opt.selected = set.has(opt.value);
        });
      }
      if (host.compositeClearBtn) host.compositeClearBtn.disabled = !ids.length;
    },

    /**
     * Select participants programmatically — the path the shared dropdown takes,
     * and the one a view uses to hand a selection over from a mark of its own (a
     * Sankey ribbon or a cross-table cell, safety.viz#92). The bound view decides
     * what the selection means.
     * @param {Array<string|number>} ids The participant ids to select.
     * @returns {void}
     */
    set(ids) {
      view.changed([...ids].map(String));
    },

    /**
     * Clear the whole selection — the shared Clear selection button's gesture,
     * handed to the bound view (HEP-SELECT-007).
     * @returns {void}
     */
    clear() {
      view.cleared();
    },

    /**
     * The selection to carry across a redraw or a view switch (HEP-SELECT-006):
     * the last dispatched participantsSelected payload, read once per render
     * before the preamble resets it.
     * @returns {string[]} The carried participant ids.
     */
    carried() {
      return host.participantsSelected.map(String);
    },

    /**
     * The shared annotation text for a traced participant, identical in every
     * view (HEP-SELECT-001, HEP-COMP-007): "Participant {id} selected." when it
     * is the sticky selection, else "Participant {id}" for a transient hover.
     * @param {string|number} id The participant identifier.
     * @param {boolean} selected Whether the participant is in the sticky selection.
     * @returns {string} The annotation text.
     */
    annotationText(id, selected) {
      return `Participant ${id}${selected ? ' selected.' : ''}`;
    },

    /**
     * Update the shared participant-trace header from a view's hover +
     * selection: a hover names that participant (marked selected when it is also
     * in the selection), a single selection reads "Participant X selected.",
     * several are counted, and the idle hint returns when nothing is traced
     * (HEP-SELECT-001, HEP-COMP-007).
     * @param {string|number|null} hoverId The view's transient hovered id.
     * @param {Array<string|number>} selected The view's sticky selected ids.
     * @returns {void}
     */
    updateTraceHeader(hoverId, selected) {
      if (!host.compositeHeaderEl) return;
      let text;
      let active = true;
      if (hoverId != null) {
        text = api.annotationText(hoverId, selected.includes(String(hoverId)));
      } else if (selected.length === 1) {
        text = api.annotationText(selected[0], true);
      } else if (selected.length > 1) {
        text = `${selected.length} participants selected.`;
      } else {
        text = TRACE_HEADER_HINT;
        active = false;
      }
      host.compositeHeaderEl.textContent = text;
      host.compositeHeaderEl.classList.toggle('is-active', active);
    },

    /**
     * Dispatch the custom participantsSelected event on the shell root with the
     * selected ids, and record them as the selection to carry (HEP-API-003,
     * HEP-SELECT-006). The only writer of host.participantsSelected outside the
     * orchestrator's render preamble.
     * @param {Array<string|number>} ids The selected participant ids.
     * @returns {void}
     */
    dispatch(ids) {
      host.participantsSelected = ids;
      if (host.root) {
        host.root.dispatchEvent(
          new CustomEvent('participantsSelected', { detail: { data: ids }, bubbles: true })
        );
      }
    }
  };

  return api;
}
