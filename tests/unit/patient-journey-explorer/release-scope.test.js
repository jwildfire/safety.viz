// @vitest-environment jsdom
// Release-scope guard for the Patient Journey Explorer (#176): the AI
// narrative layer was taken out of v1.8.0 and is kept on the branch
// parked/pje-narratives, so the bundle entry must export no narrative symbol
// and a chart mounted on the demo extracts must carry no narrative card, tray
// or chip and no narrative setting. The Chart class is stubbed as in
// events.test.js (the canvases exist, nothing is painted); the data is the six
// vendored site/data/pje-*.csv files with the demo page's own settings
// (site/demo/patient-journey-explorer.js).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The whole collection is imported, so every module's Chart.js registrations
// must resolve: keep the real exports and stub only the Chart class.
vi.mock('chart.js', async (importOriginal) => {
  class Chart {
    constructor(canvas, config) {
      this.canvas = canvas;
      this.config = config;
      this.data = config.data;
      this.options = config.options;
      this.plugins = config.plugins || [];
    }
    update() {}
    draw() {}
    resize() {}
    destroy() {}
  }
  Chart.register = () => {};
  return { ...(await importOriginal()), Chart };
});

const main = await import('../../../src/main.js');
const { default: patientJourneyExplorer } =
  await import('../../../src/patient-journey-explorer.js');

const DATA = join(dirname(fileURLToPath(import.meta.url)), '../../../site/data');
const DOMAINS = ['ex', 'ae', 'lb', 'cm', 'mh', 'ds'];
const NARRATIVE = /narrativ/i;

// Quote-aware RFC-4180 reader: the extracts carry verbatim terms with commas.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...records] = rows.filter((cells) => cells.length > 1 || cells[0].trim() !== '');
  return records.map((cells) => Object.fromEntries(header.map((col, i) => [col, cells[i] ?? ''])));
}

function demoData() {
  return Object.fromEntries(
    DOMAINS.map((domain) => [
      domain,
      parseCsv(readFileSync(join(DATA, `pje-${domain}.csv`), 'utf8'))
    ])
  );
}

/** Every own and inherited property name of an object, up to Object.prototype. */
function memberNames(object) {
  const names = new Set();
  for (let o = object; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    Object.getOwnPropertyNames(o).forEach((name) => names.add(name));
  }
  return [...names];
}

describe('patient-journey-explorer release scope', () => {
  let instance;

  afterEach(() => {
    instance?.destroy();
    instance = undefined;
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  it('PJE-API: the release carries no narrative layer (#176)', () => {
    // The bundle entry: no narrative symbol, named or on the default collection.
    expect(Object.keys(main).filter((name) => NARRATIVE.test(name))).toEqual([]);
    expect(Object.keys(main.default).filter((name) => NARRATIVE.test(name))).toEqual([]);

    // A chart mounted the way the demo page mounts it, anchored on the seeded
    // participant's day-30 adverse event so the context panel is populated.
    document.body.innerHTML = '<div id="container"></div>';
    instance = patientJourneyExplorer('#container', {
      subject: '01-716-1447',
      mh_onset_stdy_col: 'MHONSDY',
      lb_tests: [
        'Alanine Aminotransferase',
        'Aspartate Aminotransferase',
        'Bilirubin',
        'Alkaline Phosphatase'
      ]
    });
    instance.init(demoData());
    const erythema = instance.structured.allEvents.find(
      (event) => event.domain === 'AE' && event.day === 30
    );
    instance.anchor(erythema.id);
    expect(instance.getContext()).not.toBeNull();

    // No card, tray or chip in the DOM, and no narrative style rule shipped.
    const narrativeNodes = [...document.querySelectorAll('[class]')].filter((node) =>
      [...node.classList].some((name) => NARRATIVE.test(name) || /^sv-pje-ai(-|$)/.test(name))
    );
    expect(narrativeNodes.map((node) => node.className)).toEqual([]);
    const css = [...document.querySelectorAll('style')].map((node) => node.textContent).join('\n');
    expect(css).not.toMatch(/sv-pje-ai|narrativ/i);

    // No setting, no method, no state.
    expect(Object.keys(instance.settings).filter((name) => NARRATIVE.test(name))).toEqual([]);
    expect(memberNames(instance).filter((name) => NARRATIVE.test(name))).toEqual([]);
  });
});
