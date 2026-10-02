import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';

// Browser evidence for the kit (#154, obot.roadmap#354). The claim under test
// is the requirement's: another library can build a chart from safety.viz's
// shared parts using only the published bundle. The fixture page is that other
// library in miniature — it loads the committed IIFE bundle and builds a shell
// with a sidebar, a filter, a bar chart, a record listing and the participant
// rail from `SafetyViz.kit` alone. Test names are keyed to the KIT-USE rows of
// requirements/kit.md.

const { version } = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
);
const BUNDLE = `/dist/safety.viz-${version}/safety.viz.js`;
const FIXTURE = '/tests/e2e/fixtures/kit.html';

// The fixture's data, read the way the page reads it, so every expected count
// below is derived from the file rather than typed in.
const rows = (() => {
  const text = readFileSync(new URL('./fixtures/adbds.csv', import.meta.url), 'utf8');
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(cols.map((col, i) => [col, cells[i] ?? '']));
  });
})();
const sites = [...new Set(rows.map((row) => row.SITE))].sort();
const countsFor = (subset) => sites.map((site) => subset.filter((r) => r.SITE === site).length);

// Record every property the page reads from the bundle's global. The bundle
// assigns `SafetyViz` with a top-level `var`, which lands on this accessor, so
// the page gets a recording proxy around the real object and nothing about the
// object itself changes.
async function recordGlobalReads(page) {
  await page.addInitScript(() => {
    const reads = [];
    let proxy;
    Object.defineProperty(window, 'SafetyViz', {
      configurable: true,
      get: () => proxy,
      set: (value) => {
        proxy = new Proxy(value, {
          get(target, key) {
            if (typeof key === 'string') reads.push(key);
            return Reflect.get(target, key);
          }
        });
      }
    });
    window.__safetyVizReads = reads;
  });
}

async function open(page) {
  await page.goto(FIXTURE);
  await page.evaluate(() => window.__kitFixture.ready.then(() => true));
  await expect(page.locator('.sv-main canvas.sv-chart')).toBeVisible();
}

const chartCounts = (page) =>
  page.evaluate(() => window.__kitFixture.host.chart.data.datasets[0].data);

// Click the middle of one bar, the way a reader would.
async function clickBar(page, site) {
  const point = await page.evaluate((index) => {
    const { chart } = window.__kitFixture.host;
    const bar = chart.getDatasetMeta(0).data[index];
    const box = chart.canvas.getBoundingClientRect();
    return { x: box.left + bar.x, y: box.top + (bar.y + bar.base) / 2 };
  }, sites.indexOf(site));
  await page.mouse.click(point.x, point.y);
}

test.describe('kit: a page built from the bundle alone', () => {
  test('KIT-USE-001: the fixture page loads the committed bundle and no other script, and builds the shell with its sidebar with no console errors (#154)', async ({
    page
  }) => {
    const errors = [];
    const scripts = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
    });
    await open(page);

    expect(scripts).toEqual([BUNDLE]);
    expect(await page.locator('script[src]').count()).toBe(1);

    // The shared shell: sidebar on the left, main column, and the styles the
    // kit injects — one stylesheet, the charts' own.
    await expect(page.locator('#container > .sv-root.kit-fixture')).toBeVisible();
    await expect(page.locator('.sv-sidebar .sv-sidebar-title')).toHaveText('Controls');
    await expect(page.locator('style#safety-viz-shell-styles')).toHaveCount(1);
    const toggle = page.locator('.sv-sidebar-toggle');
    await toggle.click();
    await expect(page.locator('.sv-root')).toHaveClass(/sv-collapsed/);
    await expect(page.locator('.sv-controls')).toBeHidden();
    await toggle.click();
    await expect(page.locator('.sv-controls')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('KIT-USE-002: the page reads nothing from the bundle but the kit: no chart module is called directly (#154)', async ({
    page
  }) => {
    await recordGlobalReads(page);
    await open(page);
    // Drive the whole page — filter, bar, listing row, rail — before looking.
    await page.locator('.sv-controls select[data-filter="SEX"]').selectOption('F');
    await clickBar(page, sites[0]);
    await page.locator('.sv-listing tbody tr').first().click();
    await expect(page.locator('.sv-rail .sv-profile-id')).toBeVisible();

    const reads = await page.evaluate(() => [...new Set(window.__safetyVizReads)]);
    expect(reads).toEqual(['kit']);

    // The recorder is live: a direct call to a chart module is what it catches.
    const after = await page.evaluate(() => {
      void window.SafetyViz.histogram;
      return [...new Set(window.__safetyVizReads)];
    });
    expect(after).toEqual(['kit', 'histogram']);
  });

  test('KIT-USE-003: the bar chart is drawn with kit.Chart, and the filter narrows it (#154)', async ({
    page
  }) => {
    await open(page);
    const drawn = await page.evaluate(() => {
      const { chart, canvas } = window.__kitFixture.host;
      return {
        isKitChart: chart instanceof window.SafetyViz.kit.Chart,
        registered: window.SafetyViz.kit.Chart.getChart(canvas) === chart,
        type: chart.config.type,
        labels: chart.data.labels
      };
    });
    expect(drawn).toEqual({ isKitChart: true, registered: true, type: 'bar', labels: sites });
    expect(await chartCounts(page)).toEqual(countsFor(rows));
    await expect(page.locator('.sv-notes')).toHaveText(
      `${rows.length} of ${rows.length} records shown.`
    );

    // One filter, built by the kit's filter contract: All plus every value.
    const select = page.locator('.sv-controls select[data-filter="SEX"]');
    await expect(page.locator('.sv-control', { has: select }).locator('label')).toHaveText('Sex');
    await expect(select.locator('option')).toHaveText(['All', 'F', 'M']);

    const women = rows.filter((row) => row.SEX === 'F');
    await select.selectOption('F');
    expect(await chartCounts(page)).toEqual(countsFor(women));
    await expect(page.locator('.sv-notes')).toHaveText(
      `${women.length} of ${rows.length} records shown.`
    );
    // Narrowed, not merely redrawn.
    expect(women.length).toBeLessThan(rows.length);

    await select.selectOption('__all__');
    expect(await chartCounts(page)).toEqual(countsFor(rows));
  });

  test('KIT-USE-004: clicking a bar fills the record listing with that bar’s records, with search, paging and sort working (#154)', async ({
    page
  }) => {
    await open(page);
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
    const site = sites[0];
    const records = rows.filter((row) => row.SITE === site);
    await clickBar(page, site);

    await expect(page.locator('.sv-listing table')).toBeVisible();
    await expect(page.locator('.sv-listing-actions strong')).toHaveText(
      `${records.length} of ${records.length} records`
    );
    await expect(page.locator('.sv-listing thead th')).toHaveText([
      'Participant ID',
      'Measure',
      'Result',
      'Sex',
      'Site'
    ]);
    // Paged at the fixture's page size, every row from the clicked bar.
    await expect(page.locator('.sv-listing tbody tr')).toHaveCount(5);
    await expect(page.locator('.sv-listing tbody tr td:nth-child(1)')).toHaveText(
      records.slice(0, 5).map((row) => row.USUBJID)
    );
    await expect(page.locator('.sv-listing tbody tr td:nth-child(5)')).toHaveText(
      Array(5).fill(site)
    );
    await page.locator('.sv-listing-tools button', { hasText: /^>$/ }).click();
    await expect(page.locator('.sv-listing tbody tr td:nth-child(1)')).toHaveText(
      records.slice(5, 10).map((row) => row.USUBJID)
    );

    // Search narrows the listing; a header click sorts it.
    const target = records[records.length - 1].USUBJID;
    await page.locator('.sv-listing-search').fill(target);
    await expect(page.locator('.sv-listing-actions strong')).toHaveText(
      `1 of ${records.length} records`
    );
    await expect(page.locator('.sv-listing tbody tr td:nth-child(1)')).toHaveText([target]);
    await page.locator('.sv-listing-search').fill('');
    await page.locator('.sv-listing thead th', { hasText: 'Participant ID' }).click();
    await page.locator('.sv-listing thead th', { hasText: 'Participant ID' }).click();
    const descending = records
      .map((row) => row.USUBJID)
      .sort()
      .reverse();
    await expect(page.locator('.sv-listing tbody tr td:nth-child(1)')).toHaveText(
      descending.slice(0, 5)
    );
  });

  test('KIT-USE-005: clicking a listing row opens the participant rail on that participant, drawn by the same copy of Chart.js (#154)', async ({
    page
  }) => {
    await open(page);
    await expect(page.locator('.sv-rail')).toBeHidden();
    await clickBar(page, sites[0]);
    const firstRow = page.locator('.sv-listing tbody tr').first();
    await expect(firstRow).toHaveAttribute('role', 'button');
    const participantId = (await firstRow.locator('td').first().textContent()).trim();
    await firstRow.click();

    await expect(page.locator('.sv-rail')).toBeVisible();
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveText(
      `Participant ${participantId}`
    );
    await expect(page.locator('.sv-rail .sv-profile-header')).toContainText('Treatment Group');
    // The listing stays beside the rail, with the participant's rows marked.
    const highlighted = page.locator('.sv-listing tr.sv-listing-row-selected');
    await expect(highlighted.first()).toBeVisible();
    for (const text of await highlighted.locator('td:first-child').allTextContents()) {
      expect(text.trim()).toBe(participantId);
    }

    // The rail's own chart is drawn inside the bundle by the participant
    // profile; it is an instance of, and registered with, the constructor the
    // kit hands out — one copy of Chart.js on the page.
    await page.locator('.sv-rail .sv-profile-extras input').check();
    await expect(page.locator('.sv-rail .sv-profile-spaghetti canvas')).toBeVisible();
    const sameCopy = await page.evaluate(() => {
      const { Chart } = window.SafetyViz.kit;
      const railChart = Chart.getChart(
        document.querySelector('.sv-rail .sv-profile-spaghetti canvas')
      );
      return Boolean(railChart) && railChart instanceof Chart;
    });
    expect(sameCopy).toBe(true);

    // Clearing the rail empties it and un-marks the row; the listing stays.
    await page.locator('.sv-rail .sv-profile-clear').click();
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveCount(0);
    await expect(page.locator('.sv-rail')).toBeHidden();
    await expect(page.locator('.sv-listing tr.sv-listing-row-selected')).toHaveCount(0);
    await expect(page.locator('.sv-listing table')).toBeVisible();
  });
});
