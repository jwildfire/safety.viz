import { describe, expect, test } from 'vitest';
import {
  create,
  createClaudeAdapter,
  createDataService,
  createOpenAIAdapter,
  createStubAdapter
} from '../../../src/patientJourneyNarratives/index.js';
import {
  fromChatChoice,
  toChatMessages
} from '../../../src/patientJourneyNarratives/adapters/openai.js';
import { forbiddenMatch } from '../../../src/patientJourneyNarratives/validator.js';
import {
  DEMO_SETTINGS,
  DEMO_SUBJECT,
  loadDemoData
} from '../../evals/patient-journey-narratives/demo-data.mjs';

// The three provider adapters (#146, design §6). All three expose the same
// `messages({ system, messages, tools }) -> { content, stop_reason, usage,
// model }`, so the runtime never knows which provider answered: Claude over
// the Messages API, OpenAI over Chat Completions (translating the runtime's
// content blocks to and from function calling), and the offline stub the demo
// site and the CI eval gate run on. Every request here goes through an
// injected `fetch`; nothing patches a global. PJE-NARR-008.

/** A fetch that records each request and replays one JSON body. */
const fakeFetch = (body, { status = 200, ok = true } = {}) => {
  const requests = [];
  const impl = async (url, init) => {
    requests.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    return {
      ok,
      status,
      async text() {
        return typeof body === 'string' ? body : JSON.stringify(body);
      }
    };
  };
  impl.requests = requests;
  return impl;
};

describe('the Claude adapter (PJE-NARR-008)', () => {
  test('PJE-NARR-008: it POSTs the Messages API with the version and key headers and a body carrying model, max_tokens, system, messages and tools (#146)', async () => {
    const fetchImpl = fakeFetch({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 11, output_tokens: 22 },
      model: 'claude-opus-5-20260101'
    });
    const adapter = createClaudeAdapter({ apiKey: 'sk-test', fetch: fetchImpl });
    expect(adapter.name).toBe('claude');
    expect(adapter.model).toBe('claude-opus-5');

    const tools = [{ name: 'get_events', description: 'rows', input_schema: { type: 'object' } }];
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'draft it' }] }];
    const response = await adapter.messages({ system: 'SYSTEM', messages, tools });

    const [request] = fetchImpl.requests;
    expect(request.url).toBe('https://api.anthropic.com/v1/messages');
    expect(request.init.method).toBe('POST');
    expect(request.init.headers).toMatchObject({
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': 'sk-test'
    });
    expect(request.body).toMatchObject({
      model: 'claude-opus-5',
      max_tokens: 4096,
      system: 'SYSTEM',
      messages,
      tools
    });
    // The runtime's shape, whatever the provider called its fields.
    expect(response).toEqual({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      stop_details: null,
      usage: { input_tokens: 11, output_tokens: 22 },
      model: 'claude-opus-5-20260101'
    });
  });

  test('PJE-NARR-008: an effort model gets output_config.effort and no temperature; an explicit temperature replaces it (#146)', async () => {
    const effortFetch = fakeFetch({ content: [], stop_reason: 'end_turn' });
    await createClaudeAdapter({ apiKey: 'k', fetch: effortFetch }).messages({
      system: '',
      messages: [],
      tools: []
    });
    expect(effortFetch.requests[0].body.output_config).toEqual({ effort: 'medium' });
    expect(effortFetch.requests[0].body).not.toHaveProperty('temperature');

    const tunedFetch = fakeFetch({ content: [], stop_reason: 'end_turn' });
    await createClaudeAdapter({
      apiKey: 'k',
      effort: 'high',
      fetch: tunedFetch,
      model: 'claude-opus-5'
    }).messages({ system: '', messages: [], tools: [] });
    expect(tunedFetch.requests[0].body.output_config).toEqual({ effort: 'high' });

    // temperature is only sent when the caller sets it (an older model).
    const olderFetch = fakeFetch({ content: [], stop_reason: 'end_turn' });
    await createClaudeAdapter({
      apiKey: 'k',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.3,
      maxTokens: 512,
      fetch: olderFetch
    }).messages({ system: '', messages: [], tools: [] });
    expect(olderFetch.requests[0].body.temperature).toBe(0.3);
    expect(olderFetch.requests[0].body).not.toHaveProperty('output_config');
    expect(olderFetch.requests[0].body.max_tokens).toBe(512);
  });

  test('PJE-NARR-008: the credential comes from an awaited getToken(), and baseUrl and extra headers let a consumer app proxy the call (#146)', async () => {
    const fetchImpl = fakeFetch({ content: [], stop_reason: 'end_turn' });
    let asked = 0;
    const adapter = createClaudeAdapter({
      getToken: async () => {
        asked += 1;
        return 'tok-123';
      },
      baseUrl: 'https://proxy.example.com/api/',
      headers: { 'x-proxy-auth': 'let me in' },
      fetch: fetchImpl
    });
    await adapter.messages({ system: '', messages: [], tools: [] });
    await adapter.messages({ system: '', messages: [], tools: [] });

    expect(asked).toBe(2); // per request, so a short-lived token can refresh
    expect(fetchImpl.requests[0].url).toBe('https://proxy.example.com/api/v1/messages');
    expect(fetchImpl.requests[0].init.headers['x-api-key']).toBe('tok-123');
    expect(fetchImpl.requests[0].init.headers['x-proxy-auth']).toBe('let me in');

    await expect(
      createClaudeAdapter({ fetch: fetchImpl }).messages({ system: '', messages: [], tools: [] })
    ).rejects.toThrow(/no API key or getToken\(\) credential/);
  });

  test('PJE-NARR-008: a non-2xx response throws an Error carrying the status and the API’s message; a refusal passes through with its stop_details (#146)', async () => {
    const failing = createClaudeAdapter({
      apiKey: 'k',
      fetch: fakeFetch(
        { error: { message: 'rate limited, slow down' } },
        { ok: false, status: 429 }
      )
    });
    await expect(failing.messages({ system: '', messages: [], tools: [] })).rejects.toThrow(
      'claude adapter: HTTP 429: rate limited, slow down'
    );
    await failing.messages({ system: '', messages: [], tools: [] }).catch((error) => {
      expect(error.status).toBe(429);
    });

    const refusing = createClaudeAdapter({
      apiKey: 'k',
      fetch: fakeFetch({
        content: [],
        stop_reason: 'refusal',
        stop_details: { type: 'guard', reason: 'policy' },
        usage: { input_tokens: 3, output_tokens: 0 }
      })
    });
    const response = await refusing.messages({ system: '', messages: [], tools: [] });
    expect(response.stop_reason).toBe('refusal');
    expect(response.stop_details).toEqual({ type: 'guard', reason: 'policy' });
  });
});

describe('the OpenAI adapter (PJE-NARR-008)', () => {
  test('PJE-NARR-008: it requires a model id and POSTs Chat Completions with a Bearer header (#146)', async () => {
    expect(() => createOpenAIAdapter({ apiKey: 'k', fetch: fakeFetch({}) })).toThrow(
      'openai adapter: a model id is required'
    );

    const fetchImpl = fakeFetch({
      choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
      model: 'gpt-x-2026'
    });
    const adapter = createOpenAIAdapter({ apiKey: 'sk-o', model: 'gpt-x', fetch: fetchImpl });
    expect(adapter.name).toBe('openai');
    expect(adapter.model).toBe('gpt-x');

    const response = await adapter.messages({
      system: 'SYSTEM',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'draft it' }] }],
      tools: [{ name: 'get_events', description: 'rows', input_schema: { type: 'object' } }]
    });
    const [request] = fetchImpl.requests;
    expect(request.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(request.init.headers.authorization).toBe('Bearer sk-o');
    expect(request.body.model).toBe('gpt-x');
    expect(request.body.max_completion_tokens).toBe(4096);
    expect(request.body.tools).toEqual([
      {
        type: 'function',
        function: { name: 'get_events', description: 'rows', parameters: { type: 'object' } }
      }
    ]);
    expect(response).toEqual({
      content: [{ type: 'text', text: 'hello' }],
      stop_reason: 'end_turn',
      stop_details: null,
      usage: { input_tokens: 3, output_tokens: 4 },
      model: 'gpt-x-2026'
    });
  });

  test('PJE-NARR-008: toChatMessages turns the runtime’s blocks into system, user, assistant(tool_calls) and tool messages (#146)', () => {
    const chat = toChatMessages('SYSTEM', [
      { role: 'user', content: [{ type: 'text', text: 'first' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'reading a row' },
          { type: 'tool_use', id: 'call-1', name: 'get_source_row', input: { row_id: 'AE-1' } }
        ]
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call-1', content: '{"row_id":"AE-1"}' },
          { type: 'text', text: 'VALIDATION FEEDBACK: fix it.' }
        ]
      }
    ]);
    expect(chat).toEqual([
      { role: 'system', content: 'SYSTEM' },
      { role: 'user', content: 'first' },
      {
        role: 'assistant',
        content: 'reading a row',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'get_source_row', arguments: '{"row_id":"AE-1"}' }
          }
        ]
      },
      // The tool result comes before the user text of the same turn, as the
      // API requires it to answer the assistant's call.
      { role: 'tool', tool_call_id: 'call-1', content: '{"row_id":"AE-1"}' },
      { role: 'user', content: 'VALIDATION FEEDBACK: fix it.' }
    ]);

    // An assistant turn that is only a tool call carries a null content.
    const toolOnly = toChatMessages('', [
      { role: 'assistant', content: [{ type: 'tool_use', id: 'c', name: 'f', input: {} }] }
    ]);
    expect(toolOnly[0].content).toBeNull();
    // A plain string content is treated as text.
    expect(toChatMessages('', [{ role: 'user', content: 'plain' }])).toEqual([
      { role: 'user', content: 'plain' }
    ]);
  });

  test('PJE-NARR-008: fromChatChoice turns tool_calls back into tool_use blocks with parsed arguments and maps every finish_reason (#146)', () => {
    const parsed = fromChatChoice({
      message: {
        content: 'here',
        tool_calls: [
          {
            id: 'call-9',
            type: 'function',
            function: { name: 'submit_draft', arguments: '{"kind":"event-context"}' }
          }
        ]
      },
      finish_reason: 'tool_calls'
    });
    expect(parsed).toEqual({
      content: [
        { type: 'text', text: 'here' },
        { type: 'tool_use', id: 'call-9', name: 'submit_draft', input: { kind: 'event-context' } }
      ],
      stop_reason: 'tool_use'
    });

    // Arguments that are not JSON are surfaced, never thrown.
    const broken = fromChatChoice({
      message: { tool_calls: [{ id: 'z', function: { name: 'f', arguments: '{oops' } }] },
      finish_reason: 'stop'
    });
    expect(broken.content[0].input).toEqual({ __invalid_json: '{oops' });

    const mapping = {
      tool_calls: 'tool_use',
      length: 'max_tokens',
      content_filter: 'refusal',
      stop: 'end_turn',
      anything_else: 'end_turn'
    };
    for (const [finish, expected] of Object.entries(mapping)) {
      expect(
        fromChatChoice({ message: { content: 'x' }, finish_reason: finish }).stop_reason,
        finish
      ).toBe(expected);
    }
    expect(fromChatChoice(undefined)).toEqual({ content: [], stop_reason: 'end_turn' });
  });
});

describe('the stub adapter (PJE-NARR-008)', () => {
  const service = createDataService({ data: loadDemoData(), settings: DEMO_SETTINGS });
  const runs = [
    ['event-context', { subject: DEMO_SUBJECT, anchor_row_id: 'AE-973', window_days: 30 }],
    ['subject-summary', { subject: DEMO_SUBJECT }],
    ['lab-trajectory', { subject: DEMO_SUBJECT, test: 'Aspartate Aminotransferase' }],
    ['dose-journey', { subject: DEMO_SUBJECT }],
    ['disposition', { subject: DEMO_SUBJECT }]
  ];
  const generation = create({
    provider: 'stub',
    dataService: service,
    cache: false,
    log: () => {}
  });
  const withoutTimestamps = (draft) => ({
    ...draft,
    provenance: { ...draft.provenance, generated_at: null, started_at: null }
  });

  test('PJE-NARR-008: the stub is deterministic — two runs of the same inputs produce the same draft (#146)', async () => {
    const adapter = createStubAdapter();
    expect(adapter.name).toBe('stub');
    expect(adapter.model).toBe('stub-1');

    for (const [slug, inputs] of runs) {
      const first = await generation.run(slug, inputs);
      const second = await generation.run(slug, inputs);
      expect(first, slug).not.toBe(second); // the cache is off: both were composed
      expect(withoutTimestamps(first), slug).toEqual(withoutTimestamps(second));
    }
  });

  test('PJE-NARR-008: the stub makes exactly one extra tool call before submit_draft, so the runtime’s tool loop runs on every skill (#146)', async () => {
    const expected = {
      'event-context': ['get_context_window', 'get_source_row'],
      'subject-summary': ['get_subject_overview', 'get_dose_history'],
      'lab-trajectory': ['get_lab_series', 'get_source_row'],
      'dose-journey': ['get_dose_history', 'get_events'],
      disposition: ['get_events', 'get_subject_overview']
    };
    for (const [slug, inputs] of runs) {
      const draft = await generation.run(slug, inputs);
      expect(draft.provenance.tool_calls, slug).toEqual(expected[slug]);
      expect(draft.provenance.usage.calls, slug).toBe(2);
      expect(draft.provenance.attempts, slug).toBe(1);
      // Every extra call is one the skill declares.
      expect(generation.skills[slug].tools, slug).toContain(draft.provenance.tool_calls[1]);
    }

    // The extra call can be switched off; the stub then submits straight away.
    const plain = create({
      provider: 'stub',
      stub: { extraCall: false },
      dataService: service,
      cache: false,
      log: () => {}
    });
    const draft = await plain.run('event-context', runs[0][1]);
    expect(draft.provenance.tool_calls).toEqual(['get_context_window']);
    expect(draft.provenance.usage.calls).toBe(1);
  });

  test('PJE-NARR-008: every citation in every stub draft for the five skills resolves, and no sentence carries a forbidden construct (#146)', async () => {
    for (const [slug, inputs] of runs) {
      const draft = await generation.run(slug, inputs);
      expect(
        draft.flags.filter((flag) => flag.startsWith('refused:')),
        slug
      ).toEqual([]);
      expect(draft.provenance.dropped, slug).toEqual([]);
      expect(draft.sentences.length, slug).toBeGreaterThan(0);
      expect(forbiddenMatch(draft.summary), `${slug} summary`).toBeNull();
      for (const sentence of draft.sentences) {
        expect(forbiddenMatch(sentence.text), `${slug}: ${sentence.text}`).toBeNull();
        expect(sentence.citations.length, `${slug}: ${sentence.text}`).toBeGreaterThan(0);
        // Cited once each: the style guide forbids citing a row twice in one sentence.
        expect(new Set(sentence.citations).size, `${slug}: ${sentence.text}`).toBe(
          sentence.citations.length
        );
      }
    }
  });

  test('PJE-NARR-008: a request the stub cannot read comes back as text rather than a bad draft (#146)', async () => {
    const adapter = createStubAdapter();
    const response = await adapter.messages({
      system: '',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'not a narrative request' }] }],
      tools: []
    });
    expect(response.stop_reason).toBe('end_turn');
    expect(response.content).toEqual([{ type: 'text', text: 'stub: cannot read the request' }]);
    expect(response.model).toBe('stub-1');
  });
});
