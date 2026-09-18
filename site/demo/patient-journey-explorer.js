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
      // The extract ships the medical-history onset day as MHONSDY
      // (docs/DATA_SOURCES.md); the module's default chain reads ASTDY then
      // MHSTDY, so the demo names the column or the day would go unread.
      const instance = SafetyViz.patientJourneyExplorer('#container', {
        subject: '01-716-1447',
        mh_onset_stdy_col: 'MHONSDY',
        lb_tests: [
          'Alanine Aminotransferase',
          'Aspartate Aminotransferase',
          'Bilirubin',
          'Alkaline Phosphatase'
        ]
      });
      window.__safetyPatientJourneyInstance = instance;
      instance.init(data);
      mountNarrativeControls(instance);
    })
    .catch(function (error) {
      console.error(error);
      document.querySelector('#container').textContent =
        'Failed to load demo data: ' + error.message;
    });

  // --- AI narratives (#146) ---------------------------------------------------
  // The open-source site ships with the offline stub adapter: deterministic
  // drafts templated from the real rows, so every citation resolves and the
  // page builds and deploys without a secret. A visitor can switch to Claude
  // with their own key; the key stays in this tab's sessionStorage and goes
  // straight from the browser to the API (anthropic-dangerous-direct-browser-
  // access), never to this site's host. Accept / reject are wired the way a
  // host application would wire them: the action comes back through
  // on_narrative_action and the accepted draft is passed to refreshNarrative.
  var KEY_STORAGE = 'safety-viz-pje-anthropic-key';
  var MODEL_STORAGE = 'safety-viz-pje-anthropic-model';

  function readStorage(key) {
    try {
      return window.sessionStorage.getItem(key) || '';
    } catch (error) {
      return '';
    }
  }
  function writeStorage(key, value) {
    try {
      if (value) window.sessionStorage.setItem(key, value);
      else window.sessionStorage.removeItem(key);
    } catch (error) {
      /* private mode: nothing to keep */
    }
  }

  function mountNarrativeControls(instance) {
    var container = document.querySelector('#container');
    var strip = document.createElement('section');
    strip.className = 'sv-pje-demo-ai';
    strip.setAttribute('aria-label', 'AI narratives');
    strip.innerHTML =
      '<h2>AI narratives</h2>' +
      '<p>Drafted from the same rows the chart holds, every sentence citing its source rows and ' +
      'labelled <em>Draft — AI generated</em> until a reviewer accepts it. The participant summary ' +
      'sits above the lanes; anchor an adverse event to draft its context at the top of the panel; ' +
      'lab, dose and disposition narratives are drafted on request from the tray beneath the lanes. Co-occurrence is ' +
      'not causation, and the validator rejects causal, diagnostic and treatment language.</p>' +
      '<div class="sv-pje-demo-ai-row">' +
      '<label><input type="radio" name="pje-ai-provider" value="stub" checked /> Offline stub adapter ' +
      '(deterministic, no key)</label>' +
      '<label><input type="radio" name="pje-ai-provider" value="claude" /> Claude, with your own API key</label>' +
      '</div>' +
      '<div class="sv-pje-demo-ai-row sv-pje-demo-ai-live" hidden>' +
      '<label>Anthropic API key <input type="password" class="pje-ai-key" autocomplete="off" ' +
      'placeholder="sk-ant-…" /></label>' +
      '<label>Model <input type="text" class="pje-ai-model" value="claude-opus-5" /></label>' +
      '<button type="button" class="pje-ai-apply">Use this key</button>' +
      '<small>The key is kept in this tab only and sent directly to api.anthropic.com from your ' +
      'browser; nothing goes to the host of this site. Each narrative is one short tool-use call.</small>' +
      '</div>' +
      '<p class="sv-pje-demo-ai-status" aria-live="polite"></p>';
    container.parentNode.insertBefore(strip, container);

    var status = strip.querySelector('.sv-pje-demo-ai-status');
    var live = strip.querySelector('.sv-pje-demo-ai-live');
    var keyInput = strip.querySelector('.pje-ai-key');
    var modelInput = strip.querySelector('.pje-ai-model');
    keyInput.value = readStorage(KEY_STORAGE);
    modelInput.value = readStorage(MODEL_STORAGE) || 'claude-opus-5';

    function bind(provider) {
      var options = { provider: provider };
      if (provider === 'claude') {
        options.apiKey = keyInput.value.trim();
        options.model = modelInput.value.trim() || 'claude-opus-5';
        if (!options.apiKey) {
          status.textContent = 'Enter an API key to draft with Claude; the stub stays active.';
          return;
        }
        writeStorage(KEY_STORAGE, options.apiKey);
        writeStorage(MODEL_STORAGE, options.model);
      }
      window.__pjeGenerator = SafetyViz.narratives.bindNarratives(instance, options);
      status.textContent =
        provider === 'claude'
          ? 'Drafting with ' + options.model + ' through your key.'
          : 'Drafting with the offline stub adapter.';
    }

    strip.querySelectorAll('input[name="pje-ai-provider"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        live.hidden = radio.value !== 'claude';
        if (radio.value === 'stub') bind('stub');
        else if (keyInput.value.trim()) bind('claude');
        else status.textContent = 'Enter an API key and press "Use this key".';
      });
    });
    strip.querySelector('.pje-ai-apply').addEventListener('click', function () {
      bind('claude');
    });

    instance.on('pjeNarrativeAction', function (action) {
      if (action.type === 'accept' && action.draft) {
        instance.refreshNarrative(Object.assign({}, action.draft, { status: 'accepted' }));
        status.textContent =
          'Accepted the ' + action.kind + ' draft (the host app would store it now).';
      } else if (action.type === 'reject' && action.draft) {
        instance.refreshNarrative(Object.assign({}, action.draft, { status: 'rejected' }));
        status.textContent = 'Rejected the ' + action.kind + ' draft.';
      } else if (action.type === 'edit') {
        status.textContent =
          'Edited the ' + action.kind + ' draft; the host app would store the edit.';
      } else if (action.type === 'regenerate') {
        status.textContent =
          'Regenerating the ' + action.kind + ' draft (' + (action.reason || 'manual') + ').';
      }
    });

    bind('stub');
  }
})();
