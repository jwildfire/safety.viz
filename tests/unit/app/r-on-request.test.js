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
    expect(answer.message).toBe(
      'Statistics need R. Start R to compute them: it downloads about 13 MB, once, from ' +
        'webr.r-wasm.org, and the study’s data stays in this browser.'
    );
    expect(createConnection).not.toHaveBeenCalled();
    expect(note).toBeNull();
    expect(r.action.state()).toMatchObject({ label: 'Start R', done: false });
    expect(r.action.state().note).toBe(answer.message);
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
    expect(r.action.state()).toMatchObject({ label: 'Starting R…', done: true });
    await started;
    expect(r.action.state()).toMatchObject({ label: 'R started', done: true });
    // A chart made before the reader asked, and one made after, reach the same R.
    const after = r.settings().connection;
    await before.run('one', { data: [], args: {} });
    await after.run('two', { data: [], args: {} });
    expect(made).toHaveLength(1);
    expect(made[0].run.mock.calls.map(([name]) => name)).toEqual(['identity', 'one', 'two']);
  });

  it('APP-R-015: while R starts the waiting note says what it downloads; once R has answered there is no such note, and the control says R is running (#183)', async () => {
    const { createConnection } = fakeFactory();
    const r = rOnRequest({ createConnection, ...OPTIONS });
    expect(r.action.state().hint).toBe('About 13 MB, once');
    const started = r.action.press();
    expect(r.settings().waiting_note).toBe(
      'R is starting in this browser: about 13 MB to download, once, from webr.r-wasm.org.'
    );
    await started;
    expect(r.settings().waiting_note).toBeNull();
    expect(r.action.state()).toMatchObject({
      label: 'R started',
      note: 'R is running in this browser.',
      hint: null
    });
  });

  it('APP-R-016: when R does not start, the control says so and offers to try again, every chart is told without starting R again, and trying again makes one fresh connection (#183)', async () => {
    // The first connection cannot start R; the second can.
    const { createConnection, made } = fakeFactory((index) => (index === 0 ? LOAD_FAILED : null));
    const r = rOnRequest({ createConnection, ...OPTIONS });
    await r.action.press();
    expect(r.action.state()).toMatchObject({ label: 'Try R again', done: false });
    expect(r.action.state().note).toBe(
      'R did not start: bio.viz: R could not be started in the browser: Failed to fetch. ' +
        'Try again; if it fails again, reload the page.'
    );
    // Charts are answered with that, and R is not asked again until the reader asks.
    const answer = await r.settings().connection.run('one', { data: [], args: {} });
    await r.settings().connection.run('two', { data: [], args: {} });
    expect(answer).toEqual({
      status: 'unavailable',
      reason: 'load-failed',
      message: r.action.state().note
    });
    expect(made).toHaveLength(1);
    expect(made[0].run).toHaveBeenCalledTimes(1);
    expect(r.settings().waiting_note).toBeNull();
    // Trying again: one fresh connection, which starts R.
    await r.action.press();
    expect(made).toHaveLength(2);
    expect(r.action.state()).toMatchObject({ label: 'R started', done: true });
    expect((await r.settings().connection.run('three', { data: [], args: {} })).status).toBe('ok');
    expect(made[1].run.mock.calls.map(([name]) => name)).toEqual(['identity', 'three']);
  });

  it('APP-R-016: an answer that says R could not start, arriving for a chart after R had started, is treated the same way (#183)', async () => {
    let fail = false;
    const { createConnection, made } = fakeFactory(() => (fail ? LOAD_FAILED : null));
    const r = rOnRequest({ createConnection, ...OPTIONS });
    await r.action.press();
    fail = true;
    const answer = await r.settings().connection.run('one', { data: [], args: {} });
    expect(answer.reason).toBe('load-failed');
    expect(r.action.state().label).toBe('Try R again');
    await r.settings().connection.run('two', { data: [], args: {} });
    expect(made[0].run).toHaveBeenCalledTimes(2);
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

  it('APP-R-005: a library’s control is shown with its group’s charts, with what it costs in words beside it; pressing it asks once, hands the open chart its new settings without drawing it again, and the control follows what happened (#183)', async () => {
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
    const group = () => document.querySelector('.sva-group[data-group="stand-in"]');
    const button = () => group().querySelector('.sva-action');
    expect(button().textContent).toBe('Start R');
    expect(button().title).toBe('Statistics need R.');
    expect(button().disabled).toBe(false);
    expect(group().querySelector('.sva-action-hint').textContent).toBe('About 13 MB, once');
    // No other group carries it.
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
    expect(group().querySelector('.sva-action-hint')).toBeNull();
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
    const button = () => document.querySelector('.sva-action');
    const before = standInLog.length;
    button().click();
    const notes = () =>
      standInLog
        .slice(before)
        .filter((entry) => entry.event === 'setSettings')
        .map((entry) => entry.settings.waiting_note);
    expect(notes()).toEqual([
      'R is starting in this browser: about 13 MB to download, once, from webr.r-wasm.org.'
    ]);
    release();
    await vi.waitFor(() => expect(button().textContent).toBe('R started'));
    expect(notes()).toEqual([
      'R is starting in this browser: about 13 MB to download, once, from webr.r-wasm.org.',
      undefined
    ]);
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
    expect(r.action.state()).toMatchObject({ label: 'Try R again', done: false });
    expect(r.action.state().note).toBe(
      'R did not start: bio.viz: webR is not available. Try again; if it fails again, reload the page.'
    );
    expect(await r.settings().connection.run('one', { data: [], args: {} })).toEqual({
      status: 'unavailable',
      reason: 'load-failed',
      message: r.action.state().note
    });
    // On the page: pressing it changes the control, and nothing is thrown.
    const fresh = rOnRequest({ createConnection, ...OPTIONS });
    const app = mounted({ ...standIn, action: fresh.action });
    app.select('stand-in-strip');
    expect(() => document.querySelector('.sva-action').click()).not.toThrow();
    await vi.waitFor(() =>
      expect(document.querySelector('.sva-action').textContent).toBe('Try R again')
    );
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
      expect(r.action.state().label, how).toBe('Try R again');
      expect(r.action.state().note, how).toMatch(
        /^R did not start: (webR could not be created|the worker stopped)\. Try again;/
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
      expect(r.action.state().note).toBe(
        'R did not start, and no reason was given. Try again; if it fails again, reload the page.'
      );
    }
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
