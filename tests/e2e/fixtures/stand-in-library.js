// A stand-in second chart library (#181, obot.roadmap#366), written for the
// demo app's tests and for nothing else. It is the smallest library that holds
// the app to the seam a real second library will use: its own manifest in the
// portfolio manifest's format (version 2), chart factories with the same
// `factory(element, settings)` and `init(data)` lifecycle as safety.viz's, a
// chart that takes named tables, `{ results, participants }`, rather than one
// bare array, and a chart that refuses a setting passed as null, as a library
// that validates its required columns does. It draws nothing worth looking at:
// it writes what it was handed into the page, and logs it, so a test can read
// both.
//
// Imported as an ES module by the unit tests and by the harness page
// (fixtures/basic-app-library.html). No code from any other library is in it.

/** Every call the library's charts received, in order: what a test reads. */
export const log = [];

/**
 * The stand-in's one drawing chart: a strip that reports its tables.
 * @param {string|Element} element Where to draw.
 * @param {Object} settings Column settings; none may be null.
 * @returns {{init: Function, destroy: Function}} The chart instance.
 */
function strip(element, settings) {
  const target = typeof element === 'string' ? document.querySelector(element) : element;
  for (const [key, value] of Object.entries(settings)) {
    if (value === null) {
      throw new Error(`Stand-in Result Strip: ${key} is null; leave a setting out instead.`);
    }
  }
  return {
    init(data) {
      if (!data || !Array.isArray(data.results)) {
        throw new Error('Stand-in Result Strip: init takes { results, participants }.');
      }
      const tables = Object.keys(data);
      log.push({
        event: 'init',
        settings: { ...settings },
        tables,
        rows: Object.fromEntries(tables.map((name) => [name, data[name].length]))
      });
      target.innerHTML = '';
      const box = document.createElement('div');
      box.className = 'stand-in-strip';
      box.dataset.tables = tables.join(',');
      box.textContent =
        `${data.results.length} results` +
        (data.participants ? ` and ${data.participants.length} participants` : '');
      target.append(box);
    },
    // New settings for the drawn chart, kept as they come: what a page hands
    // a chart it does not want drawn again (#183).
    setSettings(next) {
      log.push({ event: 'setSettings', settings: { ...next } });
      return this;
    },
    destroy() {
      log.push({ event: 'destroy' });
      target.innerHTML = '';
    }
  };
}

/** The factories, keyed by the name each manifest entry exports. One entry names none. */
export const charts = { strip };

/** The stand-in's chart list, in the portfolio manifest's format version 2. */
export const manifest = {
  version: 2,
  description:
    'A stand-in second chart library for the demo app’s tests: one chart that takes named tables, and one whose factory the library does not provide.',
  groups: {
    'stand-in': { label: 'Stand-in charts', order: 1 }
  },
  modules: {
    'stand-in-strip': {
      library: 'stand-in',
      group: 'stand-in',
      export: 'strip',
      title: 'Stand-in Result Strip',
      domains: ['bds'],
      optionalDomains: ['subject'],
      tables: {
        results: { domain: 'bds', required: true },
        participants: { domain: 'subject', required: false }
      },
      unmappedSettings: 'omit',
      settings: {
        id_col: { domain: ['bds', 'subject'], column: 'USUBJID', required: true },
        measure_col: { domain: 'bds', column: 'TEST', required: true },
        value_col: { domain: 'bds', column: 'STRESN', required: true },
        visit_col: { domain: 'bds', column: 'VISIT', required: false },
        day_col: { domain: 'bds', column: 'DY', required: false },
        group_col: { domain: 'subject', column: 'ARM', required: false }
      }
    },
    'stand-in-absent': {
      library: 'stand-in',
      group: 'stand-in',
      export: 'absent',
      title: 'Stand-in Absent Chart',
      domains: ['bds'],
      settings: {
        value_col: { domain: 'bds', column: 'STRESN', required: true }
      }
    }
  }
};

/** The library as the app's `mount` takes it. */
export default { name: 'stand-in', charts, manifest };
