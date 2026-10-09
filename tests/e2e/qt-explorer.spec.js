import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the qt-explorer module (#68). Test names are keyed to the
// condensed QT-* requirement IDs per the traceability convention in
// CONTRIBUTING.md; see docs/qt-explorer-coverage.md for the requirement-ID → test
// map. The fixture cohort is engineered so the Xanomeline High Dose arm drives a
// mean ΔΔ above the 10 ms reference and populates the 450/480/500 ms absolute and
// 30/60 ms change thresholds, while Placebo stays near zero, so the
// central-tendency band + ICH-E14 metric, the outlier-scatter cut-lines, and the
// by-arm categorical table all assert deterministically.

async function selectByLabel(page, label, value) {
  const select = page
    .locator('.sv-control', { has: page.locator(`label:text-is("${label}")`) })
    .locator('select');
  await select.selectOption(value);
}

// The View selector is a list of always-visible option buttons (QT-CTRL-001),
// not a dropdown — switch views by clicking the labeled option.
async function selectView(page, label) {
  await page.locator(`.sv-view-option:text-is("${label}")`).click();
}

test.describe('safety.viz qt-explorer module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      // The fixture's two invalid rows trip the expected removed-count warning.
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._qtErrors = errors;
    await page.goto('/tests/e2e/fixtures/qt-explorer.html');
    await page.waitForFunction(
      () => window.__safetyQtExplorerInstance && window.__safetyQtExplorerInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._qtErrors).toEqual([]);
  });

  test('QT-CTRL-001/QT-CTRL-002/QT-CTRL-003: renders the view, correction, statistic, display, and filter controls (#68)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining(['Correction', 'Statistic', 'Display type', 'Sex', 'Race'])
    );
    // The View selector is its own section of always-visible option buttons
    // with the active view highlighted.
    const viewOptions = await page.locator('.sv-view-option').allTextContents();
    expect(viewOptions).toEqual(['Central tendency', 'Outlier scatter', 'Categorical']);
    await expect(page.locator('.sv-view-option.is-active')).toHaveText('Central tendency');
    await expect(page.locator('.sv-view-option.is-active')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.qt-legend')).toContainText('Treatments:');
    await captureEvidence(page, 'QT-CTRL-001', 'central-tendency-delta');
  });

  test('QT-CT-002/QT-CT-003/QT-CT-006: central tendency draws per-arm lines, a CI band, the reference line and the peak marker (#68)', async ({
    page
  }) => {
    const central = await page.evaluate(() => window.__safetyQtExplorerInstance.chart.$qtCentral);
    expect(central.reference).toBe(10);
    expect(central.bands.length).toBeGreaterThanOrEqual(2);
    expect(central.peaks[0].visit).toBe('Week 8');
  });

  test('QT-CT-008: central tendency prints the plotted values and CI bounds beneath the chart (#136)', async ({
    page
  }) => {
    // The chart stays visible — the table sits beneath the band rather than
    // replacing it (contrast the categorical view).
    await expect(page.locator('.sv-chart-wrap')).not.toHaveCSS('display', 'none');
    const header = await page.locator('table.qt-ct-table thead th').allTextContents();
    expect(header).toEqual(['Visit', 'Arm', 'n', 'Δ mean (ms)', '90% CI low', '90% CI high']);
    const rows = await page.locator('table.qt-ct-table tbody tr').allTextContents();
    // 5 visits × 3 arms.
    expect(rows).toHaveLength(15);
    // The printed numbers come from the same series the chart is built from.
    const plotted = await page.evaluate(() => {
      const instance = window.__safetyQtExplorerInstance;
      return instance.chart.$qtCentral.bands.length;
    });
    expect(plotted).toBeGreaterThanOrEqual(2);
    // ΔΔ prints the placebo-corrected difference and drops the placebo arm.
    await selectByLabel(page, 'Display type', 'deltadelta');
    const ddHeader = await page.locator('table.qt-ct-table thead th').allTextContents();
    expect(ddHeader[3]).toBe('ΔΔ mean (ms)');
    const ddRows = await page.locator('table.qt-ct-table tbody tr').allTextContents();
    expect(ddRows.join(' ')).not.toContain('Placebo');
    // Median mode carries no CI.
    await selectByLabel(page, 'Display type', 'delta');
    await selectByLabel(page, 'Statistic', 'median');
    const medHeader = await page.locator('table.qt-ct-table thead th').allTextContents();
    expect(medHeader[3]).toBe('Δ median (ms)');
    const medRows = await page.locator('table.qt-ct-table tbody tr').allTextContents();
    expect(medRows.every((row) => row.includes('NA'))).toBe(true);
    await selectByLabel(page, 'Statistic', 'mean');
    await captureEvidence(page, 'QT-CT-008', 'central-tendency-table');
  });

  test('QT-CT-004/QT-CT-005: ΔΔ drops placebo and reports the ICH-E14 metric above the reference (#68)', async ({
    page
  }) => {
    await selectByLabel(page, 'Display type', 'deltadelta');
    await expect(page.locator('.qt-ich')).toContainText('ICH-E14 metric');
    const rows = await page.locator('.qt-ich tbody tr').allTextContents();
    expect(rows.join(' ')).toContain('Xanomeline High Dose');
    expect(rows.join(' ')).toContain('≥ threshold');
    // Placebo is the reference and is dropped from the ΔΔ series.
    const arms = await page.evaluate(() =>
      window.__safetyQtExplorerInstance.chart.data.datasets.map((d) => d.label)
    );
    expect(arms).not.toContain('Placebo');
    await captureEvidence(page, 'QT-CT-005', 'delta-delta-ich-metric');
  });

  test('QT-OUT-002/QT-OUT-003/QT-OUT-004: the outlier scatter draws absolute diagonals, the zero line, and per-arm marks (#68)', async ({
    page
  }) => {
    await selectView(page, 'Outlier scatter');
    const thresholds = await page.evaluate(
      () => window.__safetyQtExplorerInstance.chart.$qtThresholds
    );
    expect(thresholds.absolute).toEqual([450, 480, 500]);
    expect(thresholds.zero).toBe(true);
    // Maximum post-baseline mode drops the change lines (QT-OUT-003 / B2).
    expect(thresholds.change).toEqual([]);
    const styles = await page.evaluate(() =>
      window.__safetyQtExplorerInstance.chart.data.datasets.map((d) => d.pointStyle)
    );
    expect(new Set(styles).size).toBe(styles.length);
    await captureEvidence(page, 'QT-OUT-003', 'outlier-scatter-max');
  });

  test('QT-OUT-003: a specific visit adds the change-from-baseline lines (#68)', async ({
    page
  }) => {
    await selectView(page, 'Outlier scatter');
    await selectByLabel(page, 'Timepoint', 'Week 12');
    const thresholds = await page.evaluate(
      () => window.__safetyQtExplorerInstance.chart.$qtThresholds
    );
    expect(thresholds.change).toEqual([30, 60]);
    expect(thresholds.absolute).toEqual([450, 480, 500]);
  });

  test('QT-CAT-001/QT-CAT-002/QT-CAT-003: the categorical view hides the chart and tabulates by-arm exceedance (#68)', async ({
    page
  }) => {
    await selectView(page, 'Categorical');
    await expect(page.locator('.sv-chart-wrap')).toHaveCSS('display', 'none');
    const header = await page.locator('.qt-table thead th').allTextContents();
    expect(header).toEqual(
      expect.arrayContaining([
        'Threshold',
        'Placebo (n=8)',
        'Xanomeline High Dose (n=8)',
        'Xanomeline Low Dose (n=8)',
        'All (n=24)'
      ])
    );
    const rows = await page.locator('.qt-table tbody tr').allTextContents();
    // High Dose: every participant clears 450 ms, none in Placebo.
    expect(rows[0]).toContain('> 450 ms');
    expect(rows[0]).toContain('8 (100%)');
    expect(rows[0]).toContain('0 (0%)');
    await captureEvidence(page, 'QT-CAT-002', 'categorical-table');
  });

  test('QT-CT-007: heart rate is offered in central tendency without the QTc reference line (#68)', async ({
    page
  }) => {
    await selectByLabel(page, 'Correction', 'Heart Rate');
    const spec = await page.evaluate(() => ({
      showReference: window.__safetyQtExplorerInstance.centralSpec.showReference,
      title: window.__safetyQtExplorerInstance.chart.options.scales.y.title.text
    }));
    expect(spec.showReference).toBe(false);
    expect(spec.title).toBe('Δ Heart Rate (bpm)');
  });

  test('QT-OUT-007: heart rate shows a QTc-only note in the outlier view (#68)', async ({
    page
  }) => {
    await selectByLabel(page, 'Correction', 'Heart Rate');
    await selectView(page, 'Outlier scatter');
    await expect(page.locator('.qt-note')).toBeVisible();
    await expect(page.locator('.qt-note')).toContainText('QTc corrections');
    await expect(page.locator('.sv-chart-wrap')).toHaveCSS('display', 'none');
  });

  test('QT-CAUTION-001/QT-CAUTION-002: the standing caution and the unblinding warning ride every view (#136)', async ({
    page
  }) => {
    const caution = page.locator('.safety-qt-explorer .qt-caution').first();
    const unblinding = page.locator('.safety-qt-explorer .qt-caution-unblinding');
    // Default Central tendency view.
    await expect(caution).toBeVisible();
    await expect(caution).toContainText('not validated for clinical use');
    // The fixture cohort carries Placebo plus two Xanomeline arms, so the
    // unblinding gate is true.
    await expect(unblinding).toBeVisible();
    await expect(unblinding).toContainText('unblind');

    await selectView(page, 'Outlier scatter');
    await expect(caution).toBeVisible();
    await expect(unblinding).toBeVisible();
    await selectView(page, 'Categorical');
    await expect(caution).toBeVisible();
    await expect(unblinding).toBeVisible();

    // The path that blanks the view-owned footnote outright — the reason the
    // caution cannot live there. The QTc-only note shows, the footnote empties,
    // and the caution survives on both QTc-only views.
    await selectByLabel(page, 'Correction', 'Heart Rate');
    await expect(page.locator('.qt-note')).toBeVisible();
    await expect(page.locator('.sv-footnote')).toHaveText('');
    await expect(caution).toBeVisible();
    await expect(unblinding).toBeVisible();
    await selectView(page, 'Outlier scatter');
    await expect(page.locator('.qt-note')).toBeVisible();
    await expect(page.locator('.sv-footnote')).toHaveText('');
    await expect(caution).toBeVisible();
    await expect(unblinding).toBeVisible();

    await selectByLabel(page, 'Correction', 'QTcF');
    await selectView(page, 'Central tendency');
    await captureEvidence(page, 'QT-CAUTION-001', 'standing-caution');
  });

  test('QT-DATA-003: the participant note / removed-count path leaves no page errors (#68)', async ({
    page
  }) => {
    const removed = await page.evaluate(() => window.__safetyQtExplorerInstance.removedRecords);
    expect(removed).toBe(2);
  });

  test('PPRF-QT-001/PPRF-QT-002: clicking an outlier-scatter point opens the railed profile in observed ms with the 450 cut on QTcF (#99)', async ({
    page
  }) => {
    await selectView(page, 'Outlier scatter');
    const clickedId = await page.evaluate(() => {
      const instance = window.__safetyQtExplorerInstance;
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
      return instance.chart.data.datasets[0].data[0].__point.id;
    });
    // Full railed profile: header id + configured profile_details.
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveText(`Participant ${clickedId}`);
    await expect(page.locator('.sv-rail .sv-profile-header')).toContainText('Treatment Group');
    // Single-select gesture: never a stepper; no listing exists or is added.
    await expect(page.locator('.sv-rail .sv-profile-step-count')).toHaveCount(0);
    await expect(page.locator('.sv-listing table')).toHaveCount(0);
    // The ECG parameters are KEY measures — no extras toggle — and the
    // spaghetti renders observed milliseconds with the 450 ms cut on the QTc
    // corrections while Heart Rate stays cut-free.
    await expect(page.locator('.sv-rail .sv-profile-extras')).toHaveCount(0);
    await expect(page.locator('.sv-rail .sv-profile-spaghetti canvas')).toBeVisible();
    await expect(page.locator('.sv-rail')).toContainText('Observed (ms)');
    const cuts = await page.evaluate(() => {
      const series = window.__safetyQtExplorerInstance.profile.model.spaghetti.series;
      const byKey = Object.fromEntries(series.map((entry) => [entry.key, entry]));
      return {
        qtcfCut: byKey.QTcF.cut,
        qtcfMin: Math.min(...byKey.QTcF.points.map((point) => point.value)),
        hrCutIsNaN: Number.isNaN(byKey['Heart Rate'].cut)
      };
    });
    expect(cuts.qtcfCut).toBe(450);
    expect(cuts.qtcfMin).toBeGreaterThan(300); // observed ms, not a ×ULN ratio
    expect(cuts.hrCutIsNaN).toBe(true);
    await captureEvidence(page, 'PPRF-QT-002', 'railed-profile-observed-ms');
  });

  test('PPRF-QT-003/PPRF-QT-004: empty clicks and view switches clear the rail, which idles on non-scatter views (#99)', async ({
    page
  }) => {
    await selectView(page, 'Outlier scatter');
    await page.evaluate(() => {
      window.__safetyQtExplorerInstance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    });
    await expect(page.locator('.sv-rail .sv-profile-id')).toBeVisible();
    // Empty-canvas click → the shared clear path → the rail empties and the
    // shell's :empty rule hides the slot.
    await page.evaluate(() => {
      window.__safetyQtExplorerInstance.chart.options.onClick({}, []);
    });
    await expect(page.locator('.sv-rail .sv-profile-root')).toHaveCount(0);
    await expect(page.locator('.sv-rail .sv-profile-id')).toHaveCount(0);
    // Re-select, then switch views: the render preamble clears the selection
    // and the rail idles — the central chart offers no participant marks.
    await page.evaluate(() => {
      window.__safetyQtExplorerInstance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
    });
    await expect(page.locator('.sv-rail .sv-profile-id')).toBeVisible();
    await selectView(page, 'Central tendency');
    await expect(page.locator('.sv-rail .sv-profile-root')).toHaveCount(0);
    const state = await page.evaluate(() => ({
      selectedId: window.__safetyQtExplorerInstance.state.selectedId,
      centralHasOnClick:
        typeof window.__safetyQtExplorerInstance.chart.options.onClick === 'function',
      dockMounted: !!window.__safetyQtExplorerInstance.profile
    }));
    expect(state.selectedId).toBeNull();
    expect(state.centralHasOnClick).toBe(false);
    expect(state.dockMounted).toBe(true);
  });
});

// The table under the chart is wider than a phone: six columns that do not
// wrap, 529 pixels of them in a 340-pixel space (#284). It has a box of its own
// to scroll in, so the page stays as wide as the viewport.
const PHONE = { width: 390, height: 844 };

// The box the table is in, the table, and the page, as laid out now.
const tableBox = (page) =>
  page.evaluate(() => {
    const wrap = document.querySelector('.safety-qt-explorer .qt-table');
    const table = wrap.querySelector('table');
    const edges = (element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right };
    };
    const cells = [...table.querySelectorAll('thead th')];
    return {
      viewport: window.innerWidth,
      page: document.documentElement.scrollWidth,
      wrap: edges(wrap),
      overflow: getComputedStyle(wrap).overflowX,
      scrollWidth: wrap.scrollWidth,
      clientWidth: wrap.clientWidth,
      scrollLeft: wrap.scrollLeft,
      table: edges(table),
      first: edges(cells[0]),
      last: edges(cells[cells.length - 1]),
      role: wrap.getAttribute('role'),
      label: wrap.getAttribute('aria-label'),
      tabindex: wrap.getAttribute('tabindex'),
      caption: table.querySelector('caption').textContent
    };
  });

// The page is no wider than the viewport, the box is inside it, the table is
// wider than its box, and scrolling the box brings the last column into it.
async function expectTableScrollsInItsBox(page) {
  const before = await tableBox(page);
  expect(before.viewport).toBe(PHONE.width);
  expect(before.page).toBe(PHONE.width);
  expect(before.wrap.left).toBeGreaterThanOrEqual(0);
  expect(before.wrap.right).toBeLessThanOrEqual(PHONE.width);
  expect(['auto', 'scroll']).toContain(before.overflow);
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);
  // At rest the first column is in the box and the last is past its right edge.
  expect(before.first.left).toBeGreaterThanOrEqual(before.wrap.left - 0.5);
  expect(before.last.right).toBeGreaterThan(before.wrap.right);
  // The box says what it holds and takes the keyboard's focus, so the arrow
  // keys scroll it.
  expect(before.role).toBe('region');
  expect(before.label).toBe(before.caption);
  expect(before.tabindex).toBe('0');

  const wrap = page.locator('.safety-qt-explorer .qt-table');
  await wrap.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  const after = await tableBox(page);
  expect(after.scrollLeft).toBeGreaterThan(0);
  expect(after.scrollLeft).toBeCloseTo(after.scrollWidth - after.clientWidth, 0);
  // The last column is whole inside the box, and the page has not moved.
  expect(after.last.left).toBeGreaterThanOrEqual(after.wrap.left - 0.5);
  expect(after.last.right).toBeLessThanOrEqual(after.wrap.right + 0.5);
  expect(after.page).toBe(PHONE.width);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
  return before;
}

test.describe('safety.viz qt-explorer module at a 390-pixel viewport', () => {
  test.use({ viewport: PHONE });

  test('QT-CT-009: at a 390-pixel viewport the table under the chart, and the categorical table that takes its place, scroll sideways inside their own box, which is named and takes focus (#284)', async ({
    page
  }) => {
    await page.goto('/tests/e2e/fixtures/qt-explorer.html');
    await page.waitForFunction(
      () => window.__safetyQtExplorerInstance && window.__safetyQtExplorerInstance.chart
    );
    await expect(page.locator('table.qt-ct-table')).toBeVisible();
    const central = await expectTableScrollsInItsBox(page);
    expect(central.caption).toContain('change by visit and arm');
    // The keyboard reaches the columns too: focus the box and press an arrow key.
    const wrap = page.locator('.safety-qt-explorer .qt-table');
    await wrap.evaluate((element) => {
      element.scrollLeft = 0;
    });
    await wrap.focus();
    await expect(wrap).toBeFocused();
    // A key press scrolls smoothly: wait for the scroll to end before reading it.
    await wrap.evaluate((element) => {
      window.__qtScrollEnded = new Promise((resolve) => {
        element.addEventListener('scrollend', resolve, { once: true });
      });
    });
    await page.keyboard.press('ArrowRight');
    await page.evaluate(() => window.__qtScrollEnded);
    expect((await tableBox(page)).scrollLeft).toBeGreaterThan(0);

    // The categorical view's table is in the same box, renamed for it, and
    // starts at its first column though the box had been scrolled.
    await selectView(page, 'Categorical');
    await expect(page.locator('.qt-table thead th').first()).toHaveText('Threshold');
    const categorical = await expectTableScrollsInItsBox(page);
    expect(categorical.caption).toContain('participants exceeding thresholds by arm');
    await captureEvidence(page, 'QT-CT-009', 'table-scrolls-in-its-box');
  });

  // The two pages the defect was seen on are build products, so the site is
  // built here: the docs demo page, and the demo app on the pilot study.
  test.describe('on the built pages', () => {
    test.beforeAll(() => {
      execSync('npm run site', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
    });

    for (const [name, url, ready] of [
      ['on the docs demo page', '/_site/qt-explorer/index.html', null],
      ['in the demo app', '/_site/demo/index.html#qt-explorer', 'window.__safetyVizApp.ready']
    ]) {
      test(`QT-CT-009: ${name} at a 390-pixel viewport the page is as wide as the viewport and the table scrolls inside its own box to its last column (#284)`, async ({
        page
      }) => {
        await page.goto(url);
        if (ready) await page.evaluate(ready);
        await expect(page.locator('.safety-qt-explorer table.qt-ct-table')).toBeVisible();
        const table = await expectTableScrollsInItsBox(page);
        // Six columns, the last being the upper bound of the interval.
        await expect(page.locator('.safety-qt-explorer table.qt-ct-table thead th')).toHaveCount(6);
        expect(table.table.right - table.table.left).toBeGreaterThan(500);
      });
    }
  });
});
