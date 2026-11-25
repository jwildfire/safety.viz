// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import { builderTab } from '../../../src/app/builder-view.js';
import { builderTabOptions } from '../../../scripts/builder-lib.mjs';

// The Build a study tab on the page: a tab a library brings through the
// second-library seam, which starts R only when the reader presses Build,
// says what R is doing, and loads what R returns as gsm's raw files. R is a
// stand-in here: the connection answers with a small study. Real R is held by
// the trial script and the browser.

const OPTIONS = builderTabOptions();
const ANSWER = {
  study_id: 'BUILT-001',
  snapshot_date: '2012-09-30',
  snapshots: 9,
  seconds: 2.1,
  simulator: '2.1.0',
  files: [
    {
      name: 'Raw_SUBJ.csv',
      rows: 2,
      text: 'studyid,subjid,invid\nBUILT-001,S1,SITE1\nBUILT-001,S2,SITE1\n'
    },
    { name: 'Raw_SITE.csv', rows: 1, text: 'studyid,invid\nBUILT-001,SITE1\n' }
  ]
};

/** A connection that records what it was asked and answers when told to. */
function fakeR(answer = { status: 'ok', value: ANSWER, form: 'browser' }) {
  const made = [];
  const createConnection = vi.fn((options) => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const connection = {
      options,
      runs: [],
      closed: false,
      release,
      run: vi.fn(async (name, request) => {
        connection.runs.push({ name, request });
        await gate;
        return typeof answer === 'function' ? answer() : answer;
      }),
      close: vi.fn(async () => {
        connection.closed = true;
      })
    };
    made.push(connection);
    return connection;
  });
  return { createConnection, made };
}

let app = null;
afterEach(() => {
  if (app) app.destroy();
  app = null;
  document.body.innerHTML = '';
});

function mount(view) {
  document.body.innerHTML = '<div id="app"></div>';
  app = mountApp('#app', {
    charts: {},
    manifest,
    libraries: [{ name: 'gsm.datasim', view }]
  });
  app.select('build');
  return app;
}

const field = (name) => document.querySelector(`.sva-build-form [name="${name}"]`);
const press = () =>
  document
    .querySelector('.sva-build-form')
    .dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the Build a study tab', () => {
  it('is a tab of its own, with a form and nothing asked of R', () => {
    const r = fakeR();
    mount(builderTab({ createConnection: r.createConnection, ...OPTIONS }));
    expect(document.querySelector('[data-tab="build"]').textContent).toContain('Build a study');
    expect(field('participants').value).toBe('150');
    expect(field('phase').value).toBe('P2');
    expect(document.querySelector('.sva-build').textContent).toContain(
      'The first build starts R in this browser and downloads about 55 MB'
    );
    expect(document.querySelector('.sva-build-caveats').textContent).toContain(
      'Phase and therapeutic area are labels'
    );
    expect(r.createConnection).not.toHaveBeenCalled();
  });

  it('fills in a typical size when the phase changes', () => {
    const r = fakeR();
    mount(builderTab({ createConnection: r.createConnection, ...OPTIONS }));
    const phase = field('phase');
    phase.value = 'P1';
    phase.dispatchEvent(new Event('change'));
    expect(field('participants').value).toBe('40');
    expect(field('sites').value).toBe('4');
    expect(field('months').value).toBe('6');
  });

  it('says what is wrong with the form and does not start R', () => {
    const r = fakeR();
    const view = builderTab({ createConnection: r.createConnection, ...OPTIONS });
    mount(view);
    const sites = field('sites');
    sites.value = '900';
    sites.dispatchEvent(new Event('input'));
    press();
    expect(document.querySelector('.sva-build-problems').textContent).toContain(
      'Sites must be a whole number from 2 to 100.'
    );
    expect(r.createConnection).not.toHaveBeenCalled();
    expect(view.state().phase).toBe('idle');
  });

  it('starts R on the press, hands it the form, and loads what it returns as raw files', async () => {
    const r = fakeR();
    const view = builderTab({ createConnection: r.createConnection, ...OPTIONS });
    const handle = mount(view);
    press();
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    const [connection] = r.made;
    expect(connection.options.packages).toEqual(OPTIONS.r.packages);
    expect(connection.options.source).toEqual(['/builder/builder.R']);
    expect(view.state().phase).toBe('building');
    expect(document.querySelector('[data-tab="build"]').textContent).toContain('building');
    expect(document.querySelector('.sva-build-status').textContent).toContain('Starting R');
    expect(document.querySelector('.sva-build-go').disabled).toBe(true);

    // R says each step of starting as it begins.
    connection.options.onStage('packages');
    expect(document.querySelector('.sva-build-status').textContent).toContain(
      'Installing R’s packages'
    );

    connection.release();
    await settle();
    await settle();
    expect(connection.runs[0].name).toBe('builder_run');
    expect(connection.runs[0].request.args).toEqual({
      simulator: '/builder/gsm.datasim',
      study_name: 'BUILT-001',
      participants: 150,
      sites: 20,
      months: 9,
      outlier_intensity: 1,
      phase: 'P2',
      therapeutic_area: 'Oncology'
    });
    expect(view.state().phase).toBe('done');
    expect(handle.state.raw.map((file) => file.name)).toEqual(['Raw_SUBJ.csv', 'Raw_SITE.csv']);
    expect(handle.state.raw[0].rows).toBe(2);
    const done = document.querySelector('.sva-build-done');
    expect(done.textContent).toContain('BUILT-001 is a simulated Phase 2 Oncology study');
    expect(done.textContent).toContain('Raw_SUBJ.csv: 2 rows');
    expect(document.querySelector('[data-tab="build"]').textContent).toContain('built');
  });

  it('builds a second study on the R it already started', async () => {
    const r = fakeR();
    const view = builderTab({ createConnection: r.createConnection, ...OPTIONS });
    mount(view);
    press();
    r.made[0].release();
    await settle();
    await settle();
    press();
    await settle();
    await settle();
    expect(r.createConnection).toHaveBeenCalledTimes(1);
    expect(r.made[0].runs.length).toBe(2);
    expect(view.state().phase).toBe('done');
  });

  it('offers the RBQM tab once a study is built', async () => {
    const r = fakeR();
    const handle = mount(builderTab({ createConnection: r.createConnection, ...OPTIONS }));
    const select = vi.spyOn(handle, 'select');
    press();
    r.made[0].release();
    await settle();
    await settle();
    document.querySelector('.sva-build-open').click();
    expect(select).toHaveBeenCalledWith('rbqm');
  });

  it('says what R said when the build stops, and loads nothing', async () => {
    const r = fakeR({ status: 'error', message: 'Sites must be no more than participants.' });
    const view = builderTab({ createConnection: r.createConnection, ...OPTIONS });
    const handle = mount(view);
    press();
    r.made[0].release();
    await settle();
    await settle();
    expect(view.state().phase).toBe('failed');
    expect(document.querySelector('.sva-build [role="alert"]').textContent).toBe(
      'The study was not built. R said: Sites must be no more than participants.'
    );
    expect(handle.state.raw).toEqual([]);
  });

  it('says so when R could not be started', async () => {
    const r = fakeR({ status: 'unavailable', reason: 'load-failed', message: 'offline' });
    const view = builderTab({ createConnection: r.createConnection, ...OPTIONS });
    mount(view);
    press();
    r.made[0].release();
    await settle();
    await settle();
    expect(document.querySelector('.sva-build [role="alert"]').textContent).toBe(
      'R could not be started in this browser: offline'
    );
  });

  it('refuses an answer with no files it can read', async () => {
    const r = fakeR({ status: 'ok', value: { files: [] }, form: 'browser' });
    const view = builderTab({ createConnection: r.createConnection, ...OPTIONS });
    mount(view);
    press();
    r.made[0].release();
    await settle();
    await settle();
    expect(view.state().failure).toBe(
      'The study was not built: R returned no files that can be read.'
    );
  });

  it('gives up on an R that does not answer, and lets go of it', async () => {
    vi.useFakeTimers();
    try {
      const r = fakeR();
      const view = builderTab({ createConnection: r.createConnection, ...OPTIONS, limit: 5 });
      mount(view);
      press();
      await vi.advanceTimersByTimeAsync(5000);
      expect(view.state().phase).toBe('failed');
      expect(view.state().failure).toContain('R gave no answer in 5 seconds');
      expect(r.made[0].close).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers no form on a page that cannot start R, and says why', () => {
    mount(builderTab({ unavailable: 'Building a study needs R, and this file cannot start R.' }));
    expect(document.querySelector('.sva-build-form')).toBeNull();
    expect(document.querySelector('.sva-build').textContent).toContain(
      'Building a study needs R, and this file cannot start R.'
    );
  });
});
