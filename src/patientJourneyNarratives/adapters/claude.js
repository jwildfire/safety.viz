// The Claude adapter of the narrative runtime (#146, design §6): the one
// adapter interface, `messages({ system, messages, tools, model }) →
// { content, stop_reason, usage, model }`, over the Messages API by raw
// HTTP. Raw HTTP on purpose: this runs inside a chart library's browser
// bundle, which carries one dependency (Chart.js) and cannot afford an SDK;
// `baseUrl` and `getToken()` let a consumer app proxy through its own server
// (no endpoint is baked in beyond the public default), and the browser
// direct-access header is sent only when running in a browser.
//
// Sampling: `temperature` is REJECTED (HTTP 400) by Claude Opus 5, Sonnet 5
// and the Fable models, which take `output_config.effort` instead; the
// adapter therefore sends `temperature` only when the caller sets it
// explicitly (for an older model) and sends `effort` by default.

const DEFAULT_MODEL = 'claude-opus-5';
const API_VERSION = '2023-06-01';
const EFFORT_MODELS = /claude-(opus-5|opus-4-[678]|sonnet-5|sonnet-4-6|fable|mythos)/;

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/**
 * Create a Claude adapter.
 * @param {Object} [options] Adapter options.
 * @param {string} [options.apiKey] An API key (browser demos; consumer apps should prefer `getToken`).
 * @param {() => (string|Promise<string>)} [options.getToken] Returns the credential to send; called per request.
 * @param {string} [options.baseUrl='https://api.anthropic.com'] The API origin, or a consumer app's proxy.
 * @param {string} [options.model='claude-opus-5'] The model id.
 * @param {number} [options.maxTokens=4096] Hard output cap per call.
 * @param {string} [options.effort='medium'] `output_config.effort` for the models that take it.
 * @param {number} [options.temperature] Sent only when set; rejected by the current models.
 * @param {Object} [options.headers] Extra headers (a proxy's own auth, for example).
 * @param {Function} [options.fetch] A fetch implementation (tests; Node without a global fetch).
 * @returns {{name: string, model: string, messages: Function}} The adapter.
 */
export function createClaudeAdapter(options = {}) {
  const {
    apiKey = null,
    getToken = null,
    baseUrl = 'https://api.anthropic.com',
    model = DEFAULT_MODEL,
    maxTokens = 4096,
    effort = 'medium',
    temperature,
    headers = {},
    fetch: fetchImpl = typeof fetch === 'function' ? fetch : null
  } = options;
  if (!fetchImpl) throw new Error('claude adapter: no fetch implementation available');

  async function credential() {
    if (typeof getToken === 'function') return getToken();
    return apiKey;
  }

  return {
    name: 'claude',
    model,
    async messages({ system, messages, tools = [], model: modelOverride, signal } = {}) {
      const key = await credential();
      if (!key) throw new Error('claude adapter: no API key or getToken() credential');
      const useModel = modelOverride || model;
      const body = {
        model: useModel,
        max_tokens: maxTokens,
        system,
        messages,
        tools
      };
      if (typeof temperature === 'number') body.temperature = temperature;
      else if (effort && EFFORT_MODELS.test(useModel)) body.output_config = { effort };
      const requestHeaders = {
        'content-type': 'application/json',
        'anthropic-version': API_VERSION,
        'x-api-key': key,
        ...headers
      };
      if (isBrowser()) requestHeaders['anthropic-dangerous-direct-browser-access'] = 'true';
      const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
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
        const error = new Error(`claude adapter: HTTP ${response.status}: ${message}`);
        error.status = response.status;
        throw error;
      }
      return {
        content: Array.isArray(data?.content) ? data.content : [],
        stop_reason: data?.stop_reason ?? null,
        stop_details: data?.stop_details ?? null,
        usage: {
          input_tokens: data?.usage?.input_tokens ?? 0,
          output_tokens: data?.usage?.output_tokens ?? 0
        },
        model: data?.model || useModel
      };
    }
  };
}
