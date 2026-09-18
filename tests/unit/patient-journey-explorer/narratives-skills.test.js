import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  compileSkills,
  forbiddenPatterns,
  outFile,
  parseFrontMatter,
  renderSkillsModule,
  rootDir,
  skillsDir
} from '../../../scripts/narratives/build-skills.mjs';
import {
  SHARED,
  SKILLS,
  SKILL_SLUGS
} from '../../../src/patientJourneyNarratives/skills.generated.js';
import { NARRATIVE_KINDS } from '../../../src/patientJourneyNarratives/kinds.js';
import { TOOLS } from '../../../src/patientJourneyNarratives/tools/index.js';

// The skills folder of the AI narrative layer (#146, design §4): five skill
// folders under skills/patient-journey-narratives/ compiled by
// scripts/narratives/build-skills.mjs into the one module the browser bundle,
// Vitest and the eval harness import. Nothing reads the folder at run time, so
// the committed module IS the contract: it must be a fresh compile of the
// folder, every skill must ground on a tool that exists, and every forbidden
// pattern the validator loads must be a compilable regex. PJE-NARR-001.

const catalog = compileSkills();
const SEMVER = /^\d+\.\d+\.\d+$/;

describe('the skills folder compiles (PJE-NARR-001)', () => {
  test('PJE-NARR-001: every skill carries a semver version, a grounding tool that exists in TOOLS, declared tools that exist, and Input/Draft/Output definitions (#146)', () => {
    // The five narrative kinds the renderer addresses, and nothing else.
    expect(SKILL_SLUGS.slice().sort()).toEqual(Object.keys(NARRATIVE_KINDS).sort());
    expect(SKILL_SLUGS.length).toBe(5);

    for (const slug of SKILL_SLUGS) {
      const skill = SKILLS[slug];
      expect(skill.slug, slug).toBe(slug);
      expect(skill.version, slug).toMatch(SEMVER);
      expect(TOOLS[skill.grounding], `${slug} grounds on ${skill.grounding}`).toBeDefined();
      // The compiler unshifts the grounding tool, so it is always declared first.
      expect(skill.tools[0], slug).toBe(skill.grounding);
      for (const name of skill.tools) {
        expect(TOOLS[name], `${slug} declares ${name}`).toBeDefined();
      }
      for (const key of ['Input', 'Draft', 'Output']) {
        expect(skill.schema.definitions[key], `${slug}.definitions.${key}`).toBeTruthy();
      }
      expect(skill.prompt.length, slug).toBeGreaterThan(0);
      expect(Array.isArray(skill.groundingArgs), slug).toBe(true);
    }

    // disposition is the one skill with fixed grounding arguments in its front
    // matter (`domain=DS`), so the runtime never has to know the domain.
    expect(SKILLS.disposition.grounding).toBe('get_events');
    expect(SKILLS.disposition.groundingArgs).toEqual(['domain=DS']);
  });

  test('PJE-NARR-001: the committed module carries the shared prompt, style guide, refusal catalog and forbidden list, and a folder on disk for every skill it names (#146)', () => {
    expect(Object.keys(SHARED).sort()).toEqual([
      'forbiddenPatterns',
      'refusalCatalog',
      'styleGuide',
      'systemPrompt'
    ]);
    expect(SHARED.systemPrompt.length).toBeGreaterThan(0);
    expect(SHARED.styleGuide).toContain('```forbidden');
    expect(SHARED.refusalCatalog).toContain('refused:insufficient-data');
    // Nothing reads the folder at run time, but every skill in the module must
    // still have one — a skill that lost its folder can never be rebuilt.
    for (const slug of SKILL_SLUGS) {
      expect(existsSync(path.join(skillsDir, slug, 'prompt.md')), slug).toBe(true);
      expect(existsSync(path.join(skillsDir, slug, 'schema.json')), slug).toBe(true);
      expect(catalog.skills[slug], `${slug} compiles from the folder`).toBeTruthy();
    }
  });

  // The generated module is prettier-ignored (its bytes are the compiler's), so
  // the byte-for-byte guard is the only formatting contract it has (#146).
  test('PJE-NARR-001: the committed skills.generated.js is renderSkillsModule(compileSkills()) byte for byte and is listed in .prettierignore (#146)', () => {
    const committed = readFileSync(outFile, 'utf8');
    expect(committed).toBe(renderSkillsModule(catalog));
    const ignored = readFileSync(path.join(rootDir, '.prettierignore'), 'utf8');
    expect(ignored).toContain('src/patientJourneyNarratives/skills.generated.js');
  });
});

describe('the front-matter subset and the forbidden block (PJE-NARR-001)', () => {
  test('PJE-NARR-001: parseFrontMatter reads scalars and one-level lists, strips trailing comments and returns the trimmed body (#146)', () => {
    const parsed = parseFrontMatter(
      [
        '---',
        'skill: event-context',
        'version: 1.2.3',
        'model_hint: claude-opus-5   # the model this prompt was written against',
        'tools:',
        '  - get_context_window',
        '  - get_source_row',
        'grounding: get_context_window',
        '---',
        '',
        '## Task',
        '',
        'Draft the thing.',
        ''
      ].join('\n')
    );
    expect(parsed.data).toEqual({
      skill: 'event-context',
      version: '1.2.3',
      model_hint: 'claude-opus-5',
      tools: ['get_context_window', 'get_source_row'],
      grounding: 'get_context_window'
    });
    expect(parsed.body).toBe('## Task\n\nDraft the thing.');

    // A list key with no items stays an empty array, and CRLF parses the same.
    expect(parseFrontMatter('---\r\nskill: x\r\ntools:\r\n---\r\nbody\r\n').data).toEqual({
      skill: 'x',
      tools: []
    });
    expect(() => parseFrontMatter('no front matter here')).toThrow(/front matter/);
    expect(() => parseFrontMatter('---\nnot a pair\n---\n')).toThrow(/cannot parse/);
  });

  test('PJE-NARR-001: every line of the style guide’s forbidden block compiles as a case-insensitive regex, and the committed list is that block (#146)', () => {
    const fromGuide = forbiddenPatterns(SHARED.styleGuide);
    expect(SHARED.forbiddenPatterns).toEqual(fromGuide);
    expect(SHARED.forbiddenPatterns.length).toBeGreaterThan(20);
    for (const source of SHARED.forbiddenPatterns) {
      expect(() => new RegExp(source, 'i'), source).not.toThrow();
      expect(source.trim(), 'no blank or commented lines survive').toBe(source);
      expect(source.startsWith('#')).toBe(false);
    }
    // The block is the validator's only source of forbidden constructs, so the
    // causal and recommendation families must both be in it.
    expect(SHARED.forbiddenPatterns).toContain('\\bdue to\\b');
    expect(SHARED.forbiddenPatterns).toContain('\\bshould\\b');
    expect(() => forbiddenPatterns('# a style guide with no fenced block')).toThrow(/forbidden/);
  });
});
