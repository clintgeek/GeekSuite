/**
 * aiProviders.js — the one list of AI providers.
 *
 * Before this, the same roster was restated in five places that drifted apart:
 * the REST config route, the GraphQL config resolver, `aiService.providers`,
 * `aiService.rotationProviderOverrides`, and `aiService.fallbackOrder`. Each
 * knew a slightly different set — which is how `llm7` and `onemin` came to be
 * offered by the config surfaces while `aiService.providers` defined neither,
 * so a key saved for either went nowhere.
 *
 * One table now, read by all of them. Adding a provider means adding a row
 * here and a `callX` implementation in aiService; nothing else needs editing.
 *
 * **Removed 2026-09-04: `llm7` and `onemin`.** Neither has an entry in
 * `aiService.providers`, so `callLLM7` / `call1minAI` dereference
 * `this.providers.llm7.baseURL` / `.onemin` on undefined and throw. `onemin`
 * was additionally absent from `AIConfig`'s schema enum, so its key could
 * never persist at all. They are gone from the config surfaces and the docs;
 * the dead call methods and the permissive model enums are noted in
 * DOCS/AI_CATALOG.md as follow-up.
 *
 * **`defaultModel` is the id used when the database has no override.** Do not
 * invent ids here — every one below is either live in this repo's seed data or
 * verified against the provider's current catalog.
 *
 * `rotationPosition` orders the free-tier rotation. Providers with no position
 * are never auto-selected: anthropic is paid (deliberate last resort, reached
 * only by an explicit pin), cohere and gemini are quota-metered and reserved
 * for callers that name them.
 */

/** @typedef {{
 *   id: string,
 *   label: string,
 *   needsAccountId: boolean,
 *   defaultModel: string,
 *   inRotation: boolean,
 *   rotationPosition: number | null,
 * }} AIProvider */

/** @type {AIProvider[]} */
export const AI_PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    needsAccountId: false,
    // Current Sonnet. Was claude-3-5-sonnet-20241022, three generations stale.
    defaultModel: 'claude-sonnet-5',
    inRotation: false,
    rotationPosition: null,
  },
  {
    id: 'groq',
    label: 'Groq',
    needsAccountId: false,
    defaultModel: 'llama-3.3-70b-versatile',
    inRotation: true,
    rotationPosition: 1,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    needsAccountId: false,
    // Was gemini-2.0-flash. 2.5-flash is the id this repo already prices and
    // lists (aiDirectorService seed data, aiService model lists).
    defaultModel: 'gemini-2.5-flash',
    inRotation: false,
    rotationPosition: null,
  },
  {
    id: 'together',
    label: 'Together AI',
    needsAccountId: false,
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    inRotation: true,
    rotationPosition: 3,
  },
  {
    id: 'cohere',
    label: 'Cohere',
    needsAccountId: false,
    defaultModel: 'command-r-plus-08-2024',
    inRotation: false,
    rotationPosition: null,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    needsAccountId: false,
    defaultModel: 'meta-llama/llama-3.1-70b-instruct:free',
    inRotation: true,
    rotationPosition: 4,
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    needsAccountId: false,
    defaultModel: 'qwen-3-235b-a22b-instruct-2507',
    inRotation: true,
    rotationPosition: 2,
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    needsAccountId: true,
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    inRotation: true,
    rotationPosition: 5,
  },
  {
    id: 'ollama',
    label: 'Ollama Cloud',
    needsAccountId: false,
    defaultModel: 'qwen3-coder:480b-cloud',
    inRotation: true,
    rotationPosition: 6,
  },
  {
    id: 'llmgateway',
    label: 'LLM Gateway',
    needsAccountId: false,
    defaultModel: 'llama-4-maverick-free',
    inRotation: true,
    rotationPosition: 7,
  },
];

/** Every provider id, in table order. */
export const PROVIDER_IDS = AI_PROVIDERS.map(p => p.id);

/** id → provider row. */
export const PROVIDERS_BY_ID = Object.fromEntries(AI_PROVIDERS.map(p => [p.id, p]));

/** id → default model id, for `aiService.providers`. */
export const DEFAULT_MODELS = Object.fromEntries(
  AI_PROVIDERS.map(p => [p.id, p.defaultModel])
);

/**
 * The free-tier rotation, cheapest-and-fastest first. `aiService.fallbackOrder`
 * is this array; nothing else may restate it.
 */
export const FALLBACK_ORDER = AI_PROVIDERS
  .filter(p => p.inRotation)
  .sort((a, b) => a.rotationPosition - b.rotationPosition)
  .map(p => p.id);

/**
 * Models the rotation pins, overriding whatever a provider's database row
 * says. Derived from the same `defaultModel`, so the two can no longer drift.
 */
export const ROTATION_MODEL_OVERRIDES = Object.fromEntries(
  AI_PROVIDERS
    .filter(p => p.inRotation)
    .map(p => [p.id, { model: p.defaultModel }])
);

/** Providers whose config carries a Cloudflare-style account id. */
export const PROVIDERS_NEEDING_ACCOUNT_ID = AI_PROVIDERS
  .filter(p => p.needsAccountId)
  .map(p => p.id);

/**
 * A key hint is the *only* part of a provider credential that leaves the
 * server: enough to tell two keys apart in the UI, useless to a thief.
 */
export const keyHintFor = (plaintext) => {
  if (typeof plaintext !== 'string' || plaintext.length < 4) return '';
  return `…${plaintext.slice(-4)}`;
};
