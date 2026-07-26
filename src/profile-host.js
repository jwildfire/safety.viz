// Shared HOST-side adoption kit for the railed participant-profile module
// (#99, PPRF-10/11; v2 obot.roadmap#75). This file is host code: the
// one-ingest-per-setData row builder and the mount/feed/unmount/sync plumbing
// every adopter repeats, extracted from the hep-explorer adoption (#98,
// PPRF-7) so the renderers don't carry a copy each. Hosts keep the same
// instance slots the pattern established: `profile` (the rail), `profileFeed`
// (the participantsSelected listener), `profileKey` (the idempotency guard),
// and `profileRows` (the pre-cleaned rows the rail consumes).
//
// v2 moved the mount from the dock below the chart to the rail beside it
// (decisions D1/D4). Hosts changed by one line — `railWrap` instead of
// `profileWrap` — because the plumbing lives here.

import { assignSequence, cleanData, deriveBaseline } from './hep-core/rows.js';
import { profileRail } from './participant-profile.js';

/**
 * Build the railed profile's pre-cleaned rows from a host's retained raw data
 * (PPRF-CORE-003/005 spirit: ONE profile ingest per setData, never per
 * gesture). Runs the shared hep-core reducers — cleanData, assignSequence,
 * deriveBaseline — over the raw records with the host's profile column
 * mapping; rows without a finite positive upper limit of normal drop (the
 * ×ULN denominator), exactly as in every hep-core consumer.
 * @param {Object[]} rawData The host's retained raw long-format records.
 * @param {Object} mapping The profile column mapping (id_col, measure_col, value_col, normal_col_high, studyday_col, ...).
 * @returns {Object[]} Cleaned rows carrying the __hep_* derived columns.
 */
export function buildProfileRows(rawData, mapping) {
  const { rows } = cleanData(Array.isArray(rawData) ? rawData : [], mapping);
  assignSequence(rows, mapping);
  deriveBaseline(rows, mapping);
  return rows;
}

/**
 * Mount the railed participant-profile module into the host shell's rail slot
 * and subscribe it to the `participantsSelected` event on the shell root — the
 * house selection contract — so every selection path feeds the rail with no
 * per-gesture edits (#99, PPRF-11). No-op when the host's `profile` setting is
 * false or a rail is already live.
 * @param {Object} host The renderer instance (needs settings, root, railWrap, profileRows).
 * @param {() => Object} settingsFn Returns the host's current profile pass-through settings.
 * @param {Object} [options] Mount options.
 * @param {?EventTarget} [options.target=null] The element the host dispatches `participantsSelected` on; defaults to the shell root.
 * @returns {void}
 */
export function mountProfileRail(host, settingsFn, { target = null } = {}) {
  if (!host.settings.profile || host.profile) return;
  host.profile = profileRail(host.railWrap, settingsFn());
  // Most renderers dispatch the house selection event on the shell root; the
  // AE renderers dispatch on their own container (AET-API-003), so the target
  // is a parameter rather than an assumption.
  host.profileTarget = target || host.root;
  /**
   * Feed one participantsSelected dispatch into the railed profile.
   * @private
   */
  host.profileFeed = (event) => {
    const data = event && event.detail ? event.detail.data : null;
    const ids = (Array.isArray(data) ? data : []).map(String);
    const key = ids.join('\u0000');
    // Idempotency guard: repeated identical payloads (e.g. a re-click of the
    // already-selected point) must not thrash the profile DOM.
    if (key === host.profileKey) return;
    host.profileKey = key;
    if (!ids.length) {
      host.profile.clear();
      return;
    }
    host.profile.show(ids, host.profileRows);
  };
  host.profileTarget.addEventListener('participantsSelected', host.profileFeed);
}

/**
 * Tear the railed profile down: unsubscribe the feed, destroy the module's
 * charts, and empty the slot (the shell's `.sv-rail:empty` rule then hides it).
 * @param {Object} host The renderer instance.
 * @returns {void}
 */
export function unmountProfileRail(host) {
  if (!host.profile) return;
  (host.profileTarget || host.root).removeEventListener('participantsSelected', host.profileFeed);
  host.profileFeed = null;
  host.profile.destroy();
  host.profile = null;
  host.profileKey = null;
}

/**
 * Reconcile the railed profile with the current settings: mount or unmount on
 * a `profile` toggle, else hand the rail the current rows and refreshed
 * pass-through settings. Called by the host's setSettings before its
 * re-render.
 * @param {Object} host The renderer instance.
 * @param {() => Object} settingsFn Returns the host's current profile pass-through settings.
 * @returns {void}
 */
export function syncProfileRail(host, settingsFn) {
  if (!host.settings.profile) {
    unmountProfileRail(host);
    return;
  }
  if (!host.profile) {
    mountProfileRail(host, settingsFn);
    return;
  }
  host.profileKey = null;
  // Hand the rail the CURRENT retained rows before its settings-driven
  // re-render, so the transient render never uses a stale row set.
  host.profile.cleanRows = host.profileRows;
  host.profile.setSettings(settingsFn());
}

/**
 * The render-preamble reset (#99, PPRF-11): these hosts reset their selection
 * silently on every render (control changes, new data), so the rail must
 * empty in the same preamble — otherwise it would keep narrating a selection
 * the chart no longer shows.
 * @param {Object} host The renderer instance.
 * @returns {void}
 */
export function resetProfileRail(host) {
  host.profileKey = null;
  if (host.profile) host.profile.clear();
}
