/**
 * openaiCompatible — one adapter for five providers.
 *
 * groq, cerebras, together, openrouter and llmgateway all serve
 * `POST {baseURL}/chat/completions` with OpenAI's own field names, take a
 * bearer token, and answer with `choices[0].message` + `usage`. Until Phase 2
 * they were five ~50-line methods on `aiService` that differed in a handful of
 * places and drifted in all of them (see the Together note below). Now every
 * difference is a field on the provider's descriptor in
 * `config/aiProviders.js`:
 *
 *   forwardsTools        put `tools`/`tool_choice` on the wire and read
 *                        `tool_calls` back off the answer (F-04: groq only —
 *                        a provider joins the day its adapter learns the
 *                        parameter, never before)
 *   sendsUsageInclude    ask for the cost accounting (openrouter only)
 *   sendsStreamFalse     send the explicit `stream: false` (together only —
 *                        kept because that is what has been on the wire)
 *   extraHeaders         static headers beyond auth (openrouter's Referer and
 *                        Title, which is how the dashboard labels our traffic)
 *   dropSampling         sampling knobs this provider 400s on (none, here)
 *
 * Nothing in this file names a provider.
 *
 * **Vision.** This dialect's own multimodal shape — a `content` array of
 * `{type:'text', text}` / `{type:'image_url', image_url:{url}}` parts — is
 * what `messagesFrom`/`toOpenAIMessage` translate our provider-neutral
 * content-parts shape into (see `imageContent.js`). A message with no image
 * is forwarded exactly as it arrived; nothing about the plain-text path
 * changes shape.
 */

import axios from 'axios';
import { raiseAdapterError, throwAdapterError, upstreamErrorEnvelope } from '../AdapterError.js';
import { partsOf } from './imageContent.js';

/** How long any adapter waits on a provider before giving up. */
export const ADAPTER_TIMEOUT_MS = 60000;

/**
 * The OpenAI sampling parameters, in OpenAI's own spelling, ready to spread
 * into the body of any OpenAI-shaped provider.
 *
 * FINDING F-09: these five used to be read off the request at the proxy door
 * and then dropped — `callAI` never destructured them and `callProvider` built
 * its downstream config from a whitelist that did not include them. They
 * travelled exactly one function call and died, at HTTP 200, with no hint to
 * the caller that `stop: ["\n\n"]` had been ignored.
 *
 * Absent values are omitted rather than sent as null, so a provider never has
 * to have an opinion about a key the caller never set. `drop` is the
 * descriptor's `dropSampling`: a knob a provider validates strictly and 400s
 * on is dropped here, at the adapter, never sent upstream to become an error
 * and never silently swallowed a layer above.
 */
export function openAISamplingFields(
  { topP, stop, seed, presencePenalty, frequencyPenalty } = {},
  drop = []
) {
  const dropped = new Set(drop);
  return {
    ...(topP != null && !dropped.has('topP') && { top_p: topP }),
    ...(stop != null && !dropped.has('stop') && { stop }),
    ...(seed != null && !dropped.has('seed') && { seed }),
    ...(presencePenalty != null && !dropped.has('presencePenalty') && { presence_penalty: presencePenalty }),
    ...(frequencyPenalty != null && !dropped.has('frequencyPenalty') && { frequency_penalty: frequencyPenalty })
  };
}

/**
 * OpenAI's `stop` (string | string[] | null) as the array form Gemini
 * (`generationConfig.stopSequences`), Cohere (`stop_sequences`) and Ollama
 * (`options.stop`) want. Returns null when there is nothing worth sending.
 *
 * Lives beside `openAISamplingFields` because it is the same job — OpenAI's
 * spelling translated into a provider's — and because the four adapters that
 * need it shared one file (aiService.js) before they were four files.
 */
export function stopSequencesFrom(stop) {
  if (typeof stop === 'string') return stop ? [stop] : null;
  if (Array.isArray(stop)) {
    const list = stop.filter(s => typeof s === 'string' && s.length > 0);
    return list.length > 0 ? list : null;
  }
  return null;
}

/**
 * Translate one message's neutral content (see `imageContent.js`) into
 * OpenAI's own multimodal shape — but ONLY when it actually carries an
 * image. A plain string stays a plain string, byte-for-byte, which is what
 * keeps every caller that has never heard of an image untouched by this.
 *
 * groq, cerebras, together, openrouter and llmgateway all speak this dialect
 * for vision the same way they speak it for text: `content` becomes an
 * array of `{type:'text', text}` / `{type:'image_url', image_url:{url}}`
 * parts, the image as a `data:` URI built from our neutral
 * `{mediaType, data}` pair. Whether the *model* behind a given row can
 * actually see it is the need-resolver's job (`aiNeedResolver.js`), not
 * this adapter's — this only has to speak the wire format correctly.
 *
 * Throws `AdapterError` (`unsupported_content`) for a part this suite does
 * not recognize, rather than the old behaviour of forwarding whatever
 * `content` was verbatim and letting the provider 400 on a shape it had
 * never heard of either.
 */
function toOpenAIMessage(message, ctx) {
  const { text, images, unrecognized } = partsOf(message?.content);
  if (unrecognized) {
    raiseAdapterError({
      provider: ctx.providerId,
      model: ctx.model,
      code: 'unsupported_content',
      message: 'message content contained a part this adapter does not understand'
    });
  }
  if (images.length === 0) {
    // No image on this turn: leave the message exactly as it arrived. Tool
    // turns, assistant `tool_calls`, everything else about the message is
    // none of this function's business.
    return message;
  }
  const parts = [];
  if (text) parts.push({ type: 'text', text });
  for (const image of images) {
    parts.push({ type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } });
  }
  return { ...message, content: parts };
}

/** The caller's messages, or the bare prompt as one user turn — translated
 *  per-message for any attached image (see `toOpenAIMessage`). */
export function messagesFrom(messages, prompt, ctx = {}) {
  const base = (Array.isArray(messages) && messages.length > 0)
    ? messages
    : [{ role: 'user', content: prompt }];
  return base.map(m => toOpenAIMessage(m, ctx));
}

/**
 * Read `tool_calls` back off a choice in the same shape the OpenAI surface
 * hands to the client. The provider already emits it, so this is a
 * pass-through with a defensive normalize.
 */
function toolCallsFrom(choice) {
  const rawCalls = choice.message?.tool_calls;
  if (!Array.isArray(rawCalls) || rawCalls.length === 0) return null;
  return rawCalls.map((tc, i) => ({
    id: tc?.id || `call_${i}`,
    type: 'function',
    function: {
      name: tc?.function?.name,
      arguments: typeof tc?.function?.arguments === 'string'
        ? tc.function.arguments
        : JSON.stringify(tc?.function?.arguments ?? {})
    }
  }));
}

/**
 * @param {object} pc  the provider's row: { id, name, apiKey, baseURL, model,
 *   maxTokens, temperature, shape, forwardsTools, extraHeaders, ... }
 * @param {object} request  { prompt, messages, model, maxTokens, temperature,
 *   responseFormat, tools, toolChoice, topP, stop, seed, presencePenalty,
 *   frequencyPenalty, timeoutMs }
 */
export async function call(pc, request = {}) {
  const {
    prompt = '',
    messages = null,
    model = pc.model,
    maxTokens = pc.maxTokens ?? 1000,
    temperature = pc.temperature ?? 0.7,
    tools = null,
    toolChoice = null,
    timeoutMs = ADAPTER_TIMEOUT_MS
  } = request;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: messagesFrom(messages, prompt, { providerId: pc.id, model }),
    ...(pc.sendsStreamFalse && { stream: false }),
    // Ask for the cost accounting. OpenRouter returns `usage.cost` (USD,
    // exact) when this is set; without it the ledger would have to price an
    // auto-router's answer from a table that does not know which model
    // answered. It costs nothing and adds no latency.
    ...(pc.sendsUsageInclude && { usage: { include: true } }),
    ...openAISamplingFields(request, pc.dropSampling)
  };

  // FINDING F-04. Groq's chat/completions is OpenAI-shaped down to the field
  // names — verified against console.groq.com/docs/api-reference (2026-09-05):
  // `tools` is "a list of tools the model may call", and `tool_choice` takes
  // none / auto / required / {type:"function",...}. So there is nothing to
  // translate: the caller's own objects go on the wire verbatim, and the whole
  // OpenAI-format conversation (assistant.tool_calls turns, role:"tool"
  // results with tool_call_id) is already in that format too — no message
  // rewriting either.
  //
  // Before this, callGroq destructured only {maxTokens, temperature, model,
  // messages} while the capability matrix advertised twelve Groq models as
  // tool-capable, so the rotation routed tool requests there and the caller
  // got prose. `forwardsTools` and `TOOL_FORWARDING_PROVIDERS` are now the
  // same fact, read from the same descriptor.
  if (pc.forwardsTools && Array.isArray(tools) && tools.length > 0 && toolChoice !== 'none') {
    body.tools = tools;
    if (toolChoice) body.tool_choice = toolChoice;
  }

  let response;
  try {
    response = await axios.post(`${pc.baseURL}/chat/completions`, body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pc.apiKey}`,
        ...(pc.extraHeaders || {})
      },
      timeout: timeoutMs
    });
  } catch (error) {
    // One line, at warn, with no `err` and no `data` — see
    // `raiseAdapterError`. The provider's body is not read here, not even for
    // the log (F-23).
    throwAdapterError(pc.id, error, model);
  }

  // Tolerant reads, groq's, now every provider's: a 200 with no choices used
  // to be a TypeError here for four of the five, and content '' for groq. It
  // is content '' for all five now, which is the case the probe already
  // judges — `classifyProbe` calls a 200 with no text dead (`empty_content`),
  // which is the truth about a row that answers that way.
  //
  // But a 200 with no choices AND a populated `error` body is a DIFFERENT
  // truth — OpenRouter's own passthrough of an upstream vendor's failure
  // (see `upstreamErrorEnvelope`'s header) — and must never fall into the
  // tolerant read below: doing so is exactly how a capacity blip earned the
  // same six-hour cooldown as a model that is actually gone. Checked before
  // the read, not after, so a real answer is never second-guessed by an
  // `error` key a provider happened to send alongside it.
  const rawChoice = response.data.choices?.[0];
  if (!rawChoice) {
    const envelope = upstreamErrorEnvelope(response.data);
    if (envelope) {
      raiseAdapterError({
        provider: pc.id,
        model,
        status: envelope.status,
        code: envelope.status ? `http_${envelope.status}` : 'unknown',
        message: envelope.message
      });
    }
  }
  const choice = rawChoice || {};
  const content = choice.message?.content ?? '';

  const toolCalls = pc.forwardsTools ? toolCallsFrom(choice) : null;
  let finishReason = choice.finish_reason || 'stop';
  if (toolCalls) finishReason = 'tool_calls';
  else if (finishReason !== 'length') finishReason = 'stop';

  return {
    content,
    inputTokens: response.data.usage?.prompt_tokens || 0,
    outputTokens: response.data.usage?.completion_tokens || 0,
    toolCalls,
    finishReason,
    // Every adapter hands the raw response headers back. `callAI` reads the
    // provider's own `x-ratelimit-*` off them (recordObservedLimits) — the
    // quota tables that used to be typed by hand are gone, so this is the
    // only place a real allowance is ever learned. Additive: no caller has to
    // look.
    headers: response.headers,
    // OpenRouter is the only provider that prices its own call for us:
    // `usage.cost` is dollars, exact, for the model that actually answered —
    // which matters most for `openrouter/free`, an auto-router whose model is
    // not known until it replies. `updateStats` prefers this over any price
    // table. Free rows report 0, and 0 is the truth; `null` means "ask the
    // price table", so an unreported cost is never mistaken for a free one.
    ...(pc.sendsUsageInclude && { costUsd: response.data.usage?.cost ?? null })
  };
}

export default { call, openAISamplingFields, stopSequencesFrom, messagesFrom };
