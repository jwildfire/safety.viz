// The output validator of the narrative runtime (#146, design §9): what the
// LLM is not trusted with. Runs after every model submission: the skill's
// Draft schema, citation resolution against the rows the tools returned in
// this generation, the forbidden-phrase block from the style guide, and the
// sentence cap. Sentences whose citations do not all resolve are DROPPED and
// logged; a schema failure or a forbidden phrase is a hard failure the runtime
// retries once and then turns into a refusal draft.

import { validateSchema, sentenceCap } from './schema.js';
import { normalizeRowId } from './tools/index.js';
import { SHARED } from './skills.generated.js';

let compiled = null;
const forbiddenRegexes = () => {
  if (!compiled) compiled = SHARED.forbiddenPatterns.map((source) => new RegExp(source, 'i'));
  return compiled;
};

/**
 * The first forbidden construct a text matches, or null.
 * @param {string} text A sentence.
 * @param {RegExp[]} [patterns] The compiled forbidden patterns (default: the style guide's).
 * @returns {?string} The matched text.
 */
export function forbiddenMatch(text, patterns = forbiddenRegexes()) {
  for (const pattern of patterns) {
    const match = pattern.exec(String(text ?? ''));
    if (match) return match[0];
  }
  return null;
}

/**
 * Validate and clean a model-submitted draft.
 * @param {Object} draft What the model submitted through submit_draft.
 * @param {Object} options The generation context.
 * @param {Object} options.skill The compiled skill (slug, schema).
 * @param {Set<string>|string[]} options.scopeIds Every row_id the tools returned in this generation.
 * @param {string} [options.subject] The requested subject; the draft's must match.
 * @param {RegExp[]} [options.patterns] Forbidden patterns override (tests).
 * @returns {{ok: boolean, errors: string[], dropped: Array<{text: string, reason: string}>, draft: ?Object}} `errors` are hard failures; `dropped` the sentences removed; `draft` the cleaned draft (null on a hard failure).
 */
export function validateDraft(draft, { skill, scopeIds, subject, patterns } = {}) {
  const errors = [];
  const dropped = [];
  if (!draft || typeof draft !== 'object') {
    return { ok: false, errors: ['no draft object was submitted'], dropped, draft: null };
  }
  const schema = skill.schema;
  const verdict = validateSchema(draft, schema.definitions.Draft, schema);
  errors.push(...verdict.errors);
  if (draft.kind !== skill.slug) errors.push(`$.kind: expected "${skill.slug}"`);
  if (subject !== undefined && String(draft.subject) !== String(subject)) {
    errors.push(`$.subject: expected "${subject}"`);
  }
  if (errors.length) return { ok: false, errors, dropped, draft: null };

  const scope = new Set([...(scopeIds || [])].map(normalizeRowId));
  const regexes = patterns || forbiddenRegexes();
  const summaryHit = forbiddenMatch(draft.summary, regexes);
  if (summaryHit) errors.push(`$.summary: forbidden construct "${summaryHit}"`);

  const kept = [];
  draft.sentences.forEach((sentence, index) => {
    const hit = forbiddenMatch(sentence.text, regexes);
    if (hit) {
      errors.push(`$.sentences[${index}]: forbidden construct "${hit}"`);
      return;
    }
    const citations = [...new Set(sentence.citations.map(normalizeRowId))];
    const unresolved = citations.filter((id) => !scope.has(id));
    if (unresolved.length) {
      dropped.push({
        text: sentence.text,
        reason: `citation${unresolved.length === 1 ? '' : 's'} not in scope: ${unresolved.join(', ')}`
      });
      return;
    }
    kept.push({ ...sentence, citations });
  });
  if (errors.length) return { ok: false, errors, dropped, draft: null };

  const cap = sentenceCap(schema);
  let sentences = kept;
  if (cap !== null && sentences.length > cap) {
    for (const sentence of sentences.slice(cap)) {
      dropped.push({ text: sentence.text, reason: `over the cap of ${cap} sentences` });
    }
    sentences = sentences.slice(0, cap);
  }
  const flags = [
    ...new Set([].concat(draft.flags || []).map((flag) => String(flag).trim()))
  ].filter(Boolean);
  return {
    ok: true,
    errors: [],
    dropped,
    draft: { ...draft, sentences, flags, status: 'draft' }
  };
}
