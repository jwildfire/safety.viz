// The status ladder as the builds read it (#272, obot.roadmap#403): what is
// wrong with the rungs site/config.json names, said in sentences before a page
// is written. The rungs themselves are src/tiers.js.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { TIERS, isBelow, tierNoteOf, tierOf } from '../src/tiers.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Where the charts read their own rung from: written here, never by hand. */
export const CHART_TIERS_FILE = 'src/data/chart-tiers.js';

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const RETIRED = ['experimental', 'prototype'];
const listed = TIERS.map((tier) => `"${tier}"`).join(', ');

/**
 * Every chart and every app tab the site's configuration lists, each with the
 * name a sentence can call it by.
 * @param {Object} config The site's configuration (site/config.json).
 * @returns {Array<{name: string, entry: Object}>} The entries, tabs first.
 */
export function tierEntries(config) {
  return [
    ...(config.appTabs || []).map((entry) => ({ name: `the ${entry.title} tab`, entry })),
    ...(config.renderers || []).map((entry) => ({ name: entry.title, entry }))
  ];
}

/**
 * What is wrong with the rungs a configuration names, one sentence for each.
 *
 * Nothing in safety.viz is qualified, so an entry that says it is stops the
 * build: the word is kept for a chart with a qualification record to point at.
 * The two flags the field replaced are refused as well, so that a rung is
 * stored in one place; and whatever stands below Exploratory and ships in the
 * app has to say why, since its label shows that sentence.
 * @param {Object} config The site's configuration.
 * @returns {string[]} The sentences; empty when nothing is wrong.
 */
export function tierProblems(config) {
  const problems = [];
  for (const { name, entry } of tierEntries(config)) {
    for (const flag of RETIRED) {
      if (has(entry, flag)) {
        problems.push(
          `site/config.json: ${name} still carries the flag "${flag}". ` +
            `A status is stored as one field: "tier": "${flag}".`
        );
      }
    }
    if (has(entry, 'tier') && !TIERS.includes(entry.tier)) {
      problems.push(
        `site/config.json: ${name} says tier ${JSON.stringify(entry.tier)}, which is not a rung. ` +
          `The rungs are ${listed}.`
      );
      continue;
    }
    if (entry.tier === 'qualified') {
      problems.push(
        `site/config.json: ${name} says tier "qualified". Nothing in safety.viz is qualified: ` +
          'no chart and no tab has been through qualification, and there is no record for the word ' +
          'to point at. Say "exploratory", "experimental" or "prototype".'
      );
    }
    if (has(entry, 'tierNote') && !(typeof entry.tierNote === 'string' && entry.tierNote.trim())) {
      problems.push(`site/config.json: ${name} has a tierNote that is not a sentence.`);
    }
    if (entry.tier === 'experimental' && !has(entry, 'tierNote')) {
      problems.push(
        `site/config.json: ${name} is Experimental and gives no reason. ` +
          'Its label shows one sentence saying why: add a "tierNote".'
      );
    }
  }
  return problems;
}

/**
 * Stop a build whose configuration names a rung it may not.
 * @param {Object} config The site's configuration.
 * @returns {void}
 * @throws {Error} With every sentence of tierProblems, when there is one.
 */
export function checkTiers(config) {
  const problems = tierProblems(config);
  if (problems.length) throw new Error(problems.join('\n'));
}

/**
 * The charts that stand below Exploratory, each with its name, its rung and
 * its reason, as the charts themselves read them (#274): a chart drawn with no
 * page around it, as an R widget draws it, says where it stands. Written to
 * src/data/chart-tiers.js, so site/config.json stays the one place a rung is set.
 * @param {Object} config The site's configuration.
 * @returns {Object<string, {tier: string, title: string, note?: string}>} Module name → what its label says.
 */
export function chartsBelow(config) {
  const below = {};
  for (const entry of config.renderers || []) {
    const tier = tierOf(entry);
    if (!isBelow(tier)) continue;
    const note = tierNoteOf(entry);
    below[entry.module] = { tier, title: entry.title, ...(note ? { note } : {}) };
  }
  return below;
}

/**
 * The text of src/data/chart-tiers.js for a configuration: a module, so that
 * the charts' shell reads it the same way in a bundle and in Node, formatted
 * as the repository formats its source.
 * @param {Object} config The site's configuration.
 * @returns {Promise<string>} The file's text.
 */
export async function chartTiersText(config) {
  const file = path.join(rootDir, CHART_TIERS_FILE);
  const source =
    '// Written by scripts/tiers.mjs from site/config.json: the charts that stand\n' +
    '// below Exploratory on the status ladder, as their own label reads them.\n' +
    '// Do not edit: set a rung in site/config.json and run `npm run tiers`.\n' +
    `export default ${JSON.stringify(chartsBelow(config), null, 2)};\n`;
  return prettier.format(source, { ...(await prettier.resolveConfig(file)), filepath: file });
}

// `node scripts/tiers.mjs` writes src/data/chart-tiers.js from site/config.json;
// `--check` says whether the file on disk is the one it would write.
if (import.meta.url === `file://${process.argv[1]}`) {
  const config = JSON.parse(readFileSync(path.join(rootDir, 'site/config.json'), 'utf8'));
  checkTiers(config);
  const file = path.join(rootDir, CHART_TIERS_FILE);
  const text = await chartTiersText(config);
  if (process.argv.includes('--check')) {
    let onDisk = null;
    try {
      onDisk = readFileSync(file, 'utf8');
    } catch {
      onDisk = null;
    }
    if (onDisk !== text) {
      console.error(
        `✗ ${CHART_TIERS_FILE} is not what site/config.json says. Run \`npm run tiers\` and commit the file.`
      );
      process.exit(1);
    }
    console.log(`✓ ${CHART_TIERS_FILE} matches site/config.json.`);
  } else {
    writeFileSync(file, text);
    console.log(
      `Wrote ${CHART_TIERS_FILE}: ${Object.keys(chartsBelow(config)).length} charts below Exploratory.`
    );
  }
}
