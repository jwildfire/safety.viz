// The OpenAI adapter of the narrative runtime (#146, Phase 2): the same
// `messages()` interface as the Claude adapter, over the Chat Completions
// endpoint by raw HTTP. The runtime's message shape is the provider-neutral
// content-block form (text / tool_use / tool_result); this file translates
// it to and from the function-calling shape. `model` has no default: name
// the model you have access to.

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Translate the runtime's content-block messages to Chat Completions messages.
 * @private
 */
export function toChatMessages(system, messages) {
  const out = [];
  if (system) out.push({ role: 'system', content: system });
  for (const message of messages) {
    const blocks = Array.isArray(message.content)
      ? message.content
      : [{ type: 'text', text: String(message.content ?? '') }];
    if (message.role === 'assistant') {
      const text = blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      const calls = blocks
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          type: 'function',
          function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) }
        }));
      const entry = { role: 'assistant', content: text || null };
      if (calls.length) entry.tool_calls = calls;
      out.push(entry);
      continue;
    }
    const results = blocks.filter((block) => block.type === 'tool_result');
    for (const block of results) {
      out.push({
        role: 'tool',
        tool_call_id: block.tool_use_id,
        content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
      });
    }
    const text = blocks
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    if (text) out.push({ role: 'user', content: text });
  }
  return out;
}

/**
 * Translate a Chat Completions choice back to the runtime's content blocks.
 * @private
 */
export function fromChatChoice(choice) {
  const message = choice?.message || {};
  const content = [];
  if (message.content) content.push({ type: 'text', text: String(message.content) });
  for (const call of message.tool_calls || []) {
    let input = {};
    try {
      input = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
    } catch {
      input = { __invalid_json: call.function?.arguments ?? '' };
    }
    content.push({ type: 'tool_use', id: call.id, name: call.function?.name, input });
  }
  const finish = choice?.finish_reason;
  const stop_reason =
    finish === 'tool_calls'
      ? 'tool_use'
      : finish === 'length'
        ? 'max_tokens'
        : finish === 'content_filter'
          ? 'refusal'
          : 'end_turn';
  return { content, stop_reason };
}

/**
 * Create an OpenAI adapter.
 * @param {Object} options Adapter options: `apiKey` or `getToken`, `baseUrl` (default https://api.openai.com), `model` (required), `maxTokens` (4096), `temperature` (0.2), `headers`, `fetch`.
 * @returns {{name: string, model: string, messages: Function}} The adapter.
 */
export function createOpenAIAdapter(options = {}) {
  const {
    apiKey = null,
    getToken = null,
    baseUrl = 'https://api.openai.com',
    model,
    maxTokens = 4096,
    temperature = 0.2,
    headers = {},
    fetch: fetchImpl = typeof fetch === 'function' ? fetch : null
  } = options;
  if (!model) throw new Error('openai adapter: a model id is required');
  if (!fetchImpl) throw new Error('openai adapter: no fetch implementation available');

  async function credential() {
    if (typeof getToken === 'function') return getToken();
    return apiKey;
  }

  return {
    name: 'openai',
    model,
    async messages({ system, messages, tools = [], model: modelOverride, signal } = {}) {
      const key = await credential();
      if (!key) throw new Error('openai adapter: no API key or getToken() credential');
      const useModel = modelOverride || model;
      const body = {
        model: useModel,
        max_completion_tokens: maxTokens,
        messages: toChatMessages(system, messages),
        tools: tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }
        }))
      };
      if (typeof temperature === 'number') body.temperature = temperature;
      const requestHeaders = {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
        ...headers
      };
      void isBrowser;
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body),
        signal
      });
      const text = await response.text();
      let data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
      if (!response.ok) {
        const message = data?.error?.message || text || `HTTP ${response.status}`;
        const error = new Error(`openai adapter: HTTP ${response.status}: ${message}`);
        error.status = response.status;
        throw error;
      }
      const { content, stop_reason } = fromChatChoice(data?.choices?.[0]);
      return {
        content,
        stop_reason,
        stop_details: null,
        usage: {
          input_tokens: data?.usage?.prompt_tokens ?? 0,
          output_tokens: data?.usage?.completion_tokens ?? 0
        },
        model: data?.model || useModel
      };
    }
  };
}
