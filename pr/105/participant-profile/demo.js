// Demo mount for the participant-profile page (#98): the library's first
// linked-charts demo. Two stacked mounts share one dataset: the top container
// runs the Hepatic Safety Explorer with its built-in profile dock turned OFF
// (`profile: false`), and the bottom container mounts the standalone
// participant-profile module against the same CSV, listening for the chart's
// public `participantsSelected` event on the chart root (PPRF-6). Clicking an
// eDISH point drives the neighbouring profile purely through that event
// contract — the two modules never share internals. Loaded by
// participant-profile/index.html after the dist/ bundle.
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

  // The shared adbds.csv mapping the hep-explorer demo established: TEST
  // strings for the four liver measures, and the numeric visit sequence
  // standing in for study day (the distribution set carries no study-day
  // column).
  var mapping = {
    studyday_col: 'VISITNUM',
    visit_col: 'VISIT',
    visitn_col: 'VISITNUM',
    measure_values: {
      ALT: 'Alanine Aminotransferase',
      AST: 'Aspartate Aminotransferase',
      TB: 'Bilirubin',
      ALP: 'Alkaline Phosphatase'
    }
  };

  var container = document.querySelector('#container');

  var chartSection = document.createElement('section');
  var chartHeading = document.createElement('h2');
  chartHeading.textContent = 'The chart: Hepatic Safety Explorer, profile dock off';
  var chartMount = document.createElement('div');
  chartMount.id = 'linked-chart';
  chartSection.appendChild(chartHeading);
  chartSection.appendChild(chartMount);

  var profileSection = document.createElement('section');
  var profileHeading = document.createElement('h2');
  profileHeading.textContent = 'The standalone profile, linked by participantsSelected';
  profileHeading.style.marginTop = '2rem';
  var profileNote = document.createElement('p');
  profileNote.textContent =
    'Click a point above (or multi-select in the composite view) — the selection reaches ' +
    'this independently mounted module only through the participantsSelected event on the ' +
    "chart's root element.";
  var profileMount = document.createElement('div');
  profileMount.id = 'linked-profile';
  profileSection.appendChild(profileHeading);
  profileSection.appendChild(profileNote);
  profileSection.appendChild(profileMount);

  container.appendChild(chartSection);
  container.appendChild(profileSection);

  fetch('./adbds.csv')
    .then(function (response) {
      return response.text();
    })
    .then(function (text) {
      var rows = parseCsv(text);

      // Top: the host chart, with its built-in dock disabled so the wiring
      // below is demonstrably the public event contract, not the adoption
      // path.
      var chart = SafetyViz.hepExplorer('#linked-chart', {
        profile: false,
        arm_col: 'ARM',
        placebo_arm: 'CLD: Placebo',
        active_arms: ['CLD: Study Drug'],
        studyday_col: mapping.studyday_col,
        visit_col: mapping.visit_col,
        visitn_col: mapping.visitn_col,
        measure_values: mapping.measure_values,
        filters: [
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'ARM', label: 'Treatment Group' }
        ],
        groups: [
          { value_col: 'ARM', label: 'Treatment Group' },
          { value_col: 'SEX', label: 'Sex' }
        ]
      });
      window.__safetyHepExplorerInstance = chart;
      chart.init(rows);

      // Bottom: the standalone profile, ingesting the same raw records and
      // listening on the chart's root. It never dispatches selection events
      // of its own (PPRF-6).
      var profile = SafetyViz.participantProfile('#linked-profile', rows, {
        listen_to: chartMount.querySelector('.sv-root'),
        studyday_col: mapping.studyday_col,
        visit_col: mapping.visit_col,
        visitn_col: mapping.visitn_col,
        measure_values: mapping.measure_values,
        details: [
          { value_col: 'SEX', label: 'Sex' },
          { value_col: 'RACE', label: 'Race' },
          { value_col: 'ARM', label: 'Treatment Group' },
          { value_col: 'SITE', label: 'Site' }
        ]
      });
      window.__safetyParticipantProfileInstance = profile;
    })
    .catch(function (error) {
      console.error(error);
      container.textContent = 'Failed to load demo data: ' + error.message;
    });
})();
