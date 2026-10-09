// The status ladder as the builds read it (#272, obot.roadmap#403): what is
// wrong with the rungs site/config.json names, said in sentences before a page
// is written. The rungs themselves are src/tiers.js.
import { TIERS } from '../src/tiers.js';

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
