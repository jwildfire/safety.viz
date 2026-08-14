import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the nep-explorer module (#120). Test names are keyed to
// the NEP-* requirement IDs per the traceability convention in CONTRIBUTING.md;
// see docs/nep-explorer-coverage.md for the requirement-ID → test map.
//
// The fixture cohort populates every KDIGO zone exactly once or twice, including
// the two cases no real dataset here can supply: a participant whose maximum
// reaches 4.0 mg/dL on a Stage-1 fold change, and a participant whose records
// mix mg/dL and µmol/L. A second fixture page carries the unknown-unit
// suppression path, which a demo with known units cannot reach.

const STAGE_OF = (page, id) =>
  page.evaluate(
    (participant) =>
      window.__safetyNepExplorerInstance.allPoints.find((point) => point.id === participant),
    id
  );

async function selectByLabel(page, label, value) {
  const select = page
    .locator('.sv-control', { has: page.locator(`label:text-is("${label}")`) })
    .locator('select');
  await select.selectOption(value);
}

test.describe('safety.viz nep-explorer module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._nepErrors = errors;
    await page.goto('/tests/e2e/fixtures/nep-explorer.html');
    await page.waitForFunction(
      () => window.__safetyNepExplorerInstance && window.__safetyNepExplorerInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._nepErrors).toEqual([]);
  });

  test('NEP-ZONE-001/NEP-ZONE-002: the stage zones paint worst-first behind the points (#120)', async ({
    page
  }) => {
    const zones = await page.evaluate(() =>
      window.__safetyNepExplorerInstance.chart.$nepZones.map((zone) => ({
        stage: zone.stage,
        label: zone.label,
        x0: zone.x0,
        x1: zone.x1,
        left: zone.left,
        right: zone.right
      }))
    );
    // Stage 3, Stage 2, then the two Stage-1 regions that make the L.
    expect(zones.map((zone) => zone.stage)).toEqual([3, 2, 1, 1]);
    expect(zones.map((zone) => zone.label)).toEqual(['Stage 3', 'Stage 2', 'Stage 1', null]);
    expect(zones[0].x0).toBe(3);
    expect(zones[2].x0).toBe(1.5);
    expect(zones[2].x1).toBe(2);
    // Painted left-to-right in pixel space, which is what proves the geometry
    // came from the live scales rather than a second copy of the cut-points.
    zones.forEach((zone) => expect(zone.right).toBeGreaterThan(zone.left));
    await captureEvidence(page, 'NEP-ZONE-001', 'stage-zones-scatter');
  });

  test('NEP-ZONE-004: the zone labels can be hidden (#120)', async ({ page }) => {
    const checkbox = page
      .locator('.sv-control', { has: page.locator('label:text-is("Stage zone labels")') })
      .locator('input[type=checkbox]');
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await page.waitForFunction(
      () => window.__safetyNepExplorerInstance.settings.zone_labels === 'hidden'
    );
    // The geometry survives; only the lettering goes, so a reviewer reading the
    // cloud rather than the regions is not also losing the regions.
    const zones = await page.evaluate(
      () => window.__safetyNepExplorerInstance.chart.$nepZones.length
    );
    expect(zones).toBe(4);
    await captureEvidence(page, 'NEP-ZONE-004', 'zone-labels-hidden');
  });

  test('NEP-STAGE-001/NEP-STAGE-004: each participant lands in the zone their staging names (#120)', async ({
    page
  }) => {
    const staged = await page.evaluate(() =>
      window.__safetyNepExplorerInstance.allPoints.map((point) => [
        point.id,
        point.foldStage,
        point.deltaStage,
        point.stage
      ])
    );
    expect(new Map(staged.map(([id, ...rest]) => [id, rest]))).toEqual(
      new Map([
        ['N-1', [0, 0, 0]],
        ['N-2', [0, 0, 0]],
        ['N-3', [0, 0, 0]],
        ['F1-1', [1, 1, 1]],
        // Stage 1 on the absolute axis alone: a chronic-kidney-disease baseline
        // where a 1.28× rise is 0.70 mg/dL.
        ['D1-1', [0, 1, 1]],
        ['F2-1', [2, 1, 2]],
        ['F3-1', [3, 1, 3]],
        // The >= 4.0 mg/dL rule, on a fold change the ladder alone calls Stage 1.
        ['A1-1', [1, 1, 3]],
        // Creatinine that only fell: staged 0, and still plotted.
        ['DN-1', [0, 0, 0]],
        ['MIX-1', [3, 1, 3]]
      ])
    );
  });

  test('NEP-UNIT-002: a participant whose records mix mg/dL and µmol/L stages on the converted values (#120)', async ({
    page
  }) => {
    // A per-DATASET conversion would read MIX-1's 1.0 mg/dL baseline against a
    // 265.2 µmol/L peak as a 265× rise. Per record, it is 3.0×.
    const point = await STAGE_OF(page, 'MIX-1');
    expect(point.baseline).toBeCloseTo(1.0, 6);
    expect(point.max).toBeCloseTo(3.0, 6);
    expect(point.fold).toBeCloseTo(3.0, 6);
    expect(point.unit).toBe('mg/dL');
  });

  test('NEP-SCAT-001/NEP-STAGE-003: the >= 4.0 mg/dL participant carries a distinct mark (#120)', async ({
    page
  }) => {
    const marks = await page.evaluate(() => {
      const instance = window.__safetyNepExplorerInstance;
      const dataset = instance.chart.data.datasets[0];
      const index = instance.points.findIndex((point) => point.id === 'A1-1');
      const plain = instance.points.findIndex((point) => point.id === 'F1-1');
      return {
        ruleStyle: dataset.pointStyle[index],
        plainStyle: dataset.pointStyle[plain],
        ruleRadius: dataset.pointRadius[index],
        plainRadius: dataset.pointRadius[plain],
        // The mark is the ONLY thing that distinguishes them: the point sits
        // inside the Stage-1 zone, because the rule is about the value reached.
        ruleX: instance.points[index].fold
      };
    });
    expect(marks.ruleStyle).not.toBe(marks.plainStyle);
    expect(marks.ruleRadius).toBeGreaterThan(marks.plainRadius);
    expect(marks.ruleX).toBeLessThan(2);
    await captureEvidence(page, 'NEP-STAGE-003', 'absolute-rule-mark');
  });

  test('NEP-SCAT-004: clicking a point selects it and dispatches participantsSelected (#120)', async ({
    page
  }) => {
    await page.evaluate(() => {
      window.__nepSelections = [];
      window.__safetyNepExplorerInstance.root.addEventListener('participantsSelected', (event) => {
        window.__nepSelections.push(event.detail.data);
      });
    });
    const clicked = await page.evaluate(() => {
      const instance = window.__safetyNepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'F3-1');
      instance.selectPoint(index);
      return instance.participantsSelected;
    });
    expect(clicked).toEqual(['F3-1']);
    // The seam Phase 2's patient profile mounts onto.
    expect(await page.evaluate(() => window.__nepSelections)).toEqual([['F3-1']]);
    await expect(page.locator('.sv-main-annotation')).toContainText('F3-1 — Stage 3');
    await expect(page.locator('.sv-footnote')).toContainText('× baseline');
    await captureEvidence(page, 'NEP-SCAT-004', 'participant-selected');

    // Clearing dispatches the empty selection, so an external listener follows
    // rather than being left holding a stale participant.
    await page.evaluate(() => window.__safetyNepExplorerInstance.clearSelection());
    expect(await page.evaluate(() => window.__nepSelections)).toEqual([['F3-1'], []]);
    await expect(page.locator('.sv-main-annotation')).toContainText('Click a point');
  });

  test('NEP-TBL-001/NEP-TBL-002: the summary tabulates the fold, absolute and combined stagings (#120)', async ({
    page
  }) => {
    await expect(page.locator('.nep-summary-title')).toContainText('n = 10');
    const rows = await page.locator('.nep-summary tbody tr').allTextContents();
    expect(rows).toHaveLength(4);
    const cells = await page.locator('.nep-summary tbody tr').nth(0).allInnerTexts();
    expect(cells.join(' ')).toMatch(/no stage/i);
    // Stage 2 and Stage 3 do not exist on the absolute-change axis, so those
    // cells are dashes rather than zeroes — a zero would read as "nobody
    // qualified", which is the misreading the R source's table invites.
    const stage2 = page.locator('.nep-summary tbody tr').nth(2);
    await expect(stage2.locator('td.nep-na')).toHaveCount(2);
    await expect(page.locator('.nep-summary-note').first()).toContainText(
      'KDIGO defines no Stage 2 or Stage 3 on absolute change'
    );
    const summary = await page.evaluate(() => window.__safetyNepExplorerInstance.summary);
    expect(summary.rows.map((row) => row.fold.n)).toEqual([5, 2, 1, 2]);
    expect(summary.rows.map((row) => row.delta.n)).toEqual([4, 6, null, null]);
    expect(summary.rows.map((row) => row.combined.n)).toEqual([4, 2, 1, 3]);
    // Captured from the listing locator, not the viewport: the table sits below
    // the fold at the standard capture size, and a screenshot that crops it off
    // is not evidence that it exists.
    await captureEvidence(page.locator('.sv-listing'), 'NEP-TBL-001', 'stage-summary-table');
  });

  test('NEP-DATA-005: unusable records and participants are counted with a download each (#120)', async ({
    page
  }) => {
    const notes = await page.locator('.sv-notes').innerText();
    expect(notes).toContain('10 of 10 participants shown');
    expect(notes).toContain('2 missing or non-numeric results removed');
    expect(notes).toContain('2 participants could not be plotted');
    // D7's fallback is the demo's own path, and its count is stated rather than
    // assumed: no fixture record carries a baseline flag.
    expect(notes).toContain('10 participants used the earliest record as baseline');

    const links = page.locator('.sv-notes .hep-csv-link');
    await expect(links).toHaveCount(2);
    const csv = await page.evaluate(() => ({
      records: document.querySelectorAll('.sv-notes .hep-csv-link')[0].__hepCsv(),
      participants: document.querySelectorAll('.sv-notes .hep-csv-link')[1].__hepCsv()
    }));
    // The export answers "which data left, and why" — not only "how much".
    expect(csv.records.split('\n')[0]).toContain('__nep_dropReason');
    expect(csv.records).toContain('BAD-1');
    expect(csv.records).not.toContain('__nep_raw');
    expect(csv.participants).toContain('"BAD-1","No usable creatinine result"');
    expect(csv.participants).toContain('"ONE-1","No post-baseline creatinine record"');
    await captureEvidence(page, 'NEP-DATA-005', 'dropped-record-notes');
  });

  test('NEP-CFG-006: the filters narrow the plotted population and restate the summary (#120)', async ({
    page
  }) => {
    const labels = await page.locator('.sv-control label').allTextContents();
    expect(labels).toEqual(expect.arrayContaining(['Sex', 'Treatment Group', 'Stage zone labels']));
    // A filter whose column the data does not carry is dropped, not rendered
    // with a single empty option (the fixture configures one deliberately).
    expect(labels).not.toContain('Absent Column');
    await selectByLabel(page, 'Treatment Group', 'Placebo');
    await expect(page.locator('.sv-notes')).toContainText('of 10 participants shown');
    const shown = await page.evaluate(() => window.__safetyNepExplorerInstance.points.length);
    expect(shown).toBe(3);
    await expect(page.locator('.nep-summary-title')).toContainText('n = 3');
  });
});

test.describe('safety.viz nep-explorer — an unrecognized unit', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._nepErrors = errors;
    await page.goto('/tests/e2e/fixtures/nep-explorer-unknown-units.html');
    await page.waitForFunction(
      () => window.__safetyNepExplorerInstance && window.__safetyNepExplorerInstance.chart
    );
  });

  test.afterEach(async ({ page }) => {
    expect(page._nepErrors).toEqual([]);
  });

  test('NEP-UNIT-003: the fold axis survives and every absolute claim is withheld (#120)', async ({
    page
  }) => {
    // Design §4: a wrong staging is worse than an incomplete one.
    const state = await page.evaluate(() => {
      const instance = window.__safetyNepExplorerInstance;
      return {
        unitsResolved: instance.unitsResolved,
        nativeUnit: instance.nativeUnit,
        zones: instance.chart.$nepZones.map((zone) => zone.stage),
        points: instance.allPoints.map((point) => [point.id, point.foldStage, point.deltaStage]),
        yTitle: instance.chart.options.scales.y.title.text,
        summary: instance.summary.rows.map((row) => row.delta.n)
      };
    });
    expect(state.unitsResolved).toBe(false);
    expect(state.nativeUnit).toBe('arb. units');
    // The 0.3 mg/dL arm of Stage 1 goes with the contract that expressed it;
    // the fold bands remain, because a ratio needs no unit.
    expect(state.zones).toEqual([3, 2, 1]);
    expect(state.points).toEqual([
      ['U-1', 0, null],
      ['U-2', 1, null],
      ['U-3', 2, null],
      ['U-4', 3, null],
      ['U-5', 0, null]
    ]);
    // The y-axis is labelled in the unit the values are actually in.
    expect(state.yTitle).toContain('arb. units');
    expect(state.summary).toEqual([0, 0, null, null]);
    await expect(page.locator('.sv-notes .sv-warning')).toContainText('not recognized');
    await expect(page.locator('.nep-summary-note.sv-warning')).toContainText(
      'Absolute-change staging is suppressed'
    );
    await captureEvidence(page, 'NEP-UNIT-003', 'unknown-unit-suppression');
  });
});
