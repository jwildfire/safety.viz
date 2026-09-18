// Lane registry, the per-render lane plan, fit-to-height, and the per-lane
// Chart.js construction for the patient-journey-explorer module (#142, design
// §6.1–6.3, §6.8, §7, D21). Consumes buildScales (getScales.js),
// buildLaneDatasets (getPlugins.js) and lanePlugin (draw.js); never
// re-derives what structureData already decided.
//
// One rendering rule lives here and nowhere else: a CLOSED interval is drawn
// through the end of its end day. `markGeometry` ends a closed bar at
// `toElapsed(end)` — the start of that day's cell — so exposure days 1–20 and
// 21–60 would leave a one-day gap at the dose-change seam the design says
// must meet (PJE-LANE-006), and a one-day adverse event would draw at the
// minimum bar width instead of one day wide. Adding one elapsed day to the
// closed end makes consecutive records touch and a same-day event occupy its
// day. Membership, de-emphasis and every count still use the record's own
// `end` (anchor.js); this is a drawing concern only.

import { Chart } from 'chart.js';
import { createElement } from '../shell.js';
import { LANE_KEYS } from './configure.js';
import { buildScales, laneLayout } from './getScales.js';
import { buildLaneDatasets } from './getPlugins.js';
import { lanePlugin } from './draw.js';

/**
 * The lane registry (design §2): key, source domain, mark kind, whether the
 * lane is a single row, the domain word for the absent-domain note and the
 * empty-state text for a participant with no records in it.
 */
export const LANE_REGISTRY = {
  exposure: {
    key: 'exposure',
    domain: 'EX',
    markKind: 'bar',
    single: false,
    noun: 'treatment',
    domainWord: 'exposure',
    empty: 'No exposure records for this participant.'
  },
  doseChanges: {
    key: 'doseChanges',
    domain: 'EX',
    markKind: 'point',
    single: true,
    noun: 'dose change',
    domainWord: 'exposure',
    empty: 'No dose changes derived for this participant.'
  },
  adverseEvents: {
    key: 'adverseEvents',
    domain: 'AE',
    markKind: 'bar',
    single: false,
    noun: 'event',
    domainWord: 'adverse-event',
    empty: 'No adverse events recorded for this participant.'
  },
  labs: {
    key: 'labs',
    domain: 'LB',
    markKind: 'point',
    single: false,
    noun: 'test',
    domainWord: 'lab',
    empty: 'No laboratory records for this participant.'
  },
  conMeds: {
    key: 'conMeds',
    domain: 'CM',
    markKind: 'bar',
    single: false,
    noun: 'con-med',
    domainWord: 'con-med',
    empty: 'No con-meds recorded for this participant.'
  },
  medicalHistory: {
    key: 'medicalHistory',
    domain: 'MH',
    markKind: 'point',
    single: true,
    noun: 'record',
    domainWord: 'medical-history',
    empty: 'No medical history recorded for this participant.'
  },
  disposition: {
    key: 'disposition',
    domain: 'DS',
    markKind: 'rule',
    single: true,
    noun: 'record',
    domainWord: 'disposition',
    empty: 'No disposition records for this participant.'
  }
};

const BAR_LANES = ['exposure', 'adverseEvents', 'conMeds'];

/** Vertical chrome (px): a group header, the gap under a lane, one footer line. */
export const GROUP_HEADER_PX = 30;
export const LANE_GAP_PX = 2;
export const FOOTER_PX = 18;
const SINGLE_ROW_FACTOR = 1.5;
const FILTERED_EMPTY = 'No records match the current filters.';

/**
 * The prose footers of one lane: the row-cap remainder with the lane's sort
 * rule (PJE-LANE-010) and the unplaceable records by label (PJE-LANE-008).
 * @private
 */
function laneFooters(info, registry) {
  const footers = [];
  if (info.truncated > 0) {
    footers.push(
      `${info.truncated} more ${registry.noun}${info.truncated === 1 ? '' : 's'} not drawn, ${info.sortRule} — see Source records.`
    );
  }
  if (info.unplaceable.length) {
    const labels = [...new Set(info.unplaceable.map((event) => String(event.label ?? '')))];
    footers.push(`No start day recorded, so not on the timeline: ${labels.join(', ')}.`);
  }
  return footers;
}

/**
 * The empty-state text of a lane with nothing to draw: the participant has no
 * records in it, or every record was filtered out.
 * @private
 */
function emptyText(laneKey, structured, registry) {
  const has = structured.allEvents.some((event) => event.lane === laneKey);
  if (!has) return registry.empty;
  const postFilter = (structured.byLane[laneKey] || []).length > 0;
  return postFilter ? registry.empty : FILTERED_EMPTY;
}

/**
 * Plan the lane stack for one render (design §6.1, §6.8): the lane groups in
 * configured order, each with its enabled lanes; every lane resolved to a
 * chart entry (rows and events to draw), an empty entry (with its reason), or
 * an absent entry (the domain was never supplied). The labs lane expands to
 * one entry per drawn test. Groups with no enabled lane are dropped here.
 * @param {Object} structured The structureData result.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @param {{lanes: Object<string, boolean>, groups: Object<string, boolean>}} state The lane enablement and group collapse state.
 * @returns {Array<{key: string, label: string, collapsed: boolean, lanes: Object[]}>} The groups to render.
 */
export function planLanes(structured, settings, state) {
  const enabled = (key) =>
    typeof state?.lanes?.[key] === 'boolean'
      ? state.lanes[key]
      : Boolean(settings.lanes[key]?.enabled);
  const groups = [];
  for (const group of settings.lane_groups) {
    const keys = LANE_KEYS.filter(
      (key) => settings.lanes[key]?.group === group.key && enabled(key)
    );
    if (!keys.length) continue;
    const lanes = [];
    for (const key of keys) {
      const registry = LANE_REGISTRY[key];
      const info = structured.lanes[key];
      const label = settings.lanes[key]?.label || key;
      if (!info || !info.supplied) {
        lanes.push({
          key,
          label,
          kind: 'absent',
          chartKey: null,
          emptyText: `No ${registry.domainWord} records were supplied.`,
          footers: []
        });
        continue;
      }
      if (key === 'labs') {
        const drawnTests = info.rows;
        const series = structured.labSeries.filter((entry) => drawnTests.includes(entry.test));
        const footers = laneFooters(info, registry);
        if (structured.labTestsMissing.length) {
          footers.unshift(`No records for: ${structured.labTestsMissing.join(', ')}.`);
        }
        if (!series.length) {
          lanes.push({
            key,
            label,
            kind: 'empty',
            chartKey: null,
            emptyText: emptyText(key, structured, registry),
            footers
          });
          continue;
        }
        series.forEach((entry, index) => {
          lanes.push({
            key,
            label,
            kind: 'chart',
            chartKey: `labs:${entry.test}`,
            test: entry.test,
            sublabel: entry.unit ? `${entry.test} (${entry.unit})` : entry.test,
            series: entry,
            rows: null,
            events: entry.points.map((point) => point.event),
            footers: index === series.length - 1 ? footers : []
          });
        });
        continue;
      }
      const footers = laneFooters(info, registry);
      if (!info.drawn.length) {
        lanes.push({
          key,
          label,
          kind: 'empty',
          chartKey: null,
          emptyText: emptyText(key, structured, registry),
          footers
        });
        continue;
      }
      lanes.push({
        key,
        label,
        kind: 'chart',
        chartKey: key,
        rows: registry.single ? [key] : info.rows,
        events: info.drawn,
        footers
      });
    }
    groups.push({
      key: group.key,
      label: group.label,
      collapsed: Boolean(state?.groups?.[group.key] ?? group.collapsed),
      lanes
    });
  }
  return groups;
}

/**
 * The pixel height of one planned lane at the given row and lab heights.
 * @param {Object} lane A planLanes lane entry.
 * @param {number} rowHeight Pixels per categorical row.
 * @param {number} labHeight Pixels per lab small multiple.
 * @returns {number} The lane's height in pixels (the chart's 2px top and bottom padding lives inside the rows, as in the design's stack arithmetic).
 */
export function laneHeightPx(lane, rowHeight, labHeight) {
  if (lane.kind !== 'chart') return Math.round(rowHeight * SINGLE_ROW_FACTOR);
  if (lane.key === 'labs') return labHeight;
  if (LANE_REGISTRY[lane.key].single) return Math.round(rowHeight * SINGLE_ROW_FACTOR);
  return lane.rows.length * rowHeight;
}

/**
 * The total stack height of a plan at the given row and lab heights.
 * @private
 */
function stackHeight(groups, rowHeight, labHeight) {
  let total = 0;
  for (const group of groups) {
    total += GROUP_HEADER_PX;
    for (const lane of group.lanes) {
      total +=
        laneHeightPx(lane, rowHeight, labHeight) + LANE_GAP_PX + lane.footers.length * FOOTER_PX;
    }
  }
  return total;
}

/**
 * Fit the stack to the configured panel height (D21, PJE-LANE-009): when the
 * natural stack is taller than `settings.height`, scale `row_height` and
 * `lab_height` by one common factor, clamped at their floors. When even the
 * floors do not fit, the column scrolls and the caller says so.
 * @param {Object[]} groups The planLanes result.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @returns {{rowHeight: number, labHeight: number, natural: number, planned: number}} The heights to draw with, the natural stack height and the planned stack height.
 */
export function fitHeights(groups, settings) {
  const natural = stackHeight(groups, settings.row_height, settings.lab_height);
  if (!settings.fit_to_height || natural <= settings.height) {
    return {
      rowHeight: settings.row_height,
      labHeight: settings.lab_height,
      natural,
      planned: natural
    };
  }
  const fixed = stackHeight(groups, 0, 0);
  const variable = natural - fixed;
  const factor = variable > 0 ? Math.max(0, (settings.height - fixed) / variable) : 1;
  const rowHeight = Math.max(settings.row_height_min, Math.floor(settings.row_height * factor));
  const labHeight = Math.max(settings.lab_height_min, Math.floor(settings.lab_height * factor));
  return { rowHeight, labHeight, natural, planned: stackHeight(groups, rowHeight, labHeight) };
}

/**
 * A flag filter as a checkbox (RF-5): renderFilterControl has no checkbox
 * branch, so the two flag filters are built here. Checked writes the spec's
 * `flag_value` into the filter state, unchecked writes null — the exact
 * shape initFilterState seeds and applyFilters consumes.
 * @param {Object} config Control configuration.
 * @param {Object} config.spec The normalized filter spec.
 * @param {boolean} config.checked Whether the filter is active.
 * @param {string} [config.label] The label text (defaults to the spec's label).
 * @param {string} [config.focusKey] The `data-sv-focus` key for focus restoration.
 * @param {(checked: boolean) => void} config.onChange Called with the next checked state.
 * @returns {HTMLElement} The detached control element.
 */
export function flagCheckbox({ spec, checked, label, focusKey, onChange }) {
  const wrap = createElement('label', 'sv-control-inline');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  input.dataset.filter = spec.value_col;
  if (focusKey) input.setAttribute('data-sv-focus', focusKey);
  input.onchange = () => onChange(input.checked);
  wrap.append(input, document.createTextNode(label || spec.label));
  return wrap;
}

/**
 * The datasets of one lane, ready for Chart.js: buildLaneDatasets plus the
 * inclusive-end drawing rule for closed intervals (see the file header).
 * @param {string} laneKey The lane key.
 * @param {Object[]} events The lane's drawn EventRecords.
 * @param {{domain: ?[number, number], settings: Object, theme: Object, bounds?: ?Object}} context The dataset context (buildLaneDatasets).
 * @returns {Object[]} The datasets.
 */
export function laneDatasets(laneKey, events, context) {
  const datasets = buildLaneDatasets(laneKey, events, context);
  if (!BAR_LANES.includes(laneKey)) return datasets;
  for (const dataset of datasets) {
    for (const point of dataset.data) {
      const event = point.event;
      if (
        event &&
        event.kind === 'interval' &&
        event.endState === 'closed' &&
        Number.isFinite(event.end) &&
        Array.isArray(point.x)
      ) {
        point.x = [point.x[0], point.x[1] + 1];
      }
    }
  }
  return datasets;
}

/**
 * Build one lane's Chart.js instance into a canvas (design §6.2, §6.3): the
 * shared scales from buildScales, the datasets from laneDatasets, and the
 * lane plugin from draw.js. No Chart.js tooltip, legend or pointer events —
 * the keyboard overlay owns interaction (D2, RF-6).
 * @param {Object} config Chart configuration.
 * @param {HTMLCanvasElement} config.canvas The lane's canvas.
 * @param {Object} config.lane The planLanes chart entry.
 * @param {Object} config.structured The structureData result.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} config.settings The synced settings.
 * @param {Object} config.theme The resolved theme tokens.
 * @param {?Object} [config.bounds] The context-window bounds when anchored.
 * @param {?Object} [config.anchor] The anchored EventRecord when anchored.
 * @param {number[]} [config.referenceDays] Elapsed days of the disposition reference rules.
 * @param {number[]} [config.doseChangeDays] Elapsed days of the dose changes.
 * @returns {Chart} The live chart.
 */
export function buildLaneChart({
  canvas,
  lane,
  structured,
  settings,
  theme,
  bounds = null,
  anchor = null,
  referenceDays = [],
  doseChangeDays = []
}) {
  const laneKey = lane.key;
  const domain = structured.domain;
  const datasets = laneDatasets(laneKey, lane.events, { domain, settings, theme, bounds });
  const scales = buildScales({
    lane: laneKey,
    domain,
    rows: lane.rows,
    valueDomain: lane.series ? lane.series.valueDomain : null
  });
  const isBar = BAR_LANES.includes(laneKey);
  const type = isBar ? 'bar' : laneKey === 'labs' ? 'line' : 'scatter';
  const anchoredHere = Boolean(anchor && lane.events.some((event) => event.id === anchor.id));
  return new Chart(canvas, {
    type,
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: [],
      indexAxis: isBar ? 'y' : 'x',
      layout: laneLayout(),
      scales,
      plugins: { legend: { display: false }, tooltip: { enabled: false } }
    },
    plugins: [
      lanePlugin({
        laneKey,
        test: lane.test ?? null,
        theme,
        bounds,
        anchor: anchor ? { id: anchor.id, day: anchor.day, label: anchor.label } : null,
        anchoredHere,
        referenceDays,
        doseChangeDays: laneKey === 'exposure' ? doseChangeDays : [],
        band: lane.series ? lane.series.band : null
      })
    ]
  });
}
