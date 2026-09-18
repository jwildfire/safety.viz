import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { CANONICAL } from './evidence.js';

// Docs-site smoke (#7): every available renderer's built demo page must mount
// from the committed dist/ bundle with no console errors, served straight out
// of _site/ — proving the emitted relative URLs work at any mount path. The
// build runs here so every context that runs the browser suite (CI, the
// evidence-update workflow, local runs) exercises the current tree.
//
// The shared-shell assertions are the layout contract (#17): a renderer is
// not "available" unless its demo renders the shared control sidebar chrome
// from src/shell.js.

const config = JSON.parse(readFileSync(new URL('../../site/config.json', import.meta.url), 'utf8'));
const available = config.renderers.filter((renderer) => renderer.status === 'available');

test.describe('docs site', () => {
  test.beforeAll(() => {
    execSync('npm run site', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('gallery shows one card per available renderer (#7)', async ({ page }) => {
    await page.goto('/_site/index.html');
    await expect(page.locator('.card.status-available')).toHaveCount(available.length);
  });

  for (const renderer of available) {
    test(`built ${renderer.module} demo mounts the shared shell with no console errors (#7) (#17)`, async ({
      page
    }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });

      await page.goto(`/_site/${renderer.module}/index.html`);
      // .first(): a linked-charts demo (participant-profile, #98) mounts two
      // shells on one page — the host chart's sidebar is the first.
      await expect(page.locator('#container .sv-sidebar .sv-controls').first()).toBeVisible();
      // Any visible chart canvas counts: the histogram opens on the
      // all-measures overview (#39), which hides the main-chart canvas in
      // favor of the per-measure panels. Table-first renderers (ae-explorer,
      // #60) satisfy the contract with a visible table in the main column
      // instead of a canvas.
      await expect(
        page
          .locator('#container .sv-main canvas:visible, #container .sv-main table:visible')
          .first()
      ).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  // Gallery nav dropdown (#71): the top-nav "Gallery" item still navigates to
  // the gallery index, and its disclosure button reveals one link per available
  // renderer straight to that chart's demo. The list is data-driven, so its
  // count tracks the config; interaction is hover + click + full keyboard.
  test.describe('gallery nav dropdown (#71)', () => {
    test('lists one chart link per available renderer, closed by default (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      const menu = page.locator('.nav-group .nav-menu');
      await expect(menu.locator('a')).toHaveCount(available.length);
      await expect(menu).toBeHidden();
      await expect(page.locator('.nav-disclosure')).toHaveAttribute('aria-expanded', 'false');
    });

    test('opens on hover and the top link still points at the gallery index (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      await page.locator('.nav-group').hover();
      await expect(page.locator('.nav-group .nav-menu')).toBeVisible();
      await expect(page.locator('.nav-group > a').first()).toHaveAttribute('href', 'index.html');
    });

    test('is keyboard operable: ArrowDown opens and focuses, Escape closes (#71)', async ({
      page
    }) => {
      await page.goto('/_site/index.html');
      const button = page.locator('.nav-disclosure');
      const menu = page.locator('.nav-group .nav-menu');
      await button.focus();
      await page.keyboard.press('ArrowDown');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(menu).toBeVisible();
      // Focus lands on the first chart link, then arrows move down the list.
      await expect(menu.locator('a').first()).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await expect(menu.locator('a').nth(1)).toBeFocused();
      // Escape closes and returns focus to the disclosure button.
      await page.keyboard.press('Escape');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(menu).toBeHidden();
      await expect(button).toBeFocused();
    });

    test('a chart link navigates straight to that renderer demo (#71)', async ({ page }) => {
      await page.goto('/_site/index.html');
      await page.locator('.nav-group').hover();
      await page.locator('.nav-menu a', { hasText: 'Safety Shift Plot' }).click();
      await expect(page).toHaveURL(/\/_site\/shift-plot\/index\.html$/);
      await expect(page.locator('#container .sv-sidebar .sv-controls')).toBeVisible();
    });

    test('marks the current chart inside the dropdown on a renderer sub-page (#71)', async ({
      page
    }) => {
      await page.goto('/_site/histogram/index.html');
      const current = page.locator('.nav-menu a.current');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText('Safety Histogram');
    });
  });

  // Patient Journey Explorer against the real demo data (#142, PJE-DEMO-003):
  // the module's own spec runs against a hand-computed fixture and reads
  // every expected number from it, so nothing there proves the Definition of
  // Done sentence — that the seeded CDISC Pilot 01 participant's day-30
  // anchor lists the con-meds, abnormal labs and dose changes documented in
  // docs/guides/patient-journey-explorer.md. This block runs against the
  // built demo page (after this file's `npm run site`), and the counts below
  // are the pilot numbers verified against the source extracts by the demo
  // data build (docs/DATA_SOURCES.md, "Patient Journey Explorer extracts").
  test.describe('patient journey explorer demo (#142)', () => {
    const SUBJECT = '01-716-1447';
    const ANCHOR = { label: 'ERYTHEMA', day: 30 };
    const COUNTS = { conMeds: 7, conMedsLater: 2, abnormalLabs: 1, doseChanges: 1, priorEvents: 0 };

    test("PJE-DEMO-003: the seeded CDISC Pilot 01 participant's day-30 anchor produces the documented context (#142)", async ({
      page
    }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.goto('/_site/patient-journey-explorer/index.html');
      await page.waitForFunction(() => window.__safetyPatientJourneyInstance?.laneCharts?.size);
      expect(await page.evaluate(() => window.__safetyPatientJourneyInstance.subject)).toBe(
        SUBJECT
      );

      // The anchor is found by what it is, not by a row index that would move
      // if the extract were rebuilt.
      const anchorId = await page.evaluate(
        ({ label, day }) =>
          window.__safetyPatientJourneyInstance.structured.byLane.adverseEvents.find(
            (event) => event.label === label && event.day === day
          )?.id,
        ANCHOR
      );
      expect(anchorId).toBeTruthy();
      await page.locator(`.sv-pje-mark[data-event-id="${anchorId}"]`).click();
      await page.waitForFunction(
        (id) => window.__safetyPatientJourneyInstance.anchoredEvent?.id === id,
        anchorId
      );

      const context = await page.evaluate(() => {
        const bundle = window.__safetyPatientJourneyInstance.getContext();
        return {
          anchor: { label: bundle.anchor.label, day: bundle.anchor.day },
          counts: bundle.counts,
          notEvaluated: bundle.notEvaluated,
          conMeds: bundle.conMeds.map((event) => event.label)
        };
      });
      expect(context.anchor).toEqual(ANCHOR);
      expect(context.counts).toMatchObject(COUNTS);
      expect(context.notEvaluated.conMedsEndUnrecorded).toBe(COUNTS.conMeds);
      expect(context.conMeds).toEqual(
        expect.arrayContaining([
          'MAALOX',
          'GELATIN',
          'ALEVE',
          'CALCIUM',
          'B COMPLEX',
          'MULTIVITAMIN',
          'VITAMIN E'
        ])
      );

      // The panel prints what the bundle holds: the marginal AST flag with
      // its ratio beside it (1.06 × ULN, so a flag cannot read as a signal),
      // the dose step, and the end-not-recorded sentence for all seven.
      const rail = page.locator('.sv-rail');
      await expect(rail.locator('[data-section="conMeds"] h3')).toHaveText(
        `Con-meds active at the anchor (${COUNTS.conMeds})`
      );
      await expect(rail.locator('[data-section="conMeds"]')).toContainText(
        `None of these ${COUNTS.conMeds} has a recorded end date`
      );
      await expect(rail.locator('[data-section="conMedsLater"] h4')).toHaveText(
        `Started later in the window (${COUNTS.conMedsLater})`
      );
      await expect(rail.locator('[data-section="abnormalLabs"]')).toContainText(
        'Aspartate Aminotransferase'
      );
      await expect(rail.locator('[data-section="abnormalLabs"]')).toContainText('1.06 × ULN');
      await expect(rail.locator('[data-section="doseChanges"]')).toContainText('54 → 81');
      await expect(rail.locator('[data-section="priorEvents"] h3')).toHaveText(
        `Earlier or same-day adverse events with the same preferred term (${COUNTS.priorEvents})`
      );
      await expect(rail.locator('[data-section="priorEvents"] .sv-pje-empty')).toHaveCount(1);

      // A con-med row jumps to its source record in the drawer.
      const item = rail.locator('[data-section="conMeds"] .sv-pje-item').first();
      const target = await item.getAttribute('data-source-anchor');
      expect(target).toMatch(/^pje-src-CM-\d+$/);
      await item.click();
      await page.waitForFunction((id) => document.activeElement?.id === id, target);
      await expect(page.locator(`#${target}`)).toBeFocused();

      // Evidence lands in the module's set, not this shared spec's: the
      // record routes to patient-journey-explorer by its PJE- id and the
      // screenshot attaches by the same prefix (scripts/evidence-lib.mjs).
      const name = 'PJE-DEMO-003-pilot-anchor.png';
      if (CANONICAL) {
        await expect(page).toHaveScreenshot(['patient-journey-explorer', name]);
      } else {
        await page.screenshot({
          path: `test-results/evidence-preview/patient-journey-explorer/${name}`
        });
      }
      expect(errors).toEqual([]);
    });

    test("PJE-KEY-001: the seeded participant's eight same-day history records share one mark whose pointer target names the others, and the journey fits the default height (#142)", async ({
      page
    }) => {
      await page.goto('/_site/patient-journey-explorer/index.html');
      await page.waitForFunction(() => window.__safetyPatientJourneyInstance?.laneCharts?.size);
      // The pointer lands on the same (first, chronological) record the
      // keyboard tab stop starts on, and that button enumerates the rest.
      await page
        .locator('.sv-pje-lane[data-lane="medicalHistory"] .sv-pje-mark')
        .first()
        .scrollIntoViewIfNeeded();
      const stacked = await page.evaluate(() => {
        const buttons = [
          ...document.querySelectorAll('.sv-pje-lane[data-lane="medicalHistory"] .sv-pje-mark')
        ];
        const boxes = buttons.map((b) => b.getBoundingClientRect());
        const hits = boxes.map((box) => {
          const el = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          return el && el.closest('.sv-pje-mark') ? el.closest('.sv-pje-mark') : null;
        });
        const winner = hits[0];
        return {
          count: buttons.length,
          allSame: hits.every((hit) => hit === winner),
          winnerIsTabStop: winner ? winner.getAttribute('tabindex') === '0' : false,
          winnerLabel: winner ? winner.getAttribute('aria-label') : '',
          winnerCount: winner ? Number(winner.dataset.sameDayCount) : 0,
          badge: [
            ...window.__safetyPatientJourneyInstance.laneCharts.get('medicalHistory').$pjeLabels
          ].map((label) => label.text)
        };
      });
      expect(stacked.count).toBe(8);
      expect(stacked.allSame).toBe(true);
      expect(stacked.winnerIsTabStop).toBe(true);
      expect(stacked.winnerCount).toBe(7);
      expect(stacked.winnerLabel).toContain('7 more records at this mark');
      expect(stacked.badge).toContain('×8');
      // The Definition-of-Done participant fits the DEFAULT height (D21/D32):
      // the demo passes none.
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
      expect(fit.height).toBe(760);
      expect(fit.scrollHeight).toBeLessThanOrEqual(fit.clientHeight + 1);
      expect(fit.stackHeight).toBeLessThanOrEqual(fit.height);
    });
  });
});
