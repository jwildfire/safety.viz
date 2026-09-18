// The eval harness of the AI narrative layer (#146): run every golden case
// through a provider adapter and score the drafts.
//
// Two graders. The RULES grader is the CI gate: no network, no key, no model —
// it rebuilds each generation's citation scope by re-running the same tools
// through `runTool`, then checks that every citation resolves, that every
// number in a sentence exists in the rows that sentence cites, that every
// capitalised term it names appears in the record, that no forbidden construct
// survives, and that the required facts are stated. The CLAUDE/OPENAI judge is
// the second opinion for phrasing the substring rules cannot see; it never
// gates CI.
//
// Everything here reads the runtime; nothing here changes it.

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SKILLS,
  create,
  createClaudeAdapter,
  createDataService,
  createOpenAIAdapter,
  normalizeRowId
} from '../../../src/patientJourneyNarratives/index.js';
import { runTool } from '../../../src/patientJourneyNarratives/tools/index.js';
import { forbiddenMatch } from '../../../src/patientJourneyNarratives/validator.js';
import { GOLDEN_DIR, SKILL_ORDER } from './build-golden.mjs';
import { DEMO_SETTINGS, loadDemoData } from './demo-data.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export { GOLDEN_DIR, SKILL_ORDER };

/** The per-skill gate, keyed by skill slug. */
export const THRESHOLDS = JSON.parse(readFileSync(path.join(here, 'thresholds.json'), 'utf8'));

/** Metrics where a higher score is better; `hallucination` is the exception. */
export const HIGHER_IS_BETTER = ['faithfulness', 'coverage', 'style', 'refusals_correct'];
/** The metrics the report prints, in order. */
export const METRICS = [
  'faithfulness',
  'coverage',
  'hallucination',
  'style',
  'refusals_correct',
  'citation_recall',
  'flags_ok'
];
/** The metrics thresholds.json gates. */
export const GATED = ['faithfulness', 'coverage', 'hallucination', 'style', 'refusals_correct'];

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
/** A share of a population, where an empty population is a perfect score. */
const ratio = (hits, total) => (total ? hits / total : 1);
/** A share of a population where the score counts failures, so empty is zero. */
const faultRatio = (hits, total) => (total ? hits / total : 0);
const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 1);

// ---------------------------------------------------------------------------
// The golden set
// ---------------------------------------------------------------------------

/**
 * Read the golden cases from disk.
 * @param {Object} [options] Filters.
 * @param {string} [options.dir] The golden directory.
 * @param {string[]} [options.skills] Only these skill slugs.
 * @param {number} [options.limit] At most this many cases per skill.
 * @returns {Object[]} The cases, in skill order.
 */
export function loadGolden({ dir = GOLDEN_DIR, skills, limit } = {}) {
  const present = new Set(
    readdirSync(dir)
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.replace(/\.jsonl$/, ''))
  );
  const wanted = (skills && skills.length ? skills : SKILL_ORDER).filter((slug) => {
    if (!present.has(slug)) throw new Error(`evals: no golden file for skill "${slug}" in ${dir}`);
    return true;
  });
  const cases = [];
  for (const slug of wanted) {
    const lines = readFileSync(path.join(dir, `${slug}.jsonl`), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
    cases.push(...(finite(limit) ? lines.slice(0, limit) : lines));
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Fact matching
// ---------------------------------------------------------------------------

const escapeRe = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a required fact appears in a text. Case-insensitive substring, with
 * two guards: a fact may not start inside a longer word or number, and a fact
 * that ends in a digit may not run into another digit — so `day 1` does not
 * match `day 184` and `1` does not match `1.06`, while `day 111.` at the end
 * of a sentence still matches. A fact that ends in a letter still matches a
 * plural (`7 con-med` matches `7 con-meds`).
 * @param {string} haystack The text to search.
 * @param {string} fact The required fact.
 * @returns {boolean} Whether it is present.
 */
export function factPresent(haystack, fact) {
  const text = String(haystack ?? '').replace(/\s+/g, ' ');
  const needle = String(fact ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!needle) return true;
  const lead = /^[\w]/.test(needle) ? '(?<![\\w.])' : '';
  const tail = /\d$/.test(needle) ? '(?!\\d)(?!\\.\\d)' : '';
  return new RegExp(`${lead}${escapeRe(needle)}${tail}`, 'i').test(text);
}

// ---------------------------------------------------------------------------
// Rebuilding the citation scope of one generation
// ---------------------------------------------------------------------------

const ROW_ID_KEY = /(^|_)row_ids?$/;
const DOMAIN_OF = { AE: 'AE', CM: 'CM', LB: 'LB', EX: 'EX', MH: 'MH', DS: 'DS', DOSE: 'EX' };
const AGGREGATE_CONTAINER = /^(counts|not_evaluated|data_quality|unplaceable|window)$/;
const AGGREGATE_KEY =
  /(count|total|truncated|_days$|^days$|change_factor|unplaceable|end_before_start|date_conflict)/i;

/**
 * Index one tool result: every object that declares a row id, keyed by that id;
 * every aggregate number (counts, array lengths, window width); every string
 * the record carries, tokenised for the name check.
 * @private
 */
function indexResult(result, index) {
  const walk = (node, key = '', underAggregate = false) => {
    if (Array.isArray(node)) {
      index.aggregates.add(node.length);
      for (const item of node) walk(item, key, underAggregate);
      return;
    }
    if (node && typeof node === 'object') {
      const ids = [];
      for (const [childKey, value] of Object.entries(node)) {
        if (ROW_ID_KEY.test(childKey)) {
          for (const id of [].concat(value)) {
            if (typeof id === 'string') ids.push(normalizeRowId(id));
          }
        }
      }
      for (const id of ids) {
        if (!index.rows.has(id)) index.rows.set(id, []);
        index.rows.get(id).push(node);
      }
      for (const [childKey, value] of Object.entries(node)) {
        walk(
          value,
          childKey,
          underAggregate || AGGREGATE_CONTAINER.test(childKey) || AGGREGATE_KEY.test(childKey)
        );
      }
      return;
    }
    if (typeof node === 'number' && Number.isFinite(node)) {
      if (underAggregate || AGGREGATE_CONTAINER.test(key) || AGGREGATE_KEY.test(key)) {
        index.aggregates.add(node);
        index.aggregates.add(Math.abs(node));
      }
      return;
    }
    if (typeof node === 'string' && node.trim()) {
      index.texts.add(node.trim().toUpperCase());
      for (const word of node.toUpperCase().match(/[A-Z][A-Z'-]*/g) || []) index.texts.add(word);
    }
  };
  walk(result);
}

/**
 * Every number a row carries, with absolute values, for the number check.
 * @private
 */
function rowNumbers(objects) {
  const numbers = new Set();
  const walk = (node) => {
    if (Array.isArray(node)) {
      numbers.add(node.length);
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      Object.values(node).forEach(walk);
      return;
    }
    if (typeof node === 'number' && Number.isFinite(node)) {
      numbers.add(node);
      numbers.add(Math.abs(node));
    }
  };
  for (const object of objects) walk(object);
  return numbers;
}

/**
 * The tool input that reproduces a follow-up read, from the case inputs.
 * @private
 */
function reconstructInput(name, inputs, skill) {
  const usubjid = inputs.subject;
  switch (name) {
    case 'get_subject_overview':
    case 'get_dose_history':
      return { usubjid };
    case 'get_lab_series':
      return inputs.test ? { usubjid, test: inputs.test } : null;
    case 'get_context_window':
      return inputs.anchor_row_id
        ? {
            usubjid,
            anchor_row_id: inputs.anchor_row_id,
            ...(finite(inputs.window_days) ? { days: inputs.window_days } : {})
          }
        : null;
    case 'get_events': {
      const fixed = (skill.groundingArgs || [])
        .map((entry) => String(entry).split('='))
        .find(([key]) => key.trim() === 'domain');
      return fixed ? { usubjid, domain: fixed[1].trim() } : null;
    }
    default:
      return null;
  }
}

/**
 * Rebuild the citation scope of a generation: the grounding rows the runtime
 * ran, the declared tools the draft says it called (re-run through `runTool`),
 * and a `get_source_row` / `get_events` read for any citation those leave
 * unresolved — the same reads the model itself was allowed to make.
 * @param {Object} generator The narrative generator.
 * @param {Object} kase The golden case.
 * @param {Object} draft The draft to score.
 * @returns {{rows: Map, aggregates: Set<number>, texts: Set<string>, tools: string[]}} The scope index.
 */
export function rebuildScope(generator, kase, draft) {
  const skill = SKILLS[kase.skill];
  const index = { rows: new Map(), aggregates: new Set(), texts: new Set(), tools: [] };
  const service = generator.dataService;
  const subject = kase.inputs.subject;
  let grounding = null;
  try {
    grounding = generator.scope(kase.skill, kase.inputs).grounding;
  } catch {
    grounding = null;
  }
  if (grounding) {
    indexResult(grounding, index);
    index.tools.push(skill.grounding);
  }
  const declared = new Set(skill.tools);
  for (const name of new Set((draft.provenance?.tool_calls || []).slice(1))) {
    if (!declared.has(name)) continue;
    const input = reconstructInput(name, kase.inputs, skill);
    if (!input) continue;
    indexResult(runTool(service, name, input, { subject }), index);
    index.tools.push(name);
  }
  const cited = new Set(
    (draft.sentences || []).flatMap((sentence) => (sentence.citations || []).map(normalizeRowId))
  );
  for (const id of cited) {
    if (index.rows.has(id)) continue;
    const domain = DOMAIN_OF[String(id).split('-')[0]];
    if (domain && declared.has('get_events')) {
      indexResult(runTool(service, 'get_events', { usubjid: subject, domain }, { subject }), index);
    }
    if (!index.rows.has(id) && declared.has('get_source_row')) {
      const row = runTool(service, 'get_source_row', { row_id: id, usubjid: subject }, { subject });
      if (!row.error) indexResult(row, index);
    }
  }
  for (const id of kase.reference.scope_row_ids || []) {
    if (!index.rows.has(id)) index.rows.set(id, []);
  }
  return index;
}

// ---------------------------------------------------------------------------
// The rules grader
// ---------------------------------------------------------------------------

/** Words a Title-case token may be without naming anything in the record. */
const STOPWORDS = new Set(
  [
    'the',
    'a',
    'an',
    'and',
    'or',
    'but',
    'if',
    'in',
    'on',
    'at',
    'by',
    'for',
    'from',
    'to',
    'of',
    'with',
    'within',
    'no',
    'not',
    'none',
    'this',
    'that',
    'these',
    'those',
    'its',
    'it',
    'all',
    'both',
    'each',
    'one',
    'two',
    'three',
    'day',
    'days',
    'baseline',
    'exposure',
    'dose',
    'study',
    'reference',
    'severity',
    'serious',
    'abnormal',
    'participant',
    'record',
    'records',
    'treatment',
    'disposition',
    'there',
    'other',
    'earlier',
    'later',
    'anchor'
  ].map((word) => word.toUpperCase())
);

/**
 * The capitalised names a sentence uses: every ALL-CAPS token of three letters
 * or more, and every Title-case token that does not open a sentence. These are
 * the tokens that look like a drug, a term or a test — the shape a model
 * invents when it reaches past the rows.
 * @param {string} text A sentence.
 * @returns {string[]} The candidate names, upper-cased.
 */
export function capitalisedNames(text) {
  const source = String(text ?? '');
  const names = [];
  for (const match of source.matchAll(/[A-Za-z][A-Za-z'-]*/g)) {
    const token = match[0];
    if (token.replace(/[^A-Za-z]/g, '').length < 3) continue;
    const before = source.slice(0, match.index).replace(/[\s"'(\[]+$/, '');
    const opensSentence = before === '' || /[.!?:;]$/.test(before);
    const allCaps = token === token.toUpperCase();
    const titleCase = !allCaps && /^[A-Z][a-z]/.test(token);
    if (!allCaps && !titleCase) continue;
    if (titleCase && opensSentence) continue;
    if (STOPWORDS.has(token.toUpperCase())) continue;
    names.push(token.toUpperCase());
  }
  return [...new Set(names)];
}

/**
 * Every number a sentence states.
 * @param {string} text A sentence.
 * @returns {number[]} The numbers.
 */
export function numbersIn(text) {
  return (String(text ?? '').match(/-?\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite);
}

/**
 * Score one draft against its golden case with the rules grader.
 * @param {Object} draft The draft the adapter produced.
 * @param {Object} kase The golden case.
 * @param {Object} scope The scope index from rebuildScope().
 * @returns {{scores: Object, reasons: string[]}} The per-case scores and why they fell short.
 */
export function gradeWithRules(draft, kase, scope) {
  const reasons = [];
  const reference = kase.reference || {};
  const sentences = draft.sentences || [];
  const flags = draft.flags || [];
  const refused = flags.some((flag) => String(flag).startsWith('refused:'));
  const text = [draft.summary || '', ...sentences.map((sentence) => sentence.text)].join(' ');

  // Refusals.
  let refusalsCorrect = 1;
  if (reference.refusal) {
    const wanted = `refused:${reference.refusal}`;
    if (!flags.includes(wanted)) {
      refusalsCorrect = 0;
      reasons.push(
        `expected ${wanted}, got ${flags.length ? flags.join(', ') : 'a draft with no refusal flag'}`
      );
    }
  } else if (refused) {
    refusalsCorrect = 0;
    reasons.push(`unexpected refusal: ${flags.filter((f) => f.startsWith('refused:')).join(', ')}`);
  }

  // Coverage.
  const missingFacts = (reference.required_facts || []).filter((fact) => !factPresent(text, fact));
  const coverage = ratio(
    (reference.required_facts || []).length - missingFacts.length,
    (reference.required_facts || []).length
  );
  if (missingFacts.length) reasons.push(`missing fact(s): ${missingFacts.join(' | ')}`);

  // Citations the reference requires.
  const cited = new Set(
    sentences.flatMap((sentence) => (sentence.citations || []).map(normalizeRowId))
  );
  const missingCitations = (reference.required_citations || []).filter((id) => !cited.has(id));
  const citationRecall = ratio(
    (reference.required_citations || []).length - missingCitations.length,
    (reference.required_citations || []).length
  );
  if (missingCitations.length) reasons.push(`no sentence cites ${missingCitations.join(', ')}`);

  // Faithfulness: every citation resolves, every number is in a cited row.
  // Sentences the runtime's validator DROPPED count against the denominator:
  // a drop means the model cited a row no tool returned, and scoring only what
  // survived would let the runtime's own cleanup hide that.
  const scopeIds = new Set([...(reference.scope_row_ids || []), ...scope.rows.keys()]);
  const dropped = draft.provenance?.dropped || [];
  for (const drop of dropped) {
    reasons.push(`the validator dropped a sentence (${drop.reason}): "${drop.text}"`);
  }
  let faithful = 0;
  for (const sentence of sentences) {
    const citations = (sentence.citations || []).map(normalizeRowId);
    const unresolved = citations.filter((id) => !scopeIds.has(id));
    const available = rowNumbers(citations.flatMap((id) => scope.rows.get(id) || []));
    available.add(citations.length);
    for (const value of scope.aggregates) available.add(value);
    const ungrounded = numbersIn(sentence.text).filter(
      (value) => !available.has(value) && !available.has(Math.abs(value))
    );
    if (unresolved.length) {
      reasons.push(`citation(s) outside the scope (${unresolved.join(', ')}): "${sentence.text}"`);
    } else if (ungrounded.length) {
      reasons.push(
        `number(s) not in the cited rows (${ungrounded.join(', ')}): "${sentence.text}" [${citations.join(', ')}]`
      );
    } else faithful += 1;
  }
  const faithfulness = ratio(faithful, sentences.length + dropped.length);

  // Hallucination: a capitalised name the record does not carry.
  let hallucinating = 0;
  for (const sentence of sentences) {
    const invented = capitalisedNames(sentence.text).filter((name) => !scope.texts.has(name));
    if (invented.length) {
      hallucinating += 1;
      reasons.push(`name(s) not in the record (${invented.join(', ')}): "${sentence.text}"`);
    }
  }
  const hallucination = faultRatio(hallucinating, sentences.length);

  // Style: the forbidden-phrase block of the style guide.
  let clean = 0;
  for (const sentence of sentences) {
    const hit = forbiddenMatch(sentence.text);
    if (hit) reasons.push(`forbidden construct "${hit}": "${sentence.text}"`);
    else clean += 1;
  }
  const style = ratio(clean, sentences.length);

  // Flags (reported, never gated).
  const missingFlags = (reference.expected_flags || []).filter((flag) => !flags.includes(flag));
  const flagsOk = ratio(
    (reference.expected_flags || []).length - missingFlags.length,
    (reference.expected_flags || []).length
  );
  if (missingFlags.length) reasons.push(`missing flag(s): ${missingFlags.join(', ')}`);

  return {
    scores: {
      faithfulness,
      coverage,
      hallucination,
      style,
      refusals_correct: refusalsCorrect,
      citation_recall: citationRecall,
      flags_ok: flagsOk
    },
    reasons
  };
}

// ---------------------------------------------------------------------------
// The LLM judge
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM = [
  'You grade short clinical-safety narrative drafts written from structured trial records.',
  'You are given the ROWS a drafting model was allowed to read and the DRAFT it produced.',
  'The rows are the only ground truth: anything the draft states that the rows do not carry is unsupported, however plausible it sounds.',
  '',
  'Score four metrics, each a number in [0,1]:',
  '- faithfulness: the fraction of sentences whose every claim, number and date is supported by the rows the sentence cites.',
  '- coverage: how much of the required_facts list the draft states, in any phrasing.',
  '- hallucination: the fraction of sentences that state something the rows do not carry (0 is perfect).',
  '- style: the fraction of sentences that stay observational — no causation, no diagnosis, no treatment advice, no prognosis, no description of the person.',
  '',
  'Answer with ONE JSON object and nothing else:',
  '{"faithfulness":0.0,"coverage":0.0,"hallucination":0.0,"style":0.0,"reasons":{"faithfulness":"one line","coverage":"one line","hallucination":"one line","style":"one line"}}'
].join('\n');

/**
 * The first JSON object in a text, or null.
 * @private
 */
function firstJsonObject(text) {
  const source = String(text ?? '');
  const start = source.indexOf('{');
  if (start < 0) return null;
  for (let end = source.lastIndexOf('}'); end > start; end = source.lastIndexOf('}', end - 1)) {
    try {
      return JSON.parse(source.slice(start, end + 1));
    } catch {
      // keep shrinking
    }
  }
  return null;
}

const clamp = (value) => (finite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : null);

/**
 * Grade one draft with an LLM judge through a plain messages call (no tools).
 * @param {Object} adapter A provider adapter.
 * @param {Object} kase The golden case.
 * @param {Object} draft The draft.
 * @param {Object} grounding The grounding rows the runtime read.
 * @returns {Promise<{scores: ?Object, reasons: string[], error: ?string}>} The judge's verdict.
 */
export async function gradeWithJudge(adapter, kase, draft, grounding) {
  const payload = {
    skill: kase.skill,
    inputs: kase.inputs,
    required_facts: kase.reference.required_facts,
    expected_refusal: kase.reference.refusal,
    rows: grounding,
    draft: {
      summary: draft.summary,
      sentences: draft.sentences,
      flags: draft.flags
    }
  };
  try {
    const response = await adapter.messages({
      system: JUDGE_SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Grade this draft.\n\n${JSON.stringify(payload)}\n\nReturn only the JSON object.`
            }
          ]
        }
      ],
      tools: []
    });
    const text = (response.content || [])
      .filter((block) => block && block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const parsed = firstJsonObject(text);
    if (!parsed) return { scores: null, reasons: [], error: 'the judge returned no JSON object' };
    const scores = {};
    for (const metric of ['faithfulness', 'coverage', 'hallucination', 'style']) {
      const value = clamp(parsed[metric]);
      if (value === null)
        return { scores: null, reasons: [], error: `the judge omitted ${metric}` };
      scores[metric] = value;
    }
    const reasons = Object.entries(parsed.reasons || {}).map(
      ([metric, reason]) => `judge/${metric}: ${String(reason).slice(0, 300)}`
    );
    return { scores, reasons, error: null };
  } catch (error) {
    return {
      scores: null,
      reasons: [],
      error: String(error && error.message ? error.message : error)
    };
  }
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/**
 * Build the adapter a run uses.
 * @private
 */
function resolveAdapter(adapter, { model, apiKey }) {
  if (adapter && typeof adapter === 'object' && typeof adapter.messages === 'function') {
    return adapter;
  }
  switch (adapter || 'stub') {
    case 'stub':
      return null; // the generator builds the stub itself
    case 'claude':
      return createClaudeAdapter({ ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}) });
    case 'openai':
      return createOpenAIAdapter({ ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}) });
    default:
      throw new Error(`evals: unknown adapter "${adapter}"`);
  }
}

/**
 * Build the judge adapter, or null for the rules judge.
 * @private
 */
function resolveJudge(judge, { model, apiKey }) {
  if (judge && typeof judge === 'object' && typeof judge.messages === 'function') return judge;
  switch (judge || 'rules') {
    case 'rules':
      return null;
    case 'claude':
      return createClaudeAdapter({ ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}) });
    case 'openai':
      return createOpenAIAdapter({ ...(apiKey ? { apiKey } : {}), ...(model ? { model } : {}) });
    default:
      throw new Error(`evals: unknown judge "${judge}"`);
  }
}

/**
 * Whether a set of scores clears a skill's thresholds.
 * @param {Object} scores Per-metric scores.
 * @param {Object} thresholds The skill's thresholds.
 * @returns {{pass: boolean, failed: string[]}} The verdict.
 */
export function clears(scores, thresholds) {
  const failed = [];
  for (const metric of GATED) {
    const limit = thresholds[metric];
    if (!finite(limit)) continue;
    const value = scores[metric];
    if (!finite(value)) continue;
    const ok = metric === 'hallucination' ? value <= limit : value >= limit;
    if (!ok) failed.push(metric);
  }
  return { pass: failed.length === 0, failed };
}

/**
 * Run the golden set through an adapter and score every draft.
 * @param {Object} [options] The run.
 * @param {'stub'|'claude'|'openai'|Object} [options.adapter='stub'] The adapter under test.
 * @param {'rules'|'claude'|'openai'|Object} [options.judge='rules'] The grader.
 * @param {string[]} [options.skills] Only these skills.
 * @param {number} [options.limit] At most this many cases per skill.
 * @param {string} [options.model] Model id for a live adapter or judge.
 * @param {string} [options.apiKey] API key for a live adapter or judge.
 * @param {string} [options.goldenDir] Where the cases live.
 * @param {Function} [options.log] Receives one line per case.
 * @returns {Promise<Object>} `{ cases, bySkill, thresholds, passed, generatedAt, adapter, judge }`.
 */
export async function runEvals({
  adapter = 'stub',
  judge = 'rules',
  skills,
  limit,
  model,
  apiKey,
  goldenDir = GOLDEN_DIR,
  log = () => {}
} = {}) {
  const cases = loadGolden({ dir: goldenDir, skills, limit });
  const built = resolveAdapter(adapter, { model, apiKey });
  const judgeAdapter = resolveJudge(judge, { model, apiKey });
  const dataService = createDataService({ data: loadDemoData(), settings: DEMO_SETTINGS });
  const generator = create({
    ...(built ? { adapter: built } : { provider: 'stub' }),
    dataService,
    log: () => {}
  });
  const adapterName = `${generator.adapter.name}:${generator.adapter.model}`;
  const judgeName =
    judgeAdapter && typeof judgeAdapter === 'object'
      ? `${judgeAdapter.name}:${judgeAdapter.model}`
      : 'rules';

  const scored = [];
  for (const kase of cases) {
    const startedAt = Date.now();
    let draft = null;
    let error = null;
    try {
      draft = await generator.run(kase.skill, kase.inputs);
    } catch (thrown) {
      error = String(thrown && thrown.message ? thrown.message : thrown);
    }
    if (!draft) {
      scored.push({
        id: kase.id,
        skill: kase.skill,
        inputs: kase.inputs,
        error,
        scores: Object.fromEntries(
          METRICS.map((metric) => [metric, metric === 'hallucination' ? 1 : 0])
        ),
        reasons: [`the generation threw: ${error}`],
        pass: false,
        ms: Date.now() - startedAt
      });
      log(`${kase.id}: FAILED (${error})`);
      continue;
    }
    const scope = rebuildScope(generator, kase, draft);
    const rules = gradeWithRules(draft, kase, scope);
    let scores = rules.scores;
    let reasons = rules.reasons;
    let judgeVerdict = null;
    if (judgeAdapter) {
      let grounding = null;
      try {
        grounding = generator.scope(kase.skill, kase.inputs).grounding;
      } catch {
        grounding = null;
      }
      judgeVerdict = await gradeWithJudge(judgeAdapter, kase, draft, grounding);
      if (judgeVerdict.scores) {
        scores = {
          ...judgeVerdict.scores,
          refusals_correct: rules.scores.refusals_correct,
          citation_recall: rules.scores.citation_recall,
          flags_ok: rules.scores.flags_ok
        };
        reasons = [...judgeVerdict.reasons, ...rules.reasons];
      } else {
        reasons = [
          `judge unavailable (${judgeVerdict.error}); rules scores kept`,
          ...rules.reasons
        ];
      }
    }
    const thresholds = THRESHOLDS[kase.skill] || {};
    const verdict = clears(scores, thresholds);
    scored.push({
      id: kase.id,
      skill: kase.skill,
      inputs: kase.inputs,
      notes: kase.notes,
      scores,
      rules: judgeAdapter ? rules.scores : undefined,
      judge_error: judgeVerdict ? judgeVerdict.error : undefined,
      reasons,
      failed_metrics: verdict.failed,
      pass: verdict.pass,
      draft: {
        summary: draft.summary,
        sentences: draft.sentences,
        flags: draft.flags,
        tool_calls: draft.provenance?.tool_calls || [],
        dropped: draft.provenance?.dropped || [],
        skill_version: draft.provenance?.skill || null
      },
      ms: Date.now() - startedAt
    });
    log(`${kase.id}: ${verdict.pass ? 'pass' : `FAIL (${verdict.failed.join(', ')})`}`);
  }

  const bySkill = {};
  for (const slug of SKILL_ORDER) {
    const rows = scored.filter((entry) => entry.skill === slug);
    if (!rows.length) continue;
    const aggregate = { n: rows.length };
    for (const metric of METRICS) {
      aggregate[metric] = mean(rows.map((row) => row.scores[metric]).filter(finite));
    }
    const verdict = clears(aggregate, THRESHOLDS[slug] || {});
    aggregate.pass = verdict.pass;
    aggregate.failed_metrics = verdict.failed;
    aggregate.failing_cases = rows.filter((row) => !row.pass).map((row) => row.id);
    bySkill[slug] = aggregate;
  }

  return {
    cases: scored,
    bySkill,
    thresholds: THRESHOLDS,
    passed: Object.values(bySkill).every((entry) => entry.pass),
    generatedAt: new Date().toISOString(),
    adapter: adapterName,
    judge: judgeName
  };
}

export default { runEvals, loadGolden, gradeWithRules, gradeWithJudge, rebuildScope };
