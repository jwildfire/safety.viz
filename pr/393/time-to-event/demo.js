// Demo mount for the time-to-event page (#128): Kaplan–Meier curves composed
// live from the vendored adverse-event data (./adae.csv) and the population
// extract (./adsl.csv) — both built from pharmaverseadam by
// scripts/build-demo-data.mjs (see docs/DATA_SOURCES.md). Loaded by
// time-to-event/index.html after the dist/ bundle.
//
// There is no pre-derived endpoint list (the sv#131 review): the endpoint is
// whatever the multiselect event filters say qualifies — by default every
// treatment-emergent AE (time to first TEAE), and one filter click away, e.g.
// the serious-only endpoint (deliberately sparse in this study: three events
// across 254 participants — the wide, early-ending band is the honest display
// for a rare endpoint) or a body-system basket such as the dermatologic events
// this dermal-patch study actually worries about. Censoring is at end of study
// regardless of reason — including death — which is exactly the situation where
// 1 − KM overestimates absolute risk; the clinical guide walks through it.
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

  Promise.all(
    ['./adae.csv', './adsl.csv'].map(function (file) {
      return fetch(file).then(function (response) {
        return response.text();
      });
    })
  )
    .then(function (texts) {
      // adae.csv carries one all-blank placeholder row per AE-free safety
      // participant (the AE renderers' denominator convention). They are not
      // events — the population file is this chart's denominator — so the
      // demo passes only the real event rows.
      const events = parseCsv(texts[0]).filter(function (row) {
        return row.AEDECOD !== '';
      });
      const population = parseCsv(texts[1]);
      const instance = SafetyViz.timeToEvent('#container', {
        event_filters: [
          { value_col: 'AEBODSYS', label: 'Body System' },
          { value_col: 'AEDECOD', label: 'Preferred Term' },
          { value_col: 'AESER', label: 'Serious' },
          { value_col: 'AESEV', label: 'Severity' }
        ],
        filters: [{ value_col: 'ARM', label: 'Treatment Group' }]
      });
      window.__safetyTimeToEventInstance = instance;
      instance.init({ events: events, population: population });
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
