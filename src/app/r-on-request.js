// Demo app: R on request (#183, obot.roadmap#366). @jwildfire's choice of
// 2026-10-02: "R on request". A second chart library whose charts print R's
// tests is handed, through the second-library seam, a connection to R that
// starts nothing until the reader asks: before the reader presses the one
// control, every chart draws and its statistics line says that statistics need
// R and what starting it downloads, and nothing is fetched. Pressing it makes
// one connection, with the library's own connection factory and the options
// given, and every chart drawn afterwards reaches R through it.
//
// The app computes no statistic here or anywhere: the connection is the
// library's, R answers, and the chart prints what R said. This module only
// decides when the library's connection is made. It names no library; the page
// that mounts the app passes the factory in.

const unavailable = (message) => ({ status: 'unavailable', reason: 'no-r-attached', message });

/**
 * A connection to R for a library's charts that is made only when the reader
 * asks, and the control that asks.
 * @param {Object} options
 * @param {(options: Object) => {run: Function}} options.createConnection The library's connection factory.
 * @param {Object} options.browser The options of R in the browser: the statistics source and the packages, as the factory takes them.
 * @param {number} options.megabytes About how much starting R downloads.
 * @param {string} options.host Where R is downloaded from.
 * @returns {{settings: () => Object, action: {state: () => {label: string, done: boolean, note: string}, press: () => void}}} The settings to add to each of the library's charts as it is drawn, and the control.
 */
export function rOnRequest({ createConnection, browser, megabytes, host }) {
  let real = null;
  const need =
    `Statistics need R. Start R to compute them: it downloads about ${megabytes} MB, once, ` +
    `from ${host}, and the study’s data stays in this browser.`;
  const starting = `R is starting in this browser: about ${megabytes} MB to download, once, from ${host}.`;
  // One connection object for every chart, before and after the reader asks:
  // a chart drawn before still reaches R once R is there.
  const connection = Object.freeze({
    run(name, request) {
      return real ? real.run(name, request) : Promise.resolve(unavailable(need));
    }
  });
  return {
    settings: () => ({ connection, waiting_note: real ? starting : null }),
    action: {
      state: () =>
        real
          ? { label: 'R started', done: true, note: starting }
          : { label: 'Start R', done: false, note: need },
      press() {
        if (!real) real = createConnection({ browser });
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
