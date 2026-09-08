/**
 * The adapter registry — five shapes, nine providers, one door.
 *
 * `aiService.callProvider` used to be a ten-case switch over ten ~60-line
 * `call<Provider>` methods, five of which were the same OpenAI-compatible
 * function with a different base URL. Adding a provider meant a roster row, a
 * `case`, a method, and edits in a dozen other files (the plan counted ~17).
 * Now it is one descriptor row in `config/aiProviders.js`, because the shape
 * is a *field* on the row:
 *
 *   shape: 'openai'      groq, cerebras, together, openrouter, llmgateway
 *   shape: 'gemini'      gemini
 *   shape: 'cohere'      cohere
 *   shape: 'cloudflare'  cloudflare
 *   shape: 'ollama'      ollama
 *
 * Every adapter has the same signature and the same result:
 *
 *   call(providerConfig, request) → { content, inputTokens, outputTokens,
 *                                     toolCalls?, finishReason?, headers,
 *                                     costUsd? }
 *
 * and throws `AdapterError { provider, status, code, message }` — never a
 * sentence with a status inside it and never the provider's body (F-23).
 */

import { ADAPTER_DESCRIPTORS } from '../../../config/aiProviders.js';
import { raiseAdapterError } from '../AdapterError.js';
import * as openaiCompatible from './openaiCompatible.js';
import * as gemini from './gemini.js';
import * as cohere from './cohere.js';
import * as cloudflare from './cloudflare.js';
import * as ollama from './ollama.js';

/** shape → adapter. The whole dispatch table. */
export const ADAPTERS = {
  openai: openaiCompatible,
  gemini,
  cohere,
  cloudflare,
  ollama
};

/** Every shape a descriptor may name. */
export const ADAPTER_SHAPES = Object.keys(ADAPTERS);

/**
 * Call one provider through its adapter.
 *
 * `providerConfig` is the live connection row (`aiService.providers[id]`) —
 * the credential, the base URL and the model, which come from the database and
 * may be patched by a test. The descriptor supplies the adapter facts, and the
 * connection row wins on any key they share, so a test that swaps a base URL
 * still reaches its own server.
 *
 * @param {string} providerId  roster id
 * @param {object} providerConfig  aiService.providers[providerId]
 * @param {object} request  see openaiCompatible.call
 */
export async function callAdapter(providerId, providerConfig, request = {}) {
  const descriptor = ADAPTER_DESCRIPTORS[providerId];
  if (!descriptor) {
    raiseAdapterError({
      provider: providerId,
      model: request?.model ?? null,
      code: 'unknown',
      message: `Unknown provider: ${providerId}`
    });
  }
  const adapter = ADAPTERS[descriptor.shape];
  if (!adapter) {
    // Unreachable while `aiProviderRoster.test.js` asserts every descriptor's
    // shape is one of ADAPTER_SHAPES — which is the point of asserting it.
    raiseAdapterError({
      provider: providerId,
      model: request?.model ?? null,
      code: 'unknown',
      message: `No adapter for shape: ${descriptor.shape}`
    });
  }
  return adapter.call({
    ...descriptor,
    // The credential, the base URL, the model and the ceilings come from the
    // live row: that is what an admin edits and what a test points at its own
    // server.
    ...providerConfig,
    // The adapter facts do not. They are the descriptor's, re-applied after
    // the row so a database document (or a stale patched object) can move a
    // base URL but never change the dialect, invent tool forwarding, or ask
    // for a cost field nothing will read.
    id: providerId,
    shape: descriptor.shape,
    extraHeaders: descriptor.extraHeaders,
    dropSampling: descriptor.dropSampling,
    forwardsTools: descriptor.forwardsTools,
    nativeJsonSchema: descriptor.nativeJsonSchema,
    nativeJsonMode: descriptor.nativeJsonMode,
    sendsUsageInclude: descriptor.sendsUsageInclude,
    sendsStreamFalse: descriptor.sendsStreamFalse
  }, request);
}

export default { ADAPTERS, ADAPTER_SHAPES, callAdapter };
