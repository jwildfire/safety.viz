// Demo app: what the header and the first screen say of where the reader is
// (#269, obot.roadmap#402): a tab's count, the Data tab's name for the loaded
// study, and the one-line welcome. Pure: no document. The page (page.js) puts
// the words on the screen.

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

const WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve'
];

/**
 * A small count as a word, "five"; a larger one as its digits.
 * @param {number} count The count.
 * @returns {string} The word.
 */
export const numberWord = (count) => (Number.isInteger(count) && WORDS[count]) || String(count);

/**
 * The welcome line a first-time visitor reads: whose data this is, how much is
 * here and where to load your own. Returned in two parts, the words before the
 * link to the Data tab and the words after it, so the page can put the link
 * between them.
 * @param {Object} study What is on screen.
 * @param {string} study.whose Whose data it is, as a phrase: "the CDISC pilot study, a public demo".
 * @param {?number} study.participants How many participants the study has, or null when the subject-level file does not say.
 * @param {number} study.charts How many charts the loaded data supports.
 * @param {number} study.tabs How many tabs they are on.
 * @returns {[string, string]} The words before the link and the words after it.
 */
export function welcomeSentence({ whose, participants, charts, tabs }) {
  const much = [
    ...(participants
      ? [
          plural(participants, 'participant').replace(/^\d+/, (n) =>
            Number(n).toLocaleString('en-US')
          )
        ]
      : []),
    `${plural(charts, 'chart')} on ${numberWord(tabs)} tab${tabs === 1 ? '' : 's'}`
  ].join(', ');
  return [
    `You are looking at ${whose}: ${much}. To use your own files, open `,
    '. They are read in this browser and never leave it.'
  ];
}
