/**
 * gemini — Google's `generateContent`, which is OpenAI-shaped in nothing.
 *
 * `contents[]` with `parts`, roles `user`/`model` (never `assistant`), the
 * system turn hoisted into `systemInstruction`, tools as
 * `functionDeclarations`, structured output as `generationConfig.responseSchema`,
 * and no tool-call ids at all. Moved verbatim out of `aiService.callGemini` in
 * Phase 2 — including the two incident notes it carries (F-02, F-09) and the
 * key-in-a-header rule.
 *
 * Gemini is the one bespoke adapter that forwards *both* `tools` and both
 * `response_format` shapes natively, which is why its descriptor is the only
 * one with `nativeJsonSchema` and `nativeJsonMode` set.
 */

import axios from 'axios';
import { throwAdapterError } from '../AdapterError.js';
import { stopSequencesFrom, ADAPTER_TIMEOUT_MS } from './openaiCompatible.js';

/**
 * The OpenAI conversation as Gemini `contents[]`.
 *
 * FINDING F-02 — the second half of the tool loop. Both message translators
 * (this one and the Anthropic content-block translator that lived above it
 * until 2026-09-07) used to be one line:
 *
 *   messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user',
 *                        content: m.content ?? '' }))
 *
 * which is correct for plain chat and destroys a tool loop: every
 * non-assistant role became `user` and every tool detail was dropped. The
 * first tool call worked; the turn that feeds the result back did not. Every
 * agent framework runs exactly that loop.
 *
 *   assistant + tool_calls[] → {role:"model", parts:[{functionCall:{name,args}}]}
 *   role:"tool"              → {role:"user", parts:[{functionResponse:{name,response}}]}
 *
 * Gemini keys a function response by *name*, not by an id — it issues no
 * tool-call ids at all (this adapter synthesizes them on the way out). So the
 * id→name map built while walking the assistant turns is what lets a
 * `tool_call_id` coming back from a client be resolved to the name Gemini
 * expects.
 *
 * System turns are skipped; they go in `systemInstruction`.
 */
export function geminiContentsFrom(messages) {
  const out = [];
  const nameByCallId = new Map();

  for (const m of messages) {
    if (!m || m.role === 'system') continue;

    if (m.role === 'tool') {
      const name = nameByCallId.get(m.tool_call_id) || m.name || m.tool_call_id || 'tool';
      let response;
      try {
        const parsed = typeof m.content === 'string' ? JSON.parse(m.content) : m.content;
        response = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed
          : { result: parsed };
      } catch {
        // Gemini wants an object; a bare string result gets wrapped rather
        // than dropped.
        response = { result: m.content ?? '' };
      }
      const part = { functionResponse: { name, response } };
      const prev = out[out.length - 1];
      if (prev && prev.role === 'user' && prev.parts.every(p => p.functionResponse)) {
        prev.parts.push(part);
      } else {
        out.push({ role: 'user', parts: [part] });
      }
      continue;
    }

    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const parts = [];
      const text = typeof m.content === 'string' ? m.content : '';
      if (text) parts.push({ text });
      for (const tc of m.tool_calls) {
        let args = {};
        try {
          const raw = tc?.function?.arguments;
          args = typeof raw === 'string' ? (raw ? JSON.parse(raw) : {}) : (raw ?? {});
        } catch {
          args = {};
        }
        const name = tc?.function?.name;
        if (tc?.id) nameByCallId.set(tc.id, name);
        parts.push({ functionCall: { name, args } });
      }
      out.push({ role: 'model', parts });
      continue;
    }

    out.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content ?? '' }]
    });
  }

  return out;
}

export async function call(pc, request = {}) {
  const {
    prompt = '',
    messages = null,
    model = pc.model,
    maxTokens = pc.maxTokens ?? 1000,
    temperature = pc.temperature ?? 0.7,
    responseFormat = null,
    tools = null,
    toolChoice = null,
    timeoutMs = ADAPTER_TIMEOUT_MS
  } = request;

  // Gemini's contents[] takes role 'user' or 'model' (not 'assistant'),
  // and system messages go into a separate systemInstruction field.
  let systemInstruction = null;
  let contents;
  if (messages && Array.isArray(messages) && messages.length > 0) {
    const systemMsgs = messages.filter(m => m.role === 'system');
    const systemText = systemMsgs.map(m => m.content ?? '').filter(Boolean).join('\n\n');
    if (systemText) {
      systemInstruction = { parts: [{ text: systemText }] };
    }
    contents = geminiContentsFrom(messages);
    if (contents.length === 0) {
      contents = [{ role: 'user', parts: [{ text: prompt }] }];
    }
  } else {
    contents = [{ role: 'user', parts: [{ text: prompt }] }];
  }

  const dropped = new Set(pc.dropSampling || []);
  const generationConfig = {
    maxOutputTokens: maxTokens,
    temperature,
    // Gemini's names for the two knobs it shares with OpenAI (F-09). seed and
    // the two penalties are not in generationConfig for the model families
    // this proxy routes to, so they are dropped — which the descriptor says
    // (`dropSampling`) rather than this code.
    ...(request.topP != null && !dropped.has('topP') && { topP: request.topP }),
    ...(!dropped.has('stop') && stopSequencesFrom(request.stop) && { stopSequences: stopSequencesFrom(request.stop) })
  };
  // Native OpenAI-style response_format → Gemini generationConfig mapping.
  if (responseFormat?.type === 'json_object') {
    generationConfig.responseMimeType = 'application/json';
  } else if (responseFormat?.type === 'json_schema' && responseFormat.json_schema?.schema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = responseFormat.json_schema.schema;
  }

  const body = { contents, generationConfig };
  if (systemInstruction) body.systemInstruction = systemInstruction;

  // Translate OpenAI-style tools → Gemini functionDeclarations,
  // and tool_choice → toolConfig.functionCallingConfig.
  if (pc.forwardsTools && tools && Array.isArray(tools) && tools.length > 0) {
    const declarations = tools.map(t => {
      const fn = t.function || t;
      return {
        name: fn.name,
        description: fn.description || '',
        parameters: fn.parameters || { type: 'object', properties: {} }
      };
    });
    body.tools = [{ functionDeclarations: declarations }];

    let mode = 'AUTO';
    let allowedFunctionNames;
    if (toolChoice === 'required') mode = 'ANY';
    else if (toolChoice === 'none') mode = 'NONE';
    else if (toolChoice?.type === 'function' && toolChoice.function?.name) {
      mode = 'ANY';
      allowedFunctionNames = [toolChoice.function.name];
    }
    body.toolConfig = {
      functionCallingConfig: {
        mode,
        ...(allowedFunctionNames && { allowedFunctionNames })
      }
    };
  }

  let response;
  try {
    // Key in a header, never the query string: @geeksuite/logger's err
    // serializer keeps `err.config.url` (it is the one thing that says which
    // call failed) and drops `err.config.headers`, so a key in a query string
    // is the one provider credential that still reaches the logs in the clear
    // on any failure. `aiCatalogDiscovery.listModels` carries the same rule
    // for the Gemini listing.
    response = await axios.post(`${pc.baseURL}/models/${model}:generateContent`, body, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': pc.apiKey
      },
      timeout: timeoutMs
    });
  } catch (error) {
    throwAdapterError(pc.id, error, model);
  }

  const parts = response.data.candidates?.[0]?.content?.parts || [];
  const functionCallParts = parts.filter(p => p.functionCall);

  let result;
  let toolCalls = null;
  let finishReason = 'stop';

  if (functionCallParts.length > 0) {
    // Gemini doesn't issue tool_call IDs — synthesize stable ones from name+index.
    toolCalls = functionCallParts.map((p, i) => ({
      id: `call_${p.functionCall.name}_${i}`,
      type: 'function',
      function: {
        name: p.functionCall.name,
        arguments: JSON.stringify(p.functionCall.args || {})
      }
    }));
    result = parts.filter(p => p.text).map(p => p.text).join('') || '';
    finishReason = 'tool_calls';
  } else {
    result = parts.filter(p => p.text).map(p => p.text).join('') || '';
  }

  const geminiFinish = response.data.candidates?.[0]?.finishReason;
  if (geminiFinish === 'MAX_TOKENS') finishReason = 'length';

  return {
    content: result,
    inputTokens: response.data.usageMetadata?.promptTokenCount || 0,
    outputTokens: response.data.usageMetadata?.candidatesTokenCount || 0,
    toolCalls,
    finishReason,
    headers: response.headers
  };
}

export default { call, geminiContentsFrom };
