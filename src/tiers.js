// The status ladder (#272, obot.roadmap#403): how far a chart, a tab of the
// demo app, or the app itself is to be trusted. Four rungs, from the top:
//
//   qualified     has been through qualification, with a record to point at.
//                 Nothing in safety.viz is, and a build refuses the word.
//   exploratory   tested and documented; confirm every result. What a chart
//                 is when its entry names no rung.
//   experimental  tested and documented, but what it shows or how it behaves
//                 may still change. It ships in the app and is counted.
//   prototype     an early look: on the docs site only, not in the app, and
//                 not counted a finished chart.
//
// A rung is stored once, as `tier` on the chart's or the tab's entry in
// site/config.json, with an optional `tierNote`: the one sentence that says
// why it stands where it does. A chart of another library says its own by the
// same two fields on its entry in that library's manifest.

/** The four rungs, from the top of the ladder down. */
export const TIERS = ['qualified', 'exploratory', 'experimental', 'prototype'];

/** The rung of an entry that names none. */
export const DEFAULT_TIER = 'exploratory';

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The rung an entry stands on: the one it names, or Exploratory when it names
 * none. What is not one of the four rungs is no rung, so it is Exploratory too;
 * the build says so before a page is written (scripts/tiers.mjs).
 * @param {?{tier?: string}} entry A chart's or a tab's entry.
 * @returns {string} One of TIERS.
 */
export function tierOf(entry) {
  return isRecord(entry) && TIERS.includes(entry.tier) ? entry.tier : DEFAULT_TIER;
}

/**
 * The sentence that says why an entry stands on its rung, where it has one.
 * @param {?{tierNote?: string}} entry A chart's or a tab's entry.
 * @returns {?string} The sentence, or null.
 */
export function tierNoteOf(entry) {
  const note = isRecord(entry) ? entry.tierNote : null;
  return typeof note === 'string' && note.trim() ? note.trim() : null;
}

/**
 * Whether a rung is below another on the ladder.
 * @param {string} tier A rung.
 * @param {string} [than] The rung to compare with; by default Exploratory, the app's own.
 * @returns {boolean} True when `tier` is lower.
 */
export function isBelow(tier, than = DEFAULT_TIER) {
  return TIERS.indexOf(tier) > TIERS.indexOf(than);
}
