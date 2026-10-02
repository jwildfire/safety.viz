// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';

// jsdom replaces the global URL, so the fixture path is built with node:path.
const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../site/data');
const demoText = (file) => readFileSync(path.join(dataDir, file), 'utf8');
const DEMO = ['adsl.csv', 'adae.csv', 'adbds.csv', 'adeg.csv'].map((name) => ({
  name,
  text: demoText(name)
}));

// Stand-ins for the chart factories: each records what it was handed and
// whether it is still mounted, which is all the page's own logic touches.
function fakeCharts() {
  const calls = [];
  const charts = { portfolio: manifest };
  for (const entry of Object.values(manifest.modules)) {
    charts[entry.export] = vi.fn((element, settings) => {
      const call = { export: entry.export, settings, data: null, mounted: false };
      calls.push(call);
      return {
        init(data) {
          call.data = data;
          call.mounted = true;
          element.innerHTML = '<canvas></canvas>';
        },
        destroy() {
          call.mounted = false;
          element.innerHTML = '';
        }
      };
    });
  }
  return { charts, calls };
}

const item = (root, id) => root.querySelector(`.sva-item[data-view="${id}"]`);
const tag = (root, id) => item(root, id).querySelector('.sva-tag').textContent;

describe('demo app: the page', () => {
  let root;
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    root = document.querySelector('#app');
    window.location.hash = '';
  });

  it('APP-PAGE-001: lists every chart in the manifest under its domain, with a status each (#150)', () => {
    const { charts } = fakeCharts();
    mountApp(root, { charts, manifest });
    const groups = [...root.querySelectorAll('.sva-group')].map((group) => ({
      title: group.querySelector('.sva-group-title').textContent,
      charts: [...group.querySelectorAll('.sva-item-title')].map((node) => node.textContent)
    }));
    expect(groups.map((group) => group.title)).toEqual([
      'Labs and vitals',
      'ECG',
      'Adverse events',
      'Outside the standard domains'
    ]);
    expect(groups.flatMap((group) => group.charts)).toEqual(
      Object.values(manifest.modules).map((entry) => entry.title)
    );
    expect(groups[3].charts).toEqual(['Patient Journey Explorer']);
    // Nothing is loaded: the page opens on the data view and no chart is ready.
    expect(root.querySelector('.sva-count').textContent).toBe(
      '0 of 14 charts supported by the loaded data'
    );
    expect(item(root, 'data').getAttribute('aria-current')).toBe('page');
    expect(tag(root, 'histogram')).toBe('no file');
    expect(tag(root, 'patient-journey-explorer')).toBe('needs more domains');
  });

  it('APP-PAGE-002: on the demo study the supported count reads 13 of 14 (#150)', () => {
    const { charts } = fakeCharts();
    const app = mountApp(root, { charts, manifest });
    app.loadFiles(DEMO);
    expect(root.querySelector('.sva-count').textContent).toBe(
      '13 of 14 charts supported by the loaded data'
    );
    const ready = [...root.querySelectorAll('.sva-tag.sva-ready')];
    expect(ready).toHaveLength(13);
    expect(tag(root, 'data')).toBe('4 files');
  });

  it('APP-PAGE-003: choosing a chart draws it from the mapped data (#150)', () => {
    const { charts, calls } = fakeCharts();
    const app = mountApp(root, { charts, manifest });
    app.loadFiles(DEMO);
    app.select('histogram');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ export: 'histogram', mounted: true });
    expect(calls[0].settings).toMatchObject({ measure_col: 'TEST', value_col: 'STRESN' });
    expect(calls[0].data.length).toBeGreaterThan(50000);
    expect(root.querySelector('.sva-title').textContent).toBe('Safety Histogram');
    expect(item(root, 'histogram').getAttribute('aria-current')).toBe('page');
    expect(window.location.hash).toBe('#histogram');
  });

  it('APP-PAGE-004: choosing another chart removes the first: never more than one is mounted (#150)', () => {
    const { charts, calls } = fakeCharts();
    const app = mountApp(root, { charts, manifest });
    app.loadFiles(DEMO);
    app.select('histogram');
    item(root, 'qt-explorer').click();
    expect(calls).toHaveLength(2);
    expect(calls[0].mounted).toBe(false);
    expect(calls[1]).toMatchObject({ export: 'qtExplorer', mounted: true });
    expect(calls.filter((call) => call.mounted)).toHaveLength(1);
    expect(root.querySelectorAll('.sva-chart canvas')).toHaveLength(1);
    // The data view mounts none.
    item(root, 'data').click();
    expect(calls.filter((call) => call.mounted)).toHaveLength(0);
  });

  it('APP-PAGE-005: a chart that was ready but throws reads "did not draw" with the chart’s own message (#150)', () => {
    const { charts } = fakeCharts();
    charts.shiftPlot = vi.fn(() => ({
      init() {
        throw new Error('Required variable(s) missing: VISIT');
      }
    }));
    const app = mountApp(root, { charts, manifest });
    app.loadFiles(DEMO);
    expect(tag(root, 'shift-plot')).toBe('ready');
    app.select('shift-plot');
    expect(tag(root, 'shift-plot')).toBe('did not draw');
    expect(root.querySelector('.sva-message').textContent).toContain(
      'Required variable(s) missing: VISIT'
    );
    // The count is corrected by what happened.
    expect(root.querySelector('.sva-count').textContent).toBe(
      '12 of 14 charts supported by the loaded data'
    );
  });

  it('APP-PAGE-006: a chart the data does not support is not drawn, and the page says what it needs (#150)', () => {
    const { charts, calls } = fakeCharts();
    const app = mountApp(root, { charts, manifest });
    app.loadFiles(DEMO.filter((file) => file.name !== 'adeg.csv'));
    app.select('qt-explorer');
    expect(calls).toHaveLength(0);
    expect(root.querySelector('.sva-message').textContent).toBe('No file loaded for: ECG.');
    app.select('patient-journey-explorer');
    expect(root.querySelector('.sva-message').textContent).toContain('six domains of its own');
    expect(calls).toHaveLength(0);
  });

  it('APP-PAGE-007: the participant profile is listed with a status and explained, not drawn as a page of its own (#150)', () => {
    const { charts, calls } = fakeCharts();
    const app = mountApp(root, { charts, manifest });
    app.loadFiles(DEMO);
    expect(tag(root, 'participant-profile')).toBe('ready');
    app.select('participant-profile');
    expect(calls).toHaveLength(0);
    expect(root.querySelector('.sva-message').textContent).toContain(
      'opens beside a chart when you select a participant'
    );
  });

  it('APP-PAGE-009: a file that belongs to no domain, or cannot be read, is reported in a sentence and loads nothing (#150)', () => {
    const { charts } = fakeCharts();
    const app = mountApp(root, { charts, manifest });
    app.loadFiles([
      { name: 'notes.csv', text: 'USUBJID,COMMENT\n01,fine\n' },
      { name: 'labs.xpt', text: 'x' }
    ]);
    const notes = [...root.querySelectorAll('.sva-note')].map((node) => node.textContent);
    expect(notes).toEqual([
      'notes.csv was not placed in a domain: it matches at most 1 column of any of them (USUBJID).',
      'labs.xpt is not a CSV or JSON file. SAS transport and sas7bdat files are not supported yet.'
    ]);
    expect(root.querySelector('.sva-count').textContent).toBe(
      '0 of 14 charts supported by the loaded data'
    );
  });

  it('APP-PAGE-010: served with a demo study, it loads it and opens on the first chart (#150)', async () => {
    const { charts, calls } = fakeCharts();
    const fetchText = vi.fn(async (url) => demoText(url.split('/').pop()));
    const app = mountApp(root, { charts, manifest, demo: { base: './data/' }, fetchText });
    await app.ready;
    expect(fetchText.mock.calls.map(([url]) => url)).toEqual([
      './data/adsl.csv',
      './data/adae.csv',
      './data/adbds.csv',
      './data/adeg.csv'
    ]);
    expect(root.querySelector('.sva-count').textContent).toBe(
      '13 of 14 charts supported by the loaded data'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].export).toBe('histogram');
  });

  it('APP-PAGE-011: a second file placed in a domain replaces the first, and the page says so (#150)', () => {
    const { charts } = fakeCharts();
    const app = mountApp(root, { charts, manifest });
    app.loadFiles([DEMO[0]]);
    app.loadFiles([{ name: 'adsl-v2.csv', text: DEMO[0].text }]);
    expect([...root.querySelectorAll('.sva-note')].map((node) => node.textContent)).toEqual([
      'adsl-v2.csv replaced adsl.csv as the Subject-level file.'
    ]);
    expect(tag(root, 'data')).toBe('1 file');
  });

  it('APP-PAGE-018: the app carries its own header: wordmark, what it is, and that nothing is sent anywhere (#150)', () => {
    const { charts } = fakeCharts();
    mountApp(root, { charts, manifest, version: '1.2.3' });
    expect(root.querySelector('.sva-rail .sva-wordmark').textContent).toBe('safety.viz');
    expect(root.querySelector('.sva-rail .sva-kicker').textContent).toBe('Demo app');
    expect(root.querySelector('.sva-logo svg')).not.toBeNull();
    expect(root.querySelector('.sva-pitch').textContent).toContain('Nothing is sent anywhere.');
    expect(root.querySelector('.sva-version').textContent).toBe('safety.viz 1.2.3');
    // One page title: the view's name, in the main column.
    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('main h1.sva-title').textContent).toBe('Data');
  });

  it('APP-PAGE-019: the rail links only where it was given an address, and the single file is a download (#150)', () => {
    const { charts } = fakeCharts();
    mountApp(root, { charts, manifest });
    expect(root.querySelectorAll('.sva-links a')).toHaveLength(0);
    mountApp(root, {
      charts,
      manifest,
      links: { docs: '../index.html', download: './safety.viz-app.html' }
    });
    const anchors = [...root.querySelectorAll('.sva-links a')];
    expect(anchors.map((a) => [a.dataset.link, a.getAttribute('href'), a.textContent])).toEqual([
      ['docs', '../index.html', 'Docs and chart gallery'],
      ['download', './safety.viz-app.html', 'Download as one file']
    ]);
    expect(anchors[0].hasAttribute('download')).toBe(false);
    expect(anchors[1].hasAttribute('download')).toBe(true);
  });

  it('APP-PAGE-020: each chart’s hex says its state beside the words: its domain’s hue when ready, red when something is missing, hollow with nothing to read (#150)', () => {
    const { charts } = fakeCharts();
    const app = mountApp(root, { charts, manifest });
    const hex = (id) => item(root, id).querySelector('.sva-hex').className;
    expect(hex('histogram')).toBe('sva-hex sva-hollow');
    app.loadFiles(DEMO);
    expect(hex('histogram')).toBe('sva-hex');
    expect(hex('patient-journey-explorer')).toBe('sva-hex sva-hollow');
    expect(hex('data')).toBe('sva-hex sva-spectrum');
    // The group carries the domain, which is what gives a ready hex its hue.
    expect(item(root, 'histogram').closest('.sva-group').className).toBe(
      'sva-group sva-domain-bds'
    );
    expect(item(root, 'qt-explorer').closest('.sva-group').className).toBe(
      'sva-group sva-domain-eg'
    );
    // Missing reads red, and the words still say what.
    app.state.mappings.eg.columns.ARM = { value: null, source: null };
    app.refresh();
    expect(hex('qt-explorer')).toBe('sva-hex sva-alarm');
    expect(tag(root, 'qt-explorer')).toBe('1 missing');
  });
});
