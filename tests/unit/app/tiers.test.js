import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { APP_LIBRARIES, chartTiers, libraryManifest } from '../../../scripts/app-libraries.mjs';
import { renderAppHtml } from '../../../scripts/build-app.mjs';
import { renderDemoAppPage } from '../../../scripts/site-lib.mjs';

// The status ladder reaches the app (#272, obot.roadmap#403): the app build
// hands every rung to the page. The tests of the field, the default and the
// refused word are in tests/unit/shared/tiers.test.js (#436).

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// The sentences of the approved design's table, one for each thing below
// Exploratory that ships in the app.
const REASONS = {
  'time-to-event':
    'Experimental until an external clinical review confirms its Kaplan–Meier estimates.',
  'hep-waterfall':
    'Experimental: a new chart, drawn from a 2025 paper; its layout and settings may still change.',
  'nep-explorer': 'Experimental until its kidney-injury staging has had a clinical review.',
  'participant-profile':
    'Experimental: what it lists for a participant, and how, may still change.',
  'qt-explorer': 'Experimental: its settings and its table may still change.',
  rbqm: 'Experimental: new in 1.10. R runs in the browser, and what the tab shows may still change.'
};

describe('the status ladder: the rung reaches the app', () => {
  const ownModules = Object.keys(manifest.modules);
  const libraryModules = APP_LIBRARIES.flatMap((library) =>
    Object.keys(libraryManifest(library).modules)
  );

  it('APP-TIER-004: the app build gives a rung for each of the eighteen charts and for the RBQM tab: thirteen charts Exploratory, five Experimental with their reasons, and the tab Experimental with its own (#272)', () => {
    const tiers = chartTiers();
    expect(ownModules).toHaveLength(13);
    expect(libraryModules).toHaveLength(5);
    // Since #427 two parts of the app that are neither a chart nor a tab have a
    // rung too: Build a study and the view of a simulated study (APP-TIER-030).
    const parts = ['build', 'simulated-study'];
    expect(Object.keys(tiers).sort()).toEqual(
      [...ownModules, ...libraryModules, 'rbqm', ...parts].sort()
    );
    const on = (tier) => Object.keys(tiers).filter((id) => tiers[id].tier === tier);
    expect(on('exploratory')).toHaveLength(13);
    expect(on('experimental').sort()).toEqual([...Object.keys(REASONS), ...parts].sort());
    expect(on('prototype')).toEqual([]);
    expect(on('qualified')).toEqual([]);
    for (const [id, note] of Object.entries(REASONS)) {
      expect(tiers[id], id).toEqual({ tier: 'experimental', note });
    }
    // An Exploratory chart has no reason to give.
    expect(tiers.histogram).toEqual({ tier: 'exploratory' });
    // A chart of another library is Exploratory unless its own list says otherwise.
    for (const module of libraryModules) expect(tiers[module]).toEqual({ tier: 'exploratory' });
    const script = path.join(mkdtempSync(path.join(os.tmpdir(), 'sv-tiers-')), 'other.js');
    writeFileSync(
      script,
      'var Other = { portfolio: { modules: { moving: { tier: "experimental", tierNote: "Still moving." }, settled: {} } } };'
    );
    const said = chartTiers({
      libraries: [{ name: 'other', global: 'Other', path: path.relative(rootDir, script) }]
    });
    expect(said.moving).toEqual({ tier: 'experimental', note: 'Still moving.' });
    expect(said.settled).toEqual({ tier: 'exploratory' });
  });

  it('APP-TIER-005: the single file and the hosted page hand the app every rung, and a page built with none says nothing of them (#272)', () => {
    const tiers = chartTiers();
    const file = renderAppHtml({ script: 'var SafetyVizApp = {};', tiers });
    expect(file).toContain(`tiers: ${JSON.stringify(tiers).replace(/</g, '\\u003c')}`);
    expect(renderAppHtml({ script: 'var SafetyVizApp = {};' })).not.toContain('tiers:');
    const page = { bundle: 'app.js', download: 'app.html', repoUrl: 'https://example.org/repo' };
    const hosted = renderDemoAppPage({ ...page, tiers });
    expect(hosted).toContain(`\n  tiers: ${JSON.stringify(tiers)},`);
    expect(hosted).toContain('"time-to-event":{"tier":"experimental","note":"Experimental until');
    expect(renderDemoAppPage(page)).not.toContain('tiers:');
  });
});
