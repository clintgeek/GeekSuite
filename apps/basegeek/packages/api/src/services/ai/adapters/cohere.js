/**
 * cohere — `POST /chat` with a preamble, a chat_history and one current turn.
 *
 * Not OpenAI-shaped and not translatable by field renaming: the conversation
 * is split three ways and the roles are shouted (`USER` / `CHATBOT`). Moved
 * verbatim out of `aiService.callCohere` in Phase 2, including the deliberate
 * refusal to forward `tools` (see the note below it) and Cohere's own spelling
 * of the sampling knobs (F-09).
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

  // Cohere /chat takes a preamble + chat_history + message (current turn).
  // Fold system messages into preamble, use the last user turn as message,
  // and place everything between into chat_history.
  let preamble = '';
  let currentMessage = prompt;
  const chatHistory = [];
  if (messages && Array.isArray(messages) && messages.length > 0) {
    const systemMsgs = messages.filter(m => m.role === 'system');
    preamble = systemMsgs.map(m => m.content ?? '').filter(Boolean).join('\n\n');
    const convo = messages.filter(m => m.role !== 'system');
    if (convo.length > 0) {
      const last = convo[convo.length - 1];
      currentMessage = last.content ?? prompt;
      for (const m of convo.slice(0, -1)) {
        chatHistory.push({ role: m.role === 'assistant' ? 'CHATBOT' : 'USER', message: m.content ?? '' });
      }
    }
  }

  const body = {
    model,
    message: currentMessage,
    max_tokens: maxTokens,
    temperature
  };
  if (preamble) body.preamble = preamble;
  if (chatHistory.length > 0) body.chat_history = chatHistory;

  // Cohere's /chat sampling knobs, in Cohere's own spelling (F-09 for cohere):
  // `p` is its top_p, `stop_sequences` takes up to 5 strings, and
  // seed/frequency_penalty/presence_penalty are named the same as OpenAI's.
  // Absent values are omitted rather than sent as null/0, same convention as
  // openAISamplingFields.
  const dropped = new Set(pc.dropSampling || []);
  if (request.topP != null && !dropped.has('topP')) body.p = request.topP;
  const cohereStop = dropped.has('stop') ? null : stopSequencesFrom(request.stop);
  if (cohereStop) body.stop_sequences = cohereStop;
  if (request.seed != null && !dropped.has('seed')) body.seed = request.seed;
  if (request.presencePenalty != null && !dropped.has('presencePenalty')) body.presence_penalty = request.presencePenalty;
  if (request.frequencyPenalty != null && !dropped.has('frequencyPenalty')) body.frequency_penalty = request.frequencyPenalty;

  // No `tools` forwarding here, deliberately — the descriptor says
  // `forwardsTools: false` and this adapter has no branch that could honour
  // it. Cohere's native tool-use contract (tool_results, force_single_step) is
  // not the OpenAI {type:"function",...} shape the other adapters translate;
  // doing it right needs its own translation layer, which is out of scope.
  // TOOL_FORWARDING_PROVIDERS (derived from these descriptors now) therefore
  // does not include 'cohere', so supportsToolCalling stays false for every
  // Cohere model regardless of what supportsFunctionCalling says, and the
  // rotation will not route a `tools` request here (F-04).

  let response;
  try {
    response = await axios.post(`${pc.baseURL}/chat`, body, {
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
    content: response.data.text,
    inputTokens: response.data.meta?.tokens?.input_tokens || 0,
    outputTokens: response.data.meta?.tokens?.output_tokens || 0,
    headers: response.headers
  };
}

export default { call };
