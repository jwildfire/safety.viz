// Demo app: what the header and the first screen say of where the reader is
// (#269, obot.roadmap#402): a tab's count and the Data tab's name for the
// loaded study. Pure: no document. The page (page.js) puts the words on the
// screen. The one-line welcome of release 1.11.0 is gone (#321).

import { plural } from './dom.js';

/**
 * What a tab's count reads: one number when every chart of the tab draws,
 * "5 of 9" when some cannot, and "0" when none can.
 * @param {number} ready How many of the tab's charts the loaded data supports.
 * @param {number} total How many charts the tab has.
 * @returns {string} The count.
 */
export function tabCount(ready, total) {
  if (ready === total) return String(total);
  return ready ? `${ready} of ${total}` : '0';
}

/**
 * What the Data tab says is loaded: a demo study by its name, a reader's own
 * files by their number, or that there are none.
 * @param {Object} loaded What is loaded.
 * @param {?string} loaded.study The id of the demo study that is loaded, when what is loaded is one.
 * @param {number} loaded.loaded How many files are loaded.
 * @param {Array<{id: string, label: string}>} loaded.studies The demo studies the page offers.
 * @returns {string} The words on the Data tab.
 */
export function dataTag({ study, loaded, studies }) {
  const demo = study ? studies.find((item) => item.id === study) : null;
  if (demo) return demo.label;
  return loaded ? `Your ${plural(loaded, 'file')}` : 'no files';
}

/** The line the app's status label shows on hover (obot.roadmap#403). */
export const APP_STATUS_LINE = 'Nothing in this app is qualified. Confirm every result.';

/** The app's disclaimer, in the panel its status label opens (obot.roadmap#403). */
export const APP_STATUS_TEXT =
  'Nothing here is qualified. The charts, statistics and site metrics are tested and documented, ' +
  'but none has been through qualification. Confirm every result in a qualified system before ' +
  'you rely on it.';

/**
 * How many of the app's charts stand on each rung, for the panel of the app's
 * status label (#273): "13 charts are Exploratory. 5 charts and the RBQM tab
 * are Experimental, and say so when you open them."
 * @param {Object} counts What the app carries.
 * @param {number} counts.exploratory How many charts are Exploratory.
 * @param {number} counts.experimental How many charts are Experimental.
 * @param {string[]} [counts.tabs] The names of the tabs that are Experimental, as "RBQM".
 * @returns {string} The sentences; empty when the app carries no chart and no such tab.
 */
export function statusCount({ exploratory, experimental, tabs = [] }) {
  const charts = (count) => `${count} ${count === 1 ? 'chart' : 'charts'}`;
  const said = [];
  if (exploratory)
    said.push(`${charts(exploratory)} ${exploratory === 1 ? 'is' : 'are'} Exploratory.`);
  const below = [];
  if (experimental) below.push(charts(experimental));
  if (tabs.length === 1) below.push(`the ${tabs[0]} tab`);
  if (tabs.length > 1) {
    below.push(`the ${tabs.slice(0, -1).join(', ')} and ${tabs[tabs.length - 1]} tabs`);
  }
  if (below.length) {
    const one = experimental + tabs.length === 1;
    said.push(
      `${below.join(' and ')} ${one ? 'is' : 'are'} Experimental, and ${one ? 'says' : 'say'} so when you open ${one ? 'it' : 'them'}.`
    );
  }
  return said.join(' ');
}
