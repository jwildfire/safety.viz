// Demo mount for the time-to-event page (#128): Kaplan–Meier curves against the
// derived ADTTE example data vendored in ./adtte.csv (built from pharmaverseadam
// adae + adsl by scripts/build-demo-data.mjs — see docs/DATA_SOURCES.md). Loaded
// by time-to-event/index.html after the dist/ bundle.
//
// Three endpoints ship with the demo: time to first dermatologic event (the CDISC
// Pilot 01 dermal-patch study's actual safety concern — the arms genuinely
// separate), time to first serious AE (deliberately sparse: three events across
// 254 participants — the wide, early-ending band is the honest display for a rare
// endpoint), and time to first any treatment-emergent AE. Censoring is at end of
// study regardless of reason — including death — which is exactly the situation
// where 1 − KM overestimates absolute risk; the clinical guide walks through it.
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

  fetch('./adtte.csv')
    .then(function (response) {
      return response.text();
    })
    .then(function (text) {
      const instance = SafetyViz.timeToEvent('#container', {
        filters: [{ value_col: 'ARM', label: 'Treatment Group' }]
      });
      window.__safetyTimeToEventInstance = instance;
      instance.init(parseCsv(text));
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
