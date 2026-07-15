// Data structuring for the ae-explorer module (#60): the placeholder-row
// denominator model, population/event dataset split, SOC → PT incidence
// roll-up with zero-count shells, the unpooled Wald difference interval,
// and the prevalence/search row predicates — matching the original
// renderer's prepareData/cross/calculateDifference behavior
// (RhoInc/aeexplorer v3.4.1). All functions are pure.

/**
 * Distinct values in input order.
 * @private
 */
function unique(values) {
  return [...new Set(values)];
}

/**
 * One-decimal rate percentage, rounded the way the original does
 * (Math.round(n / tot * 1000) / 10).
 * @param {number} n Numerator.
 * @param {number} tot Denominator.
 * @returns {number} The rate in percent, one decimal.
 */
export function rate(n, tot) {
  if (!tot) return 0;
  return Math.round((n / tot) * 1000) / 10;
}

/**
 * Copy the rows with a __ae_placeholder flag: true when the placeholder
 * column carries one of the placeholder values — the rows that keep AE-free
 * participants in the population denominator (AE-DATA-001).
 * @param {Object[]} rows The raw records.
 * @param {import('./configure.js').AEExplorerSettings} settings The synced settings.
 * @returns {Object[]} Flagged copies of the rows.
 */
export function flagPlaceholders(rows, settings) {
  const { value_col: col, values } = settings.placeholder_flag;
  return rows.map((row) => ({
    ...row,
    __ae_placeholder: values.includes(String(row[col] == null ? '' : row[col]))
  }));
}

/**
 * The group levels the table shows: the configured groups filtered to the
 * levels present in the data (dropping absentees with a console warning),
 * or every level found in group_col, sorted (AE-CFG-005).
 * @param {Object[]} rows The flagged records.
 * @param {import('./configure.js').AEExplorerSettings} settings The synced settings.
 * @returns {string[]} The group keys, in column order.
 * @throws {Error} When more levels than max_groups would be drawn.
 */
export function groupLevels(rows, settings) {
  const present = unique(rows.map((row) => String(row[settings.group_col] ?? ''))).filter(
    (value) => value !== ''
  );
  let groups;
  if (settings.groups && settings.groups.length) {
    groups = settings.groups.filter((group) => {
      if (present.includes(group)) return true;
      console.warn(`The [ ${group} ] group was removed because it does not appear in the data.`);
      return false;
    });
  } else {
    groups = [...present].sort();
  }
  if (groups.length > settings.max_groups) {
    throw new Error(
      `ae-explorer: ${groups.length} groups exceed the max_groups limit of ${settings.max_groups}.`
    );
  }
  return groups;
}

/**
 * Whether a row passes the active filters of one kind. A filter is active
 * when its state value is non-null; rows match on string equality.
 * @private
 */
function passesFilters(row, specs, state, kind) {
  return specs.every((spec) => {
    if (spec.type !== kind) return true;
    const value = state[spec.value_col];
    if (value == null) return true;
    return String(row[spec.value_col] ?? '') === String(value);
  });
}

/**
 * The analysis population: rows in the shown groups that pass the active
 * participant-type filters — placeholders included, so they keep their
 * participants in the denominators (AE-USER-018).
 * @param {Object[]} rows The flagged records.
 * @param {import('./configure.js').AEExplorerSettings} settings The synced settings.
 * @param {string[]} groups The shown group keys.
 * @param {Object[]} specs The normalized filter specs.
 * @param {Object} state Active filter values by column ({} for none).
 * @returns {Object[]} The population rows.
 */
export function populationData(rows, settings, groups, specs, state) {
  return rows.filter(
    (row) =>
      groups.includes(String(row[settings.group_col] ?? '')) &&
      passesFilters(row, specs, state, 'participant')
  );
}

/**
 * The countable events: population rows minus placeholders, minus rows
 * excluded by the active event-type filters — numerators change, the
 * population and its denominators do not (AE-REG-006).
 * @param {Object[]} populationRows The populationData result.
 * @param {Object[]} specs The normalized filter specs.
 * @param {Object} state Active filter values by column.
 * @returns {Object[]} The event rows.
 */
export function eventData(populationRows, specs, state) {
  return populationRows.filter(
    (row) => !row.__ae_placeholder && passesFilters(row, specs, state, 'event')
  );
}

/**
 * Per-group participant and event denominators: n is the distinct
 * participants in the population (placeholder rows keep AE-free
 * participants counted, AE-DATA-001), nEvents the group's event rows.
 * @param {Object[]} populationRows The populationData result.
 * @param {Object[]} eventRows The eventData result.
 * @param {import('./configure.js').AEExplorerSettings} settings The synced settings.
 * @param {string[]} groups The shown group keys.
 * @returns {Array<{key: string, n: number, nEvents: number}>} One entry per group.
 */
export function groupCounts(populationRows, eventRows, settings, groups) {
  return groups.map((key) => ({
    key,
    n: unique(
      populationRows
        .filter((row) => String(row[settings.group_col] ?? '') === key)
        .map((row) => row[settings.id_col])
    ).length,
    nEvents: eventRows.filter((row) => String(row[settings.group_col] ?? '') === key).length
  }));
}

/**
 * One summary cell: the category numerator over the group denominator on
 * the current basis — distinct participants over the group's participants,
 * or event rows over the group's events (AE-REG-008, AE-REG-009).
 * @private
 */
function cell(rows, settings, count, summarizeBy) {
  const n =
    summarizeBy === 'event' ? rows.length : unique(rows.map((row) => row[settings.id_col])).length;
  const tot = summarizeBy === 'event' ? count.nEvents : count.n;
  return { n, tot, per: rate(n, tot) };
}

/**
 * Group the rows by a key column, preserving first-seen order.
 * @private
 */
function groupBy(rows, col) {
  const map = new Map();
  rows.forEach((row) => {
    const key = String(row[col] ?? '');
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });
  return map;
}

/**
 * Cells for one category's rows across every group — including zero-count
 * shells for groups with no matching rows, so every group draws a dot
 * (AE-USER-012).
 * @private
 */
function cellsFor(rows, settings, groups, counts, summarizeBy) {
  const byGroup = groupBy(rows, settings.group_col);
  const cells = {};
  groups.forEach((key, index) => {
    cells[key] = cell(byGroup.get(key) || [], settings, counts[index], summarizeBy);
  });
  return cells;
}

/**
 * The all-groups total cell for one category's rows.
 * @private
 */
function totalFor(rows, settings, counts, summarizeBy) {
  const total = {
    n:
      summarizeBy === 'event'
        ? counts.reduce((sum, count) => sum + count.nEvents, 0)
        : counts.reduce((sum, count) => sum + count.n, 0)
  };
  return cell(rows, settings, { n: total.n, nEvents: total.n }, summarizeBy);
}

/**
 * Highest group rate in a cells object — the sort key and the prevalence
 * filter's comparison value.
 * @private
 */
function maxPer(cells) {
  return Math.max(0, ...Object.values(cells).map((value) => value.per));
}

/**
 * Descending peak-prevalence order, ties alphabetical — the original's
 * default row order.
 * @private
 */
function byPrevalence(a, b) {
  return b.maxPer - a.maxPer || a.key.localeCompare(b.key);
}

/**
 * Roll the event rows up into the summary-table structure: one entry per
 * System Organ Class with nested Preferred Term entries, each carrying
 * per-group cells, an all-groups total, and its peak rate; plus the overall
 * any-adverse-event summary. Rows sort by descending peak prevalence, ties
 * alphabetical.
 * @param {Object[]} eventRows The eventData result.
 * @param {import('./configure.js').AEExplorerSettings} settings The synced settings.
 * @param {string[]} groups The shown group keys.
 * @param {Array<{key: string, n: number, nEvents: number}>} counts The groupCounts result.
 * @param {string} summarizeBy The summary basis: 'participant' or 'event'.
 * @returns {{majors: Object[], overall: Object}} The table structure.
 */
export function crossTab(eventRows, settings, groups, counts, summarizeBy) {
  const majors = [...groupBy(eventRows, settings.major_col).entries()].map(([key, majorRows]) => {
    const cells = cellsFor(majorRows, settings, groups, counts, summarizeBy);
    const minors = [...groupBy(majorRows, settings.minor_col).entries()].map(
      ([minorKey, minorRows]) => {
        const minorCells = cellsFor(minorRows, settings, groups, counts, summarizeBy);
        return {
          key: minorKey,
          cells: minorCells,
          total: totalFor(minorRows, settings, counts, summarizeBy),
          maxPer: maxPer(minorCells)
        };
      }
    );
    minors.sort(byPrevalence);
    return {
      key,
      cells,
      total: totalFor(majorRows, settings, counts, summarizeBy),
      maxPer: maxPer(cells),
      minors
    };
  });
  majors.sort(byPrevalence);

  const overallCells = cellsFor(eventRows, settings, groups, counts, summarizeBy);
  return {
    majors,
    overall: {
      key: 'Any adverse event',
      cells: overallCells,
      total: totalFor(eventRows, settings, counts, summarizeBy),
      maxPer: maxPer(overallCells)
    }
  };
}

/**
 * The unpooled Wald 95% interval on the difference in two proportions —
 * the original's calculateDifference, in percentage points: diff = p1 − p2,
 * se = √(p1q1/t1 + p2q2/t2), bounds at ±1.96·se, significant when the
 * interval excludes zero (AE-USER-013).
 * @param {number} n1 First group numerator.
 * @param {number} tot1 First group denominator.
 * @param {number} n2 Second group numerator.
 * @param {number} tot2 Second group denominator.
 * @returns {{diff: number, lower: number, upper: number, sig: number}} The interval, ×100.
 */
export function calculateDifference(n1, tot1, n2, tot2) {
  const p1 = tot1 ? n1 / tot1 : 0;
  const p2 = tot2 ? n2 / tot2 : 0;
  const diff = p1 - p2;
  const se = Math.sqrt((p1 * (1 - p1)) / (tot1 || 1) + (p2 * (1 - p2)) / (tot2 || 1));
  const lower = diff - 1.96 * se;
  const upper = diff + 1.96 * se;
  return {
    diff: diff * 100,
    lower: lower * 100,
    upper: upper * 100,
    sig: lower > 0 || upper < 0 ? 1 : 0
  };
}

/**
 * One difference interval per group pair, in column order (AE-USER-013).
 * @param {Object} cells A category's per-group cells.
 * @param {string[]} groups The shown group keys.
 * @returns {Object[]} {group1, group2, diff, lower, upper, sig} per pair.
 */
export function addDifferences(cells, groups) {
  const diffs = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = cells[groups[i]];
      const b = cells[groups[j]];
      diffs.push({
        group1: groups[i],
        group2: groups[j],
        ...calculateDifference(a.n, a.tot, b.n, b.tot)
      });
    }
  }
  return diffs;
}

/**
 * Whether a summary row stays visible at a minimum-prevalence threshold:
 * hidden only when every group's rate is below it (AE-USER-001).
 * @param {Object} item A majors/minors entry (needs maxPer).
 * @param {number} threshold The minimum prevalence in percent.
 * @returns {boolean} True when the row shows.
 */
export function prevalenceVisible(item, threshold) {
  return item.maxPer >= (Number(threshold) || 0);
}

/**
 * Case-insensitive substring search over the category column: matching
 * System Organ Class and Preferred Term labels, with the match count the
 * search control reports (AE-USER-007).
 * @param {Object[]} majors The crossTab majors.
 * @param {string} term The search term.
 * @returns {{count: number, majorKeys: Set<string>, minorKeys: Set<string>}} Matches; minor keys are 'major||minor'.
 */
export function searchCategories(majors, term) {
  const majorKeys = new Set();
  const minorKeys = new Set();
  const lowered = String(term || '').toLowerCase();
  if (!lowered) return { count: 0, majorKeys, minorKeys };
  let count = 0;
  majors.forEach((major) => {
    if (major.key.toLowerCase().includes(lowered)) {
      majorKeys.add(major.key);
      count += 1;
    }
    major.minors.forEach((minor) => {
      if (minor.key.toLowerCase().includes(lowered)) {
        minorKeys.add(`${major.key}||${minor.key}`);
        count += 1;
      }
    });
  });
  return { count, majorKeys, minorKeys };
}
