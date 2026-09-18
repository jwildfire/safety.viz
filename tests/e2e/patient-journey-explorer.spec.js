import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the patient-journey-explorer module (#142). Test names
// are keyed to the PJE-* requirement IDs per the traceability convention in
// CONTRIBUTING.md; see docs/patient-journey-explorer-coverage.md for the
// requirement-ID → test map.
//
// The fixture (fixtures/patient-journey-explorer.html) loads the hand-computed
// dataset in fixtures/patient-journey-explorer-data.js, which assigns
// window.PJE_FIXTURE = { ex, ae, lb, cm, mh, ds, merged, expectations }. Every
// expected number in this file is read from `expectations` at run time —
// nothing is pasted (design PC-2), so the data owner's arithmetic and these
// assertions cannot drift apart.
//
// Nothing here reads `instance.state` (it is private): the documented read
// paths are `subject`, `anchoredEvent`, `getContext()`, `getTimeMode()`,
// `laneCharts`, `structured`, `droppedCounts` and the two drawing
// side-channels `chart.$pjeMarks` / `chart.$pjeBand` (design §6.4).

const LANE_ORDER = [
  'exposure',
  'doseChanges',
  'adverseEvents',
  'labs',
  'conMeds',
  'medicalHistory',
  'disposition'
];

const expectations = (page) => page.evaluate(() => window.PJE_FIXTURE.expectations);

// Every drawn mark per chart key, from the side-channel the plugin records.
const laneMarks = (page) =>
  page.evaluate(() =>
    Object.fromEntries(
      [...window.__safetyPatientJourneyInstance.laneCharts.entries()].map(([key, chart]) => [
        key,
        (chart.$pjeMarks || [])
          .filter((mark) => mark.event)
          .map((mark) => ({
            id: mark.event.id,
            lane: mark.lane,
            test: mark.test,
            glyph: mark.glyph,
            emphasis: mark.emphasis,
            endCap: mark.endCap,
            x: mark.x,
            y: mark.y,
            width: mark.width,
            height: mark.height,
            day: mark.event.day
          }))
      ])
    )
  );

// Drawn-mark counts per LANE key (the N lab charts fold into `labs`).
async function markCountByLane(page) {
  const marks = await laneMarks(page);
  const counts = {};
  for (const [key, list] of Object.entries(marks)) {
    const lane = key.startsWith('labs:') ? 'labs' : key;
    counts[lane] = (counts[lane] || 0) + list.length;
  }
  return counts;
}

const chartScales = (page) =>
  page.evaluate(() =>
    [...window.__safetyPatientJourneyInstance.laneCharts.values()].map((chart) => [
      chart.scales.x.min,
      chart.scales.x.max,
      chart.scales.y.width
    ])
  );

const axisTicks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.sv-pje-axis-tick')].map((tick) => ({
      text: tick.textContent,
      left: tick.style.left
    }))
  );

const laneKeys = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.sv-pje-lane')].map((lane) => lane.dataset.lane)
  );

const markButton = (page, id) => page.locator(`.sv-pje-mark[data-event-id="${id}"]`);

test.describe('safety.viz patient-journey-explorer module', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._pjeErrors = errors;
    await page.goto('/tests/e2e/fixtures/patient-journey-explorer.html');
    await page.waitForFunction(
      () =>
        window.__safetyPatientJourneyInstance &&
        window.__safetyPatientJourneyInstance.laneCharts &&
        window.__safetyPatientJourneyInstance.laneCharts.size > 0
    );
    // Give the compositor a frame after the first mount before any capture.
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
  });

  test.afterEach(async ({ page }) => {
    expect(page._pjeErrors).toEqual([]);
  });

  test('PJE-SUBJ-001: the subject selector lists every participant and opens on the first (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const options = page.locator('.sv-pje-subject-list option');
    await expect(options).toHaveCount(exp.subjects.length);
    const values = await options.evaluateAll((nodes) => nodes.map((node) => node.value));
    expect(values).toEqual(exp.subjects);
    const subject = await page.evaluate(() => window.__safetyPatientJourneyInstance.subject);
    expect(subject).toBe(exp.openingSubject);
    expect(await page.evaluate(() => window.__safetyPatientJourneyInstance.subjects)).toEqual(
      exp.subjects
    );
    await captureEvidence(page, 'PJE-SUBJ-001', 'subject-journey');
  });

  test('PJE-SUBJ-002: filtering the subject list and selecting a subject redraws every lane (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const target = exp.noAeSubject;
    // Anchor first, so the selection is seen to clear it.
    await page.evaluate((id) => window.__safetyPatientJourneyInstance.anchor(id), exp.anchorId);
    const before = await markCountByLane(page);
    const search = page.locator('[data-sv-focus="subject-search"]');
    await search.fill(target);
    // The current subject stays in the list even when it does not match.
    const values = await page
      .locator('.sv-pje-subject-list option')
      .evaluateAll((nodes) => nodes.map((node) => node.value));
    expect(values).toContain(target);
    expect(values).toContain(exp.openingSubject);
    expect(values.length).toBeLessThan(exp.subjects.length);
    await page.locator('.sv-pje-subject-list').selectOption(target);
    await page.waitForFunction(
      (id) => window.__safetyPatientJourneyInstance.subject === id,
      target
    );
    const state = await page.evaluate(() => ({
      subject: window.__safetyPatientJourneyInstance.subject,
      anchored: window.__safetyPatientJourneyInstance.anchoredEvent,
      selected: window.__safetyPatientJourneyInstance.participantsSelected
    }));
    expect(state.subject).toBe(target);
    expect(state.anchored).toBeNull();
    expect(state.selected).toEqual([target]);
    const after = await markCountByLane(page);
    expect(after).not.toEqual(before);
    expect(after.adverseEvents || 0).toBe(0);
  });

  test('PJE-LANE-001: every enabled domain renders a labelled lane in the fixed order (#142)', async ({
    page
  }) => {
    const keys = await laneKeys(page);
    expect([...new Set(keys)]).toEqual(LANE_ORDER);
    // The labs lane is N sibling rows, one per configured test with records.
    const exp = await expectations(page);
    expect(keys.filter((key) => key === 'labs')).toHaveLength(exp.labTests.length);
    const labels = await page
      .locator('.sv-pje-lane .sv-pje-lane-label')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()));
    expect(labels).toHaveLength(keys.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
    await captureEvidence(page, 'PJE-LANE-001', 'lanes-all');
  });

  test('PJE-LANE-004: every lane shares one x domain and one y width (#142)', async ({ page }) => {
    const scales = await chartScales(page);
    expect(scales.length).toBeGreaterThan(1);
    for (const scale of scales) expect(scale).toEqual(scales[0]);
    expect(scales[0][2]).toBe(132);
  });

  test('PJE-LANE-002: toggling a lane hides it and leaves the shared domain unchanged (#142)', async ({
    page
  }) => {
    const before = await chartScales(page);
    await page.locator('[data-sv-focus="lane-labs"]').uncheck();
    await page.waitForFunction(() => !document.querySelector('.sv-pje-lane[data-lane="labs"]'));
    const keys = await laneKeys(page);
    expect(keys).not.toContain('labs');
    const after = await chartScales(page);
    expect(after.length).toBeGreaterThan(0);
    for (const scale of after) expect(scale).toEqual(before[0]);
    await captureEvidence(page, 'PJE-LANE-002', 'lane-toggled');
  });

  test('PJE-LANE-003: collapsing a lane group hides its lanes (#142)', async ({ page }) => {
    const ticksBefore = await axisTicks(page);
    const toggle = page.locator('.sv-pje-group[data-group="events"] .sv-pje-group-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(
      page.locator('.sv-pje-group[data-group="events"] .sv-pje-lane[data-lane="adverseEvents"]')
    ).toBeHidden();
    await expect(page.locator('.sv-pje-lane[data-lane="exposure"]')).toBeVisible();
    expect(await axisTicks(page)).toEqual(ticksBefore);
  });

  test('PJE-LANE-005: the labs lane draws one sparkline per configured test with its reference band (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const rows = page.locator('.sv-pje-lane[data-lane="labs"][data-test]');
    await expect(rows).toHaveCount(exp.labTests.length);
    await expect(page.locator('.sv-pje-lane[data-lane="labs"] canvas')).toHaveCount(
      exp.labTests.length
    );
    const bands = await page.evaluate(() =>
      [...window.__safetyPatientJourneyInstance.laneCharts.entries()]
        .filter(([key]) => key.startsWith('labs:'))
        .map(([key, chart]) => [key.slice(5), chart.$pjeBand])
    );
    expect(bands.map(([test]) => test)).toEqual(exp.labTests);
    // The limits the band draws are the data's own.
    const limits = await page.evaluate((subject) => {
      const out = {};
      for (const row of window.PJE_FIXTURE.lb) {
        if (row.USUBJID !== subject || !row.LBSTNRLO) continue;
        out[row.LBTEST] = { lln: Number(row.LBSTNRLO), uln: Number(row.LBSTNRHI) };
      }
      return out;
    }, exp.openingSubject);
    for (const [test, band] of bands) {
      expect(band.length).toBeGreaterThan(0);
      for (const rect of band) {
        expect(rect.lln).toBe(limits[test].lln);
        expect(rect.uln).toBe(limits[test].uln);
        expect(rect.width).toBeGreaterThan(0);
      }
    }
    // Out-of-range points differ by shape, not only colour.
    const marks = await laneMarks(page);
    const glyphs = new Set(
      Object.entries(marks)
        .filter(([key]) => key.startsWith('labs:'))
        .flatMap(([, list]) => list.map((mark) => mark.glyph))
    );
    expect(glyphs.has('triangle-up')).toBe(true);
    expect(glyphs.has('circle-open')).toBe(true);
    await captureEvidence(page, 'PJE-LANE-005', 'labs-small-multiples');
  });

  test('PJE-LANE-006: exposure bars segment at each dose change and each change carries a direction glyph (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const marks = await laneMarks(page);
    const exposure = [...marks.exposure].sort((a, b) => a.x - b.x);
    expect(exposure).toHaveLength(exp.laneCounts.exposure);
    // Consecutive segments meet at a seam (the first's right edge is the
    // second's left edge, within a pixel).
    for (let i = 1; i < exposure.length; i += 1) {
      const previous = exposure[i - 1];
      expect(Math.abs(previous.x + previous.width - exposure[i].x)).toBeLessThanOrEqual(1.5);
    }
    const carets = marks.doseChanges;
    expect(carets).toHaveLength(exp.laneCounts.doseChanges);
    const caret = carets.find((mark) => mark.id === exp.doseChange.id);
    expect(caret).toBeTruthy();
    expect(caret.glyph).toMatch(/^caret-/);
    const expectedGlyph = {
      increase: 'caret-up',
      reduction: 'caret-down',
      interruption: 'caret-pause',
      restart: 'caret-restart'
    }[exp.doseChange.direction];
    expect(caret.glyph).toBe(expectedGlyph);
    // The caret sits at the seam.
    const seam = exposure[1].x;
    expect(Math.abs(caret.x + caret.width / 2 - seam)).toBeLessThanOrEqual(1.5);
    // Direction is a glyph, never a colour: every exposure segment shares one fill.
    const fills = await page.evaluate(() => [
      ...new Set(
        window.__safetyPatientJourneyInstance.laneCharts
          .get('exposure')
          .data.datasets.flatMap((dataset) => dataset.backgroundColor)
      )
    ]);
    expect(fills).toHaveLength(1);
    await captureEvidence(page, 'PJE-LANE-006', 'dose-change');
  });

  test("PJE-LANE-009: the opening participant's journey fits the panel without scrolling (#142)", async ({
    page
  }) => {
    const fit = await page.evaluate(() => {
      const lanes = document.querySelector('.sv-pje-lanes');
      const instance = window.__safetyPatientJourneyInstance;
      return {
        scrollHeight: lanes.scrollHeight,
        clientHeight: lanes.clientHeight,
        stackHeight: instance.stackHeight,
        height: instance.settings.height
      };
    });
    expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight + 1);
    expect(fit.stackHeight).toBeLessThanOrEqual(fit.height);
    await captureEvidence(page, 'PJE-LANE-009', 'one-screen');
  });

  test('PJE-LANE-010: a lane over its row cap draws a deterministic subset and says so (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const cap = 2;
    expect(exp.laneCounts.conMeds).toBeGreaterThan(cap);
    await page.evaluate(
      (n) => window.__safetyPatientJourneyInstance.setSettings({ max_rows_per_lane: n }),
      cap
    );
    const expected = await page.evaluate(
      (n) =>
        window.__safetyPatientJourneyInstance.structured.byLane.conMeds
          .filter((event) => event.placeable !== false)
          .slice(0, n)
          .map((event) => event.id),
      cap
    );
    const marks = await laneMarks(page);
    expect(marks.conMeds.map((mark) => mark.id)).toEqual(expected);
    const remainder = exp.laneCounts.conMeds - cap;
    const sortRule = await page.evaluate(
      () => window.__safetyPatientJourneyInstance.structured.lanes.conMeds.sortRule
    );
    const footers = await page
      .locator('.sv-pje-lane-foot')
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    const footer = footers.find((text) => text.includes(sortRule));
    expect(footer).toBeTruthy();
    expect(footer).toContain(`${remainder} more`);
    // Anchored, the panel reconciles its counts against what was drawn.
    await page.evaluate((id) => window.__safetyPatientJourneyInstance.anchor(id), exp.anchorId);
    await expect(page.locator('.sv-rail')).toContainText(
      /not drawn on the timeline \(\d+ row cap\)/
    );
    const truncated = await page.evaluate(
      () => window.__safetyPatientJourneyInstance.getContext().notEvaluated.truncatedByLane.conMeds
    );
    expect(truncated).toBe(remainder);
  });

  test('PJE-LANE-007: a subject with no adverse events renders the lane with a note (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    await page.locator('.sv-pje-subject-list').selectOption(exp.noAeSubject);
    await page.waitForFunction(
      (id) => window.__safetyPatientJourneyInstance.subject === id,
      exp.noAeSubject
    );
    const lane = page.locator('.sv-pje-lane[data-lane="adverseEvents"]');
    await expect(lane).toBeVisible();
    await expect(lane).toContainText('No adverse events recorded for this participant.');
    expect(await laneKeys(page)).toContain('adverseEvents');
    await captureEvidence(page, 'PJE-LANE-007', 'empty-ae-lane');
  });

  test('PJE-ANCH-001: clicking an adverse event anchors time on it and leaves the day domain unchanged (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const before = await chartScales(page);
    await markButton(page, exp.anchorId).click();
    await page.waitForFunction(
      (id) =>
        window.__safetyPatientJourneyInstance.anchoredEvent &&
        window.__safetyPatientJourneyInstance.anchoredEvent.id === id,
      exp.anchorId
    );
    const anchored = await page.evaluate(() => ({
      id: window.__safetyPatientJourneyInstance.anchoredEvent.id,
      label: window.__safetyPatientJourneyInstance.anchoredEvent.label,
      day: window.__safetyPatientJourneyInstance.anchoredEvent.day
    }));
    expect(anchored).toEqual({ id: exp.anchorId, label: exp.anchorLabel, day: exp.anchorDay });
    await expect(page.locator('.sv-pje-axis-title')).toHaveText('Days from anchor');
    // The anchor reads 0 on the axis strip.
    const ticks = await axisTicks(page);
    expect(ticks.map((tick) => tick.text)).toContain('0');
    // The anchor rule is drawn on every lane.
    const rules = await page.evaluate(() =>
      [...window.__safetyPatientJourneyInstance.laneCharts.values()].map((chart) =>
        (chart.$pjeMarks || []).some((mark) => mark.glyph === 'rule-anchor')
      )
    );
    expect(rules.length).toBeGreaterThan(0);
    expect(rules.every(Boolean)).toBe(true);
    // Anchoring relabels; it never re-ranges the shared domain (PC-18).
    expect(await chartScales(page)).toEqual(before);
    await captureEvidence(page, 'PJE-ANCH-001', 'anchored');
  });

  test('PJE-ANCH-003: in-window marks stay full strength and out-of-window marks de-emphasize (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    await page.evaluate((id) => window.__safetyPatientJourneyInstance.anchor(id), exp.anchorId);
    const context = await page.evaluate(() => {
      const bundle = window.__safetyPatientJourneyInstance.getContext();
      return { window: bundle.window, inWindow: bundle.inWindow.map((event) => event.id) };
    });
    expect(context.window).toEqual(exp.window);
    const inWindow = new Set(context.inWindow);
    const marks = await laneMarks(page);
    const all = Object.values(marks).flat();
    expect(all.length).toBeGreaterThan(inWindow.size);
    for (const mark of all) {
      expect(mark.emphasis).toBe(inWindow.has(mark.id) ? 'full' : 'dim');
    }
    // The band the plugin recorded carries the same bounds as the bundle.
    const bands = await page.evaluate(() =>
      [...window.__safetyPatientJourneyInstance.laneCharts.values()].map(
        (chart) => chart.$pjeWindow
      )
    );
    for (const band of bands) {
      expect(band.elapsedStart).toBe(exp.window.elapsedStart);
      expect(band.elapsedEnd).toBe(exp.window.elapsedEnd);
      expect(band.width).toBeGreaterThan(0);
    }
    // A dim mark keeps its tab stop and its tooltip.
    const dim = all.find((mark) => mark.emphasis === 'dim');
    const button = markButton(page, dim.id);
    await expect(button).toHaveAttribute('tabindex', /^(0|-1)$/);
    await button.focus();
    await expect(page.locator('.sv-pje-tooltip')).toBeVisible();
    await expect(page.locator('.sv-pje-tooltip')).toContainText('days from anchor');
    await captureEvidence(page, 'PJE-ANCH-003', 'context-window');
  });

  test('PJE-PANEL-001: the side panel lists the four context kinds with counts (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    await page.evaluate((id) => window.__safetyPatientJourneyInstance.anchor(id), exp.anchorId);
    const rail = page.locator('.sv-rail');
    await expect(rail).toBeVisible();
    const counts = await page.evaluate(
      () => window.__safetyPatientJourneyInstance.getContext().counts
    );
    expect(counts).toEqual(exp.counts);
    expect(
      await page.evaluate(() => window.__safetyPatientJourneyInstance.getContext().notEvaluated)
    ).toMatchObject(exp.notEvaluated);
    await expect(rail.locator('[data-section="conMeds"] h3')).toHaveText(
      `Con-meds active at the anchor (${exp.counts.conMeds})`
    );
    await expect(rail.locator('[data-section="conMedsLater"] h4')).toHaveText(
      `Started later in the window (${exp.counts.conMedsLater})`
    );
    await expect(rail.locator('[data-section="abnormalLabs"] h3')).toHaveText(
      `Abnormal labs in the window (${exp.counts.abnormalLabs})`
    );
    await expect(rail.locator('[data-section="doseChanges"] h3')).toHaveText(
      `Dose changes in the window (${exp.counts.doseChanges})`
    );
    await expect(rail.locator('[data-section="priorEvents"] h3')).toHaveText(
      `Earlier or same-day adverse events with the same preferred term (${exp.counts.priorEvents})`
    );
    // Each listed record says how far before the anchor it started.
    await expect(rail.locator('[data-section="priorEvents"] .sv-pje-item').first()).toContainText(
      `${exp.anchorDay - exp.priorEvent.day} days before the anchor`
    );
    // The listed records are the fixture's.
    for (const name of exp.conMedsActive)
      await expect(rail.locator('[data-section="conMeds"]')).toContainText(name);
    for (const name of exp.conMedsLater)
      await expect(rail.locator('[data-section="conMedsLater"]')).toContainText(name);
    await expect(rail.locator('[data-section="abnormalLabs"]')).toContainText(exp.abnormalLab.test);
    await expect(rail.locator('[data-section="abnormalLabs"]')).toContainText(
      `${exp.abnormalLab.ulnRatio.toFixed(2)} × ULN`
    );
    await expect(rail.locator('[data-section="doseChanges"]')).toContainText(
      `${exp.doseChange.from} → ${exp.doseChange.to}`
    );
    // The honesty sentences appear exactly when their counter is non-zero.
    const { conMedsWithoutStart, conMedsEndUnrecorded } = exp.notEvaluated;
    const withoutStart = rail.locator('[data-section="conMeds"]').getByText(/no start day/);
    await expect(withoutStart).toHaveCount(conMedsWithoutStart > 0 ? 1 : 0);
    if (conMedsWithoutStart > 0)
      await expect(withoutStart).toContainText(String(conMedsWithoutStart));
    const endUnrecorded = rail
      .locator('[data-section="conMeds"]')
      .getByText(/no recorded end date/);
    await expect(endUnrecorded).toHaveCount(conMedsEndUnrecorded > 0 ? 1 : 0);
    if (conMedsEndUnrecorded > 0) {
      const text = await endUnrecorded.textContent();
      if (exp.counts.conMeds === 1) expect(text).toMatch(/^This con-med/);
      else if (conMedsEndUnrecorded === exp.counts.conMeds)
        expect(text).toContain(`None of these ${exp.counts.conMeds}`);
      else expect(text).toContain(`${conMedsEndUnrecorded} of these ${exp.counts.conMeds}`);
    }
    await expect(rail).toContainText('Co-occurrence is not causation');
    // The explicit empty state, on whichever list the fixture says is empty.
    const empty = exp.emptyStateAnchor;
    await page.evaluate((id) => window.__safetyPatientJourneyInstance.anchor(id), empty.anchorId);
    expect(
      await page.evaluate(() => window.__safetyPatientJourneyInstance.getContext().counts)
    ).toEqual(empty.counts);
    const section = rail.locator(`[data-section="${empty.emptyList}"]`);
    await expect(section.locator('.sv-pje-empty')).toHaveCount(1);
    await expect(section.locator('.sv-pje-item')).toHaveCount(0);
    await captureEvidence(page, 'PJE-PANEL-001', 'context-panel');
  });

  test('PJE-SRC-001: both a mark and a panel item jump to their source row (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const inView = (page, id) =>
      page.evaluate((rowId) => {
        const row = document.getElementById(rowId);
        if (!row) return { exists: false };
        const rect = row.getBoundingClientRect();
        return {
          exists: true,
          focused: document.activeElement === row,
          inView: rect.bottom > 0 && rect.top < window.innerHeight && rect.height > 0
        };
      }, id);
    // Path A: the mark's own gesture.
    const button = markButton(page, exp.anchorId);
    await button.focus();
    await page.keyboard.press('Shift+Enter');
    const anchorRow = `pje-src-${exp.anchorId}`;
    await page.waitForFunction((id) => document.activeElement?.id === id, anchorRow);
    expect(await inView(page, anchorRow)).toEqual({ exists: true, focused: true, inView: true });
    // The drawer shows the raw object as supplied, under its stable id.
    const rawCells = await page
      .locator(`#${anchorRow} td`)
      .evaluateAll((nodes) => nodes.map((node) => node.textContent));
    const raw = await page.evaluate(
      (index) => Object.values(window.PJE_FIXTURE.ae[index]),
      Number(exp.anchorId.split('-')[1])
    );
    expect(rawCells).toEqual(raw);
    // Path B: a panel item.
    await page.evaluate((id) => window.__safetyPatientJourneyInstance.anchor(id), exp.anchorId);
    const item = page.locator('.sv-rail [data-section="priorEvents"] .sv-pje-item').first();
    const target = await item.getAttribute('data-source-anchor');
    expect(target).toBe(`pje-src-${exp.priorEvent.id}`);
    await item.click();
    await page.waitForFunction((id) => document.activeElement?.id === id, target);
    expect(await inView(page, target)).toEqual({ exists: true, focused: true, inView: true });
    await captureEvidence(page, 'PJE-SRC-001', 'source-row');
  });

  test('PJE-DATA-003: unusable rows are counted in the notes and exportable (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    await expect(page.locator('.sv-notes .sv-warning')).toContainText(
      `${exp.droppedCounts.total} unusable record`
    );
    const counts = await page.evaluate(() => window.__safetyPatientJourneyInstance.droppedCounts);
    expect(counts).toMatchObject(exp.droppedCounts);
    for (const reason of exp.droppedReasons) expect(counts.byReason[reason]).toBe(1);
    // The CSV is built on click by the shared helper, which stashes its builder
    // as `__hepCsv` (a hep-prefixed name from src/hep-explorer/dropped.js —
    // shared library code, deliberately reused; do not "fix" to __pjeCsv).
    const csv = await page.evaluate(() =>
      document.querySelector('.sv-notes a.hep-csv-link').__hepCsv()
    );
    expect(csv.startsWith('"__pje_dropReason"')).toBe(true);
    for (const reason of exp.droppedReasons) expect(csv).toContain(reason.replace(/"/g, '""'));
    // The merged-array form (a second, in-page instance) adds the unrecognized
    // domain row to the same accounting.
    const merged = await page.evaluate(() => {
      const instance = SafetyViz.patientJourneyExplorer('#container-merged').init(
        window.PJE_FIXTURE.merged
      );
      const out = {
        total: instance.droppedCounts.total,
        reasons: Object.keys(instance.droppedCounts.byReason)
      };
      instance.destroy();
      return out;
    });
    expect(merged.total).toBe(exp.mergedDroppedCounts.total);
    expect(merged.reasons.sort()).toEqual([...exp.mergedDroppedReasons].sort());
    await captureEvidence(page, 'PJE-DATA-003', 'dropped-rows');
  });

  test('PJE-DATA-005: an absent domain renders an explanatory empty lane and a disabled toggle (#142)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const { ex, ae, lb, cm } = window.PJE_FIXTURE;
      window.__safetyPatientJourneyInstance.setData({ ex, ae, lb, cm });
    });
    for (const lane of ['medicalHistory', 'disposition']) {
      const row = page.locator(`.sv-pje-lane[data-lane="${lane}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText('records were supplied.');
      const toggle = page.locator(`[data-sv-focus="lane-${lane}"]`);
      await expect(toggle).toBeDisabled();
      await expect(toggle).toHaveAttribute('aria-disabled', 'true');
      await expect(toggle.locator('..')).toHaveAttribute('title', /supplied/);
    }
    // The supplied domains still draw.
    expect((await markCountByLane(page)).adverseEvents).toBeGreaterThan(0);
    await expect(page.locator('[data-sv-focus="lane-adverseEvents"]')).toBeEnabled();
  });

  test('PJE-FILT-001: serious only restricts the adverse-event lane and nothing else (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const before = await markCountByLane(page);
    expect(before.adverseEvents).toBe(exp.laneCounts.adverseEvents);
    await page.locator('[data-sv-focus="filter-AESER"]').check();
    await page.waitForFunction(
      (n) =>
        (
          window.__safetyPatientJourneyInstance.laneCharts.get('adverseEvents').$pjeMarks || []
        ).filter((mark) => mark.event).length === n,
      exp.seriousCount
    );
    const after = await markCountByLane(page);
    expect(after.adverseEvents).toBe(exp.seriousCount);
    expect(after.conMeds).toBe(before.conMeds);
    expect(after.labs).toBe(before.labs);
    expect(after.exposure).toBe(before.exposure);
    const ids = (await laneMarks(page)).adverseEvents.map((mark) => mark.id);
    expect(ids).toEqual([exp.seriousId]);
    await captureEvidence(page, 'PJE-FILT-001', 'serious-only');
  });

  test('PJE-FILT-003: the con-med class multiselect filters the lane and keeps UNCODED selectable (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const control = page.locator('.sv-control', {
      has: page.locator('label:text-is("ATC class")')
    });
    const details = control.locator('details.sv-multiselect');
    await details.locator('summary').click();
    const values = await details
      .locator('.sv-ms-option:not(.sv-ms-all) input')
      .evaluateAll((nodes) => nodes.map((node) => node.value));
    expect(values).toEqual(exp.conMedClasses);
    expect(values).toContain('UNCODED');
    const before = await markCountByLane(page);
    // Keep exactly one class: uncheck every other.
    const keep = exp.conMedClasses.find((value) => value !== 'UNCODED');
    for (const value of exp.conMedClasses) {
      if (value === keep) continue;
      await details
        .locator(`.sv-ms-option:not(.sv-ms-all) input[value="${value}"]`)
        .setChecked(false);
    }
    await page.waitForFunction(
      (n) =>
        (window.__safetyPatientJourneyInstance.laneCharts.get('conMeds').$pjeMarks || []).filter(
          (mark) => mark.event
        ).length < n,
      before.conMeds
    );
    const after = await markCountByLane(page);
    expect(after.conMeds).toBeLessThan(before.conMeds);
    expect(after.adverseEvents).toBe(before.adverseEvents);
    const kept = await page.evaluate(() =>
      window.__safetyPatientJourneyInstance.structured.byLane.conMeds.map((event) => event.category)
    );
    expect([...new Set(kept)]).toEqual([keep]);
  });

  test('PJE-TIME-001: switching to calendar date relabels ticks and tooltips (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const before = await chartScales(page);
    const dayTicks = await axisTicks(page);
    for (const tick of dayTicks) expect(tick.text).toMatch(/^-?\d+$/);
    await page.locator('[data-sv-focus="time-mode"]').selectOption('date');
    await page.waitForFunction(
      () => window.__safetyPatientJourneyInstance.getTimeMode() === 'date'
    );
    expect(await page.evaluate(() => window.__safetyPatientJourneyInstance.timeMode)).toBe('date');
    await expect(page.locator('.sv-pje-axis-title')).toHaveText('Calendar date');
    const dateTicks = await axisTicks(page);
    expect(dateTicks).toHaveLength(dayTicks.length);
    for (const tick of dateTicks) expect(tick.text).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // Day 1 labels as the subject's reference date; positions are unchanged.
    const day1 = dayTicks.findIndex((tick) => tick.text === '1');
    expect(dateTicks[day1].text).toBe(exp.refDate[exp.openingSubject]);
    expect(dateTicks.map((tick) => tick.left)).toEqual(dayTicks.map((tick) => tick.left));
    // Tooltips relabel too; the scale stays linear in days (D7).
    await markButton(page, exp.anchorId).focus();
    await expect(page.locator('.sv-pje-tooltip')).toContainText(/\d{4}-\d{2}-\d{2}/);
    expect(await chartScales(page)).toEqual(before);
    await captureEvidence(page, 'PJE-TIME-001', 'date-mode');
  });

  test('PJE-EVT-001: anchoring emits the context bundle on all three channels (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const received = await page.evaluate((id) => {
      const instance = window.__safetyPatientJourneyInstance;
      const dom = [];
      const listener = [];
      // The CustomEvent bubbles from the shell root to the document.
      document.addEventListener('pjeEventAnchored', (event) => dom.push(event.detail));
      instance.on('pjeEventAnchored', (detail) => listener.push(detail));
      window.__pjeCallbacks.anchor.length = 0;
      window.__pjeCallbacks.context.length = 0;
      instance.anchor(id);
      const callback = window.__pjeCallbacks.anchor[0];
      return {
        dom: dom.map((detail) => ({ anchor: detail.anchor.id, counts: detail.context.counts })),
        listener: listener.map((detail) => ({
          anchor: detail.anchor.id,
          counts: detail.context.counts
        })),
        callback: { anchor: callback.event.id, counts: callback.context.counts },
        contextCallback: window.__pjeCallbacks.context.map((context) => context && context.counts),
        sameObject:
          dom[0].context === listener[0].context && listener[0].context === callback.context
      };
    }, exp.anchorId);
    const expected = { anchor: exp.anchorId, counts: exp.counts };
    expect(received.dom).toEqual([expected]);
    expect(received.listener).toEqual([expected]);
    expect(received.callback).toEqual(expected);
    expect(received.contextCallback).toEqual([exp.counts]);
    expect(received.sameObject).toBe(true);
  });

  test('PJE-KEY-001: marks are focusable controls with accessible names and a visible focus ring (#142)', async ({
    page
  }) => {
    // Start at the exposure lane's tab stop and Tab into the adverse-event lane.
    await page.locator('.sv-pje-lane[data-lane="exposure"] .sv-pje-mark[tabindex="0"]').focus();
    for (let i = 0; i < 6; i += 1) {
      const inAe = await page.evaluate(
        () =>
          document.activeElement &&
          document.activeElement.classList.contains('sv-pje-mark') &&
          document.activeElement.closest('.sv-pje-lane').dataset.lane === 'adverseEvents'
      );
      if (inAe) break;
      await page.keyboard.press('Tab');
    }
    const focused = await page.evaluate(() => {
      const el = document.activeElement;
      const style = getComputedStyle(el);
      return {
        isMark: el.classList.contains('sv-pje-mark'),
        lane: el.closest('.sv-pje-lane').dataset.lane,
        tag: el.tagName,
        label: el.getAttribute('aria-label'),
        outlineWidth: style.outlineWidth,
        outlineStyle: style.outlineStyle
      };
    });
    expect(focused.isMark).toBe(true);
    expect(focused.tag).toBe('BUTTON');
    expect(focused.lane).toBe('adverseEvents');
    expect(focused.label).toMatch(/adverse event/);
    expect(focused.label).toMatch(/day \d+/);
    expect(focused.label).toMatch(/Press Enter to anchor/);
    expect(focused.outlineWidth).not.toBe('0px');
    expect(focused.outlineStyle).not.toBe('none');
    // One tab stop per lane.
    const stops = await page.evaluate(() =>
      [...document.querySelectorAll('.sv-pje-lane')].map(
        (lane) => lane.querySelectorAll('.sv-pje-mark[tabindex="0"]').length
      )
    );
    for (const count of stops) expect(count).toBeLessThanOrEqual(1);
    expect(stops.filter((count) => count === 1).length).toBeGreaterThan(1);
    await captureEvidence(page, 'PJE-KEY-001', 'mark-focus');
  });

  test('PJE-KEY-002: Enter anchors the focused mark and Escape clears it (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    await markButton(page, exp.anchorId).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (id) => window.__safetyPatientJourneyInstance.anchoredEvent?.id === id,
      exp.anchorId
    );
    await expect(markButton(page, exp.anchorId)).toHaveAttribute('aria-pressed', 'true');
    // Focus stays on the (recreated) mark; Escape clears the anchor.
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-event-id'))).toBe(
      exp.anchorId
    );
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__safetyPatientJourneyInstance.anchoredEvent === null);
    await expect(page.locator('.sv-rail')).toBeHidden();
    // Re-activating an anchored mark toggles it off.
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (id) => window.__safetyPatientJourneyInstance.anchoredEvent?.id === id,
      exp.anchorId
    );
    await page.keyboard.press('Space');
    await page.waitForFunction(() => window.__safetyPatientJourneyInstance.anchoredEvent === null);
  });

  test('PJE-KEY-003: arrows move within and between lanes and the live region announces (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    const order = await page.evaluate(() =>
      window.__safetyPatientJourneyInstance.structured.byLane.adverseEvents
        .filter((event) => event.placeable !== false)
        .sort((a, b) => a.day - b.day || a.sourceIndex - b.sourceIndex)
        .map((event) => event.id)
    );
    await markButton(page, order[0]).focus();
    const focusedId = () =>
      page.evaluate(() => document.activeElement.getAttribute('data-event-id'));
    const walked = [order[0]];
    for (let i = 1; i < order.length; i += 1) {
      await page.keyboard.press('ArrowRight');
      walked.push(await focusedId());
    }
    expect(walked).toEqual(order);
    // No wrap at the end.
    await page.keyboard.press('ArrowRight');
    expect(await focusedId()).toBe(order[order.length - 1]);
    // Down moves to the nearest mark in the next lane; Up comes back.
    await page.keyboard.press('ArrowDown');
    const below = await page.evaluate(() => ({
      id: document.activeElement.getAttribute('data-event-id'),
      lane: document.activeElement.closest('.sv-pje-lane').dataset.lane
    }));
    expect(below.lane).not.toBe('adverseEvents');
    expect(below.id).not.toBe(order[order.length - 1]);
    await page.keyboard.press('ArrowUp');
    expect(await focusedId()).toBe(order[order.length - 1]);
    await page.keyboard.press('Home');
    expect(await focusedId()).toBe(order[0]);
    // The live region announces the anchor and the counts.
    await markButton(page, exp.anchorId).click();
    const live = page.locator('.sv-pje-live');
    await expect(live).toContainText(`Anchored on ${exp.anchorLabel}, day ${exp.anchorDay}`);
    await expect(live).toContainText(`${exp.counts.conMeds} con-med`);
    await expect(live).toContainText(`${exp.counts.abnormalLabs} abnormal lab`);
    await expect(live).toContainText(`${exp.counts.doseChanges} dose change`);
    await expect(live).toContainText(`${exp.counts.priorEvents} earlier or same-day event`);
  });

  test('PJE-KEY-004: focus is restored after a filter rebuild (#142)', async ({ page }) => {
    const windowDays = page.locator('[data-sv-focus="window-days"]');
    await windowDays.focus();
    await windowDays.fill('10');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const instance = window.__safetyPatientJourneyInstance;
      return instance.settings && document.activeElement;
    });
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-sv-focus'))).toBe(
      'window-days'
    );
    const serious = page.locator('[data-sv-focus="filter-AESER"]');
    await serious.focus();
    await page.keyboard.press('Space');
    await expect(serious).toBeChecked();
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-sv-focus'))).toBe(
      'filter-AESER'
    );
    // A programmatic filter change rebuilds the sidebar; focus lands on the recreated control.
    await page.evaluate(() => window.__safetyPatientJourneyInstance.setFilter('AESER', null));
    expect(await page.evaluate(() => document.activeElement.getAttribute('data-sv-focus'))).toBe(
      'filter-AESER'
    );
    await expect(page.locator('[data-sv-focus="filter-AESER"]')).not.toBeChecked();
  });

  test('PJE-ACC-002: no encoding is colour-alone (#142)', async ({ page }) => {
    const exp = await expectations(page);
    const marks = await laneMarks(page);
    const serious = markButton(page, exp.seriousId);
    await expect(serious).toHaveAttribute('aria-label', /SAE/);
    const hatched = marks.adverseEvents.find((mark) => mark.id === exp.severityNotRecordedId);
    expect(hatched.glyph).toBe('hatch-bar');
    await expect(markButton(page, exp.severityNotRecordedId)).toHaveAttribute(
      'aria-label',
      /severity not recorded/
    );
    // Severity is height at one opaque fill.
    const aeStyle = await page.evaluate(() => {
      const chart = window.__safetyPatientJourneyInstance.laneCharts.get('adverseEvents');
      return {
        heights: [...new Set(chart.data.datasets.map((dataset) => dataset.barThickness))],
        fills: [...new Set(chart.data.datasets.flatMap((dataset) => dataset.backgroundColor))]
      };
    });
    expect(aeStyle.heights.length).toBeGreaterThan(1);
    expect(aeStyle.fills).toHaveLength(1);
    // Lab direction is a glyph; dose direction is a caret.
    const labGlyphs = new Set(
      Object.entries(marks)
        .filter(([key]) => key.startsWith('labs:'))
        .flatMap(([, list]) => list.map((mark) => mark.glyph))
    );
    expect(labGlyphs.size).toBeGreaterThan(1);
    const caret = marks.doseChanges.find((mark) => mark.id === exp.doseChange.id);
    expect(caret.glyph).toMatch(/^caret-/);
  });

  test('PJE-ACC-003: module text meets AA at its rendered size (#142)', async ({ page }) => {
    const exp = await expectations(page);
    await page.evaluate((id) => window.__safetyPatientJourneyInstance.anchor(id), exp.anchorId);
    await page.locator('.sv-pje-drawer summary').click();
    const failures = await page.evaluate(() => {
      const parse = (color) => {
        const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(color);
        if (!match) return null;
        return {
          r: Number(match[1]),
          g: Number(match[2]),
          b: Number(match[3]),
          a: match[4] === undefined ? 1 : Number(match[4])
        };
      };
      const over = (top, under) => ({
        r: top.r * top.a + under.r * (1 - top.a),
        g: top.g * top.a + under.g * (1 - top.a),
        b: top.b * top.a + under.b * (1 - top.a),
        a: 1
      });
      const luminance = ({ r, g, b }) => {
        const channel = (v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };
      const contrast = (a, b) => {
        const la = luminance(a);
        const lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };
      const white = { r: 255, g: 255, b: 255, a: 1 };
      // The nearest opaque background: composite translucent layers upward.
      const backgroundOf = (element) => {
        const layers = [];
        let node = element;
        while (node && node !== document.documentElement) {
          const bg = parse(getComputedStyle(node).backgroundColor);
          if (bg && bg.a > 0) {
            layers.push(bg);
            if (bg.a >= 1) break;
          }
          node = node.parentElement;
        }
        let out = white;
        for (const layer of layers.reverse()) out = over(layer, out);
        return out;
      };
      const results = [];
      const root = document.querySelector('.sv-root.safety-patient-journey');
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      let element = walker.currentNode;
      const colors = new Set();
      while (element) {
        const hasText = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()
        );
        if (hasText && element.getClientRects().length && !element.closest('[hidden]')) {
          const disabled =
            element.matches(':disabled, [aria-disabled="true"]') ||
            element.closest(':disabled, [aria-disabled="true"], .is-disabled');
          const style = getComputedStyle(element);
          const visible = style.visibility !== 'hidden' && style.display !== 'none';
          if (visible && !disabled) {
            const color = parse(style.color);
            colors.add(style.color);
            const background = backgroundOf(element);
            const ratio = contrast(over(color, background), background);
            const size = parseFloat(style.fontSize);
            const bold = Number(style.fontWeight) >= 700;
            const large = size >= 24 || (size >= 18.66 && bold);
            const floor = large ? 3 : 4.5;
            if (ratio < floor) {
              results.push({
                text: element.textContent.trim().slice(0, 40),
                className: element.className,
                color: style.color,
                ratio: Number(ratio.toFixed(2)),
                size
              });
            }
          }
        }
        element = walker.nextNode();
      }
      return { failures: results, colors: [...colors] };
    });
    expect(failures.failures).toEqual([]);
    // The library's muted ink (#7b8b96, 3.51:1) resolves nowhere in the module.
    expect(failures.colors).not.toContain('rgb(123, 139, 150)');
    await captureEvidence(page, 'PJE-ACC-003', 'contrast');
  });
  test('PJE-PANEL-001: at phone width the source drawer never widens the page, no painted labels overlap, and anchoring a mark brings the context panel into view (#142)', async ({
    page
  }) => {
    const exp = await expectations(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    const pageWidth = () => page.evaluate(() => document.documentElement.scrollWidth);
    expect(await pageWidth()).toBeLessThanOrEqual(390);
    // The drawer's wide tables scroll inside it; the column does not grow.
    await page.locator('details.sv-pje-drawer > summary').click();
    expect(await pageWidth()).toBeLessThanOrEqual(390);
    await page.locator('details.sv-pje-drawer > summary').click();
    // No two labels a lane painted (disposition names, ULN / LLN, a count
    // badge) intersect, on any lane.
    const overlaps = await page.evaluate(() =>
      [...window.__safetyPatientJourneyInstance.laneCharts.entries()].flatMap(([key, chart]) => {
        const labels = chart.$pjeLabels || [];
        const out = [];
        for (let i = 0; i < labels.length; i += 1) {
          for (let j = i + 1; j < labels.length; j += 1) {
            const a = labels[i];
            const b = labels[j];
            const apart =
              a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y;
            if (!apart) out.push([key, a.text, b.text]);
          }
        }
        return out;
      })
    );
    expect(overlaps).toEqual([]);
    // Tapping a mark: the panel is stacked below the lanes on this width and
    // is scrolled into view, and the line under the axis says what was found.
    const mark = markButton(page, exp.anchorId);
    await mark.scrollIntoViewIfNeeded();
    await mark.click();
    await page.waitForFunction(
      (id) => window.__safetyPatientJourneyInstance.anchoredEvent?.id === id,
      exp.anchorId
    );
    const rail = await page.evaluate(() => {
      const box = document.querySelector('.sv-rail').getBoundingClientRect();
      return { top: box.top, innerHeight: window.innerHeight };
    });
    expect(rail.top).toBeGreaterThanOrEqual(-1);
    expect(rail.top).toBeLessThan(rail.innerHeight);
    await expect(page.locator('.sv-main-annotation')).toContainText(
      `Anchored on ${exp.anchorLabel}`
    );
    await expect(page.locator('.sv-main-annotation')).toContainText('Show the context panel');
    expect(await pageWidth()).toBeLessThanOrEqual(390);
  });
});
