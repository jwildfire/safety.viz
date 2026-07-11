// Demo mount for the histogram page (#7): the same call shape as the
// Playwright harness fixture (tests/e2e/fixtures/histogram.html), against the
// committed adbds.csv fixture data. Loaded by histogram/index.html after the
// dist/ bundle.
(function () {
  function parseCsv(text) {
    const [header, ...lines] = text.trim().split(/\r?\n/);
    const cols = header.split(',');
    return lines.map(function (line) {
      const cells = line.split(',');
      return Object.fromEntries(
        cols.map(function (col, i) {
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
        test_normality: true
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
