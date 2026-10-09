// Demo app: a connection to R in the browser that can run a pipeline (#231,
// obot.roadmap#373). bio.viz's connection hands R one table and asks one
// question; the RBQM pipeline needs packages from a second package repository,
// several files at once, and R source and workflow files of its own. This
// module reaches webR directly for that, and keeps bio.viz's shape so the
// app's Start R control (r-on-request.js) can drive either: `createConnection`
// starts nothing and requests nothing, and `run` always resolves, to one of
//
//   { status: 'ok', value, form: 'browser' }           R answered
//   { status: 'unavailable', reason: 'load-failed', message }  R did not start
//   { status: 'error', message }                       R ran and stopped
//
// On the first run, and not before, it imports webR from its host, starts R,
// installs the packages from the repositories given, writes the files given
// into R's own file system, and sources the R files named. A run then writes
// the caller's files beside them and calls one R function. The files a reader
// loads are written into R in this page and are sent nowhere.
//
// Nothing here computes anything: R answers, and this module carries the
// answer back as plain values.

/** The version of webR this is written for, and where it is fetched from. */
export const WEBR_VERSION = '0.6.0';
export const WEBR_BASE_URL = `https://webr.r-wasm.org/v${WEBR_VERSION}/`;

const importFromUrl = (url) => import(/* @vite-ignore */ url);
const messageOf = (error) =>
  (error && typeof error.message === 'string' && error.message) || String(error);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value !== '';

// Carried to R with each run: turn the answer into something that crosses to
// JavaScript without losing what it is. A data frame, at any depth, becomes a
// marked list of its columns; everything else is left as R has it.
const R_WIRE = `
.sv_wire <- function(x) {
  if (is.data.frame(x)) {
    list(.sv_table = TRUE, rows = nrow(x), columns = lapply(as.list(x), function(column) {
      if (inherits(column, c("Date", "POSIXt")) || is.factor(column)) as.character(column) else column
    }))
  } else if (is.list(x)) {
    lapply(x, .sv_wire)
  } else if (inherits(x, c("Date", "POSIXt")) || is.factor(x)) {
    as.character(x)
  } else {
    x
  }
}`;

/**
 * An R value as webR hands it over (`toJs()`), as plain JavaScript: a data
 * frame is an array of row objects, one per row, every row carrying every
 * column; a named list or vector is an object; an unnamed list is an array; an
 * unnamed vector of length one is a single value and of any other length an
 * array; NA and NULL are null.
 * @param {Object} node What `toJs()` returned.
 * @returns {*} The plain value.
 */
export function fromWire(node) {
  if (node === null || node === undefined || node.type === 'null') return null;
  if (!isRecord(node) || !Array.isArray(node.values)) return node;
  const { names, values } = node;
  if (node.type === 'list') {
    const converted = values.map(fromWire);
    if (!names || !names.some(isText)) return converted;
    const object = Object.fromEntries(names.map((name, index) => [name, converted[index]]));
    if (object['.sv_table'] !== true) return object;
    // A table: its columns side by side, read out a row at a time. A column of
    // one row arrived as a single value.
    const columns = isRecord(object.columns) ? object.columns : {};
    const cell = (column, row) => (Array.isArray(column) ? column[row] : column);
    return Array.from({ length: object.rows }, (_, row) =>
      Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, cell(column, row)]))
    );
  }
  if (names && names.some(isText)) {
    return Object.fromEntries(names.map((name, index) => [name, values[index]]));
  }
  return values.length === 1 ? values[0] : values;
}

/**
 * Every folder above a path, shallowest first: R's file system makes one
 * folder at a time.
 * @param {string} file An absolute path in R's file system.
 * @returns {string[]} Its folders.
 */
export function foldersOf(file) {
  const parts = String(file).split('/').filter(Boolean).slice(0, -1);
  return parts.map((_, index) => `/${parts.slice(0, index + 1).join('/')}`);
}

function optionProblem(options) {
  if (!isRecord(options)) return 'the options are not an object';
  const { packages = [], repos = [], files = [], source = [] } = options;
  if (!Array.isArray(packages) || !packages.every(isText)) return 'packages is not a list of names';
  if (!Array.isArray(repos) || !repos.every(isText)) return 'repos is not a list of addresses';
  if (!Array.isArray(files) || !files.every((file) => isRecord(file) && isText(file.path))) {
    return 'files is not a list of { path, url } or { path, text }';
  }
  const unsourced = files.find((file) => !isText(file.url) && typeof file.text !== 'string');
  if (unsourced) return `the file ${unsourced.path} has neither a url nor text`;
  const relative = files.find((file) => !file.path.startsWith('/'));
  if (relative) return `the file path ${relative.path} is not absolute`;
  if (!Array.isArray(source) || !source.every(isText)) return 'source is not a list of paths';
  if (options.onStage != null && typeof options.onStage !== 'function') {
    return 'onStage is not a function';
  }
  return null;
}

/**
 * A connection to R in the browser.
 * @param {Object} [options]
 * @param {string} [options.baseUrl] Where webR is served from; webr.r-wasm.org at WEBR_VERSION by default.
 * @param {string[]} [options.packages] R packages to install before anything is sourced.
 * @param {string[]} [options.repos] The package repositories to install from, first one first. Relative addresses resolve against the page.
 * @param {Array<{path: string, url?: string, text?: string}>} [options.files] Files to put in R's file system when R starts: each fetched from its url, or written from its text.
 * @param {string[]} [options.source] Paths, among those files, of R source to evaluate once the packages are installed.
 * @param {(stage: 'runtime'|'packages'|'files'|'source') => void} [options.onStage] Told each step of starting R as it begins, so a page can say what R is doing: fetching and starting R itself, installing the packages, fetching the files, evaluating the R source. A step with nothing to do is not named.
 * @param {(url: string) => Promise<Object>} [options.importWebR] Something else to import webR with; used by the tests.
 * @param {(url: string) => Promise<Response>} [options.fetch] Something else to fetch the files with; used by the tests.
 * @returns {{run: (name: string, request?: {files?: Object<string, string>, args?: Object}) => Promise<Object>, close: () => Promise<void>}} The connection.
 */
export function createConnection(options = {}) {
  const problem = optionProblem(options);
  if (problem) throw new TypeError(`r-browser: ${problem}.`);
  const {
    baseUrl = WEBR_BASE_URL,
    packages = [],
    repos = [],
    files = [],
    source = [],
    onStage = null,
    importWebR = importFromUrl,
    fetch: fetchFile = (url) => globalThis.fetch(url)
  } = options;

  let started = null;
  // The R that is starting or up, held from the moment it is made, and a count
  // of the times the connection was closed: closing lets go of R at once and
  // never waits on an R that has stopped answering (#261).
  let live = null;
  let closes = 0;
  const encoder = new TextEncoder();
  // What the page does with a step's name is the page's: it cannot stop R starting.
  const stage = (name) => {
    if (typeof onStage !== 'function') return;
    try {
      onStage(name);
    } catch {
      // Nothing to do: R starts all the same.
    }
  };

  async function write(webR, file, text) {
    for (const folder of foldersOf(file)) {
      // A folder that is already there is not a failure.
      await webR.FS.mkdir(folder).catch(() => {});
    }
    await webR.FS.writeFile(file, encoder.encode(text));
  }

  async function start() {
    const mine = closes;
    stage('runtime');
    const { WebR, ChannelType } = await importWebR(`${baseUrl}webr.mjs`);
    // Closed while R was being fetched: no R is made for a connection let go of.
    if (mine !== closes) throw new Error('R was closed while it was starting');
    // The channel that needs no cross-origin isolation headers: a static host
    // such as GitHub Pages sends none.
    const webR = new WebR({ baseUrl, channelType: ChannelType.PostMessage });
    live = webR;
    try {
      await webR.init();
      await prepare(webR);
    } catch (error) {
      // An R that could not be made ready is closed: the next run starts another.
      if (live === webR) {
        live = null;
        shut(webR);
      }
      throw error;
    }
    return webR;
  }

  function shut(webR) {
    try {
      if (webR && typeof webR.close === 'function') webR.close();
    } catch {
      // Nothing to do: it is being let go of either way.
    }
  }

  async function prepare(webR) {
    if (packages.length) {
      // As R reads a repository's address: absolute, and with no trailing slash.
      const from = repos.map((repo) =>
        new URL(repo, globalThis.location?.href).href.replace(/\/$/, '')
      );
      stage('packages');
      await webR.installPackages(packages, {
        quiet: true,
        ...(from.length ? { repos: from } : {})
      });
    }
    if (files.length) stage('files');
    for (const file of files) {
      let text = file.text;
      if (typeof text !== 'string') {
        const response = await fetchFile(file.url);
        if (!response.ok) throw new Error(`${file.url} answered ${response.status}`);
        text = await response.text();
      }
      await write(webR, file.path, text);
    }
    await webR.evalRVoid(R_WIRE);
    if (source.length) stage('source');
    for (const path of source) {
      await webR.evalRVoid(`source(${JSON.stringify(path)}, local = FALSE)`);
    }
  }

  return Object.freeze({
    /**
     * Ask R to call one function.
     * @param {string} name The R function: one a sourced file defines, or one R already has.
     * @param {Object} [request]
     * @param {Object<string, string>} [request.files] Files to write into R's file system before the call, as text by absolute path.
     * @param {Object} [request.args] Named arguments; a nested object becomes a nested R list.
     * @returns {Promise<Object>} The answer; it never rejects.
     */
    async run(name, { files: given = {}, args = {} } = {}) {
      if (!isText(name)) return { status: 'error', message: 'r-browser: no R function was named.' };
      if (!isRecord(given) || !isRecord(args)) {
        return { status: 'error', message: 'r-browser: files and args must each be an object.' };
      }
      let webR;
      if (!started) started = start();
      const mine = started;
      try {
        webR = await mine;
      } catch (error) {
        // The next run tries again from the start.
        if (started === mine) started = null;
        return { status: 'unavailable', reason: 'load-failed', message: messageOf(error) };
      }
      let shelter;
      try {
        for (const [file, text] of Object.entries(given)) await write(webR, file, String(text));
        shelter = await new webR.Shelter();
        // The arguments go over as a named R list, built as one: left to
        // itself webR reads an object of equal-length arrays as a data frame.
        const list = await new shelter.RList(args);
        const answer = await shelter.evalR('.sv_wire(do.call(.sv_name, .sv_args))', {
          env: { '.sv_name': name, '.sv_args': list }
        });
        return { status: 'ok', value: fromWire(await answer.toJs()), form: 'browser' };
      } catch (error) {
        return { status: 'error', message: messageOf(error) };
      } finally {
        if (shelter) await shelter.purge().catch(() => {});
      }
    },

    /**
     * Let go of R: its worker is closed, and the next run starts R again.
     * A connection that never started R has nothing to close. R is closed at
     * once, whether or not it has finished starting and whether or not it
     * still answers.
     * @returns {Promise<void>} Settled when R is closed; it never rejects.
     */
    async close() {
      closes += 1;
      started = null;
      const webR = live;
      live = null;
      if (webR) shut(webR);
    }
  });
}
