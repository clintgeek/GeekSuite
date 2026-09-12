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
 * One table now, read by all of them. **Since Phase 2 (2026-09-07) a row also
 * carries its adapter descriptor**, so adding a provider is one row here and
 * nothing else: no `case` in a switch, no `call<Provider>` method, no second
 * hand-typed connection table in `aiService`, no per-provider capability
 * allowlist. See `services/ai/adapters/index.js` and
 * DOCS/AI_CATALOG.md § "Adding a provider".
 *
 * **Removed 2026-09-04: `llm7` and `onemin`.** Neither has an entry in
 * `aiService.providers`, so `callLLM7` / `call1minAI` dereference
 * `this.providers.llm7.baseURL` / `.onemin` on undefined and throw. `onemin`
 * was additionally absent from `AIConfig`'s schema enum, so its key could
 * never persist at all. They are gone from the config surfaces and the docs;
 * the dead call methods and the permissive model enums are noted in
 * DOCS/AI_CATALOG.md as follow-up.
 *
 * **Removed 2026-09-07: `anthropic`.** The account is out of credit and is not
 * being refilled — the provider is gone for good, not resting. It was the one
 * paid row in the table, reachable only by an explicit pin, and the only pin in
 * the suite was fitnessgeek's meal plan, which had been failing on every call.
 * The whole adapter went with it (`callClaude`, `anthropicMessagesFrom`, the
 * capability and pricing blocks, the schema enums); `aiDeadProviders.test.js` is
 * the tripwire that keeps it out. The tool and content-block translation was
 * good work and lives in git history — see DOCS/AI_CATALOG.md for the incident
 * notes it carried (F-02, F-09, F-22, F-23).
 *
 * **`defaultModel` is the id used when the database has no override.** Do not
 * invent ids here — every one below is either live in this repo's seed data or
 * verified against the provider's current catalog.
 *
 * `rotationPosition` orders the free-tier rotation. Providers with no position
 * are never auto-selected: cohere is quota-metered and reserved for callers
 * that name it. Gemini joined the rotation on 2026-09-11 (D7) — the probe's
 * health ranking, not the slot, does the real work of deciding when it is
 * picked. Every row in the table is now free-tier — the one paid provider,
 * anthropic, came out on 2026-09-07.
 */

/**
 * The adapter descriptor: everything `services/ai/adapters` needs to talk to a
 * provider, and nothing about which models it serves (that is the catalog's
 * job, and it is observed, not typed).
 *
 * @typedef {object} AIAdapterDescriptor
 * @property {'openai'|'gemini'|'cohere'|'cloudflare'|'ollama'} shape
 *   Which adapter speaks this provider's dialect. Five of the nine rows are
 *   `openai` — one function, five base URLs.
 * @property {string} baseURL  Root of the provider's API. No key in it, ever.
 * @property {string} name  Human label for the connection row (shown in logs
 *   and the admin page). Carries the default model's name by tradition.
 * @property {number} maxTokens  Default output ceiling for a call.
 * @property {number} [maxContextTokens]  Input ceiling, when the provider
 *   publishes one. Absent means `preprocessContext` does not summarize for it.
 * @property {number} temperature  Default sampling temperature.
 * @property {Object<string,string>} [extraHeaders]  Static headers beyond
 *   auth (OpenRouter's ranking Referer and dashboard Title).
 * @property {string[]} [dropSampling]  Sampling knobs this provider does not
 *   accept, in *our* spelling (`topP`, `stop`, `seed`, `presencePenalty`,
 *   `frequencyPenalty`). Dropped at the adapter so they never become a 400 —
 *   and so F-09 cannot come back as a silent swallow one layer up.
 * @property {boolean} [forwardsTools]  This adapter puts `tools`/`tool_choice`
 *   on the wire *and* reads `tool_calls` back. F-04: a provider joins the day
 *   its adapter learns the parameter, never before — a false claim here is not
 *   a loud failure, it is a selected provider that quietly drops the tools and
 *   answers prose. `TOOL_FORWARDING_PROVIDERS` is derived from this field.
 * @property {boolean} [nativeJsonSchema]  Forwards
 *   `response_format: {type:'json_schema'}` natively (otherwise the caller
 *   gets the prompt-injection fallback, which keeps every provider in
 *   rotation). `JSON_SCHEMA_SUPPORTED` is derived from this field.
 * @property {boolean} [nativeJsonMode]  Same for `{type:'json_object'}`.
 * @property {boolean} [sendsUsageInclude]  Asks for `usage: {include: true}`
 *   and reports `costUsd` off the answer (OpenRouter — the only provider that
 *   prices its own call for us).
 * @property {boolean} [sendsStreamFalse]  Sends the explicit `stream: false`.
 * @property {number} [dailyNeuronLimit]  Cloudflare's free daily allowance,
 *   the one quota number a provider does not report in a header.
 */

/** @typedef {{
 *   id: string,
 *   label: string,
 *   needsAccountId: boolean,
 *   defaultModel: string,
 *   inRotation: boolean,
 *   rotationPosition: number | null,
 *   adapter: AIAdapterDescriptor,
 * }} AIProvider */

/** @type {AIProvider[]} */
export const AI_PROVIDERS = [
  {
    id: 'groq',
    label: 'Groq',
    needsAccountId: false,
    defaultModel: 'qwen/qwen3.8-27b', // alive + structured on 2026-09-07; llama-3.3-70b-versatile no longer answers
    inRotation: true,
    rotationPosition: 1,
    adapter: {
      shape: 'openai',
      baseURL: 'https://api.groq.com/openai/v1',
      name: 'Groq Llama 3.3 70B',
      maxTokens: 8000,
      maxContextTokens: 32768, // 32K context limit
      temperature: 0.7,
      // OpenAI-shaped tools, verbatim, both directions (F-04).
      forwardsTools: true,
    },
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    needsAccountId: false,
    // Was gemini-2.0-flash. 2.5-flash is the id this repo already prices and
    // lists (aiDirectorService seed data, aiService model lists).
    defaultModel: 'gemini-flash-lite-latest', // the alias Google keeps current; 2.5-flash stopped answering the free tier
    // In rotation since 2026-09-11 (D7): the probe decides like any other
    // provider. Last in the order — health ranking picks it when it earns it,
    // and its daily-quota ceiling is a reason not to lead with it.
    inRotation: true,
    rotationPosition: 8,
    adapter: {
      shape: 'gemini',
      baseURL: 'https://generativelanguage.googleapis.com/v1beta',
      name: 'Gemini 2.5 Flash',
      maxTokens: 8000,
      maxContextTokens: 1000000, // 1M token context limit
      temperature: 0.7,
      // The one bespoke adapter with all three: functionDeclarations +
      // toolConfig + functionCall readback, and both response_format shapes
      // through generationConfig.
      forwardsTools: true,
      nativeJsonSchema: true,
      nativeJsonMode: true,
      // Not in generationConfig for the model families this proxy routes to.
      dropSampling: ['seed', 'presencePenalty', 'frequencyPenalty'],
    },
  },
  {
    id: 'together',
    label: 'Together AI',
    needsAccountId: false,
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    inRotation: true,
    rotationPosition: 3,
    adapter: {
      shape: 'openai',
      baseURL: 'https://api.together.xyz/v1',
      name: 'Together Llama 3.3 70B Turbo Free',
      maxTokens: 8000,
      maxContextTokens: 131072, // 128K context limit
      temperature: 0.7,
      // Together's body has always carried the explicit `stream: false`.
      // Kept as a flag rather than normalized away: what is on the wire today
      // is what works today.
      sendsStreamFalse: true,
    },
  },
  {
    id: 'cohere',
    label: 'Cohere',
    needsAccountId: false,
    defaultModel: 'command-r-plus-08-2024',
    inRotation: false,
    rotationPosition: null,
    adapter: {
      shape: 'cohere',
      baseURL: 'https://api.cohere.ai/v1',
      name: 'Cohere Command R+',
      maxTokens: 4000,
      temperature: 0.7,
      // No `forwardsTools`, deliberately: Cohere's native tool contract
      // (tool_results, force_single_step) is not the OpenAI shape the other
      // adapters translate. See the note in adapters/cohere.js.
    },
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    needsAccountId: false,
    defaultModel: 'openrouter/free', // OpenRouter's own free auto-router: alive as long as any free model is
    inRotation: true,
    rotationPosition: 4,
    adapter: {
      shape: 'openai',
      baseURL: 'https://openrouter.ai/api/v1',
      name: 'OpenRouter',
      maxTokens: 8000,
      maxContextTokens: 131072, // 128K context limit
      temperature: 0.7,
      // The spend ledger's source of truth: OpenRouter reports `usage.cost` in
      // dollars, exact, for whichever model its auto-router picked.
      sendsUsageInclude: true,
      extraHeaders: {
        'HTTP-Referer': 'https://basegeek.clintgeek.com', // Optional: for rankings
        'X-Title': 'BaseGeek aiGeek', // Optional: shows in OpenRouter dashboard
      },
    },
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    needsAccountId: false,
    defaultModel: 'qwen-3-235b-a22b-instruct-2507',
    inRotation: true,
    rotationPosition: 2,
    adapter: {
      shape: 'openai',
      baseURL: 'https://api.cerebras.ai/v1',
      name: 'Cerebras Qwen 3 235B Instruct',
      maxTokens: 8000,
      maxContextTokens: 65536, // 64K context limit
      temperature: 0.7,
      // Until 2026-09-07 this provider's adapter appended a "tool-decisive"
      // preamble to the system turn (via families.json → PROMPT_STRATEGIES): a
      // codeGeek-era instruction block about executing tool calls and reading
      // THE_STEPS.md without asking. No suite feature is a coding agent; on an
      // Ask parse or a food-log extraction it was pure noise, and because it
      // mutated the caller's array in place it leaked into whichever provider
      // answered next after a Cerebras failure. Removed outright.
    },
  },
  {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    needsAccountId: true,
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    inRotation: true,
    rotationPosition: 5,
    adapter: {
      shape: 'cloudflare',
      baseURL: 'https://api.cloudflare.com/client/v4/accounts',
      name: 'Cloudflare Llama 3.3 70B FP8 Fast',
      maxTokens: 8000,
      maxContextTokens: 131072, // 128K context limit
      temperature: 0.7,
      // Workers AI validates its input schema strictly and `stop` is not in
      // it — an unknown property is a 400.
      dropSampling: ['stop'],
      dailyNeuronLimit: 10000,
    },
  },
  {
    id: 'ollama',
    label: 'Ollama Cloud',
    needsAccountId: false,
    defaultModel: 'gemma4:31b', // the one Ollama Cloud row alive on 2026-09-07; the coder build is denied by design
    inRotation: true,
    rotationPosition: 6,
    adapter: {
      shape: 'ollama',
      baseURL: 'https://ollama.com/api',
      name: 'Ollama Cloud Qwen3 Coder 480B',
      maxTokens: 8000,
      temperature: 0.7,
    },
  },
  {
    id: 'llmgateway',
    label: 'LLM Gateway',
    needsAccountId: false,
    defaultModel: 'llama-4-maverick-free',
    inRotation: true,
    rotationPosition: 7,
    adapter: {
      shape: 'openai',
      baseURL: 'https://api.llmgateway.io/v1',
      name: 'LLM Gateway Llama 4 Maverick',
      maxTokens: 8000,
      maxContextTokens: 1000000, // 1M context limit
      temperature: 0.7,
    },
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
 * id → adapter descriptor, with the optional fields normalized so an adapter
 * never has to write `?? false` or `?? []`. Read by
 * `services/ai/adapters/index.js` (dispatch) and by the two derived sets
 * below; nothing reads `row.adapter` directly.
 */
export const ADAPTER_DESCRIPTORS = Object.fromEntries(
  AI_PROVIDERS.map(p => [p.id, {
    id: p.id,
    needsAccountId: p.needsAccountId,
    ...p.adapter,
    dropSampling: p.adapter.dropSampling || [],
    forwardsTools: p.adapter.forwardsTools === true,
    nativeJsonSchema: p.adapter.nativeJsonSchema === true,
    nativeJsonMode: p.adapter.nativeJsonMode === true,
    sendsUsageInclude: p.adapter.sendsUsageInclude === true,
    sendsStreamFalse: p.adapter.sendsStreamFalse === true,
  }])
);

/**
 * id → the *connection* row `aiService.providers` is built from: base URL,
 * credential (empty until `loadConfigurations` decrypts one), default model,
 * and the two ceilings. What it does not carry is a price — cost comes from
 * the response (OpenRouter reports `usage.cost`, exact) or from `AIPricing`
 * per model, and lands in the `AISpend` ledger. It also does not carry the
 * adapter facts: those stay on the descriptor, which the registry merges in at
 * call time, so a database row can never overwrite one.
 *
 * A fresh object per call: `aiService` mutates these (`apiKey`, `enabled`,
 * `model`), and two callers must not share one row.
 */
export const buildProviderConnections = () => Object.fromEntries(
  AI_PROVIDERS.map(p => [p.id, {
    id: p.id,
    name: p.adapter.name,
    apiKey: '',
    baseURL: p.adapter.baseURL,
    model: p.defaultModel,
    maxTokens: p.adapter.maxTokens,
    ...(p.adapter.maxContextTokens != null && { maxContextTokens: p.adapter.maxContextTokens }),
    temperature: p.adapter.temperature,
    enabled: false,
    // Only the rows that need one — `aiProviderRoster.test.js` asserts the
    // field exists nowhere else, because an empty accountId on a provider that
    // has no such concept is a configuration surface that cannot work.
    ...(p.needsAccountId && { accountId: '' }),
    ...(p.adapter.dailyNeuronLimit != null && { dailyNeuronLimit: p.adapter.dailyNeuronLimit }),
  }])
);

/* ─── Adapter facts, derived ──────────────────────────────────────────────── */
/**
 * These three used to be hand-typed Sets in `aiModelCapabilitiesService`, one
 * file away from the adapters they described — so a provider could be added to
 * an allowlist without an adapter behind it (F-04) or, worse, keep its
 * membership after its adapter was deleted. They are derived from the
 * descriptors now: the claim and the code that honours it are the same line.
 * `aiModelCapabilitiesService` re-exports them under these exact names, so
 * every caller is unchanged.
 */

/** Providers whose adapter forwards `tools` and reads `tool_calls` back. */
export const TOOL_FORWARDING_PROVIDERS = new Set(
  AI_PROVIDERS.filter(p => p.adapter.forwardsTools).map(p => p.id)
);

/** `provider:*` pairs whose adapter forwards `response_format: json_schema`. */
export const JSON_SCHEMA_SUPPORTED = new Set(
  AI_PROVIDERS.filter(p => p.adapter.nativeJsonSchema).map(p => `${p.id}:*`)
);

/** `provider:*` pairs whose adapter forwards `response_format: json_object`. */
export const JSON_MODE_SUPPORTED = new Set(
  AI_PROVIDERS.filter(p => p.adapter.nativeJsonMode).map(p => `${p.id}:*`)
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
