// Data reduction for the time-to-event module (#128): ADTTE-shaped rows for one
// endpoint → per-group observation arrays → km.js estimates, per design
// obot.roadmap requirements/design/161_design.html §4/§6. Nothing is dropped
// silently: every excluded row carries a named reason and is counted and
// exportable (TTE-DATA-002), the nep-explorer accounting pattern.

import { kmEstimate } from './km.js';

/** The one internal column the dropped-row export keeps, because it is the answer. */
export const DROP_REASON_COLUMN = '__tte_dropReason';

/** The pooled-group label when the data carries no group column (TTE-DATA-004). */
export const POOLED_GROUP = 'All participants';

/** The endpoint label when the data carries no endpoint columns. */
export const UNNAMED_PARAM = 'Time to event';

/**
 * Distinct values in first-seen order.
 * @param {Array} values Raw values.
 * @returns {Array} Unique values, first appearance first.
 */
export function unique(values) {
  return [...new Set(values)];
}

/**
 * The endpoints present in the data, in data order: { paramcd, param } pairs
 * keyed on the paramcd column (falling back to the label column when only one
 * of the two exists). A dataset with neither column is one unnamed endpoint.
 * @param {Object[]} rows The bound records.
 * @param {import('./configure.js').TimeToEventSettings} settings The synced settings.
 * @returns {Array<{paramcd: ?string, param: string}>} The endpoints, data order.
 */
export function paramsPresent(rows, settings) {
  const hasParamcd = rows.some((row) => row[settings.paramcd_col] !== undefined);
  const hasParam = rows.some((row) => row[settings.param_col] !== undefined);
  if (!hasParamcd && !hasParam) return [{ paramcd: null, param: UNNAMED_PARAM }];
  const seen = new Map();
  for (const row of rows) {
    const paramcd = hasParamcd ? String(row[settings.paramcd_col] ?? '') : null;
    const param = hasParam ? String(row[settings.param_col] ?? '') : String(paramcd);
    const key = paramcd ?? param;
    if (!seen.has(key)) seen.set(key, { paramcd: paramcd ?? param, param: param || paramcd });
  }
  return [...seen.values()];
}

/**
 * Parse the ADaM censor flag: 0 = event, any integer ≥ 1 = censored, anything
 * else unusable.
 * @private
 */
function parseCensor(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return null;
  return value === 0;
}

/**
 * Reduce one endpoint's rows to usable observations, counting every exclusion
 * with a named reason (TTE-DATA-002, TTE-DATA-003).
 * @param {Object[]} rows The endpoint's records.
 * @param {import('./configure.js').TimeToEventSettings} settings The synced settings.
 * @returns {{observations: Object[], droppedRows: Object[]}} One observation per
 *   participant ({ id, group, time, event, eventDesc, censorDesc, row }) plus the
 *   excluded source rows, each carrying DROP_REASON_COLUMN.
 */
export function cleanData(rows, settings) {
  const observations = [];
  const droppedRows = [];
  const seen = new Set();
  const drop = (row, reason) => droppedRows.push({ ...row, [DROP_REASON_COLUMN]: reason });

  for (const row of rows) {
    const id = row[settings.id_col];
    if (id === undefined || id === null || id === '') {
      drop(row, `missing participant id (${settings.id_col})`);
      continue;
    }
    const time = Number(row[settings.time_col]);
    if (row[settings.time_col] === '' || row[settings.time_col] == null || !Number.isFinite(time)) {
      drop(row, `missing or non-numeric time (${settings.time_col})`);
      continue;
    }
    if (time <= 0) {
      drop(row, `non-positive time (${settings.time_col} = ${row[settings.time_col]})`);
      continue;
    }
    const event = parseCensor(row[settings.censor_col]);
    if (event === null) {
      drop(
        row,
        `unparseable censor flag (${settings.censor_col} = ${row[settings.censor_col]}; ` +
          'expected 0 = event, >= 1 = censored)'
      );
      continue;
    }
    if (seen.has(id)) {
      drop(row, `duplicate row for participant ${id} — first row kept`);
      continue;
    }
    seen.add(id);
    observations.push({
      id: String(id),
      group:
        settings.group_col && row[settings.group_col] !== undefined
          ? String(row[settings.group_col])
          : null,
      time,
      event,
      eventDesc:
        settings.event_desc_col && row[settings.event_desc_col]
          ? String(row[settings.event_desc_col])
          : '',
      censorDesc:
        settings.censor_desc_col && row[settings.censor_desc_col]
          ? String(row[settings.censor_desc_col])
          : '',
      row
    });
  }
  return { observations, droppedRows };
}

/**
 * Structure one endpoint for rendering: filter to the endpoint, clean, split by
 * group in data order, and estimate each group with km.js. One derivation feeds
 * everything the chart shows (TTE-STAT-001).
 * @param {Object[]} rawData The bound records.
 * @param {import('./configure.js').TimeToEventSettings} settings The synced settings.
 * @param {?string} paramcd The endpoint to structure, or null for an unkeyed dataset.
 * @returns {{
 *   groups: Array<{name: string, observations: Object[], estimate: Object}>,
 *   droppedRows: Object[],
 *   total: number,
 *   maxTime: number
 * }} The per-group estimates plus the drop accounting.
 */
export function structureData(rawData, settings, paramcd) {
  const rows = Array.isArray(rawData) ? rawData : [];
  const hasParamcd = rows.some((row) => row[settings.paramcd_col] !== undefined);
  const endpointRows =
    paramcd == null || !hasParamcd
      ? rows
      : rows.filter((row) => String(row[settings.paramcd_col] ?? '') === paramcd);

  const { observations, droppedRows } = cleanData(endpointRows, settings);

  const grouped = new Map();
  for (const observation of observations) {
    const name = observation.group ?? POOLED_GROUP;
    if (!grouped.has(name)) grouped.set(name, []);
    grouped.get(name).push(observation);
  }

  const groups = [...grouped.entries()].map(([name, members]) => ({
    name,
    observations: members,
    estimate: kmEstimate(members)
  }));

  return {
    groups,
    droppedRows,
    total: observations.length,
    maxTime: groups.reduce((max, group) => Math.max(max, group.estimate.maxTime), 0)
  };
}

/**
 * Apply the active filter selections to analysis rows: a row stays when every
 * non-null filter matches its value for that column.
 * @param {Object[]} rows The endpoint's records.
 * @param {Object<string, ?string>} filters Active selections keyed by column; null = all.
 * @returns {Object[]} The rows passing every active filter.
 */
export function applyFilters(rows, filters) {
  const active = Object.entries(filters || {}).filter(([, value]) => value != null);
  if (!active.length) return rows;
  return rows.filter((row) => active.every(([column, value]) => String(row[column]) === value));
}
