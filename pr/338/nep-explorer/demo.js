// Demo mount for the nep-explorer page (#120): the KDIGO nephrotoxicity
// explorer against the real BDS example data vendored in ./adbds.csv (built
// from pharmaverseadam by scripts/build-demo-data.mjs, plus the synthetic
// `AKI-*` acute-kidney-injury cohort appended by
// scripts/build-nep-aki-cohort.mjs — see docs/DATA_SOURCES.md). Loaded by
// nep-explorer/index.html after the dist/ bundle. Ports
// SafetyGraphics/nepExplorer Phase 1 into safety.viz.
//
// The pilot population alone cannot demonstrate this chart: every one of its
// 208 stageable participants lands in the no-stage box. The AKI cohort is what
// puts points in the coloured zones, and it is simulated injury — the guide
// page says so plainly.
(function () {
  // Quote-aware CSV parser (fields may embed commas).
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"' && text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && text[i + 1] === '\n') i += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    const [header, ...records] = rows.filter(
      (cells) => cells.length > 1 || (cells[0] || '').trim() !== ''
    );
    return records.map(function (cells) {
      return Object.fromEntries(
        header.map(function (col, i) {
          return [col, cells[i] ?? ''];
        })
      );
    });
  }

  fetch('./adbds.csv')
    .then(function (response) {
      return response.text();
    })
    .then(function (text) {
      const instance = SafetyViz.nepExplorer('#container', {
        // adbds.csv carries no study-day column, so the tooltip's "maximum on
        // study day" line degrades away rather than rendering blank; the visit
        // it came from is still shown.
        studyday_col: null,
        filters: [
          { value_col: 'ARM', label: 'Treatment Group' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'SITE', label: 'Site' }
        ]
      });
      window.__safetyNepExplorerInstance = instance;
      instance.init(parseCsv(text));
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
