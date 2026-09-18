// The generation runtime of the AI narrative layer (#146, design §6):
// `(skill, inputs) → structured draft` through one provider adapter,
// restricted to the skill's declared tools, validated after the model
// answers, with provenance attached and a cache keyed by skill@version +
// input hash. Provider-agnostic: the generator never knows which adapter is
// in use. Designed for extraction to its own package later: nothing here
// reads the DOM, and the only imports from the chart module are the pure
// data functions the data service and tools wrap.

import { SHARED, SKILLS, SKILL_SLUGS } from './skills.generated.js';
import { createDataService } from './dataService.js';
import { collectRowIds, normalizeRowId, runTool, toolDefinitions, TOOLS } from './tools/index.js';
import { validateDraft } from './validator.js';
import { inlineRefs, sentenceCap, validateSchema } from './schema.js';
import { inputHash } from './hash.js';
import { NARRATIVE_KINDS, REFUSAL_TEXT, SLUG_BY_SLOT, refusalReason } from './kinds.js';
import { createClaudeAdapter } from './adapters/claude.js';
import { createOpenAIAdapter } from './adapters/openai.js';
import { createStubAdapter } from './adapters/stub.js';

export {
  SHARED,
  SKILLS,
  SKILL_SLUGS,
  TOOLS,
  NARRATIVE_KINDS,
  SLUG_BY_SLOT,
  REFUSAL_TEXT,
  refusalReason,
  createDataService,
  createClaudeAdapter,
  createOpenAIAdapter,
  createStubAdapter,
  validateDraft,
  inputHash,
  normalizeRowId
};

/** Marker lines the first user message uses; the stub adapter parses them. */
export const MARKERS = { inputs: '<<INPUTS>>', grounding: '<<GROUNDING>>', end: '<<END>>' };

const SUBMIT_TOOL = 'submit_draft';
const ALIASES = { usubjid: 'subject', days: 'window_days' };

/**
 * The arguments of a skill's grounding tool, from the run() inputs: every
 * property the tool's schema names, taken from the inputs by name or by
 * alias (`usubjid` ← `subject`, `days` ← `window_days`), plus the fixed
 * `grounding_args` of the skill's front matter.
 * @private
 */
function groundingArgs(skill, inputs) {
  const tool = TOOLS[skill.grounding];
  if (!tool)
    throw new Error(`narratives: skill ${skill.slug} grounds on unknown tool ${skill.grounding}`);
  const args = {};
  for (const name of Object.keys(tool.input_schema.properties)) {
    const source = name in inputs ? inputs[name] : inputs[ALIASES[name]];
    if (source !== undefined && source !== null) args[name] = source;
  }
  for (const entry of skill.groundingArgs || []) {
    const [key, value] = String(entry).split('=');
    if (key && value !== undefined) args[key.trim()] = value.trim();
  }
  return args;
}

/**
 * Whether a grounding result has nothing to describe.
 * @private
 */
function scopeIsEmpty(skill, grounding) {
  if (!grounding || grounding.error) return true;
  switch (skill.grounding) {
    case 'get_subject_overview':
      return !Object.values(grounding.counts || {}).some((n) => n > 0);
    case 'get_lab_series':
      return !(grounding.points || []).length;
    case 'get_dose_history':
      return !(grounding.records || []).length;
    case 'get_events':
      return !(grounding.rows || []).length;
    default:
      return false;
  }
}

/**
 * The reason to refuse for a grounding result, or null.
 * @private
 */
function groundingRefusal(skill, grounding) {
  if (grounding && grounding.error === 'anchor-not-found') return 'anchor-not-found';
  return scopeIsEmpty(skill, grounding) ? 'insufficient-data' : null;
}

/**
 * The skill-specific identity fields of a draft, from the inputs and the
 * grounding rows (the anchor for event-context, the test for lab-trajectory).
 * @private
 */
function identityFields(skill, inputs, grounding) {
  const fields = { kind: skill.slug, subject: String(inputs.subject) };
  if (skill.slug === 'event-context') {
    const id = normalizeRowId(inputs.anchor_row_id);
    const anchor = grounding && grounding.anchor;
    fields.anchor = {
      domain: anchor ? anchor.domain : id.split('-')[0] || '',
      row_id: id,
      term: anchor ? String(anchor.label ?? '') : '',
      start_day: anchor && Number.isFinite(anchor.start_day) ? anchor.start_day : null
    };
    fields.window_days =
      grounding && grounding.window ? grounding.window.days : (inputs.window_days ?? 0);
  }
  if (skill.slug === 'lab-trajectory') {
    fields.test = grounding && grounding.test ? grounding.test : String(inputs.test ?? '');
  }
  return fields;
}

/**
 * The system prompt of a skill: the shared base, the skill prompt, the cap.
 * @private
 */
function systemPrompt(skill) {
  const cap = sentenceCap(skill.schema);
  return [
    SHARED.systemPrompt,
    `# Skill: ${skill.slug} (version ${skill.version})`,
    skill.prompt,
    cap !== null ? `Sentence cap for this skill: at most ${cap} sentences.` : '',
    'Row ids look like AE-7, CM-11, LB-203, DOSE-4; cite them exactly as the tools return them.'
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The first user message: the inputs and the grounding rows, between
 * marker lines so both a model and the stub adapter can read them.
 * @private
 */
function firstMessage(skill, inputs, grounding) {
  return [
    `Draft the ${skill.slug} narrative for participant ${inputs.subject}.`,
    MARKERS.inputs,
    JSON.stringify(inputs),
    `${MARKERS.grounding} ${skill.grounding} (already run; every row_id below is in scope for citations)`,
    JSON.stringify(grounding),
    MARKERS.end,
    `Call other declared tools only when you need a column the grounding rows do not carry, then call ${SUBMIT_TOOL} exactly once.`
  ].join('\n');
}

/**
 * Parse a first user message back into `{ skill, inputs, grounding }` (the
 * stub adapter's read path).
 * @param {string} text The message text.
 * @returns {?{skill: string, inputs: Object, grounding: Object}} The parsed payload, or null.
 */
export function parseFirstMessage(text) {
  const source = String(text ?? '');
  const skill = /^Draft the ([a-z-]+) narrative/.exec(source);
  const inputsAt = source.indexOf(MARKERS.inputs);
  const groundingAt = source.indexOf(MARKERS.grounding);
  const endAt = source.indexOf(MARKERS.end);
  if (!skill || inputsAt < 0 || groundingAt < 0 || endAt < 0) return null;
  try {
    const inputs = JSON.parse(source.slice(inputsAt + MARKERS.inputs.length, groundingAt).trim());
    const groundingText = source.slice(groundingAt, endAt);
    const grounding = JSON.parse(groundingText.slice(groundingText.indexOf('\n') + 1).trim());
    return { skill: skill[1], inputs, grounding };
  } catch {
    return null;
  }
}

/**
 * Build a refusal draft: schema-valid, no sentences, one `refused:<reason>`
 * flag, full provenance.
 * @param {Object} skill The compiled skill.
 * @param {Object} inputs The run() inputs.
 * @param {string} reason The reason after `refused:`.
 * @param {Object} provenance The provenance block.
 * @param {?Object} [grounding] The grounding result, when it ran.
 * @returns {Object} The refusal draft.
 */
export function refusalDraft(skill, inputs, reason, provenance, grounding = null) {
  return {
    ...identityFields(skill, inputs, grounding),
    summary: REFUSAL_TEXT[reason] || `Narrative withheld (${reason}).`,
    sentences: [],
    flags: [`refused:${reason}`],
    provenance,
    status: 'draft'
  };
}

/**
 * Pick or build the adapter for the create() options.
 * @private
 */
function resolveAdapter(options) {
  if (options.adapter && typeof options.adapter.messages === 'function') return options.adapter;
  const common = {
    apiKey: options.apiKey,
    getToken: options.getToken,
    baseUrl: options.baseUrl,
    model: options.model,
    maxTokens: options.maxTokens,
    effort: options.effort,
    temperature: options.temperature,
    headers: options.headers,
    fetch: options.fetch
  };
  for (const key of Object.keys(common)) if (common[key] === undefined) delete common[key];
  switch (options.provider || 'stub') {
    case 'claude':
      return createClaudeAdapter(common);
    case 'openai':
      return createOpenAIAdapter(common);
    case 'stub':
      return createStubAdapter(options.stub || {});
    default:
      throw new Error(`narratives: unknown provider "${options.provider}"`);
  }
}

/**
 * A memory cache, or the caller's `{ get, set }` store, or none.
 * @private
 */
function resolveCache(cache) {
  if (cache === false || cache === null) return null;
  if (cache && typeof cache.get === 'function' && typeof cache.set === 'function') return cache;
  const map = new Map();
  return {
    get: (key) => map.get(key),
    set: (key, value) => map.set(key, value),
    clear: () => map.clear()
  };
}

/**
 * Create a narrative generator.
 * @param {Object} options Generator options.
 * @param {'claude'|'openai'|'stub'} [options.provider='stub'] Which adapter to build when `adapter` is not given.
 * @param {Object} [options.adapter] A ready adapter (`{ name, model, messages() }`), tests and custom providers.
 * @param {string} [options.apiKey] Passed to the provider adapter.
 * @param {Function} [options.getToken] Passed to the provider adapter.
 * @param {string} [options.baseUrl] Passed to the provider adapter.
 * @param {string} [options.model] Passed to the provider adapter.
 * @param {Object} options.dataService A data service (createDataService), or `{ domains, settings }` / `{ data, settings }` to build one.
 * @param {'memory'|Object|false} [options.cache='memory'] The draft cache.
 * @param {number} [options.maxToolCalls=8] Hard cap on tool calls per generation (the grounding call excluded).
 * @param {Function} [options.log] Receives one-line diagnostics (dropped sentences, retries); default console.warn.
 * @returns {Object} The generator: `run(slug, inputs, { signal })`, `scope(slug, inputs)`, `scopeHash(slug, inputs)`, `skills`, `adapter`, `dataService`, `cache`.
 */
export function create(options = {}) {
  const adapter = resolveAdapter(options);
  const dataService =
    options.dataService && typeof options.dataService.structuredFor === 'function'
      ? options.dataService
      : createDataService(options.dataService || {});
  const cache = resolveCache(options.cache === undefined ? 'memory' : options.cache);
  const maxToolCalls = Number.isInteger(options.maxToolCalls) ? options.maxToolCalls : 8;
  const log =
    typeof options.log === 'function'
      ? options.log
      : (message) => {
          if (typeof console !== 'undefined') console.warn(`narratives: ${message}`);
        };

  function skillFor(slug) {
    const key = SLUG_BY_SLOT[slug] || slug;
    const skill = SKILLS[key];
    if (!skill)
      throw new Error(`narratives: unknown skill "${slug}" (known: ${SKILL_SLUGS.join(', ')})`);
    return skill;
  }

  function checkInputs(skill, inputs) {
    const verdict = validateSchema(inputs, skill.schema.definitions.Input, skill.schema);
    if (!verdict.ok) {
      throw new Error(`narratives: invalid inputs for ${skill.slug}: ${verdict.errors.join('; ')}`);
    }
  }

  function scope(slug, inputs) {
    const skill = skillFor(slug);
    const args = groundingArgs(skill, inputs);
    const grounding = runTool(dataService, skill.grounding, args, { subject: inputs.subject });
    const hash = inputHash({ skill: skill.slug, version: skill.version, inputs, grounding });
    return { skill, grounding, hash };
  }

  async function run(slug, rawInputs = {}, { signal } = {}) {
    const skill = skillFor(slug);
    const inputs = { ...rawInputs };
    if (inputs.subject !== undefined) inputs.subject = String(inputs.subject);
    checkInputs(skill, inputs);
    const { grounding, hash } = scope(skill.slug, inputs);
    const cacheKey = `${skill.slug}@${skill.version}|${hash}|${adapter.name}:${adapter.model}`;
    if (cache) {
      const hit = cache.get(cacheKey);
      if (hit) return hit;
    }
    const startedAt = new Date().toISOString();
    const toolCalls = [skill.grounding];
    const usage = { input_tokens: 0, output_tokens: 0, calls: 0 };
    const provenance = () => ({
      model: adapter.model,
      skill: `${skill.slug}@${skill.version}`,
      input_hash: hash,
      generated_at: new Date().toISOString(),
      started_at: startedAt,
      tool_calls: [...toolCalls],
      adapter: adapter.name,
      usage: { ...usage },
      dropped: [],
      attempts: 0
    });
    const finish = (draft) => {
      if (cache) cache.set(cacheKey, draft);
      return draft;
    };

    const refusal = groundingRefusal(skill, grounding);
    if (refusal) return finish(refusalDraft(skill, inputs, refusal, provenance(), grounding));

    const declared = skill.tools.filter((name) => TOOLS[name]);
    const tools = [
      ...toolDefinitions(declared),
      {
        name: SUBMIT_TOOL,
        description:
          'Submit the finished narrative draft. Call exactly once, after any tool reads. Every sentence must cite row_ids returned in this conversation.',
        input_schema: inlineRefs(skill.schema.definitions.Draft, skill.schema)
      }
    ];
    const system = systemPrompt(skill);
    const messages = [
      { role: 'user', content: [{ type: 'text', text: firstMessage(skill, inputs, grounding) }] }
    ];
    const scopeIds = collectRowIds(grounding);
    if (skill.slug === 'event-context') scopeIds.add(normalizeRowId(inputs.anchor_row_id));
    const identity = identityFields(skill, inputs, grounding);

    let attempts = 0;
    let validationRetried = false;
    let submitNudged = false;
    let lastErrors = [];
    let lastDropped = [];
    const maxRounds = maxToolCalls + 4;

    for (let round = 0; round < maxRounds; round += 1) {
      if (signal && signal.aborted) {
        const draft = refusalDraft(skill, inputs, 'cancelled', provenance(), grounding);
        return draft;
      }
      let response;
      try {
        response = await adapter.messages({ system, messages, tools, signal });
      } catch (error) {
        log(`${skill.slug}: adapter failed: ${error && error.message ? error.message : error}`);
        const draft = refusalDraft(skill, inputs, 'provider-error', provenance(), grounding);
        draft.provenance.error = String(error && error.message ? error.message : error);
        return draft;
      }
      usage.input_tokens += response.usage?.input_tokens ?? 0;
      usage.output_tokens += response.usage?.output_tokens ?? 0;
      usage.calls += 1;
      if (response.stop_reason === 'refusal') {
        const draft = refusalDraft(skill, inputs, 'provider-refusal', provenance(), grounding);
        if (response.stop_details) draft.provenance.stop_details = response.stop_details;
        return finish(draft);
      }
      const content = Array.isArray(response.content) ? response.content : [];
      const toolUses = content.filter((block) => block && block.type === 'tool_use');
      if (content.length) messages.push({ role: 'assistant', content });

      const results = [];
      let submitted = null;
      for (const use of toolUses) {
        if (use.name === SUBMIT_TOOL) {
          submitted = submitted || use;
          continue;
        }
        let result;
        if (!declared.includes(use.name)) {
          result = {
            error: 'tool-not-available',
            message: `${use.name} is not available to this skill.`
          };
        } else if (toolCalls.length - 1 >= maxToolCalls) {
          result = {
            error: 'tool-call-cap',
            message: `The tool-call cap (${maxToolCalls}) is reached; submit the draft.`
          };
        } else {
          result = runTool(dataService, use.name, use.input, { subject: inputs.subject });
          toolCalls.push(use.name);
          for (const id of collectRowIds(result)) scopeIds.add(id);
        }
        results.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result),
          ...(result && result.error ? { is_error: true } : {})
        });
      }

      if (submitted) {
        attempts += 1;
        const candidate = { ...submitted.input, ...identity };
        const verdict = validateDraft(candidate, { skill, scopeIds, subject: inputs.subject });
        lastErrors = verdict.errors;
        lastDropped = verdict.dropped;
        const allDropped =
          verdict.ok && !verdict.draft.sentences.length && verdict.dropped.length > 0;
        if (verdict.ok && !allDropped) {
          for (const drop of verdict.dropped)
            log(`${skill.slug}: dropped sentence (${drop.reason}): "${drop.text}"`);
          const prov = provenance();
          prov.dropped = verdict.dropped;
          prov.attempts = attempts;
          prov.model = response.model || adapter.model;
          return finish({ ...verdict.draft, provenance: prov, status: 'draft' });
        }
        if (!validationRetried) {
          validationRetried = true;
          const problems = [
            ...verdict.errors,
            ...verdict.dropped.map((drop) => `dropped "${drop.text}" (${drop.reason})`)
          ];
          results.push({
            type: 'tool_result',
            tool_use_id: submitted.id,
            content: JSON.stringify({ error: 'validation-failed', problems }),
            is_error: true
          });
          results.push({
            type: 'text',
            text: 'VALIDATION FEEDBACK: the draft was rejected. Fix every problem listed in the submit_draft result — cite only row_ids returned in this conversation, remove forbidden constructs, keep to the schema — and call submit_draft again.'
          });
          messages.push({ role: 'user', content: results });
          continue;
        }
        const prov = provenance();
        prov.dropped = verdict.dropped;
        prov.errors = verdict.errors;
        prov.attempts = attempts;
        log(
          `${skill.slug}: refused after ${attempts} attempts: ${[...verdict.errors, ...verdict.dropped.map((d) => d.reason)].join('; ')}`
        );
        return finish(refusalDraft(skill, inputs, 'validation', prov, grounding));
      }

      if (!toolUses.length) {
        const text = content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n');
        const parsed = parseJsonObject(text);
        if (parsed && Array.isArray(parsed.sentences)) {
          messages.push({
            role: 'assistant',
            content: [{ type: 'tool_use', id: `text-${round}`, name: SUBMIT_TOOL, input: parsed }]
          });
          // Re-enter the submit path on the next round by simulating the call.
          toolUses.push({
            type: 'tool_use',
            id: `text-${round}`,
            name: SUBMIT_TOOL,
            input: parsed
          });
          messages.pop();
          messages.push({
            role: 'assistant',
            content: [{ type: 'tool_use', id: `text-${round}`, name: SUBMIT_TOOL, input: parsed }]
          });
          // Fall through by looping once more with the synthetic submission.
          const synthetic = await handleSynthetic(parsed, `text-${round}`);
          if (synthetic) return synthetic;
          continue;
        }
        if (response.stop_reason === 'max_tokens') {
          log(`${skill.slug}: the model hit max_tokens without submitting`);
          const prov = provenance();
          prov.attempts = attempts;
          return finish(refusalDraft(skill, inputs, 'provider-error', prov, grounding));
        }
        if (!submitNudged) {
          submitNudged = true;
          messages.push({
            role: 'user',
            content: [{ type: 'text', text: `Call ${SUBMIT_TOOL} now with the finished draft.` }]
          });
          continue;
        }
        const prov = provenance();
        prov.attempts = attempts;
        prov.errors = ['the model ended without submitting a draft'];
        return finish(refusalDraft(skill, inputs, 'validation', prov, grounding));
      }

      messages.push({ role: 'user', content: results });
    }

    const prov = provenance();
    prov.attempts = attempts;
    prov.errors = lastErrors.length ? lastErrors : ['round cap reached'];
    prov.dropped = lastDropped;
    return finish(refusalDraft(skill, inputs, 'validation', prov, grounding));

    // A draft the model wrote as text instead of calling submit_draft: validate
    // it the same way, without another model round.
    async function handleSynthetic(parsed, id) {
      attempts += 1;
      const candidate = { ...parsed, ...identity };
      const verdict = validateDraft(candidate, { skill, scopeIds, subject: inputs.subject });
      const allDropped =
        verdict.ok && !verdict.draft.sentences.length && verdict.dropped.length > 0;
      if (verdict.ok && !allDropped) {
        const prov = provenance();
        prov.dropped = verdict.dropped;
        prov.attempts = attempts;
        return finish({ ...verdict.draft, provenance: prov, status: 'draft' });
      }
      if (!validationRetried) {
        validationRetried = true;
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: id,
              content: JSON.stringify({
                error: 'validation-failed',
                problems: [
                  ...verdict.errors,
                  ...verdict.dropped.map((d) => `dropped "${d.text}" (${d.reason})`)
                ]
              }),
              is_error: true
            },
            {
              type: 'text',
              text: 'VALIDATION FEEDBACK: fix the problems and call submit_draft again.'
            }
          ]
        });
        return null;
      }
      const prov = provenance();
      prov.dropped = verdict.dropped;
      prov.errors = verdict.errors;
      prov.attempts = attempts;
      return finish(refusalDraft(skill, inputs, 'validation', prov, grounding));
    }
  }

  return {
    run,
    scope,
    scopeHash: (slug, inputs) => scope(slug, inputs).hash,
    skills: SKILLS,
    adapter,
    dataService,
    cache
  };
}

/**
 * The first JSON object in a text, or null.
 * @private
 */
function parseJsonObject(text) {
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

export default { create };
