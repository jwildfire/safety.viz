// Demo mount for the outlier-explorer page (#24): recreates the original
// safety-outlier-explorer test page (RhoInc/safety-outlier-explorer/test-page)
// call shape against the real ADBDS example data vendored in ./adbds.csv
// (built from pharmaverseadam by scripts/build-demo-data.mjs). The data carries
// a visit (VISITNUM/VISIT) and the ADaM study day (DY) on every record, so the
// main axis offers both through x_axis and opens on Visit (#371). Loaded by
// outlier-explorer/index.html after the dist/ bundle.
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
        // The main x-axis (#371): Visit or Study day, opening on Visit.
        x_axis: {
          options: [
            { key: 'visit', col: 'VISITNUM', label_col: 'VISIT', type: 'ordinal', title: 'Visit' },
            { key: 'day', col: 'DY', type: 'linear', title: 'Study day' }
          ],
          default: 'visit'
        },
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
          { value_col: '__oe_timeLabel', label: 'Time' },
          { value_col: 'USUBJID', label: 'Participant ID' },
          { value_col: 'STRESN', label: 'Result' },
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'ARM', label: 'Treatment Group' }
        ],
        // Railed participant profile (#99, PPRF-OE): the profile plots the
        // ADaM study day (DY) the data carries on every record (#365);
        // measure_values maps the profile's key liver measures onto this
        // data's TEST names (same mapping as the hep-explorer demo);
        // profile_details are the header demographics.
        studyday_col: 'DY',
        visit_col: 'VISIT',
        visitn_col: 'VISITNUM',
        measure_values: {
          ALT: 'Alanine Aminotransferase',
          AST: 'Aspartate Aminotransferase',
          TB: 'Bilirubin',
          ALP: 'Alkaline Phosphatase'
        },
        profile_details: [
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
