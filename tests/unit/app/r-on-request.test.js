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
// and answers every run with "ok".
function fakeFactory() {
  const made = [];
  const createConnection = vi.fn((options) => {
    const connection = {
      options,
      run: vi.fn(async (name) => ({ status: 'ok', value: { name }, form: 'browser' }))
    };
    made.push(connection);
    return connection;
  });
  return { createConnection, made };
}

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

  it('APP-R-002: asking makes one connection, with the library’s own factory and the options given; every chart afterwards uses it, and asking again makes no second (#183)', async () => {
    const { createConnection, made } = fakeFactory();
    const r = rOnRequest({ createConnection, ...OPTIONS });
    const before = r.settings().connection;
    r.action.press();
    r.action.press();
    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(createConnection).toHaveBeenCalledWith({ browser: OPTIONS.browser });
    // A chart made before the reader asked, and one made after, reach the same R.
    const after = r.settings().connection;
    await before.run('one', { data: [], args: {} });
    await after.run('two', { data: [], args: {} });
    expect(made).toHaveLength(1);
    expect(made[0].run.mock.calls.map(([name]) => name)).toEqual(['one', 'two']);
    expect(r.settings().waiting_note).toBe(
      'R is starting in this browser: about 13 MB to download, once, from webr.r-wasm.org.'
    );
    expect(r.action.state()).toMatchObject({ label: 'R started', done: true });
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

  it('APP-R-005: a library’s control is shown with its group’s charts; pressing it asks once and draws the open chart again, and it then reads as done (#183)', () => {
    let done = false;
    const press = vi.fn(() => {
      done = true;
    });
    const action = {
      state: () =>
        done
          ? { label: 'R started', done: true, note: 'Started.' }
          : { label: 'Start R', done: false, note: 'Statistics need R.' },
      press
    };
    const app = mounted({ ...standIn, action });
    app.select('stand-in-strip');
    const button = () => document.querySelector('.sva-group[data-group="stand-in"] .sva-action');
    expect(button().textContent).toBe('Start R');
    expect(button().title).toBe('Statistics need R.');
    expect(button().disabled).toBe(false);
    // No other group carries it.
    expect(document.querySelectorAll('.sva-action')).toHaveLength(1);
    const inits = standInLog.filter((entry) => entry.event === 'init').length;
    button().click();
    expect(press).toHaveBeenCalledTimes(1);
    expect(standInLog.filter((entry) => entry.event === 'init').length).toBe(inits + 1);
    expect(button().textContent).toBe('R started');
    expect(button().disabled).toBe(true);
    app.destroy();
  });
});
