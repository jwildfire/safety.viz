// Demo mount for the shift-plot page (#14): recreates the original
// safety-shift-plot test page (baseline-versus-comparison scatter with the
// measure and baseline/comparison visit controls) against the real ADBDS
// example data vendored in ./adbds.csv. That file carries one row per
// participant per measure but no visit column, so — exactly as a study feed
// would supply VISIT/VISITNUM — the demo derives a visit per repeated
// measurement from its row order (first result = Visit 1, next = Visit 2, …),
// then pairs Visit 1 against Visit 2. Loaded by shift-plot/index.html after the
// dist/ bundle.
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

  // Assign a visit per repeated (participant, measure) result in row order.
  function addVisits(records) {
    const counts = new Map();
    records.forEach(function (record) {
      const key = record.USUBJID + '||' + record.TEST;
      const n = (counts.get(key) || 0) + 1;
      counts.set(key, n);
      record.VISITNUM = String(n);
      record.VISIT = 'Visit ' + n;
    });
    return records;
  }

  fetch('./adbds.csv')
    .then(function (response) {
      return response.text();
    })
    .then(function (text) {
      const instance = SafetyViz.shiftPlot('#container', {
        filters: [
          { value_col: 'SITEID', label: 'Site ID' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'ARM', label: 'Treatment Group' }
        ],
        baseline_visits: ['Visit 1'],
        comparison_visits: ['Visit 2']
      });
      window.__safetyShiftPlotInstance = instance;
      instance.init(addVisits(parseCsv(text)));
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
