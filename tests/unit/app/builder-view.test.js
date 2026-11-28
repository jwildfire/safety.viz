// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import {
  BUILDER_SOURCE_ID,
  SIMULATED_RUNG_ID,
  builderSource,
  protocolCredit,
  protocolCredits
} from '../../../src/app/builder-view.js';
import {
  BUILDER_SOURCE_ID as PAGE_SOURCE_ID,
  builderFiles,
  builderSourceExpression,
  builderSourceOptions
} from '../../../scripts/builder-lib.mjs';
import { STUDY_BUILDER, readRecord, verifyVendored } from '../../../scripts/vendor-lib.mjs';
import { chartTiers } from '../../../scripts/app-libraries.mjs';
import { tierProblems } from '../../../scripts/tiers.mjs';

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
  it('is a way to load data in step one, not a tab; on a page with no study chip it fetches study.builder’s script when first opened, and nothing before', async () => {
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

  it('tells the widget to leave the RBQM and Safety views out of the study it shows once built, since the app has tabs of its own for both', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    mounted(builderSource({ createConnection, ...OPTIONS })).openSource(BUILDER_SOURCE_ID);
    await settle();
    expect(builder.mounts[0].options.operations).toBe(false);
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

  it('APP-LOAD-029: a study handed over replaces the one handed over before it: the raw files and the placed files the next study does not have are gone, and a file of the same name has the next study’s rows (#405)', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const handle = mounted(builderSource({ createConnection, ...OPTIONS }));
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    builder.mounts[0].options.onStudy(STUDY);
    // The next study was built with vital signs turned off, and has two participants.
    builder.mounts[0].options.onStudy({
      id: 'BUILT-002',
      said: 'BUILT-002 is a simulated Phase 1 Oncology study.',
      files: () => ({
        raw: [{ name: 'Raw_SUBJ.csv', text: 'studyid,subjid,invid\nBUILT-002,S1,SITE1\n' }],
        standard: [
          {
            name: 'adsl.csv',
            text:
              'USUBJID,ARM,SITEID,SEX,RACE,EOSDY\n' +
              'S1,All participants,SITE1,F,Other,90\nS2,All participants,SITE1,M,Other,90\n'
          }
        ]
      })
    });
    expect(handle.state.raw.map((file) => file.name)).toEqual(['Raw_SUBJ.csv']);
    expect(Object.keys(handle.state.files)).toEqual(['subject']);
    expect(handle.state.files.subject.rows).toHaveLength(2);
    expect(handle.state.unplaced).toEqual([]);
    expect(handle.state.named.name).toBe('BUILT-002');
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

  const scripts = () => [...document.head.querySelectorAll('script')];
  const alertSaid = () => {
    const box = document.querySelector('.sva-source [role="alert"]');
    return box ? box.textContent : null;
  };
  const NOT_LOADED =
    'The builder cannot be shown: ./study.builder/study.builder.js did not load on this page.';

  it('says so when study.builder’s script does not load, and tries again when it is opened again', async () => {
    const source = builderSource({ createConnection, ...OPTIONS });
    const handle = mounted(source);
    handle.openSource(BUILDER_SOURCE_ID);
    const [first] = scripts();
    first.onerror();
    await settle();
    expect(alertSaid()).toBe(NOT_LOADED);
    expect(source.state().mounted).toBe(false);
    // The script that did not load is taken off the page, and nothing asks
    // for another while the source stays as it is, or once it is closed.
    expect(scripts()).toHaveLength(0);
    handle.redrawView('data');
    handle.openSource(null);
    expect(scripts()).toHaveLength(0);
    // Opened again, it asks for the script again (#408).
    handle.openSource(BUILDER_SOURCE_ID);
    const [again] = scripts();
    expect(scripts()).toHaveLength(1);
    expect(again).not.toBe(first);
    expect(again.getAttribute('src')).toBe('./study.builder/study.builder.js');
    expect(alertSaid()).toBeNull();
    expect(document.querySelector('.sva-source').textContent).toContain('Loading the builder');
    // It fails again: the page says so again, after one request.
    again.onerror();
    await settle();
    expect(alertSaid()).toBe(NOT_LOADED);
    expect(scripts()).toHaveLength(0);
    // The third time the script loads, and the builder is shown.
    handle.openSource(null);
    handle.openSource(BUILDER_SOURCE_ID);
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    scripts()[0].onload();
    await settle();
    expect(alertSaid()).toBeNull();
    expect(builder.mount).toHaveBeenCalledTimes(1);
    expect(source.state().mounted).toBe(true);
    expect(document.querySelector('.sva-source .sva-build-widget').textContent).toBe('the widget');
  });

  /** The app with the study chip, whose list asks the source what studies it has as the page opens. */
  function withChip(source) {
    document.body.innerHTML = '<div id="app"></div>';
    app = mountApp('#app', {
      charts: {},
      manifest,
      portfolio: true,
      libraries: [{ name: 'study.builder', source }]
    });
    return app;
  }

  it('APP-LIB-038: on a page with the study chip, where study.builder’s script is asked for as the page opens, a script that did not load then is asked for again when Build a study is first opened (#408)', async () => {
    const source = builderSource({ createConnection, ...OPTIONS });
    const handle = withChip(source);
    const [first] = scripts();
    expect(first.getAttribute('src')).toBe('./study.builder/study.builder.js');
    first.onerror();
    await settle();
    expect(scripts()).toHaveLength(0);
    expect(handle.portfolio().problem).toContain('studies could not be listed');
    handle.openSource(BUILDER_SOURCE_ID);
    expect(scripts()).toHaveLength(1);
    expect(alertSaid()).toBeNull();
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    scripts()[0].onload();
    await settle();
    expect(builder.mount).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.sva-source .sva-build-widget').textContent).toBe('the widget');
  });

  it('APP-STUDY-010: after study.builder’s script did not load as the page opened, the list of its studies is looked for again when Build a study is opened: once the script has loaded the chip’s list names the ready-made and saved studies, the sentence that they could not be listed is gone, and a study built then is kept in this browser; the sentence ends in one full stop (#427)', async () => {
    const source = builderSource({ createConnection, ...OPTIONS });
    const handle = withChip(source);
    scripts()[0].onerror();
    await settle();
    expect(handle.portfolio()).toMatchObject({
      studies: [],
      busy: '',
      problem:
        'study.builder’s studies could not be listed: ./study.builder/study.builder.js did not load on this page.'
    });
    // Drawn again and again, the page asks for nothing: one failure is one request.
    handle.select('studies');
    handle.retag();
    expect(scripts()).toHaveLength(0);
    // Build a study is opened: the script is asked for once, for the builder and the list both.
    const saved = [];
    const save = vi.fn(async (study) => {
      saved.push({
        kind: 'study',
        id: `study:${study.id}`,
        name: study.id,
        size: '10 participants',
        saved: '2026-11-27T00:00:00Z'
      });
    });
    const builder = {
      ...fakeBuilder(),
      fetchPresets: vi.fn(async () => [
        {
          id: 'ready',
          name: 'Ready-made',
          study: './study.builder/presets/ready.study.json.gz',
          settings: { name: 'READY', participants: 40, sites: 4 }
        }
      ]),
      createShelf: () => ({ available: true, list: async () => [...saved], save }),
      savedOf: (study) => ({ id: study.id })
    };
    handle.openSource(BUILDER_SOURCE_ID);
    expect(scripts()).toHaveLength(1);
    expect(handle.portfolio().busy).toBe('Looking for study.builder’s studies…');
    globalThis.StudyBuilder = builder;
    scripts()[0].onload();
    await settle();
    expect(builder.fetchPresets).toHaveBeenCalledTimes(1);
    expect(handle.portfolio()).toMatchObject({ busy: '', problem: '' });
    expect(handle.portfolio().studies.map((entry) => entry.id)).toEqual(['preset:ready']);
    // The Studies view lists it, and no longer says the studies could not be listed.
    handle.select('studies');
    expect(document.querySelector('.sva-studies-row[data-study="preset:ready"]')).not.toBeNull();
    expect(document.querySelector('.sva-studies [role="alert"]')).toBeNull();
    // A study built now is kept in this browser, and listed.
    handle.openSource(BUILDER_SOURCE_ID);
    builder.mounts[0].options.onStudy(STUDY);
    await settle();
    expect(save).toHaveBeenCalledWith({ id: 'BUILT-001' });
    expect(handle.portfolio().studies.map((entry) => entry.id)).toEqual([
      'saved:study:BUILT-001',
      'preset:ready'
    ]);
  });

  it('APP-STUDY-010: a list of ready-made studies that cannot be fetched leaves the saved studies listed and the shelf in use, says which list could not be read, and is asked for again when Build a study is opened (#427)', async () => {
    let failing = true;
    const fetchPresets = vi.fn(async () => {
      if (failing)
        throw new Error(
          'The list of ready-made studies could not be fetched: the page answered 503.'
        );
      return [];
    });
    globalThis.StudyBuilder = {
      ...fakeBuilder(),
      fetchPresets,
      createShelf: () => ({
        available: true,
        list: async () => [
          {
            kind: 'study',
            id: 'MINE',
            name: 'MINE',
            size: '10 participants',
            saved: '2026-11-27T00:00:00Z'
          }
        ]
      })
    };
    const handle = withChip(builderSource({ createConnection, ...OPTIONS }));
    await settle();
    expect(handle.portfolio().problem).toBe(
      'study.builder’s ready-made studies could not be listed: The list of ready-made studies could not be fetched: the page answered 503.'
    );
    expect(handle.portfolio().studies.map((entry) => entry.id)).toEqual(['saved:MINE']);
    handle.retag();
    await settle();
    expect(fetchPresets).toHaveBeenCalledTimes(1);
    failing = false;
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    expect(fetchPresets).toHaveBeenCalledTimes(2);
    expect(handle.portfolio().problem).toBe('');
  });

  it('APP-LIB-040: on a page with the study chip, study.builder’s script is fetched as the page opens, for the chip’s list, then its list of ready-made studies and the studies saved in this browser, and no study until the reader opens one (#408)', async () => {
    const source = builderSource({ createConnection, ...OPTIONS });
    const fetchPresets = vi.fn(async () => [
      {
        id: 'ready',
        name: 'Ready-made',
        study: './study.builder/presets/ready.study.json.gz',
        settings: { name: 'READY', participants: 40, sites: 4 }
      }
    ]);
    const openPreset = vi.fn(async () => ({ study: { ...STUDY, id: 'READY' } }));
    const list = vi.fn(async () => []);
    const handle = withChip(source);
    // As the page opens, with nothing pressed: the script, and nothing else yet.
    expect(scripts().map((script) => script.getAttribute('src'))).toEqual([
      './study.builder/study.builder.js'
    ]);
    expect(handle.portfolio().busy).toBe('Looking for study.builder’s studies…');
    globalThis.StudyBuilder = {
      ...fakeBuilder(),
      fetchPresets,
      openPreset,
      createShelf: () => ({ available: true, list })
    };
    scripts()[0].onload();
    await settle();
    // Once it has loaded: the list of ready-made studies, from beside the script, and the shelf.
    expect(fetchPresets.mock.calls).toEqual([['./study.builder/presets/index.json']]);
    expect(list).toHaveBeenCalledTimes(1);
    const { studies, busy } = handle.portfolio();
    expect(busy).toBe('');
    expect(studies.map((entry) => entry.id)).toEqual(['preset:ready']);
    // The widget is not mounted, and no study is fetched, until the reader asks.
    expect(source.state().mounted).toBe(false);
    expect(openPreset).not.toHaveBeenCalled();
    // However many times the page is drawn, each is asked for once.
    handle.select('data');
    handle.retag();
    await settle();
    expect(scripts()).toHaveLength(1);
    expect(fetchPresets).toHaveBeenCalledTimes(1);
    studies[0].open();
    await settle();
    expect(openPreset).toHaveBeenCalledTimes(1);
    expect(handle.state.named.name).toBe('READY');
  });

  // The simulator, named for what it is (#423). study.builder v0.5.1 says its
  // simulator is a modified copy of gsm.datasim; the app's own words say the same.
  const ATTRIBUTION =
    'Content based on DDF-RA (GitHub), https://github.com/cdisc-org/DDF-RA, used under the CC-BY-4.0 licence.';
  const CHANGES = 'Changed from CDISC’s file: cut down to what a simulated study follows.';
  const FED = [
    { id: 'preset:one', kind: 'settings', name: 'A study', license: null, attribution: null },
    ...['LZZT', 'SIMPLE'].map((name) => ({
      id: `protocol:${name}`,
      kind: 'protocol',
      name,
      license: 'CC-BY-4.0',
      attribution: `${ATTRIBUTION} ${CHANGES}`
    }))
  ];
  const copied = (file) => readFileSync(path.join(root, STUDY_BUILDER.directory, file));

  it('APP-LIB-041: the app’s own words name the simulator as a modified copy of gsm.datasim, with the version the copy’s DESCRIPTION states: the source’s description, and Made by on a study’s card (#423)', async () => {
    const description = copied('vendor/gsm.datasim/DESCRIPTION').toString('utf8');
    const version = /^Version: (.+)$/m.exec(description)[1];
    expect(description).toMatch(/^Title: .*\(a Modified Copy of 'gsm\.datasim' 2\.1\.0\)$/m);
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const source = builderSource({ createConnection, ...OPTIONS });
    expect(source.about).toBe(
      `Simulate a study with a modified copy of gsm.datasim ${version}, in this browser.`
    );
    const handle = mounted(source);
    expect(button().title).toBe(source.about);
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    // What a built or opened study carries as `simulator` is that version.
    builder.mounts[0].options.onStudy({ ...STUDY, simulator: version });
    expect(handle.state.named.facts).toContainEqual({
      label: 'Made by',
      value: 'a modified copy of gsm.datasim 2.1.0'
    });
    // Nowhere in the app's source is gsm.datasim named without those words.
    const directory = path.join(root, 'src/app');
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.js'))) {
      const text = readFileSync(path.join(directory, file), 'utf8').replace(
        /\s*\n\s*(\/\/)?\s*/g,
        ' '
      );
      const named = text.match(/gsm\.datasim/g) || [];
      const said = text.match(/modified copy of gsm\.datasim/g) || [];
      expect(said.length, file).toBe(named.length);
    }
  });

  it('APP-LIB-042: under the builder the page credits the example protocols in the studies feed’s own words, its licence and attribution; the feed is asked for once, when the builder is first shown, and not before (#423)', async () => {
    const listStudies = vi.fn(async () => FED.filter((entry) => entry.kind === 'protocol'));
    const builder = { ...fakeBuilder(), listStudies };
    globalThis.StudyBuilder = builder;
    const handle = mounted(builderSource({ createConnection, ...OPTIONS }));
    expect(listStudies).not.toHaveBeenCalled();
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    expect(listStudies.mock.calls).toEqual([
      ['./study.builder/studies/index.json', { kinds: ['protocol'] }]
    ]);
    const credit = () => document.querySelector('.sva-build .sva-build-credit');
    expect(credit().textContent).toBe(
      `The example protocols, CC-BY-4.0: ${ATTRIBUTION} ${CHANGES}`
    );
    // It is under the widget, and is still there, asked for once, after a close and a redraw.
    expect(credit().previousElementSibling).toBe(document.querySelector('.sva-build-widget'));
    document.querySelector('[data-action="close-source"]').click();
    handle.openSource(BUILDER_SOURCE_ID);
    handle.redrawView('data');
    await settle();
    expect(credit().textContent).toContain(ATTRIBUTION);
    expect(listStudies).toHaveBeenCalledTimes(1);
  });

  it('APP-LIB-042: a feed that cannot be read is said under the builder, and a study.builder with no feed draws no line; protocols of differing attribution are credited apart, by name (#423)', async () => {
    globalThis.StudyBuilder = {
      ...fakeBuilder(),
      listStudies: async () => {
        throw new Error('The list of studies could not be fetched: the page answered 404.');
      }
    };
    mounted(builderSource({ createConnection, ...OPTIONS })).openSource(BUILDER_SOURCE_ID);
    await settle();
    expect(document.querySelector('.sva-build-credit').textContent).toBe(
      'The example protocols’ attribution could not be read: The list of studies could not be fetched: the page answered 404.'
    );
    app.destroy();
    globalThis.StudyBuilder = fakeBuilder();
    mounted(builderSource({ createConnection, ...OPTIONS })).openSource(BUILDER_SOURCE_ID);
    await settle();
    expect(document.querySelector('.sva-build-widget')).not.toBeNull();
    expect(document.querySelector('.sva-build-credit')).toBeNull();
    // Entries that are not protocols, and protocols that name no attribution, are credited nothing.
    expect(protocolCredits(FED)).toEqual([
      `The example protocols, CC-BY-4.0: ${ATTRIBUTION} ${CHANGES}`
    ]);
    expect(protocolCredits([FED[0]])).toEqual([]);
    expect(protocolCredits(null)).toEqual([]);
    expect(
      protocolCredits([FED[1], { ...FED[2], license: 'CC0-1.0', attribution: 'Another’s.' }])
    ).toEqual([
      `Example protocols (LZZT), CC-BY-4.0: ${ATTRIBUTION} ${CHANGES}`,
      'Example protocols (SIMPLE), CC0-1.0: Another’s.'
    ]);
  });

  it('APP-LIB-042: where the widget says an attribution itself, under its list of ready-made protocols or under a schedule, the app’s line is off the page, so the attribution is there once; the line is back under the widget when the widget shows none; the copy of study.builder marks both of its own as the app looks for them (#428)', async () => {
    const listStudies = vi.fn(async () => FED.filter((entry) => entry.kind === 'protocol'));
    // A widget that draws as study.builder v0.5.2 does: a line of its own,
    // marked, in a form it draws again as the reader works in it.
    let target = null;
    const draw = (mark) => {
      target.replaceChildren(
        Object.assign(document.createElement('p'), { textContent: 'the widget' })
      );
      if (!mark) return;
      const line = Object.assign(document.createElement('p'), { textContent: ATTRIBUTION });
      line.dataset.attribution = mark;
      target.append(line);
    };
    const mount = vi.fn((to) => {
      target = to;
      draw('ready-protocols');
      return { destroy: vi.fn() };
    });
    globalThis.StudyBuilder = { mount, listStudies };
    const handle = mounted(builderSource({ createConnection, ...OPTIONS }));
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    const credit = () => document.querySelector('.sva-build-credit');
    const said = () =>
      document.querySelector('.sva-build').textContent.split(ATTRIBUTION).length - 1;
    // The widget's list of ready-made protocols says whose they are: the app adds nothing.
    expect(listStudies).toHaveBeenCalledTimes(1);
    expect(credit()).toBeNull();
    expect(said()).toBe(1);
    // A protocol tried: the widget draws its form again, with the attribution under the schedule.
    draw('protocol');
    await settle();
    expect(credit()).toBeNull();
    expect(said()).toBe(1);
    // The page drawn again, and the builder closed and opened again: still once.
    handle.redrawView('data');
    document.querySelector('[data-action="close-source"]').click();
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    expect(credit()).toBeNull();
    expect(said()).toBe(1);
    // A view of the widget with no attribution in it: the app's line is under the widget.
    draw(null);
    await settle();
    expect(credit().textContent).toBe(
      `The example protocols, CC-BY-4.0: ${ATTRIBUTION} ${CHANGES}`
    );
    expect(credit().previousElementSibling).toBe(document.querySelector('.sva-build-widget'));
    expect(said()).toBe(1);
    // Back on the form, the widget's own is there and the app's is gone again.
    draw('ready-protocols');
    await settle();
    expect(credit()).toBeNull();
    expect(said()).toBe(1);
    expect(listStudies).toHaveBeenCalledTimes(1);
    // The copy of study.builder marks its two attributions with the attribute the app looks for.
    const bundle = copied('study.builder.js').toString('utf8');
    expect(bundle).toContain('dataset.attribution="ready-protocols"');
    expect(bundle).toContain('dataset.attribution="protocol"');
    expect(bundle).toContain(ATTRIBUTION);
  });

  it('APP-LIB-042: the copied studies feed names CDISC’s attribution and CC-BY-4.0 for each of the five example protocols, and its checksums are those of the copied protocol and ready-made study files (#423)', () => {
    const feed = JSON.parse(copied('studies/index.json').toString('utf8'));
    const sha256 = (file) => createHash('sha256').update(copied(file)).digest('hex');
    const protocols = feed.studies.filter((entry) => entry.kind === 'protocol');
    expect(protocols).toHaveLength(5);
    for (const entry of protocols) {
      expect(entry.license, entry.id).toBe('CC-BY-4.0');
      expect(entry.attribution, entry.id).toContain(ATTRIBUTION);
      expect(entry.attribution, entry.id).toContain('Changed from CDISC’s file');
      expect(sha256(entry.protocol.url.replace('../', '')), entry.id).toBe(entry.protocol.sha256);
    }
    const lines = protocolCredits(feed.studies);
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith(`The example protocols, CC-BY-4.0: ${ATTRIBUTION}`)).toBe(true);
    const built = feed.studies.filter((entry) => entry.build);
    expect(built.map((entry) => entry.id)).toEqual([
      'preset:phase1-small',
      'preset:phase2-oncology',
      'preset:cdisc-pilot-protocol'
    ]);
    for (const entry of built) {
      expect(sha256(entry.build.url.replace('../', '')), entry.id).toBe(entry.build.sha256);
    }
    // A ready-made study has the key it had in study.builder v0.5.0 and v0.5.1.
    expect(built.map((entry) => entry.build.key)).toEqual([
      'sha256:45b7142bb06f5fee9d81a90e1b34668a87653a29ba13eeedc08f1d2af2838dca',
      'sha256:001a419ded7a107c6f2ee8b932fb70578550b5830f67a134e0321f4682f488e9',
      'sha256:9e41ba70f50756281cc1d75663231303257bf61c7dcb1eed6bfc0297c5923cd1'
    ]);
  });

  it('APP-LIB-043: a study that followed a protocol names it on its card, with the attribution and the statement of change the protocol’s source carries; a study with no protocol, or a protocol that names none, has no such line (#423)', async () => {
    const protocol = {
      name: 'CDISC PILOT - LZZT',
      source: { license: 'CC-BY-4.0', attribution: ATTRIBUTION, changes: CHANGES }
    };
    expect(protocolCredit(protocol)).toBe(`${ATTRIBUTION} ${CHANGES}`);
    expect(protocolCredit({ name: 'Mine', source: { kind: 'usdm' } })).toBe('');
    expect(protocolCredit(null)).toBe('');
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const handle = withChip(builderSource({ createConnection, ...OPTIONS }));
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    const info = () => document.querySelector('[data-action="study-info"]');
    const card = () => document.querySelector('.sva-chip-card');
    builder.mounts[0].options.onStudy({ ...STUDY, id: 'FOLLOWS', protocol });
    expect(handle.state.named.facts).toContainEqual({
      label: 'Protocol',
      value: 'CDISC PILOT - LZZT',
      note: `${ATTRIBUTION} ${CHANGES}`
    });
    info().click();
    expect(card().querySelector('.sva-chip-credit').textContent).toBe(`${ATTRIBUTION} ${CHANGES}`);
    expect(card().querySelector('.sva-chip-facts').textContent).toContain(
      'ProtocolCDISC PILOT - LZZT'
    );
    // The next study follows none: the card has neither.
    handle.openSource(BUILDER_SOURCE_ID);
    builder.mounts[0].options.onStudy({ ...STUDY, id: 'PLAIN' });
    expect(handle.state.named.facts.map((fact) => fact.label)).not.toContain('Protocol');
    if (!card()) info().click();
    expect(card().querySelector('.sva-chip-credit')).toBeNull();
  });

  // What a study says of itself (#428). study.builder v0.5.1 still wrote plain
  // "gsm.datasim" into every study's own notes, crediting Gilead's simulator
  // with what only the modified copy has; v0.5.2 names the copy in each.
  it('APP-LIB-044: no sentence in the notes of the three copied ready-made studies names gsm.datasim without saying it is the modified copy, and every raw table says it was made by "gsm.datasim (modified copy)"; each study has the key it had in study.builder v0.5.0 and v0.5.1 (#428)', () => {
    // A sentence names the simulator plainly when it names gsm.datasim and
    // does not say "modified copy of gsm.datasim", or names it again as
    // anything but that or Gilead's own.
    const plainly = (sentence) => {
      const named = sentence.match(/gsm\.datasim/g) || [];
      const copy = sentence.match(/modified copy of gsm\.datasim/g) || [];
      const gileads = sentence.match(/Gilead[’']s gsm\.datasim/g) || [];
      return named.length > 0 && (copy.length === 0 || copy.length + gileads.length < named.length);
    };
    // The check fails on a sentence of v0.5.1's, and on Gilead's simulator named alone.
    expect(plainly('gsm.datasim is asked for site ids that begin SITE.')).toBe(true);
    expect(plainly('Phase and area shape the study results, by gsm.datasim’s study profile.')).toBe(
      true
    );
    expect(plainly('Gilead’s gsm.datasim writes 0X1234.')).toBe(true);
    expect(plainly('The modified copy of gsm.datasim adds them; gsm.datasim has none.')).toBe(true);
    expect(plainly('Every row is synthetic.')).toBe(false);
    const { presets } = JSON.parse(copied('presets/index.json').toString('utf8'));
    const hosted = presets.filter((preset) => preset.study);
    expect(hosted.map((preset) => preset.study)).toEqual([
      'phase1-small.study.json.gz',
      'phase2-oncology.study.json.gz',
      'cdisc-pilot-protocol.study.json.gz'
    ]);
    const keys = [];
    for (const preset of hosted) {
      const file = JSON.parse(gunzipSync(copied(`presets/${preset.study}`)).toString('utf8'));
      const { notes } = file.study;
      // Every study carries the builder's three sentences and the study profile's.
      const naming = notes.filter((note) => /gsm\.datasim/.test(note));
      expect(naming.length, preset.study).toBeGreaterThanOrEqual(4);
      expect(notes.filter(plainly), preset.study).toEqual([]);
      expect(notes.join(' '), preset.study).toContain(
        "the study results that the modified copy of gsm.datasim adds (they are not in Gilead's gsm.datasim 2.1.0)"
      );
      // Who made a raw table, in the study as it is and in every snapshot it kept.
      const stages = [file.study, ...(file.study.history || [])];
      const made = stages.flatMap((stage) =>
        stage.layers
          .filter((layer) => layer.id === 'raw')
          .flatMap((layer) => layer.tables.map((table) => table.made.workflow))
      );
      expect(made.length, preset.study).toBeGreaterThan(0);
      expect([...new Set(made)], preset.study).toEqual(['gsm.datasim (modified copy)']);
      // The same tables as before: the file's key, and the list's, are unchanged.
      expect(file.key, preset.study).toBe(preset.key);
      keys.push(file.key);
    }
    expect(keys).toEqual([
      'sha256:45b7142bb06f5fee9d81a90e1b34668a87653a29ba13eeedc08f1d2af2838dca',
      'sha256:001a419ded7a107c6f2ee8b932fb70578550b5830f67a134e0321f4682f488e9',
      'sha256:9e41ba70f50756281cc1d75663231303257bf61c7dcb1eed6bfc0297c5923cd1'
    ]);
    // The study that followed a protocol says whose study design made its visits.
    const pilot = JSON.parse(
      gunzipSync(copied('presets/cdisc-pilot-protocol.study.json.gz')).toString('utf8')
    );
    expect(pilot.study.notes.join(' ')).toContain(
      'by the study design that the modified copy of gsm.datasim adds'
    );
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

describe('study.builder’s studies, opened from the app’s list', () => {
  const PRESETS = ['SLOW', 'FAST'].map((name) => ({
    id: name.toLowerCase(),
    name: `Ready-made ${name}`,
    study: `${name.toLowerCase()}.study.json.gz`,
    settings: { name, participants: 10, sites: 2 }
  }));
  const DEMO = [{ id: 'one', label: 'Study one', description: '', files: ['dm.csv'], dir: '' }];

  /** The app with a study chip, one demo study, and a study.builder whose ready-made studies arrive when the test says. */
  async function listed() {
    const arrivals = {};
    const builder = fakeBuilder();
    // The demo study's file: answered at once, held until released, or refused.
    const demo = { hold: null, fail: '' };
    globalThis.StudyBuilder = {
      ...builder,
      fetchPresets: async () => PRESETS,
      openPreset: (preset) =>
        new Promise((resolve, reject) => {
          arrivals[preset.id] = {
            arrive: () => resolve({ study: { ...STUDY, id: preset.settings.name } }),
            fail: (message = `${preset.settings.name} could not be fetched`) =>
              reject(new Error(message))
          };
        })
    };
    document.body.innerHTML = '<div id="app"></div>';
    app = mountApp('#app', {
      charts: {},
      manifest,
      portfolio: true,
      demo: { base: './', studies: DEMO },
      fetchText: async (url) => {
        if (demo.hold) await demo.hold;
        if (demo.fail) throw new Error(`${url} ${demo.fail}`);
        return 'USUBJID,ARM,SEX\nS1,A,F\n';
      },
      libraries: [
        { name: 'study.builder', source: builderSource({ createConnection, ...OPTIONS }) }
      ]
    });
    await app.ready;
    await settle();
    const open = (id) =>
      app
        .portfolio()
        .studies.find((entry) => entry.id === `preset:${id}`)
        .open();
    return { arrivals, open, builder, demo };
  }
  const chip = () => document.querySelector('.sva-chip-name').textContent;
  const OWN = [{ name: 'dm.csv', text: 'USUBJID,ARM,SEX\nS9,B,M\n' }];
  const RAW = [{ name: 'Raw_SUBJ.csv', text: 'studyid,subjid,invid\nMINE,S1,SITE1\n' }];
  const underChip = () => {
    const said = document.querySelector('.sva-chip-slot .sva-chip-said');
    return said ? { say: said.textContent, role: said.getAttribute('role') } : null;
  };

  it('APP-PAGE-046: the study in use is the last one chosen: a study still on its way when another is chosen is dropped when it arrives, and so is one a demo study was chosen after; a dropped study that fails says nothing (#407)', async () => {
    const { arrivals, open } = await listed();
    expect(chip()).toBe('Study one');
    // Two of study.builder's studies: the first is slow, the second arrives first.
    open('slow');
    open('fast');
    arrivals.fast.arrive();
    await settle();
    expect(chip()).toBe('FAST');
    arrivals.slow.arrive();
    await settle();
    expect(chip()).toBe('FAST');
    expect(app.state.named.id).toBe('preset:fast');
    expect(app.portfolio().busy).toBe('');
    // A demo study chosen after a slow one outranks it too.
    open('slow');
    await app.loadDemo('one');
    expect(chip()).toBe('Study one');
    arrivals.slow.arrive();
    await settle();
    expect(chip()).toBe('Study one');
    expect(app.state.named).toBeNull();
    expect(app.portfolio().busy).toBe('');
    // A study that was dropped and then fails is not reported.
    open('slow');
    open('fast');
    arrivals.slow.fail();
    await settle();
    expect(app.portfolio()).toMatchObject({ busy: 'Opening FAST…', problem: '' });
    arrivals.fast.arrive();
    await settle();
    expect(chip()).toBe('FAST');
    expect(app.portfolio()).toMatchObject({ busy: '', problem: '' });
    // The one in use, when it fails, is.
    open('slow');
    arrivals.slow.fail();
    await settle();
    expect(app.portfolio().problem).toBe(
      'SLOW did not open. SLOW could not be fetched. The study in use is unchanged.'
    );
    expect(chip()).toBe('FAST');
  });

  it('APP-STUDY-007: every way of choosing what the page shows is in one ordering, so the last thing chosen is what lands: a ready-made study still on its way when the reader loads files of their own, loads gsm’s raw files, presses Reset or loads a study they built is dropped when it arrives, and says nothing if it fails; and a demo study still on its way when a ready-made study is chosen is dropped too (#427)', async () => {
    const { arrivals, open, builder, demo } = await listed();
    // Files of the reader's own, chosen while a slow study is on its way.
    open('slow');
    expect(app.portfolio().busy).toBe('Opening SLOW…');
    app.loadFiles(OWN);
    expect(chip()).toBe('Your files');
    // The study is no longer what the reader is waiting for, and the page stops saying so.
    expect(app.portfolio().busy).toBe('');
    arrivals.slow.arrive();
    await settle();
    expect(chip()).toBe('Your files');
    expect(app.state.named).toBeNull();
    expect(app.state.files.subject.rows).toEqual([{ USUBJID: 'S9', ARM: 'B', SEX: 'M' }]);
    // gsm's raw files, which come in by the other loader.
    open('slow');
    app.loadRaw(RAW);
    arrivals.slow.arrive();
    await settle();
    expect(chip()).toBe('Your files');
    expect(app.state.raw.map((file) => file.name)).toEqual(['Raw_SUBJ.csv']);
    // Reset.
    open('slow');
    app.reset();
    expect(chip()).toBe('No study');
    expect(app.portfolio().busy).toBe('');
    arrivals.slow.arrive();
    await settle();
    expect(chip()).toBe('No study');
    expect(app.state.raw).toEqual([]);
    // A study that was dropped and then fails is not reported.
    open('slow');
    app.reset();
    arrivals.slow.fail();
    await settle();
    expect(app.portfolio()).toMatchObject({ busy: '', problem: '' });
    expect(underChip()).toBeNull();
    // A study the reader built, loaded into the demo while a slow one is on its way.
    app.openSource(BUILDER_SOURCE_ID);
    await settle();
    open('slow');
    builder.mounts[0].options.onStudy(STUDY);
    expect(chip()).toBe('BUILT-001');
    arrivals.slow.arrive();
    await settle();
    expect(chip()).toBe('BUILT-001');
    expect(app.state.named.name).toBe('BUILT-001');
    // The other way round: a demo study still on its way when a ready-made
    // study is chosen is dropped, and the page stops saying it is loading.
    let release = () => {};
    demo.hold = new Promise((resolve) => {
      release = resolve;
    });
    const loading = app.loadDemo('one');
    expect(document.querySelector('.sva-busy').textContent).toContain('Loading the demo study');
    open('fast');
    expect(document.querySelector('.sva-busy')).toBeNull();
    arrivals.fast.arrive();
    await settle();
    expect(chip()).toBe('FAST');
    release();
    await loading;
    await settle();
    expect(chip()).toBe('FAST');
    expect(app.state.named.id).toBe('preset:fast');
    expect(app.state.study).toBeNull();
  });

  it('APP-STUDY-008: a ready-made study that does not open is said under the chip in the app’s own sentence: which study, what study.builder said could not be fetched, and that the study in use is unchanged, or that none is; study.builder’s advice about its form, which is not in sight here, is not passed on; and the sentence goes when the reader chooses something else (#427)', async () => {
    const { arrivals, open } = await listed();
    const SAID =
      'The study for Ready-made SLOW could not be fetched: the page answered 404. ' +
      'Its settings are in the form, and Build makes it.';
    app.select('ae-explorer');
    open('slow');
    arrivals.slow.fail(SAID);
    await settle();
    expect(underChip()).toEqual({
      say:
        'SLOW did not open. The study for Ready-made SLOW could not be fetched: the page ' +
        'answered 404. The study in use is unchanged.',
      role: 'alert'
    });
    expect(document.body.textContent).not.toContain('in the form');
    expect(app.state.selected).toBe('ae-explorer');
    expect(chip()).toBe('Study one');
    // With nothing loaded, the sentence does not speak of a study in use.
    app.reset();
    expect(app.portfolio().problem).toBe('');
    open('slow');
    arrivals.slow.fail(SAID);
    await settle();
    expect(app.portfolio().problem).toBe(
      'SLOW did not open. The study for Ready-made SLOW could not be fetched: the page ' +
        'answered 404. No study is in use.'
    );
    // Something else is chosen, and opens: the sentence is no longer true of what the page shows, and goes.
    await app.loadDemo('one');
    expect(app.portfolio().problem).toBe('');
    expect(underChip()).toBeNull();
  });

  it('APP-STUDY-009: a demo study the reader chose that cannot be fetched is said under the chip, and the reader stays on the tab they are on with the study they had; the sentence goes at the next choice; the study a page opens on, and any study on a page with no chip, is still said on the Overview (#427)', async () => {
    const { demo } = await listed();
    app.loadFiles(OWN);
    app.select('ae-explorer');
    const notes = [...app.state.notes];
    demo.fail = 'was answered with HTTP 404.';
    await app.loadDemo('one');
    expect(underChip()).toEqual({
      say: 'Study one could not be opened: ./dm.csv was answered with HTTP 404. The study in use is unchanged.',
      role: 'alert'
    });
    expect(app.state.selected).toBe('ae-explorer');
    expect(chip()).toBe('Your files');
    expect(app.state.notes).toEqual(notes);
    expect(document.querySelector('.sva-busy')).toBeNull();
    // With nothing loaded it says so, and does not speak of a study in use.
    app.reset();
    expect(app.portfolio().problem).toBe('');
    app.select('ae-explorer');
    await app.loadDemo('one');
    expect(app.portfolio().problem).toBe(
      'Study one could not be opened: ./dm.csv was answered with HTTP 404. No study is in use.'
    );
    expect(app.state.selected).toBe('ae-explorer');
    // The next choice clears it.
    app.loadFiles(OWN);
    expect(app.portfolio().problem).toBe('');
    // The study a page opens on has no tab to stay on: it is said on the Overview, as before.
    await app.loadDemo('one', { open: true });
    expect(app.state.selected).toBe('data');
    expect(app.state.notes).toEqual([
      'The demo study could not be loaded: ./dm.csv was answered with HTTP 404.'
    ]);
    expect(app.portfolio().problem).toBe('');
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
    // The workflows study.builder v0.5.0 added, and the R file one of them calls by name.
    expect(served).toContain('study.builder/workflows/analysis/AESummaryByArm.yaml');
    expect(served).toContain('study.builder/workflows/analysis/EfficacyModel.R');
    // What study.builder v0.5.1 added for a page that copies it (#423): the
    // licence's text beside each of gsm's copies, and the studies feed.
    for (const copy of ['gsm.datasim', 'gsm.kri', 'gsm.mapping-vitals', 'gsm.reporting']) {
      expect(served).toContain(`study.builder/vendor/${copy}/LICENSE.md`);
      expect(served).toContain(`study.builder/vendor/${copy}/SOURCE.json`);
    }
    expect(served).toContain('study.builder/studies/index.json');
    // The five ready-made protocols the builder's form offers to try.
    expect(
      served.filter((file) => /^study\.builder\/protocols\/.+\.protocol\.json$/.test(file))
    ).toEqual(
      [
        'cdisc-pilot',
        'cdisc-pilot-devices',
        'alexion-wilsons',
        'lilly-nasal-glucagon',
        'observational'
      ].map((id) => `study.builder/protocols/${id}.protocol.json`)
    );
    expect(
      files.filter((entry) => /study\.builder\/vendor\/gsm\.datasim\/R\/.+\.R$/.test(entry.served))
    ).toHaveLength(45);
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
    for (const word of ['createConnection', 'repository', 'useLabel', 'onStudy', 'operations']) {
      expect(bundle, word).toContain(word);
    }
  });
});

// What the second review of the v1.13.0 release candidate asked of the Overview
// tab with study.builder on the page (#427): a status label for its two parts,
// and a side panel that says what is loaded.
describe('Build a study and a simulated study on the Overview tab', () => {
  it('APP-TIER-030: Build a study and the view of a simulated study stand on Experimental by their entries in site/config.json, each with one sentence saying why; the page shows the app’s status label on the corner of the Overview tab while the builder is open and while a simulated study is in use, on both of its faces, with that sentence; and shows none there for a demo study, a reader’s own files or an empty page (#427)', async () => {
    const config = JSON.parse(readFileSync(path.join(root, 'site/config.json'), 'utf8'));
    expect(config.appParts).toEqual([
      {
        id: BUILDER_SOURCE_ID,
        title: 'Build a study',
        tier: 'experimental',
        tierNote:
          'Experimental: new in 1.13. study.builder simulates the study in this browser, and what it makes may still change.'
      },
      {
        id: SIMULATED_RUNG_ID,
        title: 'The view of a simulated study',
        tier: 'experimental',
        tierNote:
          'Experimental: new in 1.13. The view is study.builder’s and every row is synthetic; what it shows may still change.'
      }
    ]);
    // The build holds a part to what it holds a tab to: a rung with its reason, and never Qualified.
    const [build, simulated] = config.appParts;
    expect(tierProblems(config)).toEqual([]);
    expect(
      tierProblems({ appParts: [{ id: 'build', title: 'Build a study', tier: 'experimental' }] })
    ).toEqual([
      'site/config.json: Build a study is Experimental and gives no reason. Its label shows one sentence saying why: add a "tierNote".'
    ]);
    expect(tierProblems({ appParts: [{ ...simulated, tier: 'qualified' }] })[0]).toContain(
      'The view of a simulated study says tier "qualified". Nothing in safety.viz is qualified'
    );
    // The page is handed both rungs, with the tabs' and the charts'.
    const tiers = chartTiers();
    expect(tiers[BUILDER_SOURCE_ID]).toEqual({ tier: 'experimental', note: build.tierNote });
    expect(tiers[SIMULATED_RUNG_ID]).toEqual({ tier: 'experimental', note: simulated.tierNote });

    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    document.body.innerHTML = '<div id="app"></div>';
    app = mountApp('#app', {
      charts: {},
      manifest,
      tiers,
      libraries: [
        { name: 'study.builder', source: builderSource({ createConnection, ...OPTIONS }) }
      ]
    });
    const corner = () => {
      const label = document.querySelector('.sva-content > .sva-corner');
      if (!label) return null;
      return {
        label: label.querySelector('.sv-status-label').dataset.tier,
        heading: label.querySelector('.sv-status-heading').textContent,
        why: [...label.querySelectorAll('.sv-status-text')].map((node) => node.textContent)[0],
        mark: label.querySelector('.sv-status-here .sv-status-mark').textContent
      };
    };
    // An empty page, and a reader's own files: the Overview is the app's own, and carries no label.
    expect(corner()).toBeNull();
    app.loadFiles([{ name: 'dm.csv', text: 'USUBJID,ARM,SEX\nS1,A,F\n' }]);
    expect(corner()).toBeNull();
    // The builder, open on the Overview tab.
    app.openSource(BUILDER_SOURCE_ID);
    await settle();
    expect(corner()).toEqual({
      label: 'experimental',
      heading: 'Build a study is experimental',
      why: build.tierNote,
      mark: 'Build a study'
    });
    // The study it built, in use: the Overview says where its view stands, on the face it opens on and on Files.
    builder.mounts[0].options.onStudy(STUDY);
    expect(app.state.named.rung).toBe(SIMULATED_RUNG_ID);
    const view = {
      label: 'experimental',
      heading: 'The view of this simulated study is experimental',
      why: simulated.tierNote,
      mark: 'This study’s view'
    };
    expect(corner()).toEqual(view);
    app.state.exploring = !app.state.exploring;
    app.select('data');
    expect(corner()).toEqual(view);
    // A chart's tab says where the chart stands, not the study's view.
    app.select('ae-explorer');
    expect(document.querySelector('.sva-content').textContent).not.toContain(simulated.tierNote);
    // Reset: no study, no label.
    app.reset();
    expect(corner()).toBeNull();
  });

  it('APP-LOAD-032: beside the open builder the side panel says what is loaded, as the Files face does: every placed file, every file set aside and every raw file, counted in step one, with the mapping’s state in step two; choosing a file in the list goes back to the Files face, to its card (#427)', async () => {
    const builder = fakeBuilder();
    globalThis.StudyBuilder = builder;
    const handle = mounted(builderSource({ createConnection, ...OPTIONS }));
    const said = () => ({
      steps: [...document.querySelectorAll('.sva-side .sva-step')].map((step) => [
        step.dataset.step,
        step.dataset.state,
        step.querySelector('.sva-step-status').textContent
      ]),
      loaded: [...document.querySelectorAll('.sva-side .sva-loaded-file')].map(
        (file) =>
          `${file.querySelector('.sva-loaded-name').textContent}: ${file.querySelector('.sva-loaded-detail').textContent}`
      ),
      empty: Boolean(document.querySelector('.sva-side .sva-loaded-empty'))
    });
    const beside = () => {
      handle.openSource(BUILDER_SOURCE_ID);
      expect(document.querySelector('.sva-source')).not.toBeNull();
      const now = said();
      handle.openSource(null);
      expect(document.querySelector('.sva-source')).toBeNull();
      return now;
    };
    // Nothing loaded: both say so.
    expect(beside()).toEqual(said());
    expect(said().empty).toBe(true);
    // A study whose files are placed in standard domains, as a demo study's are.
    handle.loadFiles([
      { name: 'dm.csv', text: 'USUBJID,ARM,SEX\nS1,A,F\n' },
      { name: 'notes.csv', text: 'a,b\n1,2\n' }
    ]);
    await settle();
    expect(said().steps[0]).toEqual(['load', 'done', '1 file loaded']);
    expect(said().loaded).toEqual(['dm.csv: Subject-level, 1 row', 'notes.csv: Not placed, 1 row']);
    expect(beside()).toEqual(said());
    // A simulated study: its standard files and its raw files, all four.
    handle.openSource(BUILDER_SOURCE_ID);
    await settle();
    builder.mounts[0].options.onStudy(STUDY);
    const files = said();
    expect(files.steps[0]).toEqual(['load', 'done', '4 files loaded']);
    expect(files.loaded.map((line) => line.split(':')[0])).toEqual([
      'adsl.csv',
      'advs.csv',
      'Raw_SUBJ.csv',
      'Raw_SITE.csv'
    ]);
    expect(files.steps[1][2]).toMatch(/^\d+ guessed, \d+ needed by a chart$/);
    expect(beside()).toEqual(files);
    // A file chosen in the list beside the builder: the Files face, at its card.
    handle.openSource(BUILDER_SOURCE_ID);
    document.querySelector('.sva-side .sva-loaded-file[data-raw="Raw_SITE.csv"]').click();
    expect(document.querySelector('.sva-source')).toBeNull();
    expect(handle.state.source).toBeNull();
    const card = document.querySelector('.sva-file.sva-raw[data-raw="Raw_SITE.csv"]');
    expect(card).not.toBeNull();
    expect(document.activeElement).toBe(card);
    handle.openSource(BUILDER_SOURCE_ID);
    document.querySelector('.sva-side .sva-loaded-file[data-domain="subject"]').click();
    expect(document.activeElement).toBe(document.querySelector('.sva-file[data-domain="subject"]'));
  });
});
