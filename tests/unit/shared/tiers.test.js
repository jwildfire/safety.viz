import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TIER, TIERS, isBelow, tierNoteOf, tierOf } from '../../../src/tiers.js';
import { checkTiers, tierProblems } from '../../../scripts/tiers.mjs';
import { chartTiers } from '../../../scripts/app-libraries.mjs';

// The status ladder (#272, obot.roadmap#403): Qualified, Exploratory,
// Experimental, Prototype. A chart's or a tab's rung is stored once, as `tier`
// in site/config.json. These tests hold the field, the default and the refused
// word. They moved here from tests/unit/app/ (#436) with their names unchanged;
// the tests of the rung reaching the app stay there.

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

  it('APP-TIER-003: an entry that says "qualified" stops the build with a sentence naming it, in the site’s configuration or in a library’s own list, and so do a retired flag, a word that is no rung and an Experimental entry with no reason (#272, #309)', () => {
    const qualified = copy(config);
    renderer('histogram', qualified).tier = 'qualified';
    expect(tierProblems(qualified)).toEqual([
      'site/config.json: Safety Histogram says tier "qualified". Nothing in safety.viz is qualified: ' +
        'no chart and no tab has been through qualification, and there is no record for the word ' +
        'to point at. Say "exploratory", "experimental" or "prototype".'
    ]);
    expect(() => checkTiers(qualified)).toThrow(/Safety Histogram says tier "qualified"/);
    expect(() => chartTiers({ config: qualified })).toThrow(/Nothing in safety\.viz is qualified/);
    // A further library's own entry is refused the word as well (#309).
    const script = path.join(mkdtempSync(path.join(os.tmpdir(), 'sv-tiers-')), 'claims.js');
    writeFileSync(
      script,
      'var Claims = { portfolio: { modules: { sure: { tier: "qualified" } } } };'
    );
    expect(() =>
      chartTiers({
        libraries: [{ name: 'claims', global: 'Claims', path: path.relative(rootDir, script) }]
      })
    ).toThrow('claims: sure says tier "qualified". Nothing in safety.viz is qualified');
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
