/**
 * cloudflare — Workers AI's `/accounts/{id}/ai/run/{model}`.
 *
 * Three quirks, all of them earned:
 *
 *   1. **Chat, not prompt.** Workers AI applies the model's own chat template
 *      to `messages` and stops at end-of-turn; the old flattened
 *      "System: …\n\nAssistant: …" string had no template and no stop, so
 *      llama kept generating turns until max_tokens — 15 s+ for a two-word
 *      JSON answer (2026-09-07, the StartGeek Ask outage).
 *   2. **The bare schema.** `response_format` is Workers AI's JSON mode and
 *      the schema goes in directly, without OpenAI's `{name, schema}` wrapper.
 *   3. **A strict input schema.** An unknown property is a 400, and `stop` is
 *      not in it — hence `dropSampling: ['stop']` on the descriptor.
 *
 * Plus: JSON mode answers with `result.response` as an *object*, and callers
 * expect text; and a 402 is "out of neurons for today", not a bad request.
 * Moved verbatim out of `aiService.callCloudflare` in Phase 2.
 */

import axios from 'axios';
import { raiseAdapterError, throwAdapterError } from '../AdapterError.js';
import { ADAPTER_TIMEOUT_MS } from './openaiCompatible.js';

export async function call(pc, request = {}) {
  const {
    prompt = '',
    messages = null,
    model = pc.model,
    maxTokens = pc.maxTokens ?? 1000,
    temperature = pc.temperature ?? 0.7,
    responseFormat = null,
    timeoutMs = ADAPTER_TIMEOUT_MS
  } = request;

  const accountId = pc.accountId;
  if (!accountId) {
    // Not an upstream failure — a configuration one. It carries no status, so
    // the envelope reads it as `internal`, which is what a missing account id
    // is: ours to fix.
    raiseAdapterError({
      provider: pc.id,
      model,
      code: 'unknown',
      message: 'Cloudflare account ID not configured'
    });
  }

  const requestMessages = messages || [{ role: 'user', content: prompt }];

  const cfMessages = requestMessages.map(m => ({
    role: m.role === 'system' || m.role === 'assistant' ? m.role : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
  }));
  const rf = responseFormat;
  const cfResponseFormat = rf?.type === 'json_schema'
    ? { type: 'json_schema', json_schema: rf.json_schema?.schema || rf.json_schema }
    : rf?.type === 'json_object'
      ? { type: 'json_object' }
      : null;

  const dropped = new Set(pc.dropSampling || []);
  let response;
  try {
    response = await axios.post(
      `${pc.baseURL}/${accountId}/ai/run/${model}`,
      {
        messages: cfMessages,
        max_tokens: maxTokens,
        temperature,
        ...(cfResponseFormat && { response_format: cfResponseFormat }),
        // Workers AI documents top_p / seed / the two penalties for
        // text-generation but not `stop`, and validates its input schema
        // strictly — an unknown property is a 400, so `stop` is dropped by the
        // descriptor rather than by a branch here.
        ...(request.topP != null && !dropped.has('topP') && { top_p: request.topP }),
        ...(request.stop != null && !dropped.has('stop') && { stop: request.stop }),
        ...(request.seed != null && !dropped.has('seed') && { seed: request.seed }),
        ...(request.presencePenalty != null && !dropped.has('presencePenalty') && { presence_penalty: request.presencePenalty }),
        ...(request.frequencyPenalty != null && !dropped.has('frequencyPenalty') && { frequency_penalty: request.frequencyPenalty })
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${pc.apiKey}`
        },
        timeout: timeoutMs
      }
    );
  } catch (error) {
    // A 402 is the daily neuron limit, not a malformed request. It used to be
    // a hand-built message with that sentence inside the `API error (402)`
    // prefix so the string parser would still classify it; the status is a
    // field now, so the sentence can just be the message. The provider's body
    // is never read — not for the caller and not for the log.
    if (error.response?.status === 402) {
      raiseAdapterError({
        provider: pc.id,
        model,
        status: 402,
        code: 'http_402',
        message: 'daily neuron limit exceeded'
      });
    }
    throwAdapterError(pc.id, error, model);
  }

  // JSON mode returns `response` as an object; callers expect text.
  let result = response.data.result?.response ?? response.data.result?.content ?? '';
  if (result && typeof result === 'object') result = JSON.stringify(result);

  return {
    content: result,
    inputTokens: response.data.result?.usage?.prompt_tokens || 0,
    outputTokens: response.data.result?.usage?.completion_tokens || 0,
    headers: response.headers
  };
}

export default { call };
