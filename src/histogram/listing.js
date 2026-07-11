// Linked participant listing: search, sort, pagination, CSV export, and the
// listing DOM — extracted from the safety-histogram pilot (dev @ a3ff9f7)
// under #2 (SH-LIST-001..004).

import { createElement } from '../shell.js';

export function searchRows(rows, cols, query) {
  if (!query) return rows;
  const lowered = query.toLowerCase();
  return rows.filter((row) =>
    cols.some((col) =>
      String(row[col.value_col] == null ? '' : row[col.value_col])
        .toLowerCase()
        .includes(lowered)
    )
  );
}

export function sortRows(rows, sort) {
  const { col, direction } = sort;
  return [...rows].sort((a, b) => {
    const av = a[col.value_col];
    const bv = b[col.value_col];
    const an = Number(av);
    const bn = Number(bv);
    const cmp =
      Number.isFinite(an) && Number.isFinite(bn)
        ? an - bn
        : String(av == null ? '' : av).localeCompare(String(bv == null ? '' : bv), undefined, {
            numeric: true
          });
    return direction === 'asc' ? cmp : -cmp;
  });
}

export function paginate(rows, page, pageSize) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const clamped = Math.min(page, pages);
  return {
    visible: rows.slice((clamped - 1) * pageSize, clamped * pageSize),
    pages,
    page: clamped
  };
}

export function buildCsv(rows, cols) {
  return [cols.map((col) => col.label).join(',')]
    .concat(
      rows.map((row) =>
        cols
          .map((col) => JSON.stringify(row[col.value_col] == null ? '' : row[col.value_col]))
          .join(',')
      )
    )
    .join('\n');
}

export function exportCsv(rows, cols) {
  const csv = buildCsv(rows, cols);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'safety-histogram-listing.csv';
  link.click();
  URL.revokeObjectURL(url);
}

export function renderListing(instance) {
  const cols = instance.settings.details;
  const pageSize = instance.settings.page_size;
  let rows = searchRows([...instance.currentTableData], cols, instance.listingSearch);
  if (instance.listingSort) rows = sortRows(rows, instance.listingSort);
  const { visible, pages, page } = paginate(rows, instance.page, pageSize);
  instance.page = page;
  instance.listingWrap.innerHTML = '';
  const actions = createElement('div', 'sv-listing-actions');
  actions.append(
    createElement('strong', null, `${rows.length} of ${instance.currentTableData.length} records`)
  );
  const tools = createElement('div', 'sv-listing-tools');
  const search = createElement('input', 'sv-listing-search');
  search.type = 'search';
  search.placeholder = 'Search listing';
  search.value = instance.listingSearch;
  search.oninput = () => {
    instance.listingSearch = search.value;
    instance.page = 1;
    renderListing(instance);
  };
  tools.append(search);
  [
    ['<<', 1],
    ['<', Math.max(1, instance.page - 1)],
    ['>', Math.min(pages, instance.page + 1)],
    ['>>', pages]
  ].forEach(([label, target]) => {
    const button = createElement('button', null, label);
    button.onclick = () => {
      instance.page = target;
      renderListing(instance);
    };
    tools.append(button);
  });
  const csv = createElement('button', null, 'Export: CSV');
  csv.onclick = () => exportCsv(rows, cols);
  tools.append(csv);
  actions.append(tools);
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  cols.forEach((col) => {
    const th = createElement(
      'th',
      null,
      col.label +
        (instance.listingSort && instance.listingSort.col.value_col === col.value_col
          ? instance.listingSort.direction === 'asc'
            ? ' ▲'
            : ' ▼'
          : '')
    );
    th.onclick = () => {
      const current =
        instance.listingSort && instance.listingSort.col.value_col === col.value_col
          ? instance.listingSort.direction
          : null;
      instance.listingSort = { col, direction: current === 'asc' ? 'desc' : 'asc' };
      instance.page = 1;
      renderListing(instance);
    };
    headRow.append(th);
  });
  thead.append(headRow);
  table.append(thead);
  const tbody = document.createElement('tbody');
  visible.forEach((row) => {
    const tr = document.createElement('tr');
    cols.forEach((col) =>
      tr.append(createElement('td', null, row[col.value_col] == null ? '' : row[col.value_col]))
    );
    tbody.append(tr);
  });
  table.append(tbody);
  instance.listingWrap.append(actions, table);
}
