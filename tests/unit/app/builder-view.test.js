// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { BUILDER_SOURCE_ID, builderSource } from '../../../src/app/builder-view.js';
import {
  BUILDER_SOURCE_ID as PAGE_SOURCE_ID,
  builderFiles,
  builderSourceExpression,
  builderSourceOptions
} from '../../../scripts/builder-lib.mjs';
import { STUDY_BUILDER, readRecord, verifyVendored } from '../../../scripts/vendor-lib.mjs';

// Build a study on the page: a way to load data that a library brings through
// the second-library seam, which is study.builder's widget. The data view
// offers it in step one, beside the file picker, and draws it in place of the
// loaded files while it is open. It loads study.builder's script when it is
// first opened, hands it the app's own way of making a connection to R, keeps
// the one widget across the page's redraws, and loads the study the reader
// hands over. study.builder is a stand-in here; the real one has its own tests
// in its own repository, and a run in a browser holds the two together.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OPTIONS = builderSourceOptions();
const STUDY = {
  id: 'BUILT-001',
  said: 'BUILT-001 is a simulated Phase 2 Oncology study.',
  files: () => ({
    raw: [
      { name: 'Raw_SUBJ.csv', text: 'studyid,subjid,invid\nBUILT-001,S1,SITE1\n' },
      { name: 'Raw_SITE.csv', text: 'studyid,invid\nBUILT-001,SITE1\n' }
    ],
    standard: [
      {
        name: 'adsl.csv',
        text: 'USUBJID,ARM,SITEID,SEX,RACE,EOSDY\nS1,All participants,SITE1,F,Other,90\n'
      },
      {
        name: 'advs.csv',
        text:
          'USUBJID,ARM,SITEID,SEX,RACE,VISIT,VISITNUM,TEST,STRESU,STRESN,DY\n' +
          'S1,All participants,SITE1,F,Other,Screening,0,Pulse,beats/min,70,-3\n'
      }
    ]
  })
};

/** A study.builder that records how it was mounted and draws one line. */
function fakeBuilder() {
  const mounts = [];
  const mount = vi.fn((target, options) => {
    target.append(Object.assign(document.createElement('p'), { textContent: 'the widget' }));
    mounts.push({ target, options });
    return { destroy: vi.fn() };
  });
  return { mount, mounts };
}

let app = null;
afterEach(() => {
  if (app) app.destroy();
  app = null;
  document.body.innerHTML = '';
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  delete globalThis.StudyBuilder;
});

/** The app with the source handed in; the source is not yet open. */
function mounted(source) {
  document.body.innerHTML = '<div id="app"></div>';
  app = mountApp('#app', {
    charts: {},
    manifest,
    libraries: [{ name: 'study.builder', source }]
  });
  return app;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const createConnection = () => ({ run: async () => ({ status: 'ok', value: {} }) });
const button = () => document.querySelector('[data-action="source-build"]');

describe('Build a study, on the data view', () => {
  it('is a way to load data in step one, not a tab; it fetches study.builder’s script when first opened, and nothing before', async () => {
    mounted(builderSource({ createConnection, ...OPTIONS }));
    expect(document.querySelector('[data-tab="build"]')).toBeNull();
    expect(button().textContent).toBe('Build a study');
    expect(button().getAttribute('aria-pressed')).toBe('false');
    expect(document.head.querySelector('script')).toBeNull();
    button().click();
    expect(button().getAttribute('aria-pressed')).toBe('true');
    const script = document.head.querySelector('script');
    expect(script.getAttribute('src')).toBe('./study.builder/study.builder.js');
    const pane = document.querySelector('.sva-source[data-source="build"]');
    expect(pane.querySelector('.sva-source-title').textContent).toBe('Build a study');
    expect(pane.textContent).toContain('Loading the builder');
    // The script defines the global, and the widget is mounted.
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    script.onload();
    await settle();
    expect(builder.mount).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.sva-source .sva-build-widget').textContent).toBe('the widget');
  });

  it('hands the widget the app’s own connection factory, where its files and gsm’s packages are served, and its button’s words', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    mounted(builderSource({ createConnection, ...OPTIONS })).openSource(BUILDER_SOURCE_ID);
    await settle();
    const { options } = builder.mounts[0];
    expect(options.createConnection).toBe(createConnection);
    expect(options.base).toBe('./study.builder/');
    expect(options.repository).toBe('./r-wasm');
    expect(options.useLabel).toBe('Load into the demo');
    expect(typeof options.onStudy).toBe('function');
  });

  it('keeps the one widget across a close, a reopening and the page’s redraws', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const handle = mounted(builderSource({ createConnection, ...OPTIONS }));
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    const widget = document.querySelector('.sva-build-widget');
    document.querySelector('[data-action="close-source"]').click();
    expect(document.querySelector('.sva-source')).toBeNull();
    expect(handle.state.source).toBeNull();
    handle.openSource(BUILDER_SOURCE_ID);
    expect(handle.state.selected).toBe('data');
    handle.redrawView('data');
    expect(document.querySelector('.sva-build-widget')).toBe(widget);
    expect(builder.mount).toHaveBeenCalledTimes(1);
  });

  it('loads the study the reader hands over: raw files kept as they are, standard files placed, and the source closed on the loaded files', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const source = builderSource({ createConnection, ...OPTIONS });
    const handle = mounted(source);
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    expect(source.state().loaded).toBeNull();
    builder.mounts[0].options.onStudy(STUDY);
    expect(handle.state.raw.map((file) => file.name)).toEqual(['Raw_SUBJ.csv', 'Raw_SITE.csv']);
    expect(Object.keys(handle.state.files).sort()).toEqual(['bds', 'subject']);
    expect(handle.state.files.bds.name).toBe('advs.csv');
    expect(source.state().loaded).toEqual({ id: STUDY.id, said: STUDY.said });
    expect(handle.state.source).toBeNull();
    expect(document.querySelector('.sva-source')).toBeNull();
    // Every loaded file, raw or placed, has its details on its card.
    expect(
      [...document.querySelectorAll('.sva-file-details')].map((item) => item.dataset.details).sort()
    ).toEqual(['Raw_SITE.csv', 'Raw_SUBJ.csv', 'adsl.csv', 'advs.csv']);
  });

  it('leaves a study’s efficacy scores out of the files it places, so they do not take the labs’ place', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const source = builderSource({ createConnection, ...OPTIONS });
    const handle = mounted(source);
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    const scores = {
      name: 'adqs.csv',
      text:
        'USUBJID,ARM,VISIT,VISITNUM,TEST,STRESN,BASE,CHG,ABLFL,DY\n' +
        'S1,All participants,Baseline,1,ADAS-Cog (11),24,24,0,Y,1\n'
    };
    builder.mounts[0].options.onStudy({
      ...STUDY,
      standard: [
        { id: 'subject', name: 'adsl.csv' },
        { id: 'bds', name: 'advs.csv' },
        { id: 'qs', name: 'adqs.csv' }
      ],
      files: () => ({ raw: STUDY.files().raw, standard: [...STUDY.files().standard, scores] })
    });
    expect(handle.state.files.bds.name).toBe('advs.csv');
    expect(
      [...document.querySelectorAll('.sva-file-details')].map((item) => item.dataset.details)
    ).not.toContain('adqs.csv');
  });

  it('is closed by a reset', async () => {
    globalThis.StudyBuilder = fakeBuilder();
    const handle = mounted(builderSource({ createConnection, ...OPTIONS }));
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    handle.reset();
    expect(handle.state.source).toBeNull();
    expect(document.querySelector('.sva-source')).toBeNull();
  });

  it('says so when study.builder’s script does not load, and tries again when it is opened again', async () => {
    const source = builderSource({ createConnection, ...OPTIONS });
    const handle = mounted(source);
    handle.openSource(BUILDER_SOURCE_ID);
    document.head.querySelector('script').onerror();
    await settle();
    expect(document.querySelector('.sva-source [role="alert"]').textContent).toBe(
      'The builder cannot be shown: ./study.builder/study.builder.js did not load on this page.'
    );
    expect(source.state().mounted).toBe(false);
    handle.openSource(null);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('offers no builder on a page that cannot start R, and says why', () => {
    mounted(
      builderSource({ unavailable: 'Building a study needs R, and this file cannot start R.' })
    ).openSource(BUILDER_SOURCE_ID);
    expect(document.querySelector('.sva-build-widget')).toBeNull();
    expect(document.head.querySelector('script')).toBeNull();
    expect(document.querySelector('.sva-source').textContent).toContain(
      'Building a study needs R, and this file cannot start R.'
    );
  });
});

describe('a source a library brings', () => {
  it('is left out when it has no id or an id already used, and brings no tab', () => {
    const render = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    document.body.innerHTML = '<div id="app"></div>';
    app = mountApp('#app', {
      charts: {},
      manifest,
      libraries: [
        { name: 'one', source: { id: 'one', label: 'One', about: 'The first.', render } },
        { name: 'again', source: { id: 'one', label: 'Again', render } },
        { name: 'none', source: { label: 'No id', render } }
      ]
    });
    expect(app.sources).toEqual([{ id: 'one', label: 'One', about: 'The first.' }]);
    expect(document.querySelectorAll('[data-action^="source-"]')).toHaveLength(1);
    expect(document.querySelector('[data-action="source-one"]').title).toBe('The first.');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('says so in its place when it throws, and the page stands', () => {
    document.body.innerHTML = '<div id="app"></div>';
    app = mountApp('#app', {
      charts: {},
      manifest,
      libraries: [
        {
          name: 'broken',
          source: {
            id: 'broken',
            label: 'Broken',
            render() {
              throw new Error('no good');
            }
          }
        }
      ]
    });
    app.openSource('broken');
    expect(document.querySelector('.sva-source .sva-problem').textContent).toBe(
      'Did not draw. no good'
    );
    app.openSource('not one');
    expect(app.state.source).toBeNull();
  });
});

describe('the page and the source agree', () => {
  it('on the source’s id, and that it is no tab of site/config.json', () => {
    expect(PAGE_SOURCE_ID).toBe(BUILDER_SOURCE_ID);
    const config = JSON.parse(readFileSync(path.join(root, 'site/config.json'), 'utf8'));
    expect(config.appTabs.map((tab) => tab.id)).not.toContain(BUILDER_SOURCE_ID);
  });

  it('on what is served: every copied file, in a folder of its own beside the app', () => {
    const files = builderFiles();
    expect(files[0]).toEqual({
      file: 'site/vendor/study.builder/study.builder.js',
      served: 'study.builder/study.builder.js'
    });
    const served = files.map((entry) => entry.served);
    expect(served).toContain('study.builder/r/builder.R');
    expect(served).toContain('study.builder/workflows/adam/ADSL.yaml');
    expect(served).toContain(
      'study.builder/vendor/gsm.reporting/workflow/3_reporting/Results.yaml'
    );
    expect(
      files.filter((entry) => /study\.builder\/vendor\/gsm\.datasim\/R\/.+\.R$/.test(entry.served))
    ).toHaveLength(43);
    expect(
      files.filter((entry) =>
        /study\.builder\/vendor\/gsm\.kri\/workflow\/.+\.yaml$/.test(entry.served)
      )
    ).toHaveLength(8);
    for (const entry of files)
      expect(existsSync(path.join(root, entry.file)), entry.file).toBe(true);
  });

  it('on the source the page mounts, with the app’s own connection', () => {
    expect(builderSourceExpression()).toBe(
      "{ name: 'study.builder', source: SafetyVizApp.builderSource({ createConnection: " +
        `SafetyVizApp.createRConnection, ...${JSON.stringify(OPTIONS)} }) }`
    );
    expect(OPTIONS).toEqual({
      library: { url: './study.builder/study.builder.js', global: 'StudyBuilder' },
      base: './study.builder/',
      repository: './r-wasm'
    });
  });
});

describe('the copy of study.builder', () => {
  it('matches its record, which names where it was copied from', () => {
    const directory = path.join(root, STUDY_BUILDER.directory);
    expect(verifyVendored(directory)).toEqual([]);
    const record = readRecord(directory);
    expect(record.repository).toBe(STUDY_BUILDER.repository);
    expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
    // A copy from a release names its tag, the one scripts/vendor-lib.mjs
    // names; a copy from the head of main names none, and says why.
    if (record.tag !== undefined) {
      expect(record.tag).toBe(STUDY_BUILDER.tag);
      expect(record.version).toBe(STUDY_BUILDER.tag.replace(/^v/, ''));
    } else {
      expect(record.ref).toBe('main');
      expect(record.merged_to_dev).toBe(false);
      expect(record.note).toMatch(/v0\.2\.0/);
    }
    expect(record.files.map((entry) => entry.file).sort()).toEqual(
      STUDY_BUILDER.files.map((entry) => entry.file).sort()
    );
  });

  it('defines the global the source looks for, and carries the options it is mounted with', () => {
    const bundle = readFileSync(
      path.join(root, STUDY_BUILDER.directory, 'study.builder.js'),
      'utf8'
    );
    expect(bundle).toMatch(new RegExp(`var ${STUDY_BUILDER.global}=`));
    for (const word of ['createConnection', 'repository', 'useLabel', 'onStudy']) {
      expect(bundle, word).toContain(word);
    }
  });
});
