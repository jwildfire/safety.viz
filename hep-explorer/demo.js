// Demo mount for the hep-explorer page (#43): recreates the original
// SafetyGraphics/hep-explorer eDISH call shape against the real ADBDS example
// data vendored in ./adbds.csv (built from pharmaverseadam by
// scripts/build-demo-data.mjs). Two mappings adapt the module defaults to this
// dataset: measure_values points the four liver-measure keys at the dataset's
// TEST strings ("Alanine Aminotransferase" etc. rather than the SDTM-style
// defaults), and studyday_col maps to the numeric VISITNUM sequence because
// the distribution set carries no study-day column — the visit sequence stands
// in for study day in the timing highlight, tooltips, and visit path. Loaded
// by hep-explorer/index.html after the dist/ bundle.
(function () {
  // Quote-aware CSV parser: the real data may quote fields with embedded
  // commas (e.g. long lab-test names).
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
      const instance = SafetyViz.hepExplorer('#container', {
        // Open on the composite plot (#67): the demo dataset carries a synthetic
        // chronic-liver-disease cohort (USUBJID CLD-*, injected by
        // scripts/build-hep-composite-cohort.mjs) with abnormal baseline liver
        // tests, so the baseline-referenced composite view is meaningful. Switch
        // the View control to "eDISH / mDISH scatter" for the classic view.
        view: 'composite',
        // Designate the arm pair the migration Sankey (Amirzadegan et al., Drug
        // Safety 2025, Fig 3) mirrors about its centre column. The synthetic
        // chronic-liver-disease cohort is the one population in this dataset
        // where a baseline → on-treatment shift comparison is meaningful, and
        // it reproduces the paper's Study-2 shape (the drug arm shows fewer
        // unfavourable and more than twice the favourable shifts). The ~231
        // pilot participants are designated neither side and fall out with a
        // counted note, which is exactly what an undesignated arm should do.
        arm_col: 'ARM',
        placebo_arm: 'CLD: Placebo',
        active_arms: ['CLD: Study Drug'],
        studyday_col: 'VISITNUM',
        visit_col: 'VISIT',
        visitn_col: 'VISITNUM',
        measure_values: {
          ALT: 'Alanine Aminotransferase',
          AST: 'Aspartate Aminotransferase',
          TB: 'Bilirubin',
          ALP: 'Alkaline Phosphatase'
        },
        filters: [
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'ARM', label: 'Treatment Group' }
        ],
        groups: [
          { value_col: 'ARM', label: 'Treatment Group' },
          { value_col: 'SEX', label: 'Sex' }
        ],
        // Default the color-by / composite by-arm split to treatment group so the
        // composite view opens on the paper's primary output — the by-arm
        // concern-vs-benefit comparison.
        group_by: 'ARM'
      });
      window.__safetyHepExplorerInstance = instance;
      instance.init(parseCsv(text));
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
