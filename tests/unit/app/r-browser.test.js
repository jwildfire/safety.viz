import { describe, it, expect } from 'vitest';
import {
  WEBR_BASE_URL,
  WEBR_VERSION,
  createConnection,
  foldersOf,
  fromWire
} from '../../../src/app/r-browser.js';

// The connection to R in the browser that runs a pipeline (#231,
// obot.roadmap#373), against a stand-in for webR that records what is asked of
// it. The browser tests run it against real webR.

// What webR's `toJs()` returns, written by hand.
const vector = (type, values, names = null) => ({ type, names, values });
const list = (entries) =>
  Array.isArray(entries)
    ? { type: 'list', names: null, values: entries }
    : { type: 'list', names: Object.keys(entries), values: Object.values(entries) };
const table = (rows, columns) =>
  list({ '.sv_table': vector('logical', [true]), rows: vector('integer', [rows]), columns });

// A webR that records every call, in order, and answers `evalR` with `answer`.
function standIn({ answer = vector('double', [1]), fail = {} } = {}) {
  const calls = [];
  const note = (call, ...rest) => {
    calls.push([call, ...rest]);
    if (fail[call]) throw new Error(fail[call]);
  };
  class WebR {
    constructor(options) {
      note('new', options);
      this.FS = {
        mkdir: async (folder) => note('mkdir', folder),
        writeFile: async (file, bytes) => note('write', file, new TextDecoder().decode(bytes))
      };
      this.Shelter = class {
        constructor() {
          return Promise.resolve({
            // A named R list, built from an object: kept as what it was built from.
            RList: class {
              constructor(value) {
                note('list', value);
                return Promise.resolve({ rList: value });
              }
            },
            evalR: async (code, options) => {
              note('evalR', code, options.env);
              return { toJs: async () => answer };
            },
            purge: async () => note('purge')
          });
        }
      };
    }
    async init() {
      note('init');
    }
    async installPackages(packages, options) {
      note('install', packages, options);
    }
    async evalRVoid(code) {
      note('evalRVoid', code);
    }
  }
  const imported = [];
  const importWebR = async (url) => {
    imported.push(url);
    if (fail.import) throw new Error(fail.import);
    return { WebR, ChannelType: { PostMessage: 'post-message' } };
  };
  return { calls, imported, importWebR };
}

const fetchOf = (texts) => async (url) =>
  url in texts
    ? { ok: true, status: 200, text: async () => texts[url] }
    : { ok: false, status: 404, text: async () => '' };

describe('an R value carried to JavaScript (#231)', () => {
  it('APP-R-034: reads a data frame as one object per row, every row carrying every column, NA as null', () => {
    const frame = table(
      2,
      list({
        GroupID: vector('character', ['SITE1', 'SITE2']),
        Score: vector('double', [1.5, null]),
        Flag: vector('integer', [0, 2])
      })
    );
    expect(fromWire(frame)).toEqual([
      { GroupID: 'SITE1', Score: 1.5, Flag: 0 },
      { GroupID: 'SITE2', Score: null, Flag: 2 }
    ]);
  });

  it('APP-R-034: reads a table of one row as an array of one object, and of no rows as an empty array', () => {
    expect(fromWire(table(1, list({ MetricID: vector('character', ['kri0001']) })))).toEqual([
      { MetricID: 'kri0001' }
    ]);
    expect(fromWire(table(0, list({ MetricID: vector('character', []) })))).toEqual([]);
  });

  it('APP-R-034: reads a named list as an object, an unnamed list as an array, and tables at any depth', () => {
    const value = list({
      Results: table(1, list({ Flag: vector('integer', [1]) })),
      ran: list({ metrics: list([vector('character', ['kri0001'])]) }),
      seconds: list({ read: vector('double', [0.01]) }),
      warnings: list([])
    });
    expect(fromWire(value)).toEqual({
      Results: [{ Flag: 1 }],
      ran: { metrics: ['kri0001'] },
      seconds: { read: 0.01 },
      warnings: []
    });
  });

  it('APP-R-034: reads a vector of length one as a single value, a longer one as an array, a named one as an object, and NULL as null', () => {
    expect(fromWire(vector('double', [0.05]))).toBe(0.05);
    expect(fromWire(vector('character', ['a', 'b']))).toEqual(['a', 'b']);
    expect(fromWire(vector('integer', [86, 84], ['Placebo', 'Active']))).toEqual({
      Placebo: 86,
      Active: 84
    });
    expect(fromWire({ type: 'null' })).toBeNull();
    expect(fromWire(null)).toBeNull();
  });
});

describe('the connection to R in the browser (#231)', () => {
  const options = (webR, more = {}) => ({
    packages: ['workr', 'gsm.core'],
    repos: ['https://example.org/r-wasm', 'https://repo.r-wasm.org'],
    files: [
      { path: '/rbqm/pipeline.R', url: 'pipeline.R' },
      { path: '/rbqm/workflow/2_metrics/kri0001.yaml', text: 'meta:\n  ID: kri0001\n' }
    ],
    source: ['/rbqm/pipeline.R'],
    importWebR: webR.importWebR,
    fetch: fetchOf({ 'pipeline.R': 'rbqm_run <- function(...) 1' }),
    ...more
  });

  it('APP-R-033: is written for one version of webR, fetched from its public host', () => {
    expect(WEBR_VERSION).toBe('0.6.0');
    expect(WEBR_BASE_URL).toBe('https://webr.r-wasm.org/v0.6.0/');
  });

  it('APP-R-033: starts nothing and asks for nothing when it is made', () => {
    const webR = standIn();
    createConnection(options(webR));
    expect(webR.imported).toEqual([]);
    expect(webR.calls).toEqual([]);
  });

  it('APP-R-033: refuses options it cannot use, when it is made', () => {
    expect(() => createConnection({ packages: 'workr' })).toThrow(
      'r-browser: packages is not a list of names.'
    );
    expect(() => createConnection({ files: [{ path: 'pipeline.R', text: '' }] })).toThrow(
      'r-browser: the file path pipeline.R is not absolute.'
    );
    expect(() => createConnection({ files: [{ path: '/pipeline.R' }] })).toThrow(
      'r-browser: the file /pipeline.R has neither a url nor text.'
    );
  });

  it('APP-R-033: on the first run starts R on the channel that needs no special headers, installs the packages from the repositories given, writes the files and sources the R, in that order', async () => {
    const webR = standIn();
    const connection = createConnection(options(webR));
    await connection.run('rbqm_run');
    expect(webR.imported).toEqual([`${WEBR_BASE_URL}webr.mjs`]);
    const order = webR.calls.map(([call]) => call);
    expect(order.slice(0, 3)).toEqual(['new', 'init', 'install']);
    expect(webR.calls[0][1]).toEqual({ baseUrl: WEBR_BASE_URL, channelType: 'post-message' });
    expect(webR.calls[2].slice(1)).toEqual([
      ['workr', 'gsm.core'],
      { quiet: true, repos: ['https://example.org/r-wasm', 'https://repo.r-wasm.org'] }
    ]);
    const writes = webR.calls
      .filter(([call]) => call === 'write')
      .map(([, file, text]) => [file, text]);
    expect(writes).toEqual([
      ['/rbqm/pipeline.R', 'rbqm_run <- function(...) 1'],
      ['/rbqm/workflow/2_metrics/kri0001.yaml', 'meta:\n  ID: kri0001\n']
    ]);
    // Each file's folders are made before it, shallowest first.
    expect(webR.calls.filter(([call]) => call === 'mkdir').map(([, folder]) => folder)).toEqual([
      '/rbqm',
      '/rbqm',
      '/rbqm/workflow',
      '/rbqm/workflow/2_metrics'
    ]);
    const sourced = webR.calls.filter(([call]) => call === 'evalRVoid').map(([, code]) => code);
    expect(sourced.at(-1)).toBe('source("/rbqm/pipeline.R", local = FALSE)');
    expect(order.indexOf('install')).toBeLessThan(order.indexOf('write'));
    expect(order.lastIndexOf('write')).toBeLessThan(order.lastIndexOf('evalRVoid'));
    expect(order.lastIndexOf('evalRVoid')).toBeLessThan(order.indexOf('evalR'));
  });

  it('APP-R-033: starts R once: a second run installs nothing and writes only what it is given', async () => {
    const webR = standIn();
    const connection = createConnection(options(webR));
    await connection.run('rbqm_run');
    const before = webR.calls.length;
    await connection.run('rbqm_run', { files: { '/rbqm/data/Raw_AE.csv': 'subjid\nS1\n' } });
    expect(webR.imported).toHaveLength(1);
    const after = webR.calls.slice(before).map(([call]) => call);
    expect(after).toEqual(['mkdir', 'mkdir', 'write', 'list', 'evalR', 'purge']);
  });

  it('APP-R-033: calls the one R function named, with the named arguments, and carries its answer back', async () => {
    const webR = standIn({
      answer: list({ Results: table(1, list({ Flag: vector('integer', [2]) })) })
    });
    const connection = createConnection(options(webR));
    const answer = await connection.run('rbqm_run', {
      files: { '/rbqm/data/Raw_AE.csv': 'subjid\nS1\n' },
      args: { data: '/rbqm/data', metric_ids: ['kri0001'] }
    });
    expect(answer).toEqual({ status: 'ok', value: { Results: [{ Flag: 2 }] }, form: 'browser' });
    const [, code, env] = webR.calls.find(([call]) => call === 'evalR');
    expect(code).toBe('.sv_wire(do.call(.sv_name, .sv_args))');
    // The arguments cross as a named R list, built as one.
    expect(env).toEqual({
      '.sv_name': 'rbqm_run',
      '.sv_args': { rList: { data: '/rbqm/data', metric_ids: ['kri0001'] } }
    });
    expect(
      webR.calls.find(([call, file]) => call === 'write' && file === '/rbqm/data/Raw_AE.csv')[2]
    ).toBe('subjid\nS1\n');
  });

  it('APP-R-033: answers that R did not start, with the cause, when webR cannot be fetched, a package cannot be installed or a file cannot be read; and the next run tries again', async () => {
    const offline = standIn({ fail: { import: 'Failed to fetch dynamically imported module' } });
    const connection = createConnection(options(offline));
    expect(await connection.run('rbqm_run')).toEqual({
      status: 'unavailable',
      reason: 'load-failed',
      message: 'Failed to fetch dynamically imported module'
    });
    await connection.run('rbqm_run');
    expect(offline.imported).toHaveLength(2);

    const noPackage = standIn({ fail: { install: 'package ‘gsm.core’ is not available' } });
    expect(await createConnection(options(noPackage)).run('rbqm_run')).toEqual({
      status: 'unavailable',
      reason: 'load-failed',
      message: 'package ‘gsm.core’ is not available'
    });

    const noFile = standIn();
    expect(await createConnection(options(noFile, { fetch: fetchOf({}) })).run('rbqm_run')).toEqual(
      { status: 'unavailable', reason: 'load-failed', message: 'pipeline.R answered 404' }
    );
  });

  it('APP-R-033: answers with R’s own message when R runs and stops, and with a message of its own when the call cannot be made', async () => {
    const stopped = standIn({
      fail: { evalR: 'Spec-declared input ‘Raw_SUBJ’ not found in lData.' }
    });
    expect(await createConnection(options(stopped)).run('rbqm_run')).toEqual({
      status: 'error',
      message: 'Spec-declared input ‘Raw_SUBJ’ not found in lData.'
    });
    // The shelter is released whether or not R answered.
    expect(stopped.calls.at(-1)).toEqual(['purge']);

    const webR = standIn();
    const connection = createConnection(options(webR));
    expect(await connection.run('')).toEqual({
      status: 'error',
      message: 'r-browser: no R function was named.'
    });
    expect(await connection.run('rbqm_run', { args: ['kri0001'] })).toEqual({
      status: 'error',
      message: 'r-browser: files and args must each be an object.'
    });
    expect(webR.imported).toEqual([]);
  });

  it('APP-R-033: lists a path’s folders shallowest first', () => {
    expect(foldersOf('/rbqm/workflow/1_mappings/AE.yaml')).toEqual([
      '/rbqm',
      '/rbqm/workflow',
      '/rbqm/workflow/1_mappings'
    ]);
    expect(foldersOf('/pipeline.R')).toEqual([]);
  });
});
