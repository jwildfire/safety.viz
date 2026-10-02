// The kit (#154, obot.roadmap#354): the parts every safety.viz chart already
// shares, gathered under one export so a second chart library on the same page
// can build from them instead of carrying a copy that drifts. The bundle's
// global carries it as `SafetyViz.kit`; the ES module bundle exports `kit`.
//
// This file is a re-export and nothing else. Every member is the same function
// object the charts import — nothing is moved, wrapped, renamed or given a new
// signature — so a chart built from the kit and a safety.viz chart cannot
// behave differently, and a fix to one is a fix to both.
//
// Shape, decided once because it is public surface:
//
//   - FLAT, under the names the modules already export. The names are unique
//     across the eight modules, and a flat list keeps the file layout of
//     src/ out of the contract: a member can move between files here without
//     its path on the kit changing.
//   - FROZEN. Two libraries share this object on one page, so neither can
//     replace, add or remove a member for the other.
//   - Only what is listed in requirements/kit.md. Two exports of the shared
//     modules are deliberately left out: shell.js's `prototypeBanner`, whose
//     wording is safety.viz's own release status, and box-whisker.js's
//     `hexToRgba`, a private colour helper of the box drawing. Adding a member
//     later is not a breaking change; removing one is.
//
// From v1.10.0 the kit is public surface: a change to any member — its name,
// its signature, what it returns, the DOM and class names it produces — is a
// breaking change. tests/unit/kit/ holds the membership and the identity;
// tests/e2e/kit.spec.js builds a page from the committed bundle and the kit
// alone.

import { Chart } from 'chart.js';
import {
  applyShellStyles,
  controlBuilders,
  createElement,
  multiSelect,
  option,
  renderShell,
  renderViewSelector
} from './shell.js';
import {
  ALL_VALUE,
  filterMatches,
  initFilterState,
  normalizeFilterSpec,
  renderFilterControl
} from './filters.js';
import {
  applyLimitEdit,
  clearAxisLimits,
  formatLimit,
  limitDigits,
  seedLimitInput,
  syncAxisLimits
} from './axis-limits.js';
import {
  buildCsv,
  exportCsv,
  paginate,
  renderListing,
  searchRows,
  sortRows
} from './histogram/listing.js';
import {
  buildProfileRows,
  mountProfileRail,
  resetProfileRail,
  syncProfileRail,
  unmountProfileRail
} from './profile-host.js';
import { boxWhiskerPlugin, drawBoxWhisker } from './box-whisker.js';
import { presentMeasures, resolveMeasureList } from './measure-list.js';
import { kmEstimate } from './time-to-event/km.js';

// The kit's API reference page is generated from the typedef below: its
// description is the page's overview and each @property is a member's row.
// `npm run docs:api` fails when a member is missing from it or has no
// description, so a member cannot be added without being documented.

/**
 * The shared parts every safety.viz chart is built from, exported so a second chart library on the same page builds from them instead of copying them. Each member is the same function the charts themselves call. The object is flat and frozen.
 * @typedef {Object} Kit
 * @since 1.10.0
 * @property {function} Chart The Chart.js constructor this bundle contains: the one every safety.viz chart draws with, carrying the controllers, elements, scales and plugins the charts registered on it. Draw with it instead of loading a second Chart.js.
 * @property {function} createElement Create a detached element with an optional class and text content.
 * @property {function} option Append an option to a select.
 * @property {function} multiSelect Build the multiselect control: a collapsible checkbox list with an All row and a live summary. The selection is `null` for everything, or an array of the chosen values.
 * @property {function} applyShellStyles Inject the shared `sv-` stylesheet once per document. `renderShell` calls it, so a page that builds a shell need not.
 * @property {function} renderShell Empty a container and build the shared layout into it: the collapsible control sidebar, the main column of notes, chart canvas, footnote, small multiples and listing, and the participant rail. Returns those slots by name.
 * @property {function} controlBuilders The control builders bound to a shell's controls container: `addSection`, `addRow`, `addControl` and `addReset`.
 * @property {function} renderViewSelector Render a view selector into its own sidebar section: one button per view, the active one marked.
 * @property {string} ALL_VALUE The option value that stands for no restriction in a single-value filter.
 * @property {function} normalizeFilterSpec Normalize a column name or a filter spec to the filter contract: `value_col`, `label`, `start`, `all` and `multiple`.
 * @property {function} initFilterState The opening filter state for a list of normalized specs: each spec's start value, or `null` for no restriction.
 * @property {function} filterMatches Whether one row's value passes one filter's selection: `null` passes everything, an array is membership, anything else is equality.
 * @property {function} renderFilterControl Build one filter control from its spec: a select with an optional All option, or the multiselect when the spec says `multiple`.
 * @property {function} limitDigits Decimal places for a displayed axis limit: three significant figures of the axis range.
 * @property {function} formatLimit Format a limit for its number input, dropping trailing zeros; blank when the value is not finite.
 * @property {function} syncAxisLimits Record the domain a render resolved on `state.axisDomain` and write it into the Lower and Upper inputs.
 * @property {function} seedLimitInput The value a limit input carries when the controls are rebuilt: the user's override, or else the domain last in force.
 * @property {function} applyLimitEdit Apply an edited limit to `state.lower` or `state.upper`: an empty entry returns that side to automatic, and a pair that crosses is swapped.
 * @property {function} clearAxisLimits Drop both overrides and the recorded domain, so the next render derives the limits from the data.
 * @property {function} renderListing Draw the record listing into `instance.listingWrap`, with its search box, paging buttons, sortable headers and CSV export. It reads the columns from `instance.settings.details`, the page size from `settings.page_size`, and the rows and view state from `instance.currentTableData`, `listingSearch`, `listingSort` and `page`. When `instance.onListingRowClick` is a function the rows are clickable and keyboard-focusable, and rows whose `settings.id_col` value equals `instance.listingSelectedId` are marked.
 * @property {function} searchRows The rows in which any listed column contains the query, ignoring case.
 * @property {function} sortRows A sorted copy of the rows by one column, ascending or descending: numeric when both values are numbers, otherwise as text.
 * @property {function} paginate One page of rows, with the number of pages and the page number held within it.
 * @property {function} buildCsv The listing as CSV text: a header of column labels, then one line of quoted values per row.
 * @property {function} exportCsv Download the listing as a CSV file. The file is named `safety-histogram-listing.csv`.
 * @property {function} buildProfileRows Build the rows the participant rail reads, from a host's raw lab records and its column mapping, once per data load. Rows with no positive upper limit of normal are dropped.
 * @property {function} mountProfileRail Mount the participant rail into `host.railWrap` and subscribe it to the `participantsSelected` event on `host.root`, or on `options.target`. The event's `detail.data` is the list of participant ids, and an empty list clears the rail. It does nothing unless `host.settings.profile` is set, and reads the rows from `host.profileRows`.
 * @property {function} unmountProfileRail Unsubscribe the rail, destroy its charts and empty its slot.
 * @property {function} syncProfileRail Reconcile the rail with the host's current settings: mount or unmount it when `profile` changes, otherwise hand it the current rows and settings.
 * @property {function} resetProfileRail Empty the rail when the host resets its own selection.
 * @property {function} drawBoxWhisker Draw box-and-whisker marks on a canvas through a chart's x and y scales: for each spec a box from the first to the third quartile, whiskers to the 5th and 95th percentiles, a median line and a mean marker.
 * @property {function} boxWhiskerPlugin A Chart.js plugin that draws the box-and-whisker marks for whatever specs its getter returns at draw time.
 * @property {function} resolveMeasureList The labels a Measure control offers: the configured measures in their order, or every measure in the data, sorted, when none is configured or none is found.
 * @property {function} presentMeasures The distinct measures in cleaned rows, in first-seen order, as the label and raw name that `resolveMeasureList` takes.
 * @property {function} kmEstimate The Kaplan–Meier estimate for one group, from one observation per participant of a time, whether it ends in the event, and an id: the steps with their at-risk and event counts, standard errors and pointwise 95% intervals, the censoring times, and a reader for the at-risk table.
 */

/** @type {Kit} */
export const kit = Object.freeze({
  // The Chart.js constructor this bundle contains, with the controllers,
  // elements, scales and plugins the charts registered on it.
  Chart,

  // src/shell.js — the control sidebar and the slots a chart draws into.
  createElement,
  option,
  multiSelect,
  applyShellStyles,
  renderShell,
  controlBuilders,
  renderViewSelector,

  // src/filters.js — the filter contract.
  ALL_VALUE,
  normalizeFilterSpec,
  initFilterState,
  filterMatches,
  renderFilterControl,

  // src/axis-limits.js — the Lower/Upper axis-limit inputs.
  limitDigits,
  formatLimit,
  syncAxisLimits,
  seedLimitInput,
  applyLimitEdit,
  clearAxisLimits,

  // src/histogram/listing.js — the record listing.
  renderListing,
  searchRows,
  sortRows,
  paginate,
  buildCsv,
  exportCsv,

  // src/profile-host.js — the participant rail, from the host's side.
  buildProfileRows,
  mountProfileRail,
  unmountProfileRail,
  syncProfileRail,
  resetProfileRail,

  // src/box-whisker.js — the box drawing and its Chart.js plugin.
  drawBoxWhisker,
  boxWhiskerPlugin,

  // src/measure-list.js — the Measure control's list.
  resolveMeasureList,
  presentMeasures,

  // src/time-to-event/km.js — the Kaplan–Meier estimator.
  kmEstimate
});
