import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { captureEvidence } from './evidence.js';

// Browser evidence for the participant-profile module (#98, obot.roadmap#45).
// This spec file is the module's ONE home for e2e captures — the evidence
// pipeline derives docs/evidence/participant-profile/ from this file name — so
// the hep-explorer ADOPTION tests (PPRF-HEP-*, which drive hep-explorer
// fixtures) live here too, alongside the module's own coverage. Requirement
// IDs use the PPRF-* area scheme from the obot.agent requirement matrix.

// ── hep-explorer adoption, scatter view (PPRF-7) ────────────────────────────
test.describe('participant-profile dock: hep-explorer scatter view', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._profileErrors = errors;
    await page.goto('/tests/e2e/fixtures/hep-explorer.html');
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance && window.__safetyHepExplorerInstance.chart
    );
    await page.waitForSelector('canvas.sv-chart');
  });

  test.afterEach(async ({ page }) => {
    expect(page._profileErrors).toEqual([]);
  });

  test('PPRF-HEP-001/PPRF-CORE-001: scatter click opens the docked profile below the chart — header, spaghetti, and measure table replace the legacy detail panel (#98)', async ({
    page
  }) => {
    // The legacy bespoke drill-down is deleted outright: no .hep-detail node
    // exists anywhere in the DOM, selected or not.
    await expect(page.locator('.hep-detail')).toHaveCount(0);
    await expect(page.locator('.sv-profile')).toBeEmpty();

    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });

    // The docked profile renders in the shell's sv-profile slot: header with
    // the participant id and Clear, the labs-over-time spaghetti, and the
    // measure table with sparklines. Single selection → full profile, no
    // stepper.
    const profile = page.locator('.sv-profile');
    await expect(profile.locator('.sv-profile-id')).toHaveText('Participant SUBJ-001');
    await expect(profile.locator('.sv-profile-clear')).toBeVisible();
    await expect(profile.locator('.sv-profile-spaghetti canvas')).toBeVisible();
    await expect(profile.locator('.sv-profile-measure-table')).toBeVisible();
    await expect(profile.locator('.sv-profile-stepper')).toHaveCount(0);
    await expect(page.locator('.hep-detail')).toHaveCount(0);

    // The dock sits below the chart card and above the shared listing.
    const order = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const children = [...instance.main.children];
      return {
        chartBeforeProfile:
          children.indexOf(instance.chartWrap) < children.indexOf(instance.profileWrap),
        profileBeforeListing:
          children.indexOf(instance.profileWrap) < children.indexOf(instance.listingWrap)
      };
    });
    expect(order.chartBeforeProfile).toBe(true);
    expect(order.profileBeforeListing).toBe(true);

    // The on-chart visit trace is retained alongside the dock (PPRF-7).
    const overlayCount = await page.evaluate(
      () => window.__safetyHepExplorerInstance.chart.data.datasets[1].data.length
    );
    expect(overlayCount).toBe(3);

    // Idempotency: re-dispatching the identical selection must not rebuild
    // the profile DOM (the composite controls re-dispatch on every redraw).
    const stable = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const before = instance.profileWrap.querySelector('.sv-profile-root');
      instance.selection.dispatch(['SUBJ-001']);
      return before === instance.profileWrap.querySelector('.sv-profile-root');
    });
    expect(stable).toBe(true);

    await captureEvidence(page, 'PPRF-HEP-001', 'scatter-dock');
  });

  test('PPRF-HEP-005: background click clears the selection and hides the dock (#98)', async ({
    page
  }) => {
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const index = instance.points.findIndex((point) => point.id === 'SUBJ-001');
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index }]);
    });
    await expect(page.locator('.sv-profile .sv-profile-id')).toBeVisible();

    await page.evaluate(() => {
      window.__safetyHepExplorerInstance.chart.options.onClick({}, []);
    });
    // dispatch([]) empties the slot; the shell's :empty rule collapses it, so
    // the nine non-adopting renderers' layout math applies here too.
    await expect(page.locator('.sv-profile')).toBeEmpty();
    await expect(page.locator('.sv-profile')).toBeHidden();
  });
});

// ── hep-explorer adoption, composite + migration views (PPRF-5/7) ───────────
test.describe('participant-profile dock: hep-explorer composite and migration views', () => {
  test.beforeEach(async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page._profileErrors = errors;
    await page.goto('/tests/e2e/fixtures/hep-explorer-composite.html');
    await page.waitForFunction(
      () =>
        window.__safetyHepExplorerInstance &&
        document.querySelectorAll('.hep-composite-panels canvas').length === 4
    );
  });

  test.afterEach(async ({ page }) => {
    expect(page._profileErrors).toEqual([]);
  });

  test('PPRF-HEP-002/PPRF-STEP-001/PPRF-HDR-002: composite multi-select collapses the dock to a stepper, stepping renders each profile and keeps the chart highlight in sync, Clear hides the dock (#98)', async ({
    page
  }) => {
    const events = [];
    await page.exposeFunction('__profileOnSelect', (ids) => events.push(ids));
    await page.evaluate(() =>
      window.__safetyHepExplorerInstance.root.addEventListener('participantsSelected', (event) =>
        window.__profileOnSelect(event.detail.data.map(String))
      )
    );

    // Click two points in the pretreatment eDISH panel → sticky multi-select.
    const picked = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[0];
      chart.options.onClick({}, [{ index: 0 }], chart);
      chart.options.onClick({}, [{ index: 1 }], chart);
      return instance.compositeSelectedIds.map(String);
    });
    expect(picked).toHaveLength(2);

    // The dock collapses to the worst-first stepper: "1 of 2 · <id>", and the
    // rendered profile is the stepper's current participant.
    const stepper = page.locator('.sv-profile .sv-profile-stepper');
    await expect(stepper).toBeVisible();
    const count = page.locator('.sv-profile .sv-profile-step-count');
    await expect(count).toHaveText(/^1 of 2 · /);
    const firstId = (await count.textContent()).replace('1 of 2 · ', '');
    expect(picked).toContain(firstId);
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText(`Participant ${firstId}`);
    await captureEvidence(page, 'PPRF-STEP-001', 'composite-stepper');

    // Stepping renders the other participant's full profile and reports it
    // through on_step → transient chart emphasis via the view's highlight
    // contract — with no extra selection dispatch (PPRF-5/6).
    const dispatchesBeforeStep = events.length;
    await page.locator('.sv-profile .sv-profile-step-next').click();
    await expect(count).toHaveText(/^2 of 2 · /);
    const secondId = (await count.textContent()).replace('2 of 2 · ', '');
    expect(secondId).not.toBe(firstId);
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText(`Participant ${secondId}`);
    const emphasis = await page.evaluate(() => ({
      hoverId: window.__safetyHepExplorerInstance.state.hoverId,
      compositeHoverId: window.__safetyHepExplorerInstance.compositeHoverId
    }));
    expect(emphasis.hoverId).toBe(secondId);
    expect(emphasis.compositeHoverId).toBe(secondId);
    expect(events.length).toBe(dispatchesBeforeStep);

    // The dock's Clear routes through the host's own clear path: the sticky
    // selection empties, participantsSelected fires with [], the dock hides.
    await page.locator('.sv-profile .sv-profile-clear').click();
    await expect(page.locator('.sv-profile')).toBeEmpty();
    await expect(page.locator('.sv-profile')).toBeHidden();
    await expect.poll(() => events.at(-1)).toEqual([]);
    const cleared = await page.evaluate(() =>
      window.__safetyHepExplorerInstance.compositeSelectedIds.slice()
    );
    expect(cleared).toEqual([]);
  });

  test('PPRF-HEP-003: composite single focus (point click or selector) opens the full profile, not the stepper (#98)', async ({
    page
  }) => {
    // Single point click → full profile.
    const viaClick = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[0];
      chart.options.onClick({}, [{ index: 0 }], chart);
      return String(instance.compositeSelectedIds[0]);
    });
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText(`Participant ${viaClick}`);
    await expect(page.locator('.sv-profile .sv-profile-stepper')).toHaveCount(0);

    // Narrowing through the shared Participants selector to ONE participant is
    // the same single-focus path.
    const viaSelector = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const select = instance.compositeSelectEl;
      const target = [...select.options].at(-1).value;
      [...select.options].forEach((o) => (o.selected = o.value === target));
      select.dispatchEvent(new Event('change'));
      return target;
    });
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText(
      `Participant ${viaSelector}`
    );
    await expect(page.locator('.sv-profile .sv-profile-stepper')).toHaveCount(0);
  });

  test('PPRF-ACC-001: the stepper, controls and spaghetti canvas are keyboard-operable across re-renders — repeated arrow presses step with no re-tabbing (#98)', async ({
    page
  }) => {
    // Multi-select two composite points → the stepper appears.
    await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      const chart = instance.compositeCharts[0];
      chart.options.onClick({}, [{ index: 0 }], chart);
      chart.options.onClick({}, [{ index: 1 }], chart);
    });
    const count = page.locator('.sv-profile .sv-profile-step-count');
    await expect(count).toHaveText(/^1 of 2 · /);

    // Focus the stepper strip and step by keyboard TWICE in a row: the block
    // re-renders on every step, so this only works when focus is restored onto
    // the recreated strip (the PPRF-8 promise a keyboard user relies on).
    await page.locator('.sv-profile .sv-profile-stepper').focus();
    await page.keyboard.press('ArrowRight');
    await expect(count).toHaveText(/^2 of 2 · /);
    await expect(page.locator('.sv-profile .sv-profile-stepper')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(count).toHaveText(/^1 of 2 · /);
    await expect(page.locator('.sv-profile .sv-profile-stepper')).toBeFocused();

    // Activating ▶ by keyboard keeps keyboard control inside the stepper even
    // when the recreated button comes back disabled at the cohort end.
    await page.locator('.sv-profile .sv-profile-step-next').focus();
    await page.keyboard.press('Enter');
    await expect(count).toHaveText(/^2 of 2 · /);
    await expect(page.locator('.sv-profile .sv-profile-stepper')).toBeFocused();

    // The Standardization select survives the display re-render with focus.
    const display = page.locator('.sv-profile .sv-profile-display');
    await display.focus();
    await display.selectOption('relative_baseline');
    await expect(page.locator('.sv-profile .sv-profile-display')).toBeFocused();
    await expect(page.locator('.sv-profile .sv-profile-display')).toHaveValue('relative_baseline');

    // Labeled regions and canvas text alternatives (PPRF-8), and ONE
    // persistent polite live region announcing the current participant.
    await expect(page.locator('.sv-profile .sv-profile-root')).toHaveAttribute('role', 'region');
    const canvas = page.locator('.sv-profile .sv-profile-spaghetti-canvas');
    await expect(canvas).toHaveAttribute('role', 'img');
    await expect(canvas).toHaveAttribute('aria-label', /Labs over time/);
    await expect(page.locator('.sv-profile .sv-profile-live')).toHaveAttribute(
      'aria-live',
      'polite'
    );
    await expect(page.locator('.sv-profile .sv-profile-live')).toHaveCount(1);

    // The spaghetti canvas is focusable: focusing it shows the reference cut
    // lines (the keyboard half of PPRF-3's hover/focus cut affordance).
    await canvas.focus();
    await expect(canvas).toBeFocused();
    const showsCuts = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      return instance.profile.spaghettiChart.$svShowCuts === true;
    });
    expect(showsCuts).toBe(true);

    await captureEvidence(page, 'PPRF-ACC-001', 'keyboard-stepper');
  });

  test('PPRF-HEP-004: the migration ribbon hand-off arrives in the composite view with the dock opened on the carried cohort (#98)', async ({
    page
  }) => {
    // The §1.5 acceptance demo: NO code path in migration.js, composite.js, or
    // selection.js was edited for the dock — the carried ids flow through the
    // existing choke point and the dock simply hears the dispatch.
    await page.locator('.sv-view-option', { hasText: 'Migration' }).click();
    await page.waitForFunction(() => window.__safetyHepExplorerInstance.root.$hepSankey);

    // Selecting a flow opens the dock on the flow's cohort already in the
    // migration view (every dispatch feeds it) …
    await page
      .locator('.hep-ribbon[data-side="active"][data-pre="Normal & NN"][data-post="Hy\'s Law"]')
      .click();
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText('Participant CS-01');

    // … and the "Review these N in the composite plot" hand-off lands in the
    // composite view with the dock still open on exactly that cohort.
    await page.locator('.sv-footnote .hep-step-btn').click();
    await page.waitForFunction(
      () => window.__safetyHepExplorerInstance.compositeCharts.length === 6
    );
    const landed = await page.evaluate(() => ({
      view: window.__safetyHepExplorerInstance.state.view,
      selected: window.__safetyHepExplorerInstance.compositeSelectedIds.map(String)
    }));
    expect(landed.view).toBe('composite');
    expect(landed.selected).toEqual(['CS-01']);
    await expect(page.locator('.sv-profile .sv-profile-id')).toHaveText('Participant CS-01');
    // A one-participant cohort is a full profile, not a stepper.
    await expect(page.locator('.sv-profile .sv-profile-stepper')).toHaveCount(0);
    await captureEvidence(page, 'PPRF-HEP-004', 'migration-handoff-dock');
  });
});

// ── standalone linked-charts demo (PPRF-6) ──────────────────────────────────
// The library's first linked-charts demo page: hep-explorer with its built-in
// dock off, and the standalone module mounted beside it, connected only by the
// public participantsSelected event. Runs against the BUILT demo page, so the
// wiring proven here is exactly what the docs site ships.
test.describe('participant-profile standalone: built linked-charts demo page', () => {
  test.beforeAll(() => {
    execSync('npm run site', { stdio: 'inherit', cwd: new URL('../..', import.meta.url) });
  });

  test('PPRF-EVT-001/PPRF-CORE-002: the standalone demo wires the profile to a chart via participantsSelected — chart click renders the neighbouring profile, background click clears it (#98)', async ({
    page
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/_site/participant-profile/index.html');
    await page.waitForFunction(
      () =>
        window.__safetyHepExplorerInstance &&
        window.__safetyHepExplorerInstance.chart &&
        window.__safetyParticipantProfileInstance
    );

    // Two independent mounts: the chart's own dock is off (profile: false), and
    // the standalone module idles until a selection arrives on the chart root.
    await expect(page.locator('#linked-chart .sv-profile')).toBeEmpty();
    const profile = page.locator('#linked-profile');
    await expect(profile.locator('.sv-notes')).toContainText('Waiting for selection');

    // Click a scatter point → the chart dispatches participantsSelected on its
    // root → the neighbouring profile renders that participant from its OWN
    // ingest of the same CSV.
    const id = await page.evaluate(() => {
      const instance = window.__safetyHepExplorerInstance;
      instance.chart.options.onClick({}, [{ datasetIndex: 0, index: 0 }]);
      return String(instance.points[0].id);
    });
    await expect(profile.locator('.sv-profile-id')).toHaveText(`Participant ${id}`);
    await expect(profile.locator('.sv-profile-spaghetti canvas')).toBeVisible();
    await expect(profile.locator('.sv-profile-measure-table')).toBeVisible();
    await captureEvidence(page, 'PPRF-EVT-001', 'linked-charts-demo');

    // Background click clears the chart's selection → dispatch([]) → the
    // standalone profile returns to its idle note (PPRF-6).
    await page.evaluate(() => {
      window.__safetyHepExplorerInstance.chart.options.onClick({}, []);
    });
    await expect(profile.locator('.sv-profile-id')).toHaveCount(0);
    await expect(profile.locator('.sv-notes')).toContainText('Waiting for selection');

    expect(errors).toEqual([]);
  });

  test('PPRF-GATE-001: the built site ships the full done-gate — gallery card, live demo, guide, API reference and evidence page (#98)', async ({
    page
  }) => {
    // Gallery card for the module, linking into its section.
    await page.goto('/_site/index.html');
    const card = page.locator('.card', { hasText: 'Participant Profile' });
    await expect(card.first()).toBeVisible();

    // Guide, API reference, and evidence pages are all built and titled.
    await page.goto('/_site/participant-profile/guide.html');
    await expect(page.locator('body')).toContainText('Participant Profile');
    await page.goto('/_site/participant-profile/api.html');
    await expect(page.locator('body')).toContainText('participantProfile');
    await page.goto('/_site/participant-profile/evidence.html');
    await expect(page.locator('body')).toContainText('Participant Profile');

    // The live demo page mounts (asserted in depth by the linked-charts test
    // above); here it must at least load without a 404.
    const response = await page.goto('/_site/participant-profile/index.html');
    expect(response.ok()).toBe(true);
    await captureEvidence(page, 'PPRF-GATE-001', 'done-gate-demo');
  });
});
