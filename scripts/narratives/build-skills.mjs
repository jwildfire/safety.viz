// Compiles skills/patient-journey-narratives/ into one importable module
// (#146): the browser bundle, Vitest and the Node eval harness all read
// src/patientJourneyNarratives/skills.generated.js, never the folder. Run by
// `npm run build` (scripts/build.mjs imports buildSkillsModule) and by
// `npm run narratives:skills`; skills.test.js asserts the committed module
// matches a fresh compile, and the dist-drift guard catches a stale one.
//
// Front matter is a deliberate YAML subset — `key: value` scalars and
// `- item` lists — so no YAML dependency is added to the library.

import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const skillsDir = path.join(rootDir, 'skills', 'patient-journey-narratives');
export const outFile = path.join(rootDir, 'src', 'patientJourneyNarratives', 'skills.generated.js');

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Parse the front-matter subset: scalars and one-level lists.
 * @private
 */
export function parseFrontMatter(text) {
  const match = FRONT.exec(text);
  if (!match) throw new Error('prompt.md has no front matter');
  const data = {};
  let listKey = null;
  for (const raw of match[1].split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      data[listKey].push(item[1].trim());
      continue;
    }
    const pair = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!pair) throw new Error(`front matter: cannot parse "${raw}"`);
    const [, key, value] = pair;
    if (value === '') {
      data[key] = [];
      listKey = key;
    } else {
      data[key] = value.trim();
      listKey = null;
    }
  }
  return { data, body: text.slice(match[0].length).trim() };
}

/**
 * The forbidden-phrase block of the style guide: one regex source per line.
 * @private
 */
export function forbiddenPatterns(styleGuide) {
  const block = /```forbidden\r?\n([\s\S]*?)```/.exec(styleGuide);
  if (!block) throw new Error('style-guide.md has no ```forbidden block');
  return block[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

/**
 * Read the folder into the plain object the generated module exports.
 * @returns {{shared: Object, skills: Object}} The compiled catalog.
 */
export function compileSkills(dir = skillsDir) {
  const read = (...parts) => readFileSync(path.join(dir, ...parts), 'utf8');
  const styleGuide = read('shared', 'style-guide.md');
  const shared = {
    systemPrompt: read('shared', 'system-prompt.md').trim(),
    styleGuide,
    refusalCatalog: read('shared', 'refusal-catalog.md'),
    forbiddenPatterns: forbiddenPatterns(styleGuide)
  };
  for (const source of shared.forbiddenPatterns) new RegExp(source, 'i');
  const skills = {};
  const entries = readdirSync(dir).filter(
    (name) => name !== 'shared' && statSync(path.join(dir, name)).isDirectory()
  );
  for (const slug of entries.sort()) {
    const promptFile = path.join(dir, slug, 'prompt.md');
    if (!existsSync(promptFile)) continue;
    const { data, body } = parseFrontMatter(readFileSync(promptFile, 'utf8'));
    if (data.skill !== slug) throw new Error(`${slug}/prompt.md: skill "${data.skill}" ≠ folder`);
    if (!/^\d+\.\d+\.\d+$/.test(data.version || '')) {
      throw new Error(`${slug}/prompt.md: version must be semver`);
    }
    const schema = JSON.parse(read(slug, 'schema.json'));
    for (const key of ['Input', 'Draft', 'Output']) {
      if (!schema.definitions?.[key]) throw new Error(`${slug}/schema.json: no definitions.${key}`);
    }
    const examplesFile = path.join(dir, slug, 'examples.jsonl');
    const examples = existsSync(examplesFile)
      ? readFileSync(examplesFile, 'utf8')
          .split(/\r?\n/)
          .filter((line) => line.trim())
          .map((line) => JSON.parse(line))
      : [];
    const tools = [].concat(data.tools || []);
    if (!data.grounding) throw new Error(`${slug}/prompt.md: front matter needs "grounding"`);
    if (!tools.includes(data.grounding)) tools.unshift(data.grounding);
    skills[slug] = {
      slug,
      version: data.version,
      modelHint: data.model_hint || null,
      grounding: data.grounding,
      groundingArgs: [].concat(data.grounding_args || []),
      tools,
      prompt: body,
      schema,
      examples,
      readme: existsSync(path.join(dir, slug, 'README.md')) ? read(slug, 'README.md') : ''
    };
  }
  return { shared, skills };
}

/**
 * Render the module source for a compiled catalog.
 * @param {{shared: Object, skills: Object}} catalog The compileSkills result.
 * @returns {string} The ES module text.
 */
export function renderSkillsModule(catalog) {
  const json = JSON.stringify(catalog, null, 2).replace(/[\u2028\u2029]/g, (c) =>
    c === '\u2028' ? '\\u2028' : '\\u2029'
  );
  return (
    '// GENERATED by scripts/narratives/build-skills.mjs from skills/patient-journey-narratives/.\n' +
    '// Do not edit: change the skill files and run `npm run narratives:skills` (also part of `npm run build`).\n' +
    '/* eslint-disable */\n' +
    `const CATALOG = ${json};\n` +
    'export const SHARED = CATALOG.shared;\n' +
    'export const SKILLS = CATALOG.skills;\n' +
    'export const SKILL_SLUGS = Object.keys(SKILLS);\n' +
    'export default CATALOG;\n'
  );
}

/**
 * Compile and write the module; returns true when the file changed.
 * @returns {boolean} Whether the module was rewritten.
 */
export function buildSkillsModule() {
  const next = renderSkillsModule(compileSkills());
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : null;
  if (current === next) return false;
  writeFileSync(outFile, next);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const changed = buildSkillsModule();
  console.log(
    `${changed ? 'Wrote' : 'Up to date:'} ${path.relative(rootDir, outFile)} ` +
      `(${Object.keys(compileSkills().skills).length} skills)`
  );
}
