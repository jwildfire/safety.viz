import { describe, expect, test } from 'vitest';
import {
  create,
  createDataService,
  inputHash,
  parseFirstMessage,
  refusalReason
} from '../../../src/patientJourneyNarratives/index.js';
import { validateSchema } from '../../../src/patientJourneyNarratives/schema.js';
import {
  DEMO_SETTINGS,
  DEMO_SUBJECT,
  loadDemoData
} from '../../evals/patient-journey-narratives/demo-data.mjs';

// The generation runtime of the AI narrative layer (#146, design §6): the
// grounding tool runs first and without a model, the model may call only the
// tools its skill declares (and only so many times), every row a tool returns
// joins the citation scope, a failed draft is fed back once and then refused,
// and the whole generation is keyed by skill@version + input hash so the same
// rows never cost a second call. PJE-NARR-003, 004, 006, 007.

const service = createDataService({ data: loadDemoData(), settings: DEMO_SETTINGS });
// The demo's opening anchor: ERYTHEMA on day 30 (tests/evals/.../demo-data.mjs).
const ANCHOR = 'AE-973';
const INPUTS = { subject: DEMO_SUBJECT, anchor_row_id: ANCHOR, window_days: 30 };

/**
 * A scripted adapter. `script(callNumber, messages)` returns the provider
 * response; every request is deep-copied into `calls` so a later round's
 * mutations of the runtime's message array cannot rewrite what was asked.
 */
const fakeAdapter = (script, { name = 'fake', model = 'fake-1' } = {}) => {
  const calls = [];
  return {
    name,
    model,
    calls,
    async messages({ system, messages, tools }) {
      calls.push(JSON.parse(JSON.stringify({ system, messages, tools })));
      return script(calls.length, messages);
    }
  };
};

/** A draft the validator accepts for event-context on the demo anchor. */
const goodDraft = (overrides = {}) => ({
  kind: 'event-context',
  subject: DEMO_SUBJECT,
  anchor: { domain: 'AE', row_id: ANCHOR, term: 'ERYTHEMA', start_day: 30 },
  window_days: 30,
  summary: 'ERYTHEMA on day 30, with con-meds active at onset.',
  sentences: [
    { text: 'ERYTHEMA is recorded from day 30, ongoing.', citations: [ANCHOR], confidence: 'high' }
  ],
  flags: [],
  ...overrides
});

const submit = (input, id = 'submit-1') => ({
  content: [{ type: 'tool_use', id, name: 'submit_draft', input }],
  stop_reason: 'tool_use',
  usage: { input_tokens: 10, output_tokens: 20 }
});

const generator = (adapter, options = {}) =>
  create({ adapter, dataService: service, cache: false, log: () => {}, ...options });

const toolResults = (call) =>
  call.messages.flatMap((message) => message.content || []).filter((b) => b.type === 'tool_result');

describe('grounding, hashing and the draft cache (PJE-NARR-003)', () => {
  test('PJE-NARR-003: the grounding tool runs first, without the model, and its rows are the ones the first message carries (#146)', async () => {
    const adapter = fakeAdapter(() => submit(goodDraft()));
    const draft = await generator(adapter).run('event-context', INPUTS);

    expect(draft.provenance.tool_calls[0]).toBe('get_context_window');
    expect(adapter.calls).toHaveLength(1);
    // The grounding call is already made when the model is first addressed.
    const first = adapter.calls[0].messages[0];
    expect(first.role).toBe('user');
    const payload = parseFirstMessage(first.content[0].text);
    expect(payload.skill).toBe('event-context');
    expect(payload.inputs).toEqual(INPUTS);
    expect(payload.grounding.anchor.row_id).toBe(ANCHOR);
    expect(payload.grounding.counts.conMeds).toBe(7);
    // The system prompt carries the skill, its version and the sentence cap.
    expect(adapter.calls[0].system).toContain('# Skill: event-context (version 1.0.0)');
    expect(adapter.calls[0].system).toContain('at most 6 sentences');
  });

  test('PJE-NARR-003: input_hash is sha256: plus 64 hex and equals inputHash({ skill, version, inputs, grounding }) (#146)', async () => {
    const generation = generator(fakeAdapter(() => submit(goodDraft())));
    const draft = await generation.run('event-context', INPUTS);
    const { skill, grounding, hash } = generation.scope('event-context', INPUTS);

    expect(draft.provenance.input_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(draft.provenance.input_hash).toBe(hash);
    expect(draft.provenance.input_hash).toBe(
      inputHash({ skill: 'event-context', version: skill.version, inputs: INPUTS, grounding })
    );
    expect(generation.scopeHash('event-context', INPUTS)).toBe(hash);
  });

  test('PJE-NARR-003: the same inputs hit the cache and return the identical draft; a different window is a different hash and a new call (#146)', async () => {
    const adapter = fakeAdapter(() => submit(goodDraft()));
    const generation = create({ adapter, dataService: service, log: () => {} });

    const first = await generation.run('event-context', INPUTS);
    const second = await generation.run('event-context', INPUTS);
    expect(second).toBe(first); // the same object, not a recomputed equal one
    expect(adapter.calls).toHaveLength(1);

    const narrower = { ...INPUTS, window_days: 10 };
    expect(generation.scopeHash('event-context', narrower)).not.toBe(
      generation.scopeHash('event-context', INPUTS)
    );
    const third = await generation.run('event-context', narrower);
    expect(third).not.toBe(first);
    expect(third.provenance.input_hash).not.toBe(first.provenance.input_hash);
    expect(adapter.calls).toHaveLength(2);
  });

  test('PJE-NARR-003: cache: false calls the adapter every time (#146)', async () => {
    const adapter = fakeAdapter(() => submit(goodDraft()));
    const generation = generator(adapter);
    const first = await generation.run('event-context', INPUTS);
    const second = await generation.run('event-context', INPUTS);
    expect(generation.cache).toBeNull();
    expect(second).not.toBe(first);
    expect(second.provenance.input_hash).toBe(first.provenance.input_hash);
    expect(adapter.calls).toHaveLength(2);
  });

  test('PJE-NARR-003: the cache key carries the adapter name and model, so two generators sharing a store never serve each other’s drafts (#146)', async () => {
    const store = new Map();
    const cache = { get: (key) => store.get(key), set: (key, value) => store.set(key, value) };
    const optionsFor = (model) => ({
      provider: 'stub',
      stub: { model },
      dataService: service,
      cache,
      log: () => {}
    });
    const a = await create(optionsFor('stub-A')).run('event-context', INPUTS);
    const b = await create(optionsFor('stub-B')).run('event-context', INPUTS);

    expect(a).not.toBe(b);
    expect(a.provenance.model).toBe('stub-A');
    expect(b.provenance.model).toBe('stub-B');
    expect(a.provenance.input_hash).toBe(b.provenance.input_hash);
    expect(store.size).toBe(2);
    const keys = [...store.keys()];
    expect(keys[0]).toBe(`event-context@1.0.0|${a.provenance.input_hash}|stub:stub-A`);
    expect(keys[1]).toBe(`event-context@1.0.0|${b.provenance.input_hash}|stub:stub-B`);
    // A third run on the first generator is served from the store.
    expect(await create(optionsFor('stub-A')).run('event-context', INPUTS)).toBe(a);
  });
});

describe('the tool loop is fenced (PJE-NARR-004)', () => {
  test('PJE-NARR-004: a tool the skill does not declare comes back as an is_error tool-not-available result, and the run still finishes (#146)', async () => {
    // get_dose_history is a real tool, but event-context does not declare it.
    const adapter = fakeAdapter((call) =>
      call === 1
        ? {
            content: [
              {
                type: 'tool_use',
                id: 'undeclared-1',
                name: 'get_dose_history',
                input: { usubjid: DEMO_SUBJECT }
              }
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 1, output_tokens: 1 }
          }
        : submit(goodDraft())
    );
    const draft = await generator(adapter).run('event-context', INPUTS);

    const [result] = toolResults(adapter.calls[1]);
    expect(result.tool_use_id).toBe('undeclared-1');
    expect(result.is_error).toBe(true);
    expect(JSON.parse(result.content)).toEqual({
      error: 'tool-not-available',
      message: 'get_dose_history is not available to this skill.'
    });
    // The refused call never ran, so it is not in the provenance either.
    expect(draft.provenance.tool_calls).toEqual(['get_context_window']);
    expect(refusalReason(draft)).toBeNull();
    expect(draft.sentences).toHaveLength(1);
  });

  test('PJE-NARR-004: a declared tool called past maxToolCalls comes back as a tool-call-cap error naming the cap (#146)', async () => {
    const adapter = fakeAdapter((call) =>
      call <= 4
        ? {
            content: [
              {
                type: 'tool_use',
                id: `read-${call}`,
                name: 'get_source_row',
                input: { row_id: 'AE-977', usubjid: DEMO_SUBJECT }
              }
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 1, output_tokens: 1 }
          }
        : submit(goodDraft())
    );
    const draft = await generator(adapter, { maxToolCalls: 2 }).run('event-context', INPUTS);

    // Two reads run; the third is capped. The grounding call is not counted.
    expect(draft.provenance.tool_calls).toEqual([
      'get_context_window',
      'get_source_row',
      'get_source_row'
    ]);
    const capped = toolResults(adapter.calls[adapter.calls.length - 1])
      .map((result) => JSON.parse(result.content))
      .filter((result) => result.error === 'tool-call-cap');
    expect(capped.length).toBeGreaterThan(0);
    expect(capped[0].message).toBe('The tool-call cap (2) is reached; submit the draft.');
    expect(toolResults(adapter.calls[adapter.calls.length - 1]).at(-1).is_error).toBe(true);
    expect(refusalReason(draft)).toBeNull();
  });

  test('PJE-NARR-004: a row a tool returned mid-run joins the citation scope; a row nobody fetched does not (#146)', async () => {
    // AE-977 (CHEST PAIN, day 111) is outside the ±30-day grounding window, so
    // the only way to cite it is to have read it with get_source_row.
    const adapter = fakeAdapter((call) =>
      call === 1
        ? {
            content: [
              {
                type: 'tool_use',
                id: 'read-1',
                name: 'get_source_row',
                input: { row_id: 'AE-977', usubjid: DEMO_SUBJECT }
              }
            ],
            stop_reason: 'tool_use',
            usage: { input_tokens: 1, output_tokens: 1 }
          }
        : submit(
            goodDraft({
              sentences: [
                {
                  text: 'The last adverse event recorded is CHEST PAIN on day 111.',
                  citations: ['AE-977'],
                  confidence: 'high'
                },
                {
                  text: 'A sentence citing a row no tool returned.',
                  citations: ['LB-9999'],
                  confidence: 'low'
                }
              ]
            })
          )
    );
    const draft = await generator(adapter).run('event-context', INPUTS);

    expect(draft.provenance.tool_calls).toEqual(['get_context_window', 'get_source_row']);
    expect(draft.sentences.map((sentence) => sentence.citations)).toEqual([['AE-977']]);
    expect(draft.provenance.dropped).toEqual([
      {
        text: 'A sentence citing a row no tool returned.',
        reason: 'citation not in scope: LB-9999'
      }
    ]);
  });
});

describe('validation feedback and refusals (PJE-NARR-006)', () => {
  test('PJE-NARR-006: a forbidden phrase is fed back once and the clean second submission is the draft that ships (#146)', async () => {
    const adapter = fakeAdapter((call) =>
      call === 1
        ? submit(
            goodDraft({
              sentences: [
                {
                  text: 'The rash was caused by the study drug.',
                  citations: [ANCHOR],
                  confidence: 'high'
                }
              ]
            }),
            'submit-bad'
          )
        : submit(goodDraft(), 'submit-clean')
    );
    const draft = await generator(adapter).run('event-context', INPUTS);

    expect(adapter.calls).toHaveLength(2);
    expect(draft.provenance.attempts).toBe(2);
    expect(refusalReason(draft)).toBeNull();
    expect(draft.sentences.map((sentence) => sentence.text)).toEqual([
      'ERYTHEMA is recorded from day 30, ongoing.'
    ]);

    // The second request carries the rejection: the failed submission's own
    // tool_result, then the feedback line.
    const secondRequest = adapter.calls[1].messages;
    const rejection = secondRequest
      .flatMap((message) => message.content || [])
      .find((block) => block.type === 'tool_result' && block.tool_use_id === 'submit-bad');
    expect(rejection.is_error).toBe(true);
    expect(JSON.parse(rejection.content).problems.join(' ')).toContain('forbidden construct');
    const feedback = secondRequest
      .flatMap((message) => message.content || [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    expect(feedback).toContain('VALIDATION FEEDBACK');
  });

  test('PJE-NARR-006: two bad submissions refuse with refused:validation and the errors in provenance (#146)', async () => {
    const adapter = fakeAdapter(() =>
      submit(goodDraft({ summary: 'This confirms drug-induced liver injury.' }))
    );
    const draft = await generator(adapter).run('event-context', INPUTS);

    expect(adapter.calls).toHaveLength(2);
    expect(draft.flags).toEqual(['refused:validation']);
    expect(draft.sentences).toEqual([]);
    expect(draft.summary).toBe('The draft did not pass validation and was withheld.');
    expect(draft.provenance.attempts).toBe(2);
    expect(draft.provenance.errors.join(' ')).toContain('$.summary: forbidden construct');
    // A refusal is a complete, reproducible draft.
    expect(draft.provenance.input_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(draft.status).toBe('draft');
  });

  test('PJE-NARR-006: an anchor that does not resolve refuses before the model is addressed at all (#146)', async () => {
    const adapter = fakeAdapter(() => {
      throw new Error('the adapter must not be called');
    });
    const draft = await generator(adapter).run('event-context', {
      subject: DEMO_SUBJECT,
      anchor_row_id: 'AE-99999'
    });

    expect(adapter.calls).toHaveLength(0);
    expect(draft.flags).toEqual(['refused:anchor-not-found']);
    expect(draft.summary).toBe('The anchored event could not be found in the record.');
    expect(draft.anchor).toEqual({
      domain: 'AE',
      row_id: 'AE-99999',
      term: '',
      start_day: null
    });
    expect(draft.provenance.tool_calls).toEqual(['get_context_window']);
  });

  test('PJE-NARR-006: a lab test the record does not hold refuses with refused:insufficient-data, unread by the model (#146)', async () => {
    const adapter = fakeAdapter(() => {
      throw new Error('the adapter must not be called');
    });
    const draft = await generator(adapter).run('lab-trajectory', {
      subject: DEMO_SUBJECT,
      test: 'Creatinine'
    });

    expect(adapter.calls).toHaveLength(0);
    expect(draft.flags).toEqual(['refused:insufficient-data']);
    expect(draft.summary).toBe('Not enough recorded data to draft a narrative.');
    expect(draft.kind).toBe('lab-trajectory');
    expect(draft.test).toBe('Creatinine');
  });

  test('PJE-NARR-006: an adapter that throws refuses with refused:provider-error and keeps the message (#146)', async () => {
    const adapter = {
      name: 'broken',
      model: 'broken-1',
      calls: 0,
      async messages() {
        this.calls += 1;
        throw new Error('network down');
      }
    };
    const draft = await generator(adapter).run('event-context', INPUTS);

    expect(adapter.calls).toBe(1);
    expect(draft.flags).toEqual(['refused:provider-error']);
    expect(draft.summary).toBe('The narrative service did not answer.');
    expect(draft.provenance.error).toBe('network down');
  });

  test('PJE-NARR-006: a refusal stop reason refuses with refused:provider-refusal and keeps the provider’s stop_details (#146)', async () => {
    const adapter = fakeAdapter(() => ({
      content: [],
      stop_reason: 'refusal',
      stop_details: { type: 'guard', reason: 'policy' },
      usage: { input_tokens: 4, output_tokens: 0 }
    }));
    const draft = await generator(adapter).run('event-context', INPUTS);

    expect(adapter.calls).toHaveLength(1);
    expect(draft.flags).toEqual(['refused:provider-refusal']);
    expect(draft.summary).toBe('The narrative service declined this request.');
    expect(draft.provenance.stop_details).toEqual({ type: 'guard', reason: 'policy' });
    expect(draft.provenance.usage.input_tokens).toBe(4);
  });

  test('PJE-NARR-006: a draft returned as text JSON instead of a submit_draft call is accepted and validated the same way (#146)', async () => {
    const adapter = fakeAdapter(() => ({
      content: [
        { type: 'text', text: `Here is the draft:\n${JSON.stringify(goodDraft())}\nThanks.` }
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 7, output_tokens: 9 }
    }));
    const draft = await generator(adapter).run('event-context', INPUTS);

    expect(adapter.calls).toHaveLength(1); // no extra round is spent
    expect(refusalReason(draft)).toBeNull();
    expect(draft.provenance.attempts).toBe(1);
    expect(draft.sentences.map((sentence) => sentence.text)).toEqual([
      'ERYTHEMA is recorded from day 30, ongoing.'
    ]);
  });

  test('PJE-NARR-006: plain prose twice, with no draft anywhere in it, refuses with refused:validation (#146)', async () => {
    const adapter = fakeAdapter(() => ({
      content: [{ type: 'text', text: 'The record looks unremarkable to me.' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 2, output_tokens: 3 }
    }));
    const draft = await generator(adapter).run('event-context', INPUTS);

    expect(adapter.calls).toHaveLength(2); // one nudge, then the refusal
    expect(adapter.calls[1].messages.at(-1).content[0].text).toBe(
      'Call submit_draft now with the finished draft.'
    );
    expect(draft.flags).toEqual(['refused:validation']);
    expect(draft.provenance.errors).toEqual(['the model ended without submitting a draft']);
  });

  test('PJE-NARR-006: an aborted signal refuses with refused:cancelled before the provider is called (#146)', async () => {
    const adapter = fakeAdapter(() => {
      throw new Error('the adapter must not be called');
    });
    const controller = new AbortController();
    controller.abort();
    const draft = await generator(adapter).run('event-context', INPUTS, {
      signal: controller.signal
    });

    expect(adapter.calls).toHaveLength(0);
    expect(draft.flags).toEqual(['refused:cancelled']);
    expect(draft.sentences).toEqual([]);
    expect(draft.status).toBe('draft');
  });

  // REFUSAL_TEXT.cancelled is deliberately '' (shared/refusal-catalog.md: the
  // card is removed), and refusalDraft keeps it (#146).
  test('PJE-NARR-006: a cancelled draft carries the catalog’s empty summary, not the generic withheld text (#146)', async () => {
    const controller = new AbortController();
    controller.abort();
    const draft = await generator(fakeAdapter(() => submit(goodDraft()))).run(
      'event-context',
      INPUTS,
      { signal: controller.signal }
    );
    expect(draft.flags).toEqual(['refused:cancelled']);
    expect(draft.summary).toBe('');
  });
});

describe('provenance completeness (PJE-NARR-007)', () => {
  test('PJE-NARR-007: a stub draft carries model, skill@version, input hash, ISO timestamp, the tool calls in order, adapter, usage, attempts and an empty dropped list (#146)', async () => {
    const generation = create({ provider: 'stub', dataService: service, log: () => {} });
    const draft = await generation.run('event-context', INPUTS);
    const { provenance } = draft;

    expect(provenance.model).toBe('stub-1');
    expect(provenance.adapter).toBe('stub');
    expect(provenance.skill).toMatch(/^[a-z-]+@\d+\.\d+\.\d+$/);
    expect(provenance.skill).toBe('event-context@1.0.0');
    expect(provenance.input_hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(new Date(provenance.generated_at).toISOString()).toBe(provenance.generated_at);
    expect(new Date(provenance.started_at).toISOString()).toBe(provenance.started_at);
    // The grounding call first, then the one extra read the stub makes.
    expect(provenance.tool_calls).toEqual(['get_context_window', 'get_source_row']);
    expect(provenance.attempts).toBe(1);
    expect(provenance.dropped).toEqual([]);
    expect(Object.keys(provenance.usage).sort()).toEqual([
      'calls',
      'input_tokens',
      'output_tokens'
    ]);
    expect(provenance.usage.calls).toBe(2); // one tool round, one submission
    expect(typeof provenance.usage.input_tokens).toBe('number');
    expect(typeof provenance.usage.output_tokens).toBe('number');
    expect(draft.status).toBe('draft');
    expect(refusalReason(draft)).toBeNull();
  });

  test('PJE-NARR-007: the finished draft validates against the skill’s definitions.Output (#146)', async () => {
    const generation = create({ provider: 'stub', dataService: service, log: () => {} });
    const runs = [
      ['event-context', INPUTS],
      ['subject-summary', { subject: DEMO_SUBJECT }],
      ['lab-trajectory', { subject: DEMO_SUBJECT, test: 'Aspartate Aminotransferase' }],
      ['dose-journey', { subject: DEMO_SUBJECT }],
      ['disposition', { subject: DEMO_SUBJECT }]
    ];
    for (const [slug, inputs] of runs) {
      const draft = await generation.run(slug, inputs);
      const skill = generation.skills[slug];
      const verdict = validateSchema(draft, skill.schema.definitions.Output, skill.schema);
      expect(verdict.errors, slug).toEqual([]);
      expect(verdict.ok, slug).toBe(true);
      expect(draft.kind, slug).toBe(slug);
      expect(draft.subject, slug).toBe(DEMO_SUBJECT);
    }
  });

  test('PJE-NARR-007: usage sums the provider’s token counters across every call of a generation (#146)', async () => {
    const adapter = fakeAdapter(
      (call) =>
        call === 1
          ? {
              content: [
                {
                  type: 'tool_use',
                  id: 'read-1',
                  name: 'get_source_row',
                  input: { row_id: ANCHOR, usubjid: DEMO_SUBJECT }
                }
              ],
              stop_reason: 'tool_use',
              usage: { input_tokens: 100, output_tokens: 5 }
            }
          : submit(goodDraft()) // 10 in, 20 out
    );
    const draft = await generator(adapter).run('event-context', INPUTS);
    expect(draft.provenance.usage).toEqual({ input_tokens: 110, output_tokens: 25, calls: 2 });
  });

  test('PJE-NARR-007: an unknown skill throws, and inputs that miss the skill’s Input schema throw before any call (#146)', async () => {
    const adapter = fakeAdapter(() => submit(goodDraft()));
    const generation = generator(adapter);
    await expect(generation.run('no-such-skill', INPUTS)).rejects.toThrow(/unknown skill/);
    // The renderer's camelCase slot name resolves to the same skill.
    await expect(generation.run('eventContext', INPUTS)).resolves.toMatchObject({
      kind: 'event-context'
    });
    await expect(
      generation.run('event-context', { subject: DEMO_SUBJECT, anchor_row_id: 'nope' })
    ).rejects.toThrow(/invalid inputs for event-context/);
  });
});
