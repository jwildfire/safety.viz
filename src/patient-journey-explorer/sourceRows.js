// Source-row traceability for the patient-journey-explorer module (#142,
// design §6.7): every mark and every panel item links back to the exact raw
// row the host passed to init. This file has two halves.
//
//   1. The PURE half (below): the external link-out built from
//      `source_url_template`, and the column set of the raw-row table. Unit
//      tested in sourceRows.test.js (PJE-SRC-002).
//   2. The DOM half — the `<details>` drawer under `.sv-listing`, one table per
//      domain, `id="pje-src-<DOMAIN>-<sourceIndex>"` rows with `tabindex="-1"`,
//      and `jumpToSource(anchorId)` (scroll into view, focus, flash). Covered in
//      the browser suite (PJE-SRC-001).
//
// A `{COLUMN}` token names a key of the raw row; `{domain}` (lower-case, the
// one reserved token) is the domain code. A template that names a column the
// row does not carry yields no link at all rather than a link with a hole in it
// (PJE-SRC-002).

const TOKEN = /\{([^{}]+)\}/g;

/** The prefix of every derived column the module attaches to a raw row. */
export const DERIVED_PREFIX = '__pje_';

/**
 * Build the external link for one source row from `source_url_template`:
 * `{domain}` becomes the domain code and every `{COLUMN}` the row's URI-encoded
 * value for that column. No template means no link; a template naming a column
 * the row lacks also means no link, with one console warning naming the column
 * (pass `{ warn: false }` when the caller batches warnings per render).
 * @param {Object} row The raw source row as passed to init.
 * @param {string} domain The domain code (`'AE'`, …).
 * @param {?string} template The `source_url_template` setting.
 * @param {{warn?: boolean}} [options] `warn: false` silences the missing-column warning.
 * @returns {?string} The href, or null when no link should be rendered.
 */
export function buildSourceUrl(row, domain, template, { warn = true } = {}) {
  if (typeof template !== 'string' || !template) return null;
  const source = row && typeof row === 'object' ? row : {};
  const missing = [];
  const href = template.replace(TOKEN, (match, token) => {
    if (token === 'domain') return encodeURIComponent(String(domain ?? ''));
    if (!Object.prototype.hasOwnProperty.call(source, token)) {
      missing.push(token);
      return match;
    }
    const value = source[token];
    return encodeURIComponent(value === null || value === undefined ? '' : String(value));
  });
  if (missing.length) {
    if (warn) {
      console.warn(
        `patient-journey-explorer: source_url_template names column(s) the ${domain} row does not carry (${missing.join(
          ', '
        )}); the link is omitted.`
      );
    }
    return null;
  }
  return href;
}

/**
 * The column set of a raw-row table: the union of every row's own keys in
 * first-seen order, with the module's derived `__pje_*` columns left out — they
 * are this renderer's working, not the reviewer's data.
 * @param {Object[]} rows The raw rows (or dropped-row copies) to tabulate.
 * @returns {string[]} The column names, in order.
 */
export function sourceColumns(rows) {
  const columns = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    for (const key of Object.keys(row)) {
      if (key.startsWith(DERIVED_PREFIX) || seen.has(key)) continue;
      seen.add(key);
      columns.push(key);
    }
  }
  return columns;
}

// ---------------------------------------------------------------------------
// DOM half — added in wave B (B1): renderSourceDrawer(host, structured, settings)
// and jumpToSource(anchorId). Everything above this line is pure and is imported
// by name; nothing below may change the two exports above.
// ---------------------------------------------------------------------------

import { createElement } from '../shell.js';
import { paginate } from '../histogram/listing.js';
import { DOMAIN_LABELS } from './getPlugins.js';

const DOMAIN_ORDER = ['EX', 'AE', 'LB', 'CM', 'MH', 'DS'];
const ANCHOR_ID = /^pje-src-([A-Z]+)-(\d+)$/;
const FLASH_MS = 1200;

/**
 * Scroll a source row into view, focus it and flash it (design §6.7): the one
 * "jump to source" every mark, footnote button and panel item shares. Opens
 * the drawer when the row is inside a closed one.
 * @param {string|HTMLElement} target The row's anchor id (`pje-src-AE-7`) or the row element.
 * @param {ParentNode} [scope=document] Where to look the id up (an instance's listing element).
 * @returns {boolean} True when a row was found and focused.
 */
export function jumpToSource(target, scope = document) {
  const row =
    typeof target === 'string'
      ? scope.querySelector(`[id="${String(target).replace(/"/g, '')}"]`)
      : target;
  if (!row) return false;
  const details = row.closest ? row.closest('details') : null;
  if (details && !details.open) details.open = true;
  if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'center' });
  if (typeof row.focus === 'function') row.focus({ preventScroll: true });
  row.classList.add('is-flashed');
  setTimeout(() => row.classList.remove('is-flashed'), FLASH_MS);
  return true;
}

/**
 * The domain's rows for the subject — the raw objects, in source order, with
 * their stable anchor ids — from the structured record.
 * @private
 */
function domainRows(structured, domain) {
  return structured.allEvents
    .filter((event) => event.domain === domain && !event.flags?.derived)
    .map((event) => ({
      id: event.sourceAnchorId,
      sourceIndex: event.sourceIndex,
      source: event.source && typeof event.source === 'object' ? event.source : {}
    }))
    .sort((a, b) => a.sourceIndex - b.sourceIndex);
}

/**
 * Render the source-row drawer into the shell's listing slot (design §6.7,
 * PJE-SRC-001, PJE-SRC-002): a `<details>` titled `Source records (n)` with one
 * paginated table per domain present for the subject. Each row renders the raw
 * object as passed to init — every own key in insertion order, no derived
 * `__pje_*` columns — under `id="pje-src-<DOMAIN>-<sourceIndex>"` with
 * `tabindex="-1"`, plus the external link when `source_url_template` is set.
 * @param {HTMLElement} host The listing element (the shell's listingWrap).
 * @param {Object} structured The structureData result.
 * @param {import('./configure.js').PatientJourneyExplorerSettings} settings The synced settings.
 * @param {{open?: boolean, warn?: boolean}} [options] `open`: whether the drawer starts open (default false); `warn`: whether to log the missing-column warning for `source_url_template` (default true; the orchestrator passes false after the first render of a data load so the warning is printed once, not once per interaction).
 * @returns {{element: HTMLDetailsElement, count: number, jumpTo: (anchorId: string) => boolean, open: () => void}} The drawer controller: `jumpTo` pages to the row, then scrolls, focuses and flashes it.
 */
export function renderSourceDrawer(host, structured, settings, { open = false, warn = true } = {}) {
  host.innerHTML = '';
  const pageSize = Math.max(1, Number(settings.page_size) || 10);
  const template = settings.source_url_template;
  const tables = new Map();
  let total = 0;
  const missingLinks = new Set();

  const details = createElement('details', 'sv-pje-drawer');
  details.open = Boolean(open);
  const summary = createElement('summary');
  details.append(summary);

  for (const domain of DOMAIN_ORDER) {
    const rows = domainRows(structured, domain);
    if (!rows.length) continue;
    total += rows.length;
    const wrap = createElement('div', 'sv-pje-drawer-domain');
    wrap.dataset.domain = domain;
    wrap.append(
      createElement('h3', null, `${DOMAIN_LABELS[domain] || domain} records (${rows.length})`)
    );
    const columns = sourceColumns(rows.map((row) => row.source));
    const scroll = createElement('div', 'sv-pje-drawer-scroll');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    for (const column of columns) headRow.append(createElement('th', null, column));
    if (template) headRow.append(createElement('th', null, 'Link'));
    thead.append(headRow);
    const tbody = document.createElement('tbody');
    table.append(thead, tbody);
    scroll.append(table);
    const pager = createElement('div', 'sv-listing-actions');
    wrap.append(scroll, pager);
    details.append(wrap);

    const state = { rows, page: 1, columns, tbody, pager, domain };
    tables.set(domain, state);
    renderTable(state);
  }

  function renderTable(state) {
    const { visible, pages, page } = paginate(state.rows, state.page, pageSize);
    state.page = page;
    state.tbody.innerHTML = '';
    for (const row of visible) {
      const tr = document.createElement('tr');
      tr.id = row.id;
      tr.tabIndex = -1;
      for (const column of state.columns) {
        const value = row.source[column];
        tr.append(
          createElement('td', null, value === null || value === undefined ? '' : String(value))
        );
      }
      if (template) {
        const cell = createElement('td');
        const href = buildSourceUrl(row.source, state.domain, template, { warn: false });
        if (href) {
          const link = createElement('a', null, settings.source_url_label);
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener';
          cell.append(link);
        } else {
          missingLinks.add(state.domain);
        }
        tr.append(cell);
      }
      state.tbody.append(tr);
    }
    state.pager.innerHTML = '';
    if (pages <= 1) {
      state.pager.hidden = true;
      return;
    }
    state.pager.hidden = false;
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, state.rows.length);
    state.pager.append(createElement('span', null, `${from}–${to} of ${state.rows.length}`));
    const tools = createElement('div', 'sv-listing-tools');
    const prev = createElement('button', null, 'Previous');
    prev.type = 'button';
    prev.disabled = page <= 1;
    prev.onclick = () => {
      state.page = Math.max(1, state.page - 1);
      renderTable(state);
    };
    const next = createElement('button', null, 'Next');
    next.type = 'button';
    next.disabled = page >= pages;
    next.onclick = () => {
      state.page = Math.min(pages, state.page + 1);
      renderTable(state);
    };
    tools.append(prev, next);
    state.pager.append(tools);
  }

  summary.textContent = `Source records (${total})`;
  if (missingLinks.size && warn) {
    console.warn(
      `patient-journey-explorer: source_url_template names a column some ${[...missingLinks].join(
        ', '
      )} rows do not carry; those links are omitted.`
    );
  }
  host.append(details);

  return {
    element: details,
    count: total,
    open() {
      details.open = true;
    },
    jumpTo(anchorId) {
      const match = ANCHOR_ID.exec(String(anchorId));
      if (!match) return false;
      const state = tables.get(match[1]);
      if (!state) return false;
      const position = state.rows.findIndex((row) => row.id === anchorId);
      if (position < 0) return false;
      const page = Math.floor(position / pageSize) + 1;
      if (page !== state.page) {
        state.page = page;
        renderTable(state);
      }
      details.open = true;
      return jumpToSource(anchorId, details);
    }
  };
}
