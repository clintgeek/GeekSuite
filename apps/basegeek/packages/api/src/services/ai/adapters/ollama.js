/**
 * ollama — Ollama Cloud's `/api/chat`.
 *
 * OpenAI-ish messages, but every sampling knob lives under `options` and
 * max_tokens is `num_predict`; token counts come back as `prompt_eval_count` /
 * `eval_count`. Moved verbatim out of `aiService.callOllama` in Phase 2.
 *
 * `forwardsTools: false` on the descriptor: Ollama's chat API does carry
 * `tools`, but no adapter here has ever put them on the wire or read them
 * back, and F-04 is the rule that a provider joins TOOL_FORWARDING_PROVIDERS
 * the day its adapter learns the parameter — never before, because a false
 * claim is *selected* and then silently dropped.
 */

import axios from 'axios';
import { throwAdapterError } from '../AdapterError.js';
import { stopSequencesFrom, ADAPTER_TIMEOUT_MS } from './openaiCompatible.js';

export async function call(pc, request = {}) {
  const {
    prompt = '',
    messages = null,
    model = pc.model,
    maxTokens = pc.maxTokens ?? 1000,
    temperature = pc.temperature ?? 0.7,
    timeoutMs = ADAPTER_TIMEOUT_MS
  } = request;

  const requestMessages = messages || [{ role: 'user', content: prompt }];
  const dropped = new Set(pc.dropSampling || []);
  const stop = dropped.has('stop') ? null : stopSequencesFrom(request.stop);

  let response;
  try {
    response = await axios.post(`${pc.baseURL}/chat`, {
      model,
      messages: requestMessages,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
        // Ollama takes the same knobs under different names, in `options`.
        ...(request.topP != null && !dropped.has('topP') && { top_p: request.topP }),
        ...(stop && { stop }),
        ...(request.seed != null && !dropped.has('seed') && { seed: request.seed }),
        ...(request.presencePenalty != null && !dropped.has('presencePenalty') && { presence_penalty: request.presencePenalty }),
        ...(request.frequencyPenalty != null && !dropped.has('frequencyPenalty') && { frequency_penalty: request.frequencyPenalty })
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pc.apiKey}`
      },
      timeout: timeoutMs
    });
  } catch (error) {
    throwAdapterError(pc.id, error, model);
  }

  return {
    content: response.data.message?.content || response.data.response || '',
    inputTokens: response.data.prompt_eval_count || 0,
    outputTokens: response.data.eval_count || 0,
    headers: response.headers
  };
}

export default { call };
