// The expanded panel, measured (#409). A chart's side panel, the participant
// profile's rail or the Patient Journey Explorer's context panel, has an Expand
// button that lays it over the chart's own card. The rule that does so is the
// shell's (`.sv-rail-expanded .sv-rail` in src/shell.js), so every chart with a
// panel has it, and a change made there for one chart moves them all. No unit
// test can see that: jsdom lays nothing out. The browser tests that expand a
// panel measure it with this.

/**
 * Where the expanded panel is, against the card it is laid over and against
 * what it holds. Positions are the page's own, in CSS pixels.
 * @param {import('@playwright/test').Page} page The page, with a panel expanded.
 * @returns {Promise<{expanded: boolean, card: Object, panel: Object, slack: number, beneath: string, controls: ?Object, chart: ?Object, chartShows: ?boolean, table: ?Object}>}
 *   `card` and `panel` are boxes. `slack` is how far the panel's bottom edge is
 *   below the last thing it holds: its padding when the panel is as tall as
 *   its content, and less than nothing when a shorter card cuts the content
 *   off. `beneath` is what a reader finds just under the panel inside the
 *   card: `card` (the card's own chart, controls or listing, dimmed), `panel`,
 *   or `nothing` when the card ends there. `controls`, `chart` and `table` are
 *   the profile's control column, its labs chart and its measure table, each
 *   null where the panel has none, and `chartShows` says whether the chart's
 *   middle is the chart itself.
 */
export function expandedPanel(page) {
  return page.evaluate(() => {
    const box = (element) => {
      if (!element) return null;
      const { left, top, right, bottom, width, height } = element.getBoundingClientRect();
      const y = window.scrollY;
      return { left, right, width, height, top: top + y, bottom: bottom + y };
    };
    const root = document.querySelector('.sv-root');
    const rail = root.querySelector(':scope > .sv-rail');
    const card = box(root);
    const panel = box(rail);
    // What the panel holds ends at the lowest element in it that holds no other.
    const content = Math.max(
      ...[...rail.querySelectorAll('*')]
        .filter((element) => !element.firstElementChild && element.getClientRects().length)
        .map((element) => box(element).bottom)
    );
    // The element a reader sees at a point of the page, scrolled into view first.
    const at = (x, y) => {
      window.scrollTo(0, Math.max(0, y - window.innerHeight / 2));
      return document.elementFromPoint(x, y - window.scrollY);
    };
    let beneath = 'nothing';
    if (card.bottom - panel.bottom > 30) {
      const under = at(card.left + card.width / 2, panel.bottom + 15);
      beneath = under && rail.contains(under) ? 'panel' : root.contains(under) ? 'card' : 'page';
    }
    const canvas = rail.querySelector('.sv-profile-spaghetti canvas');
    const chart = box(canvas);
    const chartShows = chart
      ? at(chart.left + chart.width / 2, chart.top + chart.height / 2) === canvas
      : null;
    window.scrollTo(0, 0);
    return {
      expanded: root.classList.contains('sv-rail-expanded'),
      card,
      panel,
      slack: panel.bottom - content,
      beneath,
      controls: box(rail.querySelector('.sv-profile-controls')),
      chart,
      chartShows,
      table: box(rail.querySelector('.sv-profile-measure-wrap'))
    };
  });
}

/**
 * Make the card taller, as a longer chart or listing under the panel would. A
 * panel that is as tall as what it holds stays as it was; one stretched to the
 * card grows with it.
 * @param {import('@playwright/test').Page} page The page, with a panel expanded.
 * @param {number} by How many pixels taller.
 * @returns {Promise<void>}
 */
export function growCard(page, by) {
  return page.evaluate((more) => {
    const root = document.querySelector('.sv-root');
    root.style.minHeight = `${root.getBoundingClientRect().height + more}px`;
  }, by);
}
