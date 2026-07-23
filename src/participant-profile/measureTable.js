// The participant-profile measure summary table (#98, PPRF-4): one row per
// measure in the profile model's key-first order — Measure | N | Min | Median |
// Max | Spark, values 0.2f — with the non-key measures hidden behind the
// original's "Show N additional measure(s):" toggle, an inline sparkline per
// row (sparkline.js), and a keyboard-operable button that expands a full-width
// inset line chart under the row (inset.js) and collapses it again, destroying
// the chart. Parity targets: the original renderer's measureTable/
// drawMeasureTable.js + makeNestedData.js + addExtraMeasureToggle.js +
// sparkLine/addSparkClick.js. Also hosts the optional participant record
// listing, delegated to the shared listing renderer (src/histogram/listing.js).
// Plain DOM via shell.createElement; no selection events (PPRF-6).

import { createElement } from '../shell.js';
import { renderListing } from '../histogram/listing.js';
import { extrasControl } from './controls.js';
import { sparklineSVG } from './sparkline.js';
import { renderInset } from './inset.js';

const COLUMNS = ['Measure', 'N', 'Min', 'Median', 'Max', 'Spark'];

/** Format a summary statistic to two decimals, '' when not finite (parity: d3.format('0.2f')). */
export function formatSummary(value) {
  return Number.isFinite(value) ? value.toFixed(2) : '';
}

/**
 * The default record-listing columns, derived from the module's lab mapping
 * (PPRF-4): measure, visit, study day, value, unit — skipping any column the
 * settings null out.
 * @param {Object} settings Normalized settings.
 * @returns {Array<{value_col: string, label: string}>} The listing column specs.
 */
export function listingColumns(settings) {
  return [
    [settings.measure_col, 'Measure'],
    [settings.visit_col, 'Visit'],
    [settings.studyday_col, 'Study Day'],
    [settings.value_col, 'Value'],
    [settings.unit_col, 'Unit']
  ]
    .filter(([col]) => col !== undefined && col !== null && col !== '')
    .map(([value_col, label]) => ({ value_col, label }));
}

/**
 * Render the measure summary table into a host element (PPRF-4). Returns a
 * controller owning the inset lifecycle: every expanded inset's Chart.js
 * instance is tracked in `open` and destroyed on collapse, on extras hide, and
 * on `destroy()` — which the caller must invoke before any re-render so no
 * chart leaks.
 * @param {HTMLElement} host The element to render into.
 * @param {Object[]} measures The measure models from buildProfileModel, key-first.
 * @param {Object} settings Normalized settings.
 * @param {Object} [state] The live state ({ showExtras }).
 * @param {Object} [handlers] Optional handlers ({ onToggleExtras }).
 * @returns {{element: HTMLElement, open: Map, collapseAll: Function, destroy: Function}}
 */
export function renderMeasureTable(host, measures, settings, state = {}, handlers = {}) {
  const wrap = createElement('div', 'sv-profile-measure-wrap');
  const open = new Map();

  const table = createElement('table', 'sv-profile-measure-table');
  table.setAttribute('aria-label', 'Measure summary');
  const thead = createElement('thead');
  const headRow = createElement('tr');
  COLUMNS.forEach((label) => headRow.append(createElement('th', null, label)));
  thead.append(headRow);
  const tbody = createElement('tbody');
  table.append(thead, tbody);

  function collapse(key) {
    const entry = open.get(key);
    if (!entry) return;
    entry.chart.destroy();
    entry.insetRow.remove();
    entry.button.setAttribute('aria-expanded', 'false');
    entry.button.textContent = '▽';
    if (entry.svg) entry.svg.style.display = '';
    open.delete(key);
  }

  function expand(measure, row, button, svg) {
    const insetRow = createElement('tr', 'sv-profile-inset-row');
    const cell = createElement('td', 'sv-profile-inset-cell');
    cell.setAttribute('colspan', String(COLUMNS.length));
    insetRow.append(cell);
    row.after(insetRow); // parity insertAfter
    const chart = renderInset(cell, measure);
    button.setAttribute('aria-expanded', 'true');
    button.textContent = '△ Minimize Chart';
    if (svg) svg.style.display = 'none';
    open.set(measure.key, { measure, insetRow, chart, button, svg });
  }

  measures.forEach((measure) => {
    const row = createElement(
      'tr',
      measure.isKey ? 'sv-profile-measure-row' : 'sv-profile-measure-row sv-profile-extra-row'
    );
    row.dataset.key = measure.key;
    if (!measure.isKey && !state.showExtras) row.style.display = 'none';

    row.append(createElement('td', 'sv-profile-measure-name', measure.label));
    row.append(createElement('td', null, String(measure.n)));
    row.append(createElement('td', null, formatSummary(measure.min)));
    row.append(createElement('td', null, formatSummary(measure.median)));
    row.append(createElement('td', null, formatSummary(measure.max)));

    const sparkCell = createElement('td', 'sv-profile-spark');
    const button = createElement('button', 'sv-profile-spark-toggle', '▽');
    button.type = 'button';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', `Expand ${measure.label} chart`);
    const svg = sparklineSVG(measure);
    button.onclick = () => {
      if (open.has(measure.key)) collapse(measure.key);
      else expand(measure, row, button, svg);
    };
    sparkCell.append(button, svg);
    row.append(sparkCell);
    tbody.append(row);
  });

  // The extras toggle (parity addExtraMeasureToggle): only when extras exist.
  const extras = measures.filter((measure) => !measure.isKey);
  if (extras.length) {
    const toggle = extrasControl(extras.length, state, (showExtras) => {
      [...tbody.querySelectorAll('tr.sv-profile-extra-row')].forEach((row) => {
        row.style.display = showExtras ? '' : 'none';
      });
      if (!showExtras) extras.forEach((measure) => collapse(measure.key));
      if (handlers.onToggleExtras) handlers.onToggleExtras(showExtras);
    });
    wrap.append(toggle);
  }

  wrap.append(table);
  host.append(wrap);

  function collapseAll() {
    [...open.keys()].forEach((key) => collapse(key));
  }

  return {
    element: wrap,
    open,
    collapse,
    collapseAll,
    destroy: collapseAll
  };
}

/**
 * Render the optional participant record listing through the shared listing
 * renderer (PPRF-4): the participant's raw rows with search, sort, pagination,
 * and CSV export, over the configured `listing_cols` (default: the lab mapping
 * columns via listingColumns).
 * @param {HTMLElement} host The element to render into.
 * @param {Object[]} rows The participant's rows.
 * @param {Object} settings Normalized settings ({ listing_cols, listing_page_size }).
 * @returns {Object} The listing adapter instance (renderListing's state carrier).
 */
export function renderRecordListing(host, rows, settings) {
  const cols =
    settings.listing_cols && settings.listing_cols.length
      ? settings.listing_cols
      : listingColumns(settings);
  const section = createElement('div', 'sv-profile-listing');
  section.append(createElement('h4', 'sv-profile-listing-title', 'Records'));
  const listingWrap = createElement('div', 'sv-listing');
  section.append(listingWrap);
  host.append(section);

  const adapter = {
    settings: { details: cols, page_size: settings.listing_page_size || 10 },
    currentTableData: rows,
    listingWrap,
    listingSearch: '',
    listingSort: null,
    page: 1
  };
  renderListing(adapter);
  return adapter;
}
