import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import manifest from '../../../src/data/portfolio.json';
import { DEFAULT_TIER, TIERS, isBelow, tierNoteOf, tierOf } from '../../../src/tiers.js';
import { checkTiers, tierProblems } from '../../../scripts/tiers.mjs';
import { APP_LIBRARIES, chartTiers, libraryManifest } from '../../../scripts/app-libraries.mjs';
import { renderAppHtml } from '../../../scripts/build-app.mjs';
import { renderDemoAppPage } from '../../../scripts/site-lib.mjs';

// The status ladder (#272, obot.roadmap#403): Qualified, Exploratory,
// Experimental, Prototype. A chart's or a tab's rung is stored once, as `tier`
// in site/config.json, and the app build hands it to the page. These tests
// hold the field, the default, the refused word and the hand-over.

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const config = JSON.parse(readFileSync(path.join(rootDir, 'site/config.json'), 'utf8'));
const copy = (value) => JSON.parse(JSON.stringify(value));
const renderer = (module, from = config) => from.renderers.find((entry) => entry.module === module);

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

describe('the status ladder: the rung an entry stands on', () => {
  it('APP-TIER-001: there are four rungs in order, and an entry that names none is Exploratory (#272)', () => {
    expect(TIERS).toEqual(['qualified', 'exploratory', 'experimental', 'prototype']);
    expect(DEFAULT_TIER).toBe('exploratory');
    expect(tierOf({})).toBe('exploratory');
    expect(tierOf(undefined)).toBe('exploratory');
    expect(tierOf(null)).toBe('exploratory');
    for (const tier of TIERS) expect(tierOf({ tier })).toBe(tier);
    // What is not a rung is no rung.
    expect(tierOf({ tier: 'stable' })).toBe('exploratory');
    expect(tierOf({ experimental: true })).toBe('exploratory');
    // Experimental and Prototype are below the app's rung; the other two are not.
    expect(TIERS.filter((tier) => isBelow(tier))).toEqual(['experimental', 'prototype']);
    expect(isBelow('prototype', 'experimental')).toBe(true);
    expect(isBelow('exploratory', 'qualified')).toBe(true);
    // The reason is a sentence or nothing.
    expect(tierNoteOf({ tierNote: ' Why. ' })).toBe('Why.');
    expect(tierNoteOf({ tierNote: '' })).toBeNull();
    expect(tierNoteOf({})).toBeNull();
    expect(tierNoteOf(null)).toBeNull();
  });

  it('APP-TIER-002: the site’s configuration stores a rung as one field: no entry carries the two flags it replaced, the five Experimental charts and the RBQM tab say why, and the one Prototype is the Patient Journey Explorer (#272)', () => {
    const entries = [...config.appTabs, ...config.renderers];
    for (const entry of entries) {
      expect(entry, entry.module || entry.id).not.toHaveProperty('experimental');
      expect(entry, entry.module || entry.id).not.toHaveProperty('prototype');
    }
    const below = (tier) =>
      entries.filter((entry) => tierOf(entry) === tier).map((entry) => entry.module || entry.id);
    expect(below('experimental').sort()).toEqual(Object.keys(REASONS).sort());
    expect(below('prototype')).toEqual(['patient-journey-explorer']);
    expect(below('qualified')).toEqual([]);
    for (const [id, reason] of Object.entries(REASONS)) {
      const entry = entries.find((candidate) => (candidate.module || candidate.id) === id);
      expect(entry.tierNote, id).toBe(reason);
    }
    // Whether a chart exists yet is a different question, and is kept.
    for (const entry of config.renderers) {
      expect(['available', 'planned'], entry.module).toContain(entry.status);
    }
    expect(tierProblems(config)).toEqual([]);
  });

  it('APP-TIER-003: an entry that says "qualified" stops the build with a sentence naming it, and so do a retired flag, a word that is no rung and an Experimental entry with no reason (#272)', () => {
    const qualified = copy(config);
    renderer('histogram', qualified).tier = 'qualified';
    expect(tierProblems(qualified)).toEqual([
      'site/config.json: Safety Histogram says tier "qualified". Nothing in safety.viz is qualified: ' +
        'no chart and no tab has been through qualification, and there is no record for the word ' +
        'to point at. Say "exploratory", "experimental" or "prototype".'
    ]);
    expect(() => checkTiers(qualified)).toThrow(/Safety Histogram says tier "qualified"/);
    expect(() => chartTiers({ config: qualified })).toThrow(/Nothing in safety\.viz is qualified/);
    // A tab is named as a tab.
    const tab = copy(config);
    tab.appTabs[0].tier = 'qualified';
    expect(tierProblems(tab)[0]).toContain('the RBQM tab says tier "qualified"');

    const flagged = copy(config);
    renderer('histogram', flagged).experimental = true;
    expect(tierProblems(flagged)).toEqual([
      'site/config.json: Safety Histogram still carries the flag "experimental". ' +
        'A status is stored as one field: "tier": "experimental".'
    ]);
    const unknown = copy(config);
    renderer('histogram', unknown).tier = 'stable';
    expect(tierProblems(unknown)).toEqual([
      'site/config.json: Safety Histogram says tier "stable", which is not a rung. ' +
        'The rungs are "qualified", "exploratory", "experimental", "prototype".'
    ]);
    const silent = copy(config);
    delete renderer('qt-explorer', silent).tierNote;
    expect(tierProblems(silent)).toEqual([
      'site/config.json: QT Safety Explorer is Experimental and gives no reason. ' +
        'Its label shows one sentence saying why: add a "tierNote".'
    ]);
    const empty = copy(config);
    renderer('histogram', empty).tierNote = ' ';
    expect(tierProblems(empty)).toEqual([
      'site/config.json: Safety Histogram has a tierNote that is not a sentence.'
    ]);
    // Every problem is said, not the first alone.
    const two = copy(config);
    renderer('histogram', two).tier = 'qualified';
    renderer('ae-explorer', two).prototype = true;
    expect(tierProblems(two)).toHaveLength(2);
    expect(() => checkTiers(config)).not.toThrow();
  });
});

describe('the status ladder: the rung reaches the app', () => {
  const ownModules = Object.keys(manifest.modules);
  const libraryModules = APP_LIBRARIES.flatMap((library) =>
    Object.keys(libraryManifest(library).modules)
  );

  it('APP-TIER-004: the app build gives a rung for each of the eighteen charts and for the RBQM tab: thirteen charts Exploratory, five Experimental with their reasons, and the tab Experimental with its own (#272)', () => {
    const tiers = chartTiers();
    expect(ownModules).toHaveLength(13);
    expect(libraryModules).toHaveLength(5);
    expect(Object.keys(tiers).sort()).toEqual([...ownModules, ...libraryModules, 'rbqm'].sort());
    const on = (tier) => Object.keys(tiers).filter((id) => tiers[id].tier === tier);
    expect(on('exploratory')).toHaveLength(13);
    expect(on('experimental').sort()).toEqual(Object.keys(REASONS).sort());
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
