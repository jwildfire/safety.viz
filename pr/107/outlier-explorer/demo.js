// Demo mount for the outlier-explorer page (#24): recreates the original
// safety-outlier-explorer test page (RhoInc/safety-outlier-explorer/test-page)
// call shape against the real ADBDS example data vendored in ./adbds.csv
// (built from pharmaverseadam by scripts/build-demo-data.mjs). The demo leaves
// time_cols unset to exercise the module's derived per-participant
// "Measurement" sequence axis; the data also carries real VISIT/VISITNUM
// columns, which a real deployment would map via time_cols (as the
// results-over-time demo does). Loaded by outlier-explorer/index.html after
// the dist/ bundle.
(function () {
  // Quote-aware CSV parser: the real data quotes fields with embedded commas
  // (e.g. "Aminotransferase, alanine (ALT)").
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
      const instance = SafetyViz.outlierExplorer('#container', {
        filters: [
          { value_col: 'SITEID', label: 'Site ID' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'ARM', label: 'Treatment Group' }
        ],
        groups: [
          { value_col: 'ARM', label: 'Treatment Group' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'SITE', label: 'Site' }
        ],
        details: [
          { value_col: '__oe_timeLabel', label: 'Measurement' },
          { value_col: 'USUBJID', label: 'Participant ID' },
          { value_col: 'STRESN', label: 'Result' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'ARM', label: 'Treatment Group' }
        ]
      });
      window.__safetyOutlierExplorerInstance = instance;
      instance.init(parseCsv(text));
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
