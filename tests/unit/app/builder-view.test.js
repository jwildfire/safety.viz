// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { BUILDER_TAB_ID, builderTab } from '../../../src/app/builder-view.js';
import {
  BUILDER_TAB_ID as PAGE_TAB_ID,
  builderFiles,
  builderTabExpression,
  builderTabOptions
} from '../../../scripts/builder-lib.mjs';
import { STUDY_BUILDER, readRecord, verifyVendored } from '../../../scripts/vendor-lib.mjs';

// The Build a study tab on the page: a tab a library brings through the
// second-library seam, which is study.builder's widget. The tab loads
// study.builder's script when it is first opened, hands it the app's own way
// of making a connection to R, keeps the one widget across the page's
// redraws, and loads the study the reader hands over. study.builder is a
// stand-in here; the real one has its own tests in its own repository, and a
// run in a browser holds the two together.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OPTIONS = builderTabOptions();
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
    const mounted = { target, options };
    mounts.push(mounted);
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

function mounted(view) {
  document.body.innerHTML = '<div id="app"></div>';
  app = mountApp('#app', {
    charts: {},
    manifest,
    libraries: [{ name: 'study.builder', view }]
  });
  app.select(BUILDER_TAB_ID);
  return app;
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const createConnection = () => ({ run: async () => ({ status: 'ok', value: {} }) });

describe('the Build a study tab', () => {
  it('is a tab of its own; it fetches study.builder’s script from the page’s own address when first opened, and nothing before', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    const view = builderTab({ createConnection, ...OPTIONS });
    app = mountApp('#app', {
      charts: {},
      manifest,
      libraries: [{ name: 'study.builder', view }]
    });
    expect(document.querySelector('[data-tab="build"]').textContent).toContain('Build a study');
    expect(document.head.querySelector('script')).toBeNull();
    app.select(BUILDER_TAB_ID);
    const script = document.head.querySelector('script');
    expect(script.getAttribute('src')).toBe('./study.builder/study.builder.js');
    expect(document.querySelector('.sva-build').textContent).toContain('Loading the builder');
    // The script defines the global, and the widget is mounted.
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    script.onload();
    await settle();
    expect(builder.mount).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.sva-build-widget').textContent).toBe('the widget');
  });

  it('hands the widget the app’s own connection factory, where its files and gsm’s packages are served, and its button’s words', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    mounted(builderTab({ createConnection, ...OPTIONS }));
    await settle();
    const { options } = builder.mounts[0];
    expect(options.createConnection).toBe(createConnection);
    expect(options.base).toBe('./study.builder/');
    expect(options.repository).toBe('./r-wasm');
    expect(options.useLabel).toBe('Load into the demo');
    expect(typeof options.onStudy).toBe('function');
  });

  it('keeps the one widget across the page’s redraws and a visit to another tab', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const handle = mounted(builderTab({ createConnection, ...OPTIONS }));
    await settle();
    const widget = document.querySelector('.sva-build-widget');
    handle.select('data');
    expect(document.querySelector('.sva-build-widget')).toBeNull();
    handle.select(BUILDER_TAB_ID);
    handle.redrawView(BUILDER_TAB_ID);
    expect(document.querySelector('.sva-build-widget')).toBe(widget);
    expect(builder.mount).toHaveBeenCalledTimes(1);
  });

  it('loads the study the reader hands over: raw files kept as they are, standard files placed, and offers the RBQM tab', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const view = builderTab({ createConnection, ...OPTIONS });
    const handle = mounted(view);
    await settle();
    expect(view.tag()).toBe('');
    builder.mounts[0].options.onStudy(STUDY);
    expect(handle.state.raw.map((file) => file.name)).toEqual(['Raw_SUBJ.csv', 'Raw_SITE.csv']);
    expect(Object.keys(handle.state.files).sort()).toEqual(['bds', 'subject']);
    expect(handle.state.files.bds.name).toBe('advs.csv');
    expect(document.querySelector('[data-tab="build"]').textContent).toContain('loaded');
    const done = document.querySelector('.sva-build-done');
    expect(done.textContent).toContain('BUILT-001 is loaded into the demo.');
    // The widget is still there, under the line that says what was loaded.
    expect(document.querySelector('.sva-build-widget')).not.toBeNull();
    const select = vi.spyOn(handle, 'select');
    done.querySelector('.sva-build-open').click();
    expect(select).toHaveBeenCalledWith('rbqm');
  });

  it('says so when study.builder’s script does not load, and tries again when the tab is opened again', async () => {
    const view = builderTab({ createConnection, ...OPTIONS });
    const handle = mounted(view);
    document.head.querySelector('script').onerror();
    await settle();
    expect(document.querySelector('.sva-build [role="alert"]').textContent).toBe(
      'The builder cannot be shown: ./study.builder/study.builder.js did not load on this page.'
    );
    expect(view.state().mounted).toBe(false);
    handle.select('data');
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('offers no builder on a page that cannot start R, and says why', () => {
    mounted(builderTab({ unavailable: 'Building a study needs R, and this file cannot start R.' }));
    expect(document.querySelector('.sva-build-widget')).toBeNull();
    expect(document.head.querySelector('script')).toBeNull();
    expect(document.querySelector('.sva-build').textContent).toContain(
      'Building a study needs R, and this file cannot start R.'
    );
  });
});

describe('the page and the tab agree', () => {
  it('on the tab’s address, which site/config.json lists', () => {
    expect(PAGE_TAB_ID).toBe(BUILDER_TAB_ID);
    const config = JSON.parse(readFileSync(path.join(root, 'site/config.json'), 'utf8'));
    expect(config.appTabs.map((tab) => tab.id)).toContain(BUILDER_TAB_ID);
  });

  it('on what is served: every copied file, in a folder of its own beside the app', () => {
    const files = builderFiles();
    expect(files[0]).toEqual({
      file: 'site/vendor/study.builder/study.builder.js',
      served: 'study.builder/study.builder.js'
    });
    expect(files.map((entry) => entry.served)).toContain('study.builder/r/builder.R');
    expect(
      files.filter((entry) => /study\.builder\/vendor\/gsm\.datasim\/R\/.+\.R$/.test(entry.served))
    ).toHaveLength(41);
    for (const entry of files)
      expect(existsSync(path.join(root, entry.file)), entry.file).toBe(true);
  });

  it('on the view the page mounts: the app’s own connection, or a sentence where R cannot start', () => {
    expect(builderTabExpression()).toBe(
      "{ name: 'study.builder', view: SafetyVizApp.builderTab({ createConnection: " +
        `SafetyVizApp.createRConnection, ...${JSON.stringify(OPTIONS)} }) }`
    );
    expect(OPTIONS).toEqual({
      library: { url: './study.builder/study.builder.js', global: 'StudyBuilder' },
      base: './study.builder/',
      repository: './r-wasm',
      open: 'rbqm'
    });
    expect(builderTabExpression({ r: 'unavailable' })).toContain(
      '"unavailable":"Building a study needs R'
    );
  });
});

describe('the copy of study.builder', () => {
  it('matches its record, which names where it was copied from', () => {
    const directory = path.join(root, STUDY_BUILDER.directory);
    expect(verifyVendored(directory)).toEqual([]);
    const record = readRecord(directory);
    expect(record.repository).toBe(STUDY_BUILDER.repository);
    expect(record.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(record.tag).toBe(STUDY_BUILDER.tag);
    expect(record.version).toBe(STUDY_BUILDER.tag.replace(/^v/, ''));
    expect(record.files.map((entry) => entry.file).sort()).toEqual(
      STUDY_BUILDER.files.map((entry) => entry.file).sort()
    );
  });

  it('defines the global the tab looks for, and carries the functions the tab calls', () => {
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
