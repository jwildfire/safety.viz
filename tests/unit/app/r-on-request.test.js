// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { rOnRequest, rUnavailable } from '../../../src/app/r-on-request.js';
import { mountApp } from '../../../src/app/page.js';
import standIn, { log as standInLog } from '../../e2e/fixtures/stand-in-library.js';

// R on request (#183, obot.roadmap#366; @jwildfire, 2026-10-02: "R on
// request"). A second library's charts can be handed a connection to R; the
// app does not start R until the reader asks. These tests hold the connection
// the app hands out before and after the reader asks, the one control that
// asks, and the page's wiring of both — against a stand-in for the library's
// connection factory, so no R and no network is involved here.

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../site/data');
const DEMO = ['adsl.csv', 'adae.csv', 'adbds.csv', 'adeg.csv'].map((name) => ({
  name,
  text: readFileSync(path.join(dataDir, name), 'utf8')
}));

// A stand-in for a library's connection factory: records each connection made
// and answers every run with "ok", or with what `answer` says for that
// connection (its index among those made).
function fakeFactory(answer = () => null) {
  const made = [];
  const createConnection = vi.fn((options) => {
    const index = made.length;
    const connection = {
      options,
      run: vi.fn(
        async (name) => answer(index, name) || { status: 'ok', value: { name }, form: 'browser' }
      )
    };
    made.push(connection);
    return connection;
  });
  return { createConnection, made };
}

const LOAD_FAILED = {
  status: 'unavailable',
  reason: 'load-failed',
  message: 'bio.viz: R could not be started in the browser: Failed to fetch.'
};

// What a connection was asked, leaving out the app's own two questions about
// R's version (#276).
const asked = (connection) =>
  connection.run.mock.calls.map(([name]) => name).filter((name) => name !== 'do.call');
const NEED_TITLE =
  'Statistics need R. Start R to compute them: about 13 MB, downloaded once from ' +
  'webr.r-wasm.org. The study’s data stays in this browser.';
const VIEW_NEED = 'Statistics need R. Start R, in the note above.';
const VIEW_NEED_CLOSED = 'Statistics need R. Start R, at the top right.';
const VIEW_STARTING = 'R is starting. The test appears here when it is ready.';
const VIEW_FAILED = 'R did not start, so there is no test. Try again, in the note above.';
const DOWNLOAD_FAILED =
  'The browser could not download R from webr.r-wasm.org. Check the connection, or whether ' +
  'this network blocks that address, and try again. The charts still draw; only the ' +
  'statistics are missing.';

const OPTIONS = {
  browser: { sourceUrl: './statistics.R', packages: [] },
  megabytes: 13,
  host: 'webr.r-wasm.org'
};

afterEach(() => {
  standInLog.length = 0;
});

describe('R on request', () => {
  it('APP-R-001: before the reader asks, the connection makes no connection to R and answers that statistics need R, saying what starting it downloads (#183)', async () => {
    const { createConnection } = fakeFactory();
    const r = rOnRequest({ createConnection, ...OPTIONS });
    const { connection, waiting_note: note } = r.settings();
    const answer = await connection.run('Analyze_GroupDifference', { data: [], args: {} });
    expect(answer.status).toBe('unavailable');
    // One short line, which points at the note where R is started (#276, #322).
    expect(answer.message).toBe(VIEW_NEED);
    expect(createConnection).not.toHaveBeenCalled();
    expect(note).toBeNull();
    // The control: a few words, the cost, the button, and the whole sentence on hover.
    expect(r.action.state()).toEqual({
      phase: 'off',
      say: 'Statistics need R',
      meta: '13 MB, once',
      title: NEED_TITLE,
      label: 'Start R'
    });
  });

  it('APP-R-002: asking makes one connection, with the library’s own factory and the options given, and starts R at once; every chart afterwards uses it, and asking again makes no second (#183)', async () => {
    const { createConnection, made } = fakeFactory();
    const r = rOnRequest({ createConnection, ...OPTIONS });
    const before = r.settings().connection;
    const started = r.action.press();
    r.action.press();
    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(createConnection).toHaveBeenCalledWith({ browser: OPTIONS.browser });
    // Pressing starts R there and then, with one call R already has.
    expect(made[0].run).toHaveBeenCalledTimes(1);
    expect(made[0].run.mock.calls[0][0]).toBe('identity');
    expect(r.action.state()).toMatchObject({ phase: 'starting', say: 'Starting R', meta: '13 MB' });
    await started;
    expect(r.action.state()).toMatchObject({ phase: 'ready', say: 'R ready' });
    // A chart made before the reader asked, and one made after, reach the same R.
    const after = r.settings().connection;
    await before.run('one', { data: [], args: {} });
    await after.run('two', { data: [], args: {} });
    expect(made).toHaveLength(1);
    expect(asked(made[0])).toEqual(['identity', 'one', 'two']);
  });

  it('APP-R-015: while R starts the chart’s line says so in one short sentence and the control counts from the press; once R has answered there is no such line, and the control is a chip whose details say R’s version, how long it took, the download and where R runs (#183, #276)', async () => {
    // R says its own version when asked; the page knew the runtime's.
    const { createConnection, made } = fakeFactory((index, name) =>
      name === 'do.call' ? { status: 'ok', value: { said: made.length } } : null
    );
    let clock = 1000;
    const r = rOnRequest({ createConnection, ...OPTIONS, webr: '0.6.0', now: () => clock });
    const started = r.action.press();
    expect(r.settings().waiting_note).toBe(VIEW_STARTING);
    expect(r.action.state()).toEqual({
      phase: 'starting',
      say: 'Starting R',
      meta: '13 MB',
      since: 1000
    });
    clock = 2540;
    await started;
    expect(r.settings().waiting_note).toBeNull();
    expect(r.action.state()).toEqual({
      phase: 'ready',
      say: 'R ready',
      title: 'R is running in this browser',
      details: {
        heading: 'R is running in this browser',
        rows: [
          ['Version', 'webR 0.6.0'],
          ['Started', 'in 1.5 seconds'],
          ['Downloaded', '13 MB, once, from webr.r-wasm.org'],
          ['Your data', 'stays in this browser; R runs here']
        ]
      }
    });
    // R was asked its version twice, by a call R makes of a function that takes no argument.
    expect(made[0].run.mock.calls.filter(([name]) => name === 'do.call')).toEqual([
      ['do.call', { data: [], args: { what: 'R.Version' } }],
      ['do.call', { data: [], args: { what: 'Sys.getenv' } }]
    ]);
  });

  it('APP-R-043: the details say the version R itself gave, "R 4.6.0, on webR 0.6.0"; where R gives none they say what the page knew, and where nothing is known the line is left to the control to leave out (#276)', async () => {
    const answers = {
      'R.Version': { status: 'ok', value: { 'version.string': ['R version 4.6.0 (2026-04-24)'] } },
      'Sys.getenv': { status: 'ok', value: { LANG: ['en_US.UTF-8'], WEBR_VERSION: ['0.6.1'] } }
    };
    const version = (r) => r.action.state().details.rows.find(([term]) => term === 'Version')[1];
    const says = fakeFactory((index, name) => (name === 'do.call' ? null : null));
    says.createConnection.mockImplementation(() => ({
      run: vi.fn(async (name, request) =>
        name === 'do.call' ? answers[request.args.what] : { status: 'ok', value: 1 }
      )
    }));
    const told = rOnRequest({ createConnection: says.createConnection, ...OPTIONS, webr: '0.6.0' });
    await told.action.press();
    await vi.waitFor(() => expect(version(told)).toBe('R 4.6.0, on webR 0.6.1'));
    // R that will not say: an error, an answer that is not a success, or a run that throws.
    for (const refuses of [
      async () => ({ status: 'error', message: 'could not find function' }),
      async () => ({ status: 'unavailable', reason: 'no-r-attached' }),
      () => {
        throw new Error('no');
      }
    ]) {
      const silent = rOnRequest({
        createConnection: () => ({
          run: (name) => (name === 'do.call' ? refuses() : Promise.resolve({ status: 'ok' }))
        }),
        ...OPTIONS,
        webr: '0.6.0'
      });
      await silent.action.press();
      await Promise.resolve();
      expect(version(silent)).toBe('webR 0.6.0');
      expect(silent.action.state().phase).toBe('ready');
    }
    const unknown = rOnRequest({ createConnection: fakeFactory().createConnection, ...OPTIONS });
    await unknown.action.press();
    expect(version(unknown)).toBeNull();
  });

  it('APP-R-016: when R does not start, the control says so and offers to try again, every chart is told without starting R again, and trying again makes one fresh connection (#183)', async () => {
    // The first connection cannot start R; the second can.
    const { createConnection, made } = fakeFactory((index) => (index === 0 ? LOAD_FAILED : null));
    const r = rOnRequest({ createConnection, ...OPTIONS });
    await r.action.press();
    // The words, Try again, and the reason one click away: a plain sentence first,
    // and what the browser said behind a disclosure, never in the first line (#277).
    expect(r.action.state()).toEqual({
      phase: 'failed',
      say: 'R did not start',
      label: 'Try again',
      why: 'Why',
      details: {
        heading: 'R did not start',
        text: [DOWNLOAD_FAILED],
        more: [
          'The browser said: bio.viz: R could not be started in the browser: Failed to fetch.'
        ],
        moreTitle: 'What the browser said'
      }
    });
    // Charts are answered with that, and R is not asked again until the reader asks.
    const answer = await r.settings().connection.run('one', { data: [], args: {} });
    await r.settings().connection.run('two', { data: [], args: {} });
    expect(answer).toEqual({
      status: 'unavailable',
      reason: 'load-failed',
      message: VIEW_FAILED
    });
    expect(made).toHaveLength(1);
    expect(made[0].run).toHaveBeenCalledTimes(1);
    expect(r.settings().waiting_note).toBeNull();
    // Trying again: one fresh connection, which starts R.
    await r.action.press();
    expect(made).toHaveLength(2);
    expect(r.action.state()).toMatchObject({ phase: 'ready', say: 'R ready' });
    expect((await r.settings().connection.run('three', { data: [], args: {} })).status).toBe('ok');
    expect(asked(made[1])).toEqual(['identity', 'three']);
  });

  it('APP-R-016: an answer that says R could not start, arriving for a chart after R had started, is treated the same way (#183)', async () => {
    let fail = false;
    const { createConnection, made } = fakeFactory(() => (fail ? LOAD_FAILED : null));
    const r = rOnRequest({ createConnection, ...OPTIONS });
    await r.action.press();
    fail = true;
    const answer = await r.settings().connection.run('one', { data: [], args: {} });
    expect(answer.reason).toBe('load-failed');
    expect(r.action.state()).toMatchObject({ phase: 'failed', label: 'Try again' });
    await r.settings().connection.run('two', { data: [], args: {} });
    expect(asked(made[0])).toEqual(['identity', 'one']);
  });

  it('APP-R-003: where R cannot be started, the connection answers in words why statistics are unavailable, and there is no control (#183)', async () => {
    const r = rUnavailable('Statistics are unavailable in this file.');
    const answer = await r.settings().connection.run('anything', { data: [], args: {} });
    expect(answer).toEqual({
      status: 'unavailable',
      reason: 'no-r-attached',
      message: 'Statistics are unavailable in this file.'
    });
    expect(r.action).toBeUndefined();
  });
});

// The note at the top of a chart's card (#322, obot.roadmap#420): the same
// press as the control's, inside a sentence that says why R is wanted here.
const COST = 'about 13 MB, downloaded once. The study’s data stays in this browser.';
const NEEDS_R = ['needs-r'];

describe('the note where R can be started', () => {
  it('APP-R-055: before the reader asks, a chart R adds p-values to has a blue note that can be closed and a chart that cannot be drawn without R has an amber one that cannot, each with Start R inside its sentence and what starting it costs; while R starts the note is blue, waits and has no button; once R is ready there is none (#322)', async () => {
    let answer;
    const createConnection = vi.fn(() => ({
      run: vi.fn(
        () =>
          new Promise((resolve) => {
            answer = resolve;
          })
      )
    }));
    const r = rOnRequest({ createConnection, ...OPTIONS, required: NEEDS_R });
    const adds = r.note('adds-p-values');
    expect(adds).toMatchObject({
      kind: 'info',
      before: 'This chart’s p-values need R. ',
      label: 'Start R',
      after: ` to add them: ${COST}`
    });
    expect(typeof adds.close).toBe('function');
    const must = r.note('needs-r');
    expect(must).toEqual({
      kind: 'warning',
      before: 'This chart cannot be drawn without R. ',
      label: 'Start R',
      after: ` to draw it: ${COST}`
    });
    // Asking what the note says starts nothing.
    expect(createConnection).not.toHaveBeenCalled();

    const started = r.action.press();
    expect(r.note('adds-p-values')).toEqual({
      kind: 'info',
      busy: true,
      before: 'R is starting. The p-values appear under the chart when it is ready.',
      meta: '13 MB'
    });
    expect(r.note('needs-r')).toEqual({
      kind: 'info',
      busy: true,
      before: 'R is starting. The chart is drawn when it is ready.',
      meta: '13 MB'
    });
    answer({ status: 'ok', value: {}, form: 'browser' });
    await started;
    expect(r.note('adds-p-values')).toBeNull();
    expect(r.note('needs-r')).toBeNull();
  });

  it('APP-R-056: when R did not start both notes are amber, say what the chart is left without, offer Try again inside the sentence and say where the reason is; neither can be closed, and the chart’s own line points at the note (#322)', async () => {
    const { createConnection } = fakeFactory(() => LOAD_FAILED);
    const r = rOnRequest({ createConnection, ...OPTIONS, required: NEEDS_R });
    await r.action.press();
    expect(r.note('adds-p-values')).toEqual({
      kind: 'warning',
      before: 'R did not start, so this chart has no p-values. ',
      label: 'Try again',
      after: ' The reason is behind Why, at the top right.'
    });
    expect(r.note('needs-r')).toEqual({
      kind: 'warning',
      before: 'R did not start, so this chart cannot be drawn. ',
      label: 'Try again',
      after: ' The reason is behind Why, at the top right.'
    });
    const told = await r.settings().connection.run('one', { data: [], args: {} });
    expect(told.message).toBe(VIEW_FAILED);
  });

  it('APP-R-057: closing the blue note closes it on every chart R adds p-values to, and each of those charts’ own line then points at the control; the amber note of a chart that needs R stays, and that chart’s line still points at its note; closed is closed while R starts too, and a reader who is then told R did not start has the note back (#322)', async () => {
    let fails = true;
    const { createConnection } = fakeFactory(() => (fails ? LOAD_FAILED : null));
    const r = rOnRequest({ createConnection, ...OPTIONS, required: NEEDS_R });
    const line = async () =>
      (await r.settings().connection.run('one', { data: [], args: {} })).message;
    expect(await line()).toBe(VIEW_NEED);
    r.note('adds-p-values').close();
    expect(r.note('adds-p-values')).toBeNull();
    expect(r.note('another-that-adds')).toBeNull();
    expect(r.note('needs-r')).toMatchObject({ kind: 'warning', label: 'Start R' });
    expect(await line()).toBe(VIEW_NEED_CLOSED);
    // A chart that cannot be drawn without R keeps its note, so its line keeps
    // pointing at it; every chart R adds p-values to is told the same thing.
    const lineOf = async (module) =>
      (await r.settings(module).connection.run('one', { data: [], args: {} })).message;
    expect(await lineOf('needs-r')).toBe(VIEW_NEED);
    expect(await lineOf('adds-p-values')).toBe(VIEW_NEED_CLOSED);
    expect(r.settings('adds-p-values').connection).toBe(r.settings('another-that-adds').connection);
    expect(createConnection).not.toHaveBeenCalled();
    // While R starts the closed note stays closed; the chart that needs R says R is starting.
    const starting = r.action.press();
    expect(r.note('adds-p-values')).toBeNull();
    expect(r.note('needs-r')).toMatchObject({ kind: 'info', busy: true });
    await starting;
    // That R did not start is always said, on both kinds of chart.
    expect(r.note('adds-p-values')).toMatchObject({ kind: 'warning', label: 'Try again' });
    expect(r.note('needs-r')).toMatchObject({ kind: 'warning', label: 'Try again' });
    fails = false;
    const again = r.action.press();
    expect(r.note('adds-p-values')).toBeNull();
    await again;
    expect(r.note('adds-p-values')).toBeNull();
    expect(r.note('needs-r')).toBeNull();
  });
});

describe('the page with a library’s settings and control', () => {
  const mounted = (library) => {
    document.body.innerHTML = '<div id="app"></div>';
    const charts = Object.fromEntries(
      Object.values(manifest.modules).map((entry) => [entry.export, () => ({ init() {} })])
    );
    const app = mountApp('#app', { charts, manifest, libraries: [library] });
    app.loadFiles(DEMO);
    return app;
  };

  it('APP-R-004: a library’s settings are added to each of its charts’ settings when it is drawn, and to no safety chart’s (#183)', () => {
    const settings = vi.fn(() => ({ extra_col: 'ARM' }));
    const app = mounted({ ...standIn, settings });
    app.select('stand-in-strip');
    expect(standInLog[0].settings).toMatchObject({ extra_col: 'ARM', value_col: 'STRESN' });
    expect(settings).toHaveBeenCalledWith('stand-in-strip');
    settings.mockClear();
    app.select('histogram');
    expect(settings).not.toHaveBeenCalled();
    app.destroy();
  });

  it('APP-R-005: a library’s control is shown while its charts’ tab is open, with what it costs in words beside it; pressing it asks once, hands the open chart its new settings without drawing it again, and the control follows what happened (#183)', async () => {
    let phase = 'idle';
    let finish;
    const press = vi.fn(() => {
      phase = 'starting';
      return new Promise((resolve) => {
        finish = () => {
          phase = 'done';
          resolve();
        };
      });
    });
    const action = {
      state: () =>
        ({
          idle: {
            label: 'Start R',
            done: false,
            note: 'Statistics need R.',
            hint: 'About 13 MB, once'
          },
          starting: { label: 'Starting R…', done: true, note: 'Starting.', hint: null },
          done: { label: 'R started', done: true, note: 'Running.', hint: null }
        })[phase],
      press
    };
    const settings = vi.fn(() => ({ extra_col: phase }));
    const app = mounted({ ...standIn, action, settings });
    app.select('stand-in-strip');
    const group = () => document.querySelector('.sva-charts > .sva-r');
    const button = () => group().querySelector('.sva-action');
    expect(button().textContent).toBe('Start R');
    expect(button().title).toBe('Statistics need R.');
    expect(button().disabled).toBe(false);
    expect(group().querySelector('.sva-r-meta').textContent).toBe('About 13 MB, once');
    // There is one, whichever tab is open.
    expect(document.querySelectorAll('.sva-action')).toHaveLength(1);
    const before = standInLog.length;
    button().click();
    expect(press).toHaveBeenCalledTimes(1);
    // The open chart keeps what the reader chose: it is handed the library's
    // settings as they are now, and is neither destroyed nor drawn again.
    expect(standInLog.slice(before)).toEqual([
      { event: 'setSettings', settings: { extra_col: 'starting' } }
    ]);
    expect(button().textContent).toBe('Starting R…');
    expect(button().disabled).toBe(true);
    expect(group().querySelector('.sva-r-meta')).toBeNull();
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(button().textContent).toBe('R started');
    // Once what it started has settled, the open chart is handed the settings
    // as they are then, still without being drawn again (#193).
    expect(standInLog.slice(before)).toEqual([
      { event: 'setSettings', settings: { extra_col: 'starting' } },
      { event: 'setSettings', settings: { extra_col: 'done' } }
    ]);
    app.destroy();
  });

  it('APP-R-020: the chart open when R is started is handed no waiting note once R has started, so its statistics line stops saying R is starting (#193)', async () => {
    let release;
    const gate = new Promise((resolve) => (release = resolve));
    const { createConnection } = fakeFactory();
    const slow = vi.fn((options) => {
      const connection = createConnection(options);
      const run = connection.run;
      return { ...connection, run: (...args) => gate.then(() => run(...args)) };
    });
    const r = rOnRequest({ createConnection: slow, ...OPTIONS });
    // The stand-in refuses a setting passed as null when it is drawn, so "no
    // note" reaches it as a note left out.
    const settings = () => {
      const given = r.settings();
      return {
        ...given,
        waiting_note: given.waiting_note === null ? undefined : given.waiting_note
      };
    };
    const app = mounted({ ...standIn, action: r.action, settings });
    app.select('stand-in-strip');
    const before = standInLog.length;
    document.querySelector('.sva-r .sva-action').click();
    const notes = () =>
      standInLog
        .slice(before)
        .filter((entry) => entry.event === 'setSettings')
        .map((entry) => entry.settings.waiting_note);
    expect(notes()).toEqual([VIEW_STARTING]);
    // While it starts the control is a spinner and a count, and no button.
    expect(document.querySelector('.sva-r').dataset.phase).toBe('starting');
    expect(document.querySelector('.sva-r .sva-action')).toBeNull();
    release();
    await vi.waitFor(() =>
      expect(document.querySelector('.sva-r .sva-chip').textContent).toBe('R ready▾')
    );
    expect(notes()).toEqual([VIEW_STARTING, undefined]);
    // Still the one chart, not drawn again.
    expect(standInLog.slice(before).map((entry) => entry.event)).toEqual([
      'setSettings',
      'setSettings'
    ]);
    app.destroy();
  });

  it('APP-R-022: when the library’s connection factory throws, the control says R did not start and why, and offers to try again; the page keeps working (#193)', async () => {
    const createConnection = vi.fn(() => {
      throw new Error('bio.viz: webR is not available');
    });
    const r = rOnRequest({ createConnection, ...OPTIONS });
    await expect(r.action.press()).resolves.toBeUndefined();
    expect(r.action.state()).toMatchObject({
      phase: 'failed',
      say: 'R did not start',
      label: 'Try again'
    });
    // Nothing was downloaded, so the plain reason does not say a download failed.
    expect(r.action.state().details.text).toEqual([
      'R could not be started on this page. Try again; if it fails again, reload the page. ' +
        'The charts still draw; only the statistics are missing.'
    ]);
    expect(r.action.state().details.more).toEqual([
      'The browser said: bio.viz: webR is not available.'
    ]);
    expect(await r.settings().connection.run('one', { data: [], args: {} })).toEqual({
      status: 'unavailable',
      reason: 'load-failed',
      message: VIEW_FAILED
    });
    // On the page: pressing it changes the control, and nothing is thrown.
    const fresh = rOnRequest({ createConnection, ...OPTIONS });
    const app = mounted({ ...standIn, action: fresh.action });
    app.select('stand-in-strip');
    expect(() => document.querySelector('.sva-r .sva-action').click()).not.toThrow();
    await vi.waitFor(() =>
      expect(document.querySelector('.sva-r .sva-action').textContent).toBe('Try again')
    );
    expect(document.querySelector('.sva-r .sva-r-say').textContent).toBe('R did not start');
    expect(document.querySelector('.sva-r .sva-r-say').classList.contains('sva-bad')).toBe(true);
    app.destroy();
  });

  it('APP-R-024: when the connection’s run throws or rejects as R starts, or the factory throws with no reason, the control says R did not start and offers to try again, never sticking at “Starting R…” (#193)', async () => {
    const throwing = {
      'throws at once': () => ({
        run: () => {
          throw new Error('webR could not be created');
        }
      }),
      rejects: () => ({ run: () => Promise.reject(new Error('the worker stopped')) })
    };
    for (const [how, make] of Object.entries(throwing)) {
      const r = rOnRequest({ createConnection: make, ...OPTIONS });
      await r.action.press();
      expect(r.action.state(), how).toMatchObject({ phase: 'failed', label: 'Try again' });
      expect(r.action.state().details.more[0], how).toMatch(
        /^The browser said: (webR could not be created|the worker stopped)\.$/
      );
      expect((await r.settings().connection.run('one', {})).reason, how).toBe('load-failed');
    }
    // A factory that throws nothing usable still gives a sentence, not "undefined".
    for (const thrown of [undefined, null, '']) {
      const r = rOnRequest({
        createConnection: () => {
          throw thrown;
        },
        ...OPTIONS
      });
      await r.action.press();
      expect(r.action.state().say).toBe('R did not start');
      expect(r.action.state().details.more).toEqual(['The browser gave no reason.']);
    }
  });

  it('APP-R-058: a chart whose library has a note is drawn under it in the same card: the note is the standard one, blue or amber as the library says, with the button inside its sentence; pressing that button is the control’s press, asked once, and hands the open chart its new settings without drawing it again; the note follows what happened and leaves when the library has none (#322)', async () => {
    let phase = 'idle';
    let finish;
    const press = vi.fn(() => {
      phase = 'starting';
      return new Promise((resolve) => {
        finish = () => {
          phase = 'done';
          resolve();
        };
      });
    });
    const action = {
      state: () =>
        ({
          idle: { label: 'Start R', say: 'Statistics need R' },
          starting: { phase: 'starting', say: 'Starting R' },
          done: { phase: 'ready', say: 'R ready' }
        })[phase],
      press
    };
    const said = vi.fn(
      (module) =>
        ({
          idle: {
            kind: module === 'stand-in-strip' ? 'warning' : 'info',
            before: 'This chart cannot be drawn without R. ',
            label: 'Start R',
            after: ' to draw it.'
          },
          starting: { kind: 'info', busy: true, before: 'R is starting.', meta: '13 MB' },
          done: null
        })[phase]
    );
    const app = mounted({ ...standIn, settings: () => ({}), action, note: said });
    app.select('stand-in-strip');
    const card = document.querySelector('.sva-chart');
    const callout = () => card.querySelector('.sva-chart-note .sva-callout');
    // The note first, the chart's own place after it, and the chart in that.
    expect([...card.children].map((child) => child.className)).toEqual([
      'sva-chart-note',
      'sva-chart-mount'
    ]);
    expect(card.querySelector('.sva-chart-mount .stand-in-strip')).not.toBeNull();
    expect(said).toHaveBeenCalledWith('stand-in-strip');
    expect(callout().dataset.kind).toBe('warning');
    expect(callout().classList.contains('sva-warning')).toBe(true);
    // The note's place is the status region: it stays on the page while the note in it is drawn again.
    const slot = card.querySelector('.sva-chart-note');
    expect(slot.getAttribute('role')).toBe('status');
    expect(callout().hasAttribute('role')).toBe(false);
    expect(callout().querySelector('.sva-callout-say').textContent).toBe(
      'This chart cannot be drawn without R. Start R to draw it.'
    );
    // The button is in the sentence, and is not the control's.
    const button = callout().querySelector('.sva-callout-say > button.sva-note-start');
    expect(button.textContent).toBe('Start R');
    expect(callout().querySelector('.sva-close')).toBeNull();
    const drawn = standInLog.filter((entry) => entry.event !== 'setSettings').length;

    // Pressed from the keyboard: the keyboard stays with the note as it is drawn again.
    button.focus();
    button.click();
    expect(press).toHaveBeenCalledTimes(1);
    expect(card.querySelector('.sva-chart-note')).toBe(slot);
    expect(document.activeElement).toBe(callout());
    expect(callout().dataset.kind).toBe('info');
    expect(callout().querySelector('.sva-spin')).not.toBeNull();
    expect(callout().querySelector('button')).toBeNull();
    expect(callout().querySelector('.sva-callout-say').textContent).toBe('R is starting. 13 MB');
    expect(callout().querySelector('.sva-callout-meta').textContent).toBe('13 MB');
    // The control in the row says the same thing happened: it was one press.
    expect(document.querySelector('.sva-r .sva-r-say').textContent).toBe('Starting R');

    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(callout()).toBeNull();
    expect(card.querySelector('.sva-chart-note').hidden).toBe(true);
    // The note is gone, so the keyboard goes to the control in the row; this
    // control's chip has nothing behind it to open, so it goes to the chart's card.
    expect(document.querySelector('.sva-charts .sva-r button').disabled).toBe(true);
    expect(document.activeElement).toBe(card);
    // The chart was handed its settings and never drawn again.
    expect(standInLog.filter((entry) => entry.event !== 'setSettings')).toHaveLength(drawn);
    expect(standInLog.some((entry) => entry.event === 'setSettings')).toBe(true);
    expect(card.querySelector('.sva-chart-mount .stand-in-strip')).not.toBeNull();
    app.destroy();
  });

  it('APP-R-059: a blue note with a cross is closed by it: the library is told, the note leaves the card and the chart is handed its settings again; a library with no note, or one whose note throws or says nothing that can be read, leaves the chart drawn in the card as it always was, and a safety chart’s card is never given one (#322)', () => {
    let closed = false;
    const close = vi.fn(() => {
      closed = true;
    });
    const said = vi.fn(() =>
      closed ? null : { kind: 'info', before: 'P-values need R. ', label: 'Start R', close }
    );
    const action = { state: () => ({ label: 'Start R' }), press: vi.fn() };
    let app = mounted({ ...standIn, settings: () => ({}), action, note: said });
    app.select('stand-in-strip');
    const callout = () => document.querySelector('.sva-chart-note .sva-callout');
    expect(callout().dataset.kind).toBe('info');
    standInLog.length = 0;
    callout().querySelector('.sva-close').focus();
    callout().querySelector('.sva-close').click();
    expect(close).toHaveBeenCalledTimes(1);
    expect(callout()).toBeNull();
    // The keyboard goes to the control, which the chart's line now points at.
    expect(document.activeElement).toBe(document.querySelector('.sva-charts .sva-r button'));
    expect(document.activeElement.textContent).toBe('Start R');
    expect(standInLog.map((entry) => entry.event)).toEqual(['setSettings']);
    expect(action.press).not.toHaveBeenCalled();
    // A safety chart has no note of a library's.
    app.select('histogram');
    expect(document.querySelector('.sva-chart-note')).toBeNull();
    expect(said).not.toHaveBeenCalledWith('histogram');
    app.destroy();

    // No note at all: the chart is drawn in the card itself.
    app = mounted({ ...standIn, settings: () => ({}), action });
    app.select('stand-in-strip');
    expect(document.querySelector('.sva-chart > .stand-in-strip')).not.toBeNull();
    expect(document.querySelector('.sva-chart-note')).toBeNull();
    app.destroy();

    // A note that throws, or says nothing that can be read: the card, the chart, and no note.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const broken of [
      () => {
        throw new Error('no');
      },
      () => 'words',
      () => ({ kind: 'warning' })
    ]) {
      app = mounted({ ...standIn, settings: () => ({}), action, note: broken });
      app.select('stand-in-strip');
      expect(document.querySelector('.sva-chart-mount .stand-in-strip')).not.toBeNull();
      expect(document.querySelector('.sva-chart-note').hidden).toBe(true);
      expect(document.querySelector('.sva-callout.sva-start-note')).toBeNull();
      app.destroy();
    }
    expect(warn).toHaveBeenCalledWith(
      'safety.viz app: a library could not say its note.',
      expect.any(Error)
    );
    warn.mockRestore();
  });

  it('APP-R-025: a library control whose press throws leaves the page working: nothing is thrown out of the click, a warning says why, and the control shows what it now says (#193)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let label = 'Start R';
    const action = {
      state: () => ({ label, done: false, note: null, hint: null }),
      press: () => {
        label = 'Try R again';
        throw new Error('the control broke');
      }
    };
    const app = mounted({ ...standIn, action });
    app.select('stand-in-strip');
    const errors = [];
    const onError = (event) => errors.push(event.error);
    window.addEventListener('error', onError);
    document.querySelector('.sva-action').click();
    window.removeEventListener('error', onError);
    expect(errors).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      'safety.viz app: a library’s control failed when pressed.',
      expect.objectContaining({ message: 'the control broke' })
    );
    expect(document.querySelector('.sva-action').textContent).toBe('Try R again');
    // The chart is still open and still answers.
    expect(document.querySelector('.sva-chart .stand-in-strip')).not.toBeNull();
    warn.mockRestore();
    app.destroy();
  });
});
