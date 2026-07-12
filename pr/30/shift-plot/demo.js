// Demo mount for the shift-plot page (#14): recreates the original
// safety-shift-plot test page (baseline-versus-comparison scatter with the
// measure and baseline/comparison visit controls) against the real ADBDS
// example data vendored in ./adbds.csv, using its real VISIT/VISITNUM
// columns (Screening through End of Study, unscheduled visits included).
// The initial view pairs the classic shift — Screening against End of
// Study — and the visit controls expose every other pairing. Loaded by
// shift-plot/index.html after the dist/ bundle.
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
      const instance = SafetyViz.shiftPlot('#container', {
        filters: [
          { value_col: 'SITEID', label: 'Site ID' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'ARM', label: 'Treatment Group' }
        ],
        baseline_visits: ['Screening'],
        comparison_visits: ['End of Study']
      });
      window.__safetyShiftPlotInstance = instance;
      // A handful of source rows carry no visit assignment; they cannot join a
      // baseline/comparison pairing, so drop them before mounting.
      instance.init(
        parseCsv(text).filter(function (record) {
          return record.VISIT !== '';
        })
      );
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
