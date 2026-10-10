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

import { browserSaid, megabytesSaid, rWords, startedSaid, versionSaid } from './r-words.js';

const unavailable = (message) => ({ status: 'unavailable', reason: 'no-r-attached', message });

/**
 * A connection to R for a library's charts that is made only when the reader
 * asks, and the control that asks.
 *
 * The control says what is true at each step, in the words every tab that
 * starts R uses (src/app/r-words.js, #277): before it is pressed, why R is
 * needed and what starting it costs; while R starts, that it is starting and
 * for how long; once R has answered, that it is ready, with R's version, how
 * long it took and where it runs behind the chip; and when R did not start,
 * that it did not, with a plain reason and the browser's own words behind it. Pressing it starts R there and then, with one call every
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
 * @param {?string} [options.webr] The version of the runtime R runs on, when the page knows it: said in the details if R itself does not say.
 * @param {() => number} [options.now] The clock, in milliseconds.
 * @returns {{settings: () => Object, action: {state: () => Object, press: () => Promise<void>}}} The settings to add to each of the library's charts as it is drawn, and the control.
 */
export function rOnRequest({
  createConnection,
  browser,
  megabytes,
  host,
  webr = null,
  now = () => Date.now()
}) {
  // idle → starting → running, or → failed, from which pressing again starts afresh.
  let phase = 'idle';
  let real = null;
  let started = Promise.resolve();
  let failure = null;
  const words = rWords({
    needs: 'Statistics',
    verb: 'compute them',
    megabytes,
    from: host,
    appears: 'The test',
    missing: 'there is no test',
    still: 'The charts still draw; only the statistics are missing.'
  });
  // When the press was, how long R took, and what R says its version is.
  let pressedAt = null;
  let took = null;
  const versions = { r: null, webr };
  // Whether what stopped R was a download that failed, and what was said of it.
  let reason = null;
  // What was thrown, as words: its message, or itself when it is words (#193).
  const reasonOf = (error) =>
    (error && typeof error.message === 'string' && error.message) ||
    (typeof error === 'string' && error) ||
    null;
  const didNotStart = () => ({
    status: 'unavailable',
    reason: 'load-failed',
    message: words.viewFailed()
  });
  const fail = (message, downloading) => {
    phase = 'failed';
    failure = message;
    reason = downloading ? words.failedReason() : words.failedOther;
  };

  // R's version, asked of R itself once it is up (#276). The library's
  // connection has R call a function by name, so `do.call` on a function that
  // takes no argument has R call that one. Anything but an answer leaves the
  // version as the page knew it.
  const learnVersions = (connection) => {
    const call = (what) =>
      new Promise((resolve) => resolve(connection.run('do.call', { data: [], args: { what } })))
        .then((answer) => (answer && answer.status === 'ok' ? JSON.stringify(answer.value) : ''))
        .catch(() => '');
    call('R.Version').then((text) => {
      const found = /R version (\d+(?:\.\d+)+)/.exec(text || '');
      if (found && connection === real) versions.r = found[1];
    });
    call('Sys.getenv').then((text) => {
      const found = /WEBR_VERSION\\?"?\s*[:,]\s*\[?\s*\\?"?(\d+(?:\.\d+)+)/.exec(text || '');
      if (found && connection === real) versions.webr = found[1];
    });
  };

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
          fail(answer.message, true);
          return didNotStart();
        }
        // R answered, with a value or with R's own error: it is running.
        if (phase === 'starting' && answer && answer.status !== 'unavailable') {
          phase = 'running';
          took = now() - pressedAt;
          learnVersions(connection);
        }
        return answer;
      });

  // One connection object for every chart, before and after the reader asks:
  // a chart drawn before still reaches R once R is there.
  const connection = Object.freeze({
    run(name, request) {
      if (phase === 'idle') return Promise.resolve(unavailable(words.viewNeed()));
      if (phase === 'failed') return Promise.resolve(didNotStart());
      return ask(real, name, request);
    }
  });

  return {
    settings: () => ({
      connection,
      waiting_note: phase === 'starting' ? words.viewStarting : null
    }),
    action: {
      state: () =>
        ({
          idle: {
            phase: 'off',
            say: words.need,
            meta: words.cost,
            title: words.needTitle,
            label: words.start
          },
          starting: {
            phase: 'starting',
            say: words.starting,
            meta: megabytesSaid(megabytes),
            since: pressedAt
          },
          running: {
            phase: 'ready',
            say: words.ready,
            title: words.readyHeading,
            details: {
              heading: words.readyHeading,
              rows: [
                ['Version', versionSaid(versions)],
                ['Started', took === null ? null : startedSaid(took)],
                ['Downloaded', `${megabytesSaid(megabytes)}, once, from ${host}`],
                ['Your data', 'stays in this browser; R runs here']
              ]
            }
          },
          failed: {
            phase: 'failed',
            say: words.failed,
            label: words.again,
            why: words.why,
            details: {
              heading: words.failed,
              text: [reason],
              more: [browserSaid(failure)],
              moreTitle: 'What the browser said'
            }
          }
        })[phase],
      press() {
        if (phase === 'starting' || phase === 'running') return started;
        // A factory that throws is R that did not start, and says why (#193).
        try {
          real = createConnection({ browser });
        } catch (error) {
          real = null;
          fail(reasonOf(error), false);
          started = Promise.resolve();
          return started;
        }
        phase = 'starting';
        failure = null;
        pressedAt = now();
        took = null;
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
