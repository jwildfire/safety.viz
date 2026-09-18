import { describe, expect, test } from 'vitest';
import { SKILLS } from '../../../src/patientJourneyNarratives/skills.generated.js';
import { forbiddenMatch, validateDraft } from '../../../src/patientJourneyNarratives/validator.js';

// The output validator (#146, design §9): what the model is not trusted with.
// A schema violation, a forbidden construct or the wrong subject is a HARD
// failure (the runtime retries once, then refuses); a sentence whose citations
// do not all resolve is DROPPED with its reason, because the rest of the draft
// is still true; the sentence cap truncates; and `status` is never the model's
// to set. PJE-NARR-005.

const skill = SKILLS['event-context'];
const SUBJECT = 'S1';
const SCOPE = new Set(['AE-1', 'CM-2', 'LB-3', 'DOSE-4']);

const sentence = (text, citations = ['AE-1'], confidence = 'high') => ({
  text,
  citations,
  confidence
});

const draftOf = (overrides = {}) => ({
  kind: 'event-context',
  subject: SUBJECT,
  anchor: { domain: 'AE', row_id: 'AE-1', term: 'RASH', start_day: 30 },
  window_days: 30,
  summary: 'RASH on day 30: 1 con-med active, 1 abnormal lab.',
  sentences: [sentence('RASH is recorded from day 30, with no end date recorded.')],
  flags: [],
  ...overrides
});

const check = (draft, options = {}) =>
  validateDraft(draft, { skill, scopeIds: SCOPE, subject: SUBJECT, ...options });

describe('hard failures (PJE-NARR-005)', () => {
  test('PJE-NARR-005: a schema violation is a hard error and no draft comes back (#146)', () => {
    // A confidence the enum does not allow, a summary past maxLength, a
    // citation that is not a row id, and a missing required property.
    const cases = [
      [draftOf({ sentences: [sentence('A sentence.', ['AE-1'], 'certain')] }), '$.sentences[0]'],
      [draftOf({ summary: 'x'.repeat(241) }), '$.summary'],
      [draftOf({ sentences: [sentence('A sentence.', ['not-an-id'])] }), '$.sentences[0]'],
      [draftOf({ sentences: [sentence('A sentence.', [])] }), '$.sentences[0]'],
      [draftOf({ window_days: -1 }), '$.window_days'],
      [(({ summary, ...rest }) => rest)(draftOf()), 'missing required "summary"']
    ];
    for (const [draft, needle] of cases) {
      const verdict = check(draft);
      expect(verdict.ok, needle).toBe(false);
      expect(verdict.draft, needle).toBeNull();
      expect(verdict.errors.join(' | '), needle).toContain(needle);
    }
    // A property the Draft schema does not name is refused too (the schemas
    // close additionalProperties, so the model cannot smuggle prose through).
    expect(check(draftOf({ status: 'final' })).errors.join(' ')).toContain(
      'unexpected property "status"'
    );
    expect(check(null)).toEqual({
      ok: false,
      errors: ['no draft object was submitted'],
      dropped: [],
      draft: null
    });
  });

  test('PJE-NARR-005: a forbidden phrase is a hard error naming the match, in a sentence and in the summary alike (#146)', () => {
    const forbidden = [
      ['The rash was caused by the study drug.', 'caused'],
      ['ALT rose, due to the con-med.', 'due to'],
      ['The dose should be reduced.', 'should'],
      ['A male participant received the dose.', 'male'],
      // Re-identification: the first pattern that matches is the one reported.
      ['A 54-year-old participant received the dose.', 'year-old']
    ];
    for (const [text, match] of forbidden) {
      const verdict = check(draftOf({ sentences: [sentence(text)] }));
      expect(verdict.ok, text).toBe(false);
      expect(verdict.draft, text).toBeNull();
      expect(verdict.errors, text).toEqual([`$.sentences[0]: forbidden construct "${match}"`]);
      // A forbidden sentence is rejected outright, never quietly dropped.
      expect(verdict.dropped, text).toEqual([]);

      const onSummary = check(draftOf({ summary: text }));
      expect(onSummary.ok, `summary: ${text}`).toBe(false);
      expect(onSummary.errors[0], `summary: ${text}`).toBe(
        `$.summary: forbidden construct "${match}"`
      );
    }

    // The error points at the sentence that carried it.
    const mixed = check(
      draftOf({
        sentences: [
          sentence('RASH is recorded from day 30.'),
          sentence('The rash led to the dose reduction.')
        ]
      })
    );
    expect(mixed.errors).toEqual(['$.sentences[1]: forbidden construct "led to"']);
  });

  test('PJE-NARR-005: a kind or subject that is not the one requested is a hard error (#146)', () => {
    expect(check(draftOf({ kind: 'lab-trajectory' })).errors.join(' ')).toContain(
      '$.kind: expected "event-context"'
    );
    const wrongSubject = check(draftOf({ subject: 'S2' }));
    expect(wrongSubject.ok).toBe(false);
    expect(wrongSubject.errors).toContain('$.subject: expected "S1"');
    // Without a requested subject the draft's own value stands.
    expect(check(draftOf({ subject: 'S2' }), { subject: undefined }).ok).toBe(true);
  });
});

describe('dropped sentences, the cap and cleaning (PJE-NARR-005)', () => {
  test('PJE-NARR-005: a sentence whose citation is not in scope is dropped with the reason, and the rest of the draft survives (#146)', () => {
    const verdict = check(
      draftOf({
        sentences: [
          sentence('RASH is recorded from day 30.', ['AE-1']),
          sentence('IBUPROFEN was active at onset.', ['CM-99']),
          sentence('Two rows, one of them unknown.', ['LB-3', 'LB-77'])
        ]
      })
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.draft.sentences.map((entry) => entry.text)).toEqual([
      'RASH is recorded from day 30.'
    ]);
    expect(verdict.dropped).toEqual([
      { text: 'IBUPROFEN was active at onset.', reason: 'citation not in scope: CM-99' },
      { text: 'Two rows, one of them unknown.', reason: 'citation not in scope: LB-77' }
    ]);

    // Several unresolved ids are all named, pluralised.
    const many = check(draftOf({ sentences: [sentence('Nothing resolves.', ['CM-98', 'CM-99'])] }));
    expect(many.dropped[0].reason).toBe('citations not in scope: CM-98, CM-99');
    expect(many.draft.sentences).toEqual([]);
  });

  test('PJE-NARR-005: a submission longer than the skill’s sentence cap does not reach the reviewer (#146)', () => {
    const cap = skill.schema.definitions.Draft.properties.sentences.maxItems;
    expect(cap).toBe(6);
    const sentences = Array.from({ length: cap }, (unused, index) =>
      sentence(`Sentence number ${index + 1}.`)
    );
    expect(check(draftOf({ sentences })).ok).toBe(true);

    const verdict = check(draftOf({ sentences: [...sentences, sentence('One too many.')] }));
    expect(verdict.ok).toBe(true);
    expect(verdict.draft.sentences).toHaveLength(cap);
    expect(verdict.dropped).toEqual([
      { text: 'One too many.', reason: `over the cap of ${cap} sentences` }
    ]);
  });

  // The cap is enforced by truncation BEFORE the schema check (design §7), so
  // the extra sentences are logged with the cap as their reason (#146).
  test('PJE-NARR-005: sentences past the cap are truncated and each extra one is dropped with the cap as its reason (#146)', () => {
    const sentences = Array.from({ length: 6 }, (unused, index) =>
      sentence(`Sentence number ${index + 1}.`)
    );
    const capped = {
      ...skill,
      schema: { ...skill.schema, definitions: capOf(skill, 2) }
    };
    const verdict = validateDraft(draftOf({ sentences }), {
      skill: capped,
      scopeIds: SCOPE,
      subject: SUBJECT
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.draft.sentences.map((entry) => entry.text)).toEqual([
      'Sentence number 1.',
      'Sentence number 2.'
    ]);
    expect(verdict.dropped).toEqual([
      { text: 'Sentence number 3.', reason: 'over the cap of 2 sentences' },
      { text: 'Sentence number 4.', reason: 'over the cap of 2 sentences' },
      { text: 'Sentence number 5.', reason: 'over the cap of 2 sentences' },
      { text: 'Sentence number 6.', reason: 'over the cap of 2 sentences' }
    ]);
  });

  test('PJE-NARR-005: citations are normalised and de-duplicated, flags are trimmed and status is forced to draft (#146)', () => {
    const verdict = check(
      draftOf({
        sentences: [
          sentence('The anchor row, cited twice over.', ['AE:1', 'AE-1']),
          sentence('The dose change.', ['DOSE:4', 'DOSE-4'])
        ],
        flags: ['  sae ', 'sae', '', 'ends-unrecorded']
      })
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.dropped).toEqual([]);
    expect(verdict.draft.sentences.map((entry) => entry.citations)).toEqual([['AE-1'], ['DOSE-4']]);
    expect(verdict.draft.flags).toEqual(['sae', 'ends-unrecorded']);
    // The model never sets `status`; the validator does.
    expect(verdict.draft.status).toBe('draft');
    // The scope itself is normalised, so a scope given in the colon spelling
    // still resolves a dash-spelled citation.
    const colonScope = check(draftOf({ sentences: [sentence('The lab point.', ['LB-3'])] }), {
      scopeIds: ['lb:3']
    });
    expect(colonScope.ok).toBe(true);
    expect(colonScope.dropped).toEqual([]);
  });

  test('PJE-NARR-005: forbiddenMatch returns the matched construct, or null, and takes a pattern override (#146)', () => {
    expect(forbiddenMatch('The event was caused by the drug.')).toBe('caused');
    expect(forbiddenMatch('CAUSED — case does not matter.')).toBe('CAUSED');
    expect(forbiddenMatch('The rash is temporally associated with the con-med.')).toBeNull();
    expect(forbiddenMatch('')).toBeNull();
    expect(forbiddenMatch(null)).toBeNull();
    expect(forbiddenMatch('A perfectly fine sentence.', [/\bfine\b/i])).toBe('fine');
    // The override is what the validator uses, so a test can pin its own block.
    const verdict = check(draftOf({ sentences: [sentence('A perfectly fine sentence.')] }), {
      patterns: [/\bfine\b/i]
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toEqual(['$.sentences[0]: forbidden construct "fine"']);
  });
});

/**
 * The skill's definitions with a different sentence cap, so the truncation
 * path can be reached without rewriting the committed schema.
 */
function capOf(source, maxItems) {
  return {
    ...source.schema.definitions,
    Draft: {
      ...source.schema.definitions.Draft,
      properties: {
        ...source.schema.definitions.Draft.properties,
        sentences: { ...source.schema.definitions.Draft.properties.sentences, maxItems }
      }
    }
  };
}

describe('quoted record wording (PJE-NARR-005)', () => {
  test("PJE-NARR-005: forbidden wording inside a double-quoted span is the record's claim and passes; the same words unquoted fail (#146)", async () => {
    const { forbiddenMatch } = await import('../../../src/patientJourneyNarratives/validator.js');
    expect(
      forbiddenMatch('The disposition record reads "PMD DECISION DUE TO AE\'S" on day 40.')
    ).toBeNull();
    expect(forbiddenMatch('The disposition was due to an adverse event.')).toBe('due to');
    expect(forbiddenMatch('“Discontinued due to AE” is the recorded term.')).toBeNull();
  });
});
