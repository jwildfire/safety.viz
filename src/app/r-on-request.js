// Demo app: R on request (#183, obot.roadmap#366). @jwildfire's choice of
// 2026-10-02: "R on request". A second chart library whose charts print R's
// tests is handed, through the second-library seam, a connection to R that
// starts nothing until the reader asks: before the reader presses the one
// control, every chart draws and its statistics line says that statistics need
// R and what starting it downloads, and R's hosts are asked for nothing.
// Pressing it makes one connection, with the library's own connection factory
// and the options given, and every chart drawn afterwards reaches R through
// it. A factory that throws is R that did not start, and the control says why.
//
// The app computes no statistic here or anywhere: the connection is the
// library's, R answers, and the chart prints what R said. This module only
// decides when the library's connection is made. It names no library; the page
// that mounts the app passes the factory in.

const unavailable = (message) => ({ status: 'unavailable', reason: 'no-r-attached', message });

/**
 * A connection to R for a library's charts that is made only when the reader
 * asks, and the control that asks.
 *
 * The control says what is true at each step: before it is pressed, what
 * starting R costs; while R starts, that it is starting; once R has answered,
 * that it is running. Pressing it starts R there and then, with one call every
 * R has (`identity` on no rows), so the download happens on the press and not
 * whenever a chart next asks. If R does not start — its host cannot be
 * reached, or the statistics file cannot be read — the control says so and
 * offers to try again, and every chart is told the same without R being
 * started again for each one; trying again makes one fresh connection.
 * @param {Object} options
 * @param {(options: Object) => {run: Function}} options.createConnection The library's connection factory.
 * @param {Object} options.browser The options of R in the browser: the statistics source and the packages, as the factory takes them.
 * @param {number} options.megabytes About how much starting R downloads.
 * @param {string} options.host Where R is downloaded from.
 * @returns {{settings: () => Object, action: {state: () => {label: string, done: boolean, note: string, hint: ?string}, press: () => Promise<void>}}} The settings to add to each of the library's charts as it is drawn, and the control.
 */
export function rOnRequest({ createConnection, browser, megabytes, host }) {
  // idle → starting → running, or → failed, from which pressing again starts afresh.
  let phase = 'idle';
  let real = null;
  let started = Promise.resolve();
  let failure = null;
  const need =
    `Statistics need R. Start R to compute them: it downloads about ${megabytes} MB, once, ` +
    `from ${host}, and the study’s data stays in this browser.`;
  const starting = `R is starting in this browser: about ${megabytes} MB to download, once, from ${host}.`;
  const failed = (message) =>
    (message
      ? `R did not start: ${String(message).replace(/\.?$/, '.')} `
      : 'R did not start, and no reason was given. ') +
    'Try again; if it fails again, reload the page.';
  // What was thrown, as words: its message, or itself when it is words (#193).
  const reasonOf = (error) =>
    (error && typeof error.message === 'string' && error.message) ||
    (typeof error === 'string' && error) ||
    null;
  const didNotStart = () => ({ status: 'unavailable', reason: 'load-failed', message: failure });

  // Ask R through one connection, and learn from its answer whether R is up.
  // A run that throws, at once or later, is R that could not answer: the same
  // as an answer that says R could not start, so nothing sticks at "starting"
  // (#193).
  const ask = (connection, name, request) =>
    new Promise((resolve) => resolve(connection.run(name, request)))
      .catch((error) => ({
        status: 'unavailable',
        reason: 'load-failed',
        message: reasonOf(error)
      }))
      .then((answer) => {
        if (connection !== real) return answer;
        if (answer && answer.status === 'unavailable' && answer.reason === 'load-failed') {
          phase = 'failed';
          failure = failed(answer.message);
          return didNotStart();
        }
        // R answered, with a value or with R's own error: it is running.
        if (phase === 'starting' && answer && answer.status !== 'unavailable') phase = 'running';
        return answer;
      });

  // One connection object for every chart, before and after the reader asks:
  // a chart drawn before still reaches R once R is there.
  const connection = Object.freeze({
    run(name, request) {
      if (phase === 'idle') return Promise.resolve(unavailable(need));
      if (phase === 'failed') return Promise.resolve(didNotStart());
      return ask(real, name, request);
    }
  });

  return {
    settings: () => ({ connection, waiting_note: phase === 'starting' ? starting : null }),
    action: {
      state: () =>
        ({
          idle: { label: 'Start R', done: false, note: need, hint: `About ${megabytes} MB, once` },
          starting: { label: 'Starting R…', done: true, note: starting, hint: null },
          running: {
            label: 'R started',
            done: true,
            note: 'R is running in this browser.',
            hint: null
          },
          failed: { label: 'Try R again', done: false, note: failure, hint: null }
        })[phase],
      press() {
        if (phase === 'starting' || phase === 'running') return started;
        // A factory that throws is R that did not start, and says why (#193).
        try {
          real = createConnection({ browser });
        } catch (error) {
          real = null;
          phase = 'failed';
          failure = failed(reasonOf(error));
          started = Promise.resolve();
          return started;
        }
        phase = 'starting';
        failure = null;
        started = ask(real, 'identity', { data: [], args: {} }).then(() => undefined);
        return started;
      }
    }
  };
}

/**
 * A connection to R for a page that cannot start R: every answer says why
 * statistics are unavailable, and there is no control.
 * @param {string} message The sentence each statistics line prints.
 * @returns {{settings: () => Object}} The settings to add to each of the library's charts.
 */
export function rUnavailable(message) {
  const connection = Object.freeze({ run: () => Promise.resolve(unavailable(message)) });
  return { settings: () => ({ connection, waiting_note: null }) };
}
