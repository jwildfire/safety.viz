// What the app's desktop-R comparison is made of (#183, #212): the walk
// through the biomarker charts whose requests are recorded, where the requests
// and desktop R's answers are kept, and the files they are derived from, held
// by checksum so a change to any of them makes the comparison stale rather
// than silently wrong.
//
// The walk is one list of steps, used twice: scripts/derive-app-statistics.mjs
// plays it against a stand-in for R that records what each chart asks, and the
// browser tests play it against real R in the browser and compare each answer
// with desktop R's (tests/e2e/basic-app.spec.js, APP-R-007). A view bio.viz
// gains later is one more step here, and the two commands run again.

import { sha256 } from './vendor-lib.mjs';

export const APP_STATISTICS = {
  // The biomarker the group comparison is opened on, and the visit opened from it.
  measure: 'Alanine Aminotransferase',
  visit: 'Week 4',
  directory: 'tests/fixtures/app-statistics',
  // What the recorded requests depend on: the study; the app code that reads
  // its files, places and maps them, and hands each chart its settings and its
  // tables; the charts that ask; and the R that answers.
  sources: [
    'site/data/adbds.csv',
    'site/data/adsl.csv',
    'src/app/parse.js',
    'src/app/detect.js',
    'src/app/mapping.js',
    'src/app/charts.js',
    'src/app/libraries.js',
    'src/app/page.js',
    'site/vendor/bio.viz/bio.viz.js',
    'site/vendor/gsm.bio/statistics.R'
  ]
};

/**
 * The checksum of each file the comparison is derived from.
 * @param {(file: string) => Uint8Array} read A file's bytes, by its path in the repository.
 * @returns {Array<{file: string, sha256: string}>} One entry per source.
 */
export const derivedFrom = (read) =>
  APP_STATISTICS.sources.map((file) => ({ file, sha256: sha256(read(file)) }));

const chip = (page, module) => page.locator(`.sva-item[data-view="${module}"]`);

/**
 * The walk: each step is something a reader does in the Biomarkers tab that
 * makes a chart ask R, with the R function it asks for. The steps run in order
 * on one page, each from where the one before left the app. `what` is plain
 * ASCII, because desktop R writes it back.
 * @type {Array<{id: string, chart: string, asks: string, what: string, act: (page: Object) => Promise<void>}>}
 */
export const SCENARIO = [
  {
    id: 'over-time',
    chart: 'group-comparison',
    asks: 'Analyze_GroupDifferenceBy',
    what: "a trend tile opened: one biomarker over time, with R's test of the groups under each visit",
    async act(page) {
      await page.locator(`.sva-chart .bv-tile[data-measure="${APP_STATISTICS.measure}"]`).click();
    }
  },
  {
    id: 'one-visit',
    chart: 'group-comparison',
    asks: 'Analyze_GroupDifference',
    what: 'a visit opened from the picture over time: the single-visit view and its test',
    async act(page) {
      await page.locator(`.sva-chart .bv-time-visit[data-visit="${APP_STATISTICS.visit}"]`).click();
    }
  },
  {
    id: 'cross-tab',
    chart: 'cross-tab',
    asks: 'Analyze_Contingency',
    what: "the cross-tabulation opened: a two-way table of counts and R's test of it",
    async act(page) {
      await chip(page, 'cross-tab').click();
    }
  }
];

/**
 * Open the group comparison in the Biomarkers tab and press the control that
 * starts R. The chart opens on its trend tiles, which ask R for nothing, so
 * nothing is asked of R until a step of the walk is taken.
 * @param {Object} page The Playwright page, with the app mounted on the demo study.
 * @returns {Promise<void>}
 */
export async function openAndStartR(page) {
  await page.locator('.sva-tab[data-domain="biomarkers"]').click();
  await chip(page, 'group-comparison').click();
  await page.locator('.sva-chart .bv-tile').first().waitFor();
  await page.locator('.sva-action').click();
}

/**
 * Play the walk on a page whose R has been started, and say which of the
 * requests logged on the page belong to each step.
 *
 * A step is over when the chart has stopped waiting and the log has been
 * still for a moment; with `counts`, it first waits for that many entries.
 * @param {Object} page The Playwright page.
 * @param {Object} options
 * @param {string} options.log The name of the page's list of what R was asked or answered: `__rCalls` or `__rAnswers`.
 * @param {Array} [options.steps] The steps to take (default: the whole walk).
 * @param {Object<string, number>} [options.counts] How many entries each step is known to add, by step id.
 * @param {number} [options.timeout] How long one step may take, in milliseconds.
 * @param {(step: Object, range: {from: number, to: number}) => Promise<void>} [options.afterStep] Called after each step, before the next, with the step's range of the log.
 * @returns {Promise<Array<{id: string, from: number, to: number}>>} Each step's range of the log.
 */
export async function playScenario(
  page,
  { log, steps = SCENARIO, counts = {}, timeout = 150000, afterStep } = {}
) {
  const size = () => page.evaluate((name) => window[name].length, log);
  const ranges = [];
  for (const step of steps) {
    const from = await size();
    await step.act(page);
    await page.waitForFunction(
      ([name, least]) => window[name].length >= least,
      [log, from + (counts[step.id] || 1)],
      { timeout }
    );
    // No line and no test row still waiting for R, and nothing more asked.
    await page.waitForFunction(
      () =>
        ![...document.querySelectorAll('.sva-chart .bv-statistic')].some((line) =>
          /waiting/.test(line.textContent)
        ) &&
        !document.querySelector(
          '.sva-chart .bv-statistic[data-state="waiting"], .sva-chart [data-row="test"][data-state="waiting"]'
        ),
      null,
      { timeout }
    );
    let to = await size();
    for (;;) {
      await page.waitForTimeout(600);
      const now = await size();
      if (now === to) break;
      to = now;
    }
    const range = { id: step.id, from, to };
    ranges.push(range);
    if (afterStep) await afterStep(step, range);
  }
  return ranges;
}
