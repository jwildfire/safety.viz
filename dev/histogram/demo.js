// Demo mount for the histogram page (#7, #15): recreates the original
// safety-histogram test page (RhoInc/safety-histogram/test-page) — the same
// call shape and options — against the real ADBDS example data vendored in
// ./adbds.csv (RhoInc data-library, trimmed to the columns the demo maps).
// Loaded by histogram/index.html after the dist/ bundle.
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
      const instance = SafetyViz.histogram('#container', {
        filters: [
          { value_col: 'SITEID', label: 'Site ID' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'ARM', label: 'Treatment Group' },
          { value_col: 'USUBJID', label: 'Participant ID' }
        ],
        groups: [
          { value_col: 'SITE', label: 'Site' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'ARM', label: 'Treatment Group' }
        ],
        display_normal_range: true,
        annotate_bin_boundaries: true,
        test_normality: true,
        group_by: 'ARM',
        compare_distributions: true
      });
      window.__safetyHistogramInstance = instance;
      instance.init(parseCsv(text));
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
