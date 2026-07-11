import fs from 'node:fs';
import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the ae-timelines module (#26): a Chart.js
// reimplementation of RhoInc/ae-timelines matching the original renderer's
// behavior. Test names are keyed to AET- requirement IDs per the traceability
// convention in CONTRIBUTING.md; see docs/ae-timelines-coverage.md for the
// requirement-ID → matrix-row → test map.
//
// Fixture data (fixtures/adae.csv, hand-computed): 8 participants; SUBJ-05 is
// an AE-free placeholder row, SUBJ-08 has only a blank-term record, and
// SUBJ-07 has one record with a non-integer start day — so 6 of 8
// participants (75.0%) show by default, with 2 + 1 removal warnings.

async function clickParticipantLabel(page, subject) {
  const pos = await page.evaluate((id) => {
    const chart = window.__aeTimelinesInstance.chart;
    const index = chart.scales.y.getLabels().indexOf(id);
    const rect = chart.canvas.getBoundingClientRect();
    return {
      x: rect.left + (chart.chartArea.left + chart.scales.y.left) / 2,
      y: rect.top + chart.scales.y.getPixelForValue(index)
    };
  }, subject);
  await page.mouse.click(pos.x, pos.y);
  await expect(page.locator('.sv-detail')).toBeVisible();
}

function yLabels(page) {
  return page.evaluate(() => window.__aeTimelinesInstance.chart.scales.y.getLabels());
}

async function selectFilter(page, label, value) {
  await page
    .locator('.sv-controls .sv-control', { has: page.locator(`label:text-is("${label}")`) })
    .locator('select')
    .selectOption(value);
}

test.describe('safety.viz ae-timelines module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._aetErrors = errors;
    await page.goto('/tests/e2e/fixtures/ae-timelines.html');
    await page.waitForFunction(
      () => window.__aeTimelinesInstance && window.__aeTimelinesInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._aetErrors).toEqual([]);
  });

  test('AET-FUNC-002/AET-FUNC-003/AET-FUNC-004/AET-FUNC-005: renders the timeline with filter and sort controls and a severity legend (#26)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toEqual(
      expect.arrayContaining([
        'Serious Event',
        'Severity/Intensity',
        'Sex',
        'Participant Identifier',
        'Sort Participant IDs'
      ])
    );
    // The legend carries the configured severity levels, the N/A level found
    // in the data, and the serious-event highlight item.
    const legend = await page.evaluate(() =>
      window.__aeTimelinesInstance.chart.data.datasets.map((dataset) => dataset.label)
    );
    expect(legend).toEqual(['MILD', 'MODERATE', 'SEVERE', 'N/A', 'Serious Event']);
    await captureEvidence(page, 'AET-FUNC-002', 'baseline-timelines');
  });

  test('AET-FUNC-007/AET-REG-002/AET-REG-013: the italicized participant annotation reports shown of total and updates on filter (#26)', async ({
    page
  }) => {
    const note = page.locator('.sv-notes em');
    await expect(note).toHaveText('6 of 8 participant ID(s) shown (75.0%)');
    await expect(note).toHaveCSS('font-style', 'italic');
    await selectFilter(page, 'Serious Event', 'Y');
    await expect(note).toHaveText('2 of 8 participant ID(s) shown (25.0%)');
    await captureEvidence(page, 'AET-FUNC-007', 'participant-annotation');
  });

  test('AET-DATA-001: blank-term and non-integer-start-day records are removed with visible counts (#26)', async ({
    page
  }) => {
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      '2 records without [ AETERM ] removed. 1 records without [ ASTDY ] removed.'
    );
  });

  test('AET-REG-001: filtering by severity changes the visible events and participants (#26)', async ({
    page
  }) => {
    const before = await yLabels(page);
    expect(before).toHaveLength(6);
    await selectFilter(page, 'Severity/Intensity', 'MODERATE');
    const after = await yLabels(page);
    expect(after).toEqual(['SUBJ-06', 'SUBJ-01']);
    const drawn = await page.evaluate(() =>
      window.__aeTimelinesInstance.chart.data.datasets.reduce(
        (sum, dataset) => sum + dataset.data.length,
        0
      )
    );
    expect(drawn).toBe(2);
    await captureEvidence(page, 'AET-REG-001', 'severity-filter');
  });

  test('AET-FUNC-006/AET-REG-003: the sort control switches between earliest and alphabetical participant order (#26)', async ({
    page
  }) => {
    // earliest (default): first AE start day ascending from the top.
    expect(await yLabels(page)).toEqual([
      'SUBJ-02',
      'SUBJ-06',
      'SUBJ-01',
      'SUBJ-03',
      'SUBJ-07',
      'SUBJ-04'
    ]);
    await selectFilter(page, 'Sort Participant IDs', 'alphabetical-descending');
    expect(await yLabels(page)).toEqual([
      'SUBJ-01',
      'SUBJ-02',
      'SUBJ-03',
      'SUBJ-04',
      'SUBJ-06',
      'SUBJ-07'
    ]);
    await captureEvidence(page, 'AET-FUNC-006', 'alphabetical-sort');
  });

  test('AET-FUNC-008/AET-REG-004: hovering an event shows the reported term, start day, and stop day (#26)', async ({
    page
  }) => {
    const tooltip = await page.evaluate(() => {
      const chart = window.__aeTimelinesInstance.chart;
      const di = chart.data.datasets.findIndex((dataset) =>
        dataset.data.some((point) => point.__aet && point.__aet.term === 'Headache')
      );
      const index = chart.data.datasets[di].data.findIndex(
        (point) => point.__aet.term === 'Headache'
      );
      chart.tooltip.setActiveElements([{ datasetIndex: di, index }], { x: 0, y: 0 });
      chart.update();
      return chart.tooltip.body.flatMap((body) => body.lines);
    });
    expect(tooltip).toEqual(['Reported Term: Headache', 'Start Day: 5', 'Stop Day: 12']);
    // Serious events append the highlight label and value.
    const serious = await page.evaluate(() => {
      const chart = window.__aeTimelinesInstance.chart;
      const di = chart.data.datasets.findIndex((dataset) =>
        dataset.data.some((point) => point.__aet && point.__aet.term === 'Nausea')
      );
      const index = chart.data.datasets[di].data.findIndex(
        (point) => point.__aet.term === 'Nausea'
      );
      chart.tooltip.setActiveElements([{ datasetIndex: di, index }], { x: 0, y: 0 });
      chart.update();
      return chart.tooltip.body.flatMap((body) => body.lines);
    });
    expect(serious).toEqual([
      'Reported Term: Nausea',
      'Start Day: 20',
      'Stop Day: 25',
      'Serious Event: Y'
    ]);
    await captureEvidence(page, 'AET-FUNC-008', 'hover-tooltip');
  });

  test('AET-REG-005/AET-REG-006: serious events carry a distinct mark and dots sit at start days only (#26)', async ({
    page
  }) => {
    const marks = await page.evaluate(() => window.__aeTimelinesInstance.chart.$aetMarks);
    // 7 clean events drawn; exactly the two serious events flagged.
    expect(marks).toHaveLength(7);
    const serious = marks.filter((mark) => mark.serious);
    expect(serious.map((mark) => mark.subject).sort()).toEqual(['SUBJ-01', 'SUBJ-06']);
    // Every mark's dot is anchored at the start-day pixel, never the stop day.
    for (const mark of marks) {
      expect(mark.circleX).toBe(mark.x0);
      if (mark.end > mark.start) expect(mark.circleX).not.toBe(mark.x1);
    }
    await captureEvidence(page, 'AET-REG-006', 'serious-markers');
  });

  test('AET-FUNC-009/AET-REG-008/AET-API-003: clicking a participant ID opens the detail view and fires participantsSelected (#26)', async ({
    page
  }) => {
    await clickParticipantLabel(page, 'SUBJ-01');
    await expect(page.locator('.sv-detail strong')).toHaveText('Participant: SUBJ-01');
    await expect(page.locator('.sv-detail canvas')).toBeVisible();
    // The main chart and controls hide while the detail view is open.
    await expect(page.locator('.sv-chart-wrap').first()).toBeHidden();
    await expect(page.locator('.sv-sidebar')).toBeHidden();
    // The listing shows the participant's raw records with the default columns.
    const headers = await page.locator('.sv-listing th').allTextContents();
    expect(headers.join(',')).toContain('Sequence Number');
    expect(headers.join(',')).toContain('Start Day');
    expect(headers.join(',')).toContain('Stop Day');
    expect(headers.join(',')).toContain('Reported Term');
    expect(headers.join(',')).toContain('Severity/Intensity');
    expect(headers.join(',')).toContain('Serious Event');
    await expect(page.locator('.sv-listing tbody tr')).toHaveCount(2);
    // The detail chart draws one row per sequence number on the shared x-domain.
    const detail = await page.evaluate(() => {
      const instance = window.__aeTimelinesInstance;
      return {
        labels: instance.detailChart.scales.y.getLabels(),
        min: instance.detailChart.scales.x.min,
        max: instance.detailChart.scales.x.max,
        mainMin: instance.chart.scales.x.min,
        mainMax: instance.chart.scales.x.max
      };
    });
    expect(detail.labels).toEqual(['1', '2']);
    expect(detail.min).toBe(detail.mainMin);
    expect(detail.max).toBe(detail.mainMax);
    expect(await page.evaluate(() => window.__aetParticipantsSelected.at(-1))).toEqual([
      'SUBJ-01'
    ]);
    await captureEvidence(page, 'AET-FUNC-009', 'participant-detail');
  });

  test('AET-FUNC-010/AET-REG-012/AET-API-003: the Back button returns to the timelines and clears the selection (#26)', async ({
    page
  }) => {
    await clickParticipantLabel(page, 'SUBJ-02');
    await page.locator('.sv-detail button', { hasText: 'Back' }).click();
    await expect(page.locator('.sv-detail')).toBeHidden();
    await expect(page.locator('.sv-chart-wrap').first()).toBeVisible();
    await expect(page.locator('.sv-sidebar')).toBeVisible();
    expect(await page.evaluate(() => window.__aetParticipantsSelected.at(-1))).toEqual([]);
    await captureEvidence(page, 'AET-FUNC-010', 'back-to-timelines');
  });

  test('AET-REG-009/AET-REG-010/AET-REG-011: the detail listing supports search, header sorting, and CSV export (#26)', async ({
    page
  }) => {
    await clickParticipantLabel(page, 'SUBJ-01');
    await page.locator('.sv-listing-search').fill('Nausea');
    await expect(page.locator('.sv-listing tbody tr')).toHaveCount(1);
    await expect(page.locator('.sv-listing tbody')).toContainText('Nausea');
    await page.locator('.sv-listing-search').fill('');

    await page.locator('.sv-listing th', { hasText: 'Start Day' }).click();
    await expect(page.locator('.sv-listing th', { hasText: 'Start Day ▲' })).toBeVisible();
    await expect(page.locator('.sv-listing tbody tr').first()).toContainText('Headache');
    await page.locator('.sv-listing th', { hasText: /Start Day/ }).click();
    await expect(page.locator('.sv-listing th', { hasText: 'Start Day ▼' })).toBeVisible();
    await expect(page.locator('.sv-listing tbody tr').first()).toContainText('Nausea');

    const download = page.waitForEvent('download');
    await page.locator('.sv-listing-actions button', { hasText: 'Export: CSV' }).click();
    const csvDownload = await download;
    const csv = fs.readFileSync(await csvDownload.path(), 'utf8');
    expect(csv.split('\n')[0]).toBe(
      'Sequence Number,Start Day,Stop Day,Reported Term,Severity/Intensity,Serious Event'
    );
    expect(csv).toContain('Nausea');
    await captureEvidence(page, 'AET-REG-009', 'detail-listing');
  });

  test('AET-API-001: lifecycle API supports init, setData, setSettings, render, resize, and destroy (#26)', async ({
    page
  }) => {
    const result = await page.evaluate(() => {
      const instance = window.__aeTimelinesInstance;
      const methods = ['init', 'setData', 'setSettings', 'render', 'resize', 'destroy'];
      const hasMethods = methods.every((method) => typeof instance[method] === 'function');
      const setSettingsReturnsInstance =
        instance.setSettings({ sort_participants: 'earliest' }) === instance;
      const setDataReturnsInstance = instance.setData(instance.rawData.slice(0, 6)) === instance;
      const renderReturns = instance.render();
      instance.resize();
      const chartCountBeforeDestroy = instance.charts.length;
      instance.destroy();
      return {
        hasMethods,
        setSettingsReturnsInstance,
        setDataReturnsInstance,
        renderReturns,
        chartCountBeforeDestroy,
        containerText: document.querySelector('#container').textContent.trim()
      };
    });
    expect(result.hasMethods).toBe(true);
    expect(result.setSettingsReturnsInstance).toBe(true);
    expect(result.setDataReturnsInstance).toBe(true);
    expect(result.renderReturns).toBeUndefined();
    expect(result.chartCountBeforeDestroy).toBeGreaterThan(0);
    expect(result.containerText).toBe('');
  });
});
