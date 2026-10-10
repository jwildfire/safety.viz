// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import manifest from '../../../src/data/portfolio.json';
import { mountApp } from '../../../src/app/page.js';
import standIn from '../../e2e/fixtures/stand-in-library.js';

// The page knows where each chart and each view stands on the status ladder
// (#272, obot.roadmap#403): the app build tells it (scripts/app-libraries.mjs::
// chartTiers, held by tiers.test.js), and a chart it is told nothing of stands
// where its own entry says.

const ownModules = Object.keys(manifest.modules);
const REASON =
  'Experimental until an external clinical review confirms its Kaplan–Meier estimates.';

describe('the status ladder: the rung on the page', () => {
  it('APP-TIER-006: the page knows the rung of every chart and every view it lists: what it was told, or what a library’s own entry says, or Exploratory (#272)', () => {
    document.body.innerHTML = '<div id="app"></div>';
    const charts = Object.fromEntries(
      Object.values(manifest.modules).map((entry) => [entry.export, () => ({ init() {} })])
    );
    const view = { id: 'extra', title: 'Extra', tag: () => '', render: () => null };
    const [standInModule] = Object.keys(standIn.manifest.modules);
    const told = {
      'time-to-event': { tier: 'experimental', note: REASON },
      extra: { tier: 'experimental', note: 'A new tab.' },
      // What is not a rung is no rung, and a reason that is no sentence is none.
      histogram: { tier: 'stable', note: 7 }
    };
    const app = mountApp('#app', {
      charts,
      manifest,
      libraries: [standIn, { name: 'views', view }],
      tiers: told
    });
    const tiers = app.tiers();
    expect(Object.keys(tiers).sort()).toEqual(
      [...ownModules, ...Object.keys(standIn.manifest.modules), 'extra'].sort()
    );
    expect(tiers['time-to-event']).toEqual(told['time-to-event']);
    expect(tiers.extra).toEqual({ tier: 'experimental', note: 'A new tab.' });
    expect(tiers.histogram).toEqual({ tier: 'exploratory' });
    expect(tiers['ae-explorer']).toEqual({ tier: 'exploratory' });
    expect(tiers[standInModule]).toEqual({ tier: 'exploratory' });
    app.destroy();

    // A library's chart says its own rung by the same field on its entry.
    const modules = {
      ...standIn.manifest.modules,
      [standInModule]: {
        ...standIn.manifest.modules[standInModule],
        tier: 'experimental',
        tierNote: 'Its axes may still change.'
      }
    };
    const own = mountApp('#app', {
      charts,
      manifest,
      libraries: [{ ...standIn, manifest: { ...standIn.manifest, modules } }]
    });
    expect(own.tiers()[standInModule]).toEqual({
      tier: 'experimental',
      note: 'Its axes may still change.'
    });
    // And the page it was told nothing by treats every other chart as Exploratory.
    expect(own.tiers()['time-to-event']).toEqual({ tier: 'exploratory' });
    own.destroy();
  });
});
