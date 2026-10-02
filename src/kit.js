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
