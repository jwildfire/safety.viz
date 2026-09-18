// Demo mount for the patient-journey-explorer page (#142): one participant's
// whole safety record on a single study-day axis, composed live from the six
// vendored per-domain extracts (./pje-ex.csv, ./pje-ae.csv, ./pje-lb.csv,
// ./pje-cm.csv, ./pje-mh.csv, ./pje-ds.csv) built from pharmaverseadam and
// pharmaversesdtm by scripts/build-demo-data.mjs (see docs/DATA_SOURCES.md).
// Loaded by patient-journey-explorer/index.html after the dist/ bundle.
//
// The demo opens on 01-716-1447 — the one participant whose ±30-day window
// around the day-30 ERYTHEMA event holds all three context kinds at once
// (a dose change, an abnormal lab and active con-meds); the clinical guide
// walks through what that panel does and does not claim.
//
// Three things this study's data cannot show, so two controls look sparse:
//  - 83% of the con-med courses are UNCODED (no ATC class), so the con-med
//    class filter has one dominant value;
//  - the medical-history terms were scrubbed to VERBATIM_ placeholders in the
//    source, so the history lane reads as a count, not a story;
//  - only 3 adverse events study-wide are serious, so "Serious only" empties
//    the AE lane for almost every participant.
(function () {
  // Quote-aware CSV parser (fields may embed commas) — pje-ae, pje-cm and
  // pje-ds carry RFC-4180 quoted verbatim terms.
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

  const files = ['ex', 'ae', 'lb', 'cm', 'mh', 'ds'];

  Promise.all(
    files.map(function (domain) {
      return fetch('./pje-' + domain + '.csv').then(function (response) {
        if (!response.ok) throw new Error('pje-' + domain + '.csv: HTTP ' + response.status);
        return response.text();
      });
    })
  )
    .then(function (texts) {
      const data = {};
      files.forEach(function (domain, i) {
        data[domain] = parseCsv(texts[i]);
      });
      // Four lab tests plus the screening-history lane put the opening
      // participant's stack at 736px at the row floors, 16px over the
      // 720px default; a slightly taller panel keeps the whole journey on
      // one screen without scrolling (PJE-LANE-009).
      const instance = SafetyViz.patientJourneyExplorer('#container', {
        subject: '01-716-1447',
        height: 760,
        lb_tests: [
          'Alanine Aminotransferase',
          'Aspartate Aminotransferase',
          'Bilirubin',
          'Alkaline Phosphatase'
        ]
      });
      window.__safetyPatientJourneyInstance = instance;
      instance.init(data);
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });
})();
