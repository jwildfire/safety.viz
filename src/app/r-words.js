// Demo app: what is said wherever R is started (#277, obot.roadmap#404). The
// app starts R in two places, for the biomarker charts' statistics and for the
// RBQM tab's site metrics, and both say it in these words: before R is started,
// while it starts, once it is ready, and when it did not start. A tab brings
// only what differs: what needs R, and what starting it downloads.

/** The megabytes of a download, as the control says them: "13 MB". */
export const megabytesSaid = (megabytes) => `${megabytes} MB`;

/** Where the control is, as a sentence in the view points at it: at the right end of the chart-name row, or first in it on a phone. */
export function whereSaid() {
  const narrow =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(max-width:760px)').matches;
  return narrow ? 'above' : 'at the top right';
}

/**
 * The sentences for one thing that needs R.
 * @param {Object} what What needs R.
 * @param {string} what.needs What needs R, as the control names it: "Statistics", "Site metrics".
 * @param {string} what.verb What R does for them, after "Start R to": "compute them", "run them".
 * @param {number} what.megabytes About how much starting R downloads.
 * @param {string} what.from Where from, in words: "webr.r-wasm.org".
 * @param {string} what.appears What appears when R is ready, as the view's line names it: "The test".
 * @param {string} what.missing What there is none of while R is not there: "there is no test".
 * @param {string} what.still What a failure leaves standing: "The charts still draw; only the statistics are missing."
 * @returns {Object} The sentences, each a string or a function of what is known only at the moment.
 */
export function rWords({ needs, verb, megabytes, from, appears, missing, still }) {
  const cost = megabytesSaid(megabytes);
  return {
    // The control, before a press: a few words, the cost, and the whole sentence on hover.
    need: `${needs} need R`,
    cost: `${cost}, once`,
    needTitle:
      `${needs} need R. Start R to ${verb}: about ${cost}, downloaded once from ${from}. ` +
      'The study’s data stays in this browser.',
    start: 'Start R',
    // While it starts.
    starting: 'Starting R',
    startingMeta: (seconds) => `${cost} · ${seconds} s`,
    // Once it is ready.
    ready: 'R ready',
    readyHeading: 'R is running in this browser',
    // When it did not start.
    failed: 'R did not start',
    again: 'Try again',
    why: 'Why',
    // What could not be downloaded, and where from: R itself, unless a tab says otherwise.
    failedReason: (what = 'R', host = from) =>
      `The browser could not download ${what} from ${host}. Check the connection, or whether ` +
      `this network blocks that address, and try again. ${still}`,
    // R that could not be started for a reason that is not a download.
    failedOther: `R could not be started on this page. Try again; if it fails again, reload the page. ${still}`,
    stopped: 'R stopped answering',
    stoppedReason: (limit, doing) =>
      `R gave no answer for ${limit} while ${doing}, so it was closed. Try again; if it stops ` +
      `again, reload the page. ${still}`,
    // The one short line in the view, which points at the control.
    viewNeed: () => `${needs} need R. Start R, ${whereSaid()}.`,
    viewStarting: `R is starting. ${appears} appears here when it is ready.`,
    viewFailed: () => `R did not start, so ${missing}. Try again, ${whereSaid()}.`
  };
}

/**
 * What the browser or R said when R did not start, as a sentence of its own
 * for the disclosure: never the first thing a reader is shown.
 * @param {?string} message What was said.
 * @param {string} [who] Who said it: the browser, unless it was R.
 * @returns {string} The sentence.
 */
export function browserSaid(message, who = 'The browser') {
  const said = typeof message === 'string' ? message.trim() : '';
  if (!said) return `${who} gave no reason.`;
  return `${who} said: ${/[.!?]$/.test(said) ? said : `${said}.`}`;
}

/**
 * A length of time a reader was kept waiting, in words: "90 seconds",
 * "5 minutes".
 * @param {number} seconds The time, in seconds.
 * @returns {string} The words.
 */
export function waitSaid(seconds) {
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return seconds >= 120 && seconds % 60 === 0
    ? count(seconds / 60, 'minute')
    : count(seconds, 'second');
}

/**
 * R's version and the runtime's, as the ready chip's details say them:
 * "R 4.6.0, on webR 0.6.0". What is not known is left out.
 * @param {{r?: ?string, webr?: ?string}} versions The versions.
 * @returns {?string} The words, or null when neither is known.
 */
export function versionSaid({ r = null, webr = null } = {}) {
  if (r && webr) return `R ${r}, on webR ${webr}`;
  if (r) return `R ${r}`;
  if (webr) return `webR ${webr}`;
  return null;
}

/**
 * How long R took to start, as the details say it: "in 1.5 seconds".
 * @param {number} milliseconds The time from the press to R's first answer.
 * @returns {string} The words.
 */
export function startedSaid(milliseconds) {
  const seconds = Math.max(0.1, Math.round(milliseconds / 100) / 10);
  return `in ${seconds === 1 ? '1 second' : `${seconds} seconds`}`;
}
