// MUST import WASM backend initializer FIRST to prevent native binding attempts
// DISABLED: Causing Docker issues with onnxruntime-node dependency
// import '../wasm-backend-init.js';

import logger from '../lib/logger.js';
import AIConfig from '../models/AIConfig.js';
import {
  FALLBACK_ORDER,
  ROTATION_MODEL_OVERRIDES,
  buildProviderConnections,
  keyHintFor
} from '../config/aiProviders.js';
// Every provider dialect lives behind this one call (Phase 2). aiService owns
// the credential, the model and the retry policy; the adapters own the wire
// format and throw `AdapterError {provider, status, code, message}` — never a
// sentence with the status inside it and never the provider's body (F-23).
import { callAdapter } from './ai/adapters/index.js';
import AIModel from '../models/AIModel.js';
import AIPricing from '../models/AIPricing.js';
import aiUsageService from './aiUsageService.js';
import AIFreeTier, {
  classifyFreeTierFailure,
  isFreeTierCooling,
  FREE_TIER_COOLDOWN_MS,
  FREE_TIER_LONG_COOLDOWN_MS,
  FREE_TIER_LONG_COOLDOWN_AFTER
} from '../models/AIFreeTier.js';
import AIAppConfig from '../models/AIAppConfig.js';
import AIUsage from '../models/AIUsage.js';
import AISpend, { spendDay, recordRefusal } from '../models/AISpend.js';
import AIStickyPick, { stickyKey } from '../models/AIStickyPick.js';
// The routing decision is pure and lives next door (Phase 2). aiService owns
// the I/O the decision needs — is this row cooling, what has today cost — and
// nothing else about where a request goes.
import {
  resolveRoute,
  degradePin,
  explicitPinOf,
  paidCaps,
  paidBudgetVerdict,
  estimatePaidCostUsd
} from './aiRoute.js';
import RotationManager from './rotationManager.js';
import aiModelCapabilitiesService from './aiModelCapabilitiesService.js';
// The catalog module owns everything this service knows about the outside
// world's model lists and quota headers. aiService calls it; it never calls
// back (the job injects `callProvider`), so there is no cycle to reason about.
import {
  parseRateLimitHeaders,
  ROUTER_MODEL_IDS,
  listModels,
  listedRows,
  openRouterCatalog,
  writeListed,
  deactivateUnlisted
} from './aiCatalogDiscovery.js';
// Using cloud-based summarization instead of local transformers.js
import crypto from 'crypto';
import { countTextTokens, countMessageTokens } from './tokenCounter.js';

/**
 * How many free-tier rows one `auto` call may try before giving up (R130).
 * Three is the whole budget: StartGeek's Ask lives inside a 3 s GlanceIntent
 * timeout, so a fourth attempt is a timeout dressed as a retry.
 *
 * Phase 2 made this the budget for *every* auto caller, not only the ones
 * that said `freeOnly` — there is one walk now. The governed paid attempt
 * sits outside the count: it happens at most once, after the free rows, and
 * only with `allowPaid` and the budget's blessing.
 */
const MAX_FREE_TIER_ATTEMPTS = 3;

/**
 * Read a positive integer from an env var, falling back to `fallback` when
 * unset, unparseable, or <= 0. Keeps a typo'd env var from silently
 * disabling the cache bound (NaN comparisons are always false, which would
 * make the eviction loop a no-op).
 */
function envPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    logger.warn(`Ignoring invalid ${name}="${raw}" — using default ${fallback}`);
    return fallback;
  }
  return parsed;
}

function normalizeMessageContent(content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part;
      if (part?.text) return part.text;
      if (part?.type === 'text' && part?.value) return part.value;
      return JSON.stringify(part);
    }).join('\n');
  }

  if (content && typeof content === 'object') {
    if (content.text) return content.text;
    if (content.value) return content.value;
    return JSON.stringify(content);
  }

  if (content === undefined || content === null) {
    return '';
  }

  return String(content);
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map(message => ({
    ...message,
    content: normalizeMessageContent(message.content)
  }));
}

// The two sampling translators that used to live here — `openAISamplingFields`
// (F-09, the five knobs the proxy accepted and this service dropped) and
// `stopSequencesFrom` (OpenAI's `stop` as the array form Gemini, Cohere and
// Ollama want) — moved to `ai/adapters/openaiCompatible.js` in Phase 2, beside
// the bodies they are spread into. They were only ever called by the ten
// `call<Provider>` methods that are now five adapter files.

// Cloud-based summarization using existing free AI providers

class AIService {
  constructor() {
    // Smart context management - using cloud-based summarization
    this.summarizer = null; // Not used (cloud-based)
    this.summarizationEnabled = true; // Re-enabled with cloud approach
    this.summarizationThreshold = 8000;

    // Response caching — bounded on BOTH axes:
    //   TTL  keeps a long-lived process from serving stale completions forever
    //   LRU  caps memory when prompt churn would otherwise grow the Map without limit
    // A Map is insertion-ordered, so "oldest key" == least-recently-used as long
    // as every read re-inserts (see getCachedResponse).
    //
    // Tunables (env, both optional):
    //   AI_CACHE_MAX_ENTRIES  max cached responses      (default 500)
    //   AI_CACHE_TTL_MS       entry lifetime in ms      (default 30 minutes)
    this.responseCache = new Map();
    this.maxCacheSize = envPositiveInt('AI_CACHE_MAX_ENTRIES', 500);
    this.cacheTtlMs = envPositiveInt('AI_CACHE_TTL_MS', 30 * 60 * 1000);
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.cacheExpirations = 0;
    this.cacheEvictions = 0;

    // Request batching
    this.batchQueue = [];
    this.batchTimeout = null;
    this.batchMaxWait = 100; // 100ms max wait for batching
    this.batchMaxSize = 5; // Max 5 requests per batch

    // Provider rotation cooldowns. In memory only since 2026-09-07: the old
    // `logs/rotation-state.json` was per-container file state, written on every
    // call, reset by every deploy, and held remaining-quota numbers that a
    // response header reports for free (see rotationManager.js).
    this.rotationManager = new RotationManager();

    // Per-(provider, model) free-tier health, mirroring AIFreeTier.health so
    // selection never waits on Mongo (R130). Keyed `<provider>/<modelId>`.
    this.freeTierHealth = new Map();

    // The rotation pins each provider to its default model, overriding any
    // model stored on the provider's database row. Derived from the same table
    // the defaults below come from, so the two cannot drift apart.
    this.rotationProviderOverrides = ROTATION_MODEL_OVERRIDES;

    // The live *connection* per provider: base URL, credential, default model,
    // the two ceilings, and whether it is enabled. Built from the roster
    // (`config/aiProviders.js`) rather than typed here — until Phase 2 this was
    // a second hand-kept table of the same nine rows, and the roster test
    // existed precisely because the two could disagree about a base URL or a
    // default model. The adapter facts (shape, headers, dropped knobs, tool
    // forwarding) are *not* copied in: they stay on the descriptor, which the
    // registry merges at call time, so nothing a database row says can
    // overwrite one.
    //
    // `costPer1kTokens` lived here until Phase 1 (2026-09-07): one blended
    // dollars-per-1,000-tokens rate per provider, in a different unit from the
    // AIPricing collection's per-1,000,000, so the two could never be compared
    // without a conversion nobody remembered. It was also a single rate for
    // input and output. Cost now comes from the response (OpenRouter reports
    // `usage.cost` in dollars, exact) or from AIPricing per model, and lands in
    // the `AISpend` ledger — see `updateStats` and `resolveCostUsd`.
    this.providers = buildProviderConnections();

    this.currentProvider = 'groq';
    this.fallbackOrder = [...FALLBACK_ORDER];

    /**
     * Per-provider 429 memory: `{ [provider]: { rateLimitedUntil } }`, written
     * only by `markRateLimited` off a real response, read only by
     * `isRateLimited`. Starts empty and stays empty until a provider says no.
     *
     * Until Phase 1 (2026-09-07) this was a hand-typed table of RPM / TPM /
     * RPD / requests-per-month per provider, with in-process counters, and
     * `checkRateLimit` refused a call it predicted would be refused upstream.
     * Three problems, all of them expensive:
     *
     *   1. The numbers were wrong and unfixable. They were the *second* of
     *      three copies in the repo (rotationManager.PROVIDER_LIMITS and
     *      aiDirectorService's free-tier seed were the others) and all three
     *      disagreed — Groq's TPM read 6000, 12000 or 18000 depending on the
     *      file. A vendor changing a tier silently invalidated all three.
     *   2. The counters were per process. Two containers each thought they had
     *      the whole allowance.
     *   3. It guessed *ahead* of the provider. A wrong low guess skipped a
     *      provider that would have answered; the provider's own 429 is free,
     *      accurate and arrives exactly when it is true.
     *
     * What replaced it: `recordObservedLimits` writes the provider's own
     * `x-ratelimit-*` headers into the row (`AIFreeTier.freeLimits` for the
     * ceilings, `.observed` for what is left), selection skips a row the
     * headers say is exhausted, and a 429 cools the provider for as long as
     * its own `retry-after` asks.
     */
    this.rateLimits = {};

    /**
     * `provider/modelId` → epoch ms of the last `recordObservedLimits` write,
     * so a hot path cannot turn one Mongo write per call into the bottleneck.
     */
    this.observedLimitWrites = new Map();

    /** `provider/modelId` → { at, inputPrice, outputPrice } from AIPricing. */
    this.pricingCache = new Map();

    this.sessionStats = {
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      providerUsage: {}
    };

    // Initialize configurations (will be loaded asynchronously)
    this.initialized = false;
    this.initializeService();
  }

  async initializeService() {
    try {
      await this.loadConfigurations();
      // No seeding. `seedInitialModels` used to run here and re-stamp ~40
      // hand-typed model ids `isActive: true` on every boot — including ids
      // their vendors had retired, which defeated the 24-hour staleness sweep
      // that was supposed to catch exactly that. The catalog is now written by
      // observation (`aiCatalogJob` → `aiCatalogDiscovery`), and a model this
      // process has never heard of is a model it does not claim exists.
      logger.info('AI Service initialized with configurations from database');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize AI service');
    } finally {
      // Always mark as initialized so we don't block forever
      // Even on partial failure, the service can function with defaults
      this.initialized = true;
    }
  }

  // Load configurations from database
  async loadConfigurations() {
    try {
      logger.info('🔍 Loading AI configurations from database...');
      const configs = await AIConfig.find({});
      logger.info(`📊 Found ${configs.length} configurations in database`);

      for (const config of configs) {
        logger.debug(`  ${config.provider}: enabled=${config.enabled}, apiKey=${config.apiKey ? 'Set' : 'Not Set'}`);
        if (this.providers[config.provider]) {
          const decryptedKey = config.getDecryptedKey();
          this.providers[config.provider].apiKey = decryptedKey ? decryptedKey.trim() : '';
          this.providers[config.provider].enabled = config.enabled;
          this.providers[config.provider].model = this.rotationProviderOverrides[config.provider]?.model || this.providers[config.provider].model;
          this.providers[config.provider].maxTokens = config.maxTokens || this.providers[config.provider].maxTokens;
          this.providers[config.provider].temperature = config.temperature || this.providers[config.provider].temperature;

          // Handle Cloudflare-specific fields
          if (config.provider === 'cloudflare' && config.accountId) {
            this.providers[config.provider].accountId = config.accountId.trim();
          }
        }
      }
      this.logApiKeyStatus();
    } catch (error) {
      logger.error({ err: error }, 'Failed to load AI configurations');
    }
  }

  /**
   * Ask one provider what it offers and make `AIModel` match. Returns
   * `[{ id, name }]`, unchanged — `aiDirectorService.collectModelInformation`
   * and the admin refresh route both read that shape.
   *
   * This was ~140 lines of per-provider fetch code with a hardcoded Gemini
   * model list as its fallback (a list that had already outlived the 1.5
   * family). It is now a thin call into `aiCatalogDiscovery`, which is the same
   * code the scheduled job and the two RUNBOOK scripts use — so the admin
   * button and the nightly run can no longer produce different catalogs. No
   * probing happens here: this is "what exists", not "what answers".
   *
   * A provider with no key throws, as it always did; a listing that fails
   * throws with the provider's status and nothing else.
   */
  async refreshModels(provider) {
    const providerConfig = this.providers[provider];
    if (!providerConfig) throw new Error(`Unknown provider: ${provider}`);
    if (!providerConfig.apiKey) throw new Error(`${provider} API key not configured`);

    try {
      const raw = await listModels(provider, providerConfig);
      let rows;
      if (provider === 'openrouter') {
        const { free, paid } = openRouterCatalog(raw);
        rows = [...free, ...paid];
      } else {
        rows = listedRows(provider, raw);
      }

      const writeDeps = { model: AIModel, pricing: AIPricing, freeTier: AIFreeTier };
      for (const row of rows) {
        await writeListed({ provider, ...row }, writeDeps);
      }
      await deactivateUnlisted({ provider, listedIds: rows.map(r => r.modelId) }, writeDeps);

      return rows.map(row => ({ id: row.modelId, name: row.name }));
    } catch (error) {
      logger.error({ err: error }, `Failed to refresh models for ${provider}`);
      throw error;
    }
  }

  async getModels(provider) {
    try {
      // Get models from database
      const dbModels = await AIModel.find({
        provider,
        isActive: true
      }).sort({ name: 1 });

      return dbModels.map(model => ({
        id: model.modelId,
        name: model.name
      }));
    } catch (error) {
      logger.error({ err: error }, `Failed to get models for ${provider}`);
      return [];
    }
  }

  /*
   * `seedInitialModels` lived here until Phase 1 (2026-09-07): ~90 lines of
   * hand-typed model ids per provider, upserted `isActive: true` on every boot.
   *
   * Every failure mode it had was structural. It re-animated ids the vendors
   * had retired (`llama-3.1-8b-instant`, `gemini-1.5-*`, `mixtral-8x7b-32768`),
   * so the staleness sweep never fired; it claimed models this account has no
   * access to; and it seeded a paid OpenRouter passthrough for a model three
   * generations stale that nothing pinned. The catalog is written by
   * observation now — `aiCatalogDiscovery.listedRows` per provider, on a
   * schedule, plus `refreshModels` above for the admin button.
   */

  /**
   * Get or initialize the summarization model (lazy loading)
   * Using cloud-based summarization - no local model needed
   */
  async getSummarizer() {
    // Cloud-based approach - no model loading needed
    return true; // Always available
  }  /**
   * Estimate token count (rough: 1 char ≈ 0.75 tokens)
   */
  estimateTokens(input) {
    if (!input) return 0;

    if (Array.isArray(input)) {
      return countMessageTokens(input);
    }

    if (typeof input === 'string') {
      return countTextTokens(input);
    }

    if (typeof input === 'object') {
      try {
        return countTextTokens(JSON.stringify(input));
      } catch (error) {
        logger.warn({ err: error }, '[AIService] Failed to stringify input for token count, falling back to heuristic');
      }
    }

    return Math.ceil(String(input).length / 4);
  }

  /**
   * Generate cache key for request.
   *
   * structuredFingerprint is a stable hash of response_format + tools + tool_choice
   * (see structuredOutputFingerprint). Included so two identical prompts with
   * different structured-output requirements don't collide in the cache and
   * return each other's plaintext.
   */
  getCacheKey(prompt, provider, model, temperature, namespace = 'default', structuredFingerprint = '') {
    const hash = crypto.createHash('md5')
      .update(`${prompt}:${provider}:${model}:${temperature}:${namespace}:${structuredFingerprint}`)
      .digest('hex');
    return hash;
  }

  /**
   * Stable hash of structured-output parameters for cache-key segregation.
   * Returns '' when no structured output requested (so existing cache entries
   * from before this change still match — they were written with fingerprint '').
   */
  structuredOutputFingerprint(responseFormat, tools, toolChoice) {
    if (!responseFormat && !tools && !toolChoice) return '';
    const payload = JSON.stringify({
      rf: responseFormat || null,
      t: Array.isArray(tools) ? tools.map(t => t?.function?.name || t?.name || '').sort() : null,
      tc: toolChoice || null
    });
    return crypto.createHash('md5').update(payload).digest('hex').slice(0, 12);
  }

  /**
   * The conversation, as the string the cache key is built from.
   *
   * FINDING F-03: the key used to be built from the *routing prompt* — which
   * the proxy derives from the last user message alone. Two different
   * conversations whose last turn is "continue" (or "why?", "go on",
   * "summarise that", "fix it" — the whole vocabulary of multi-turn chat)
   * therefore shared one cache entry, and the second caller was served the
   * first caller's answer for up to thirty minutes. Since the cache is
   * process-global, across a shared baseGeek that meant one app's completion
   * answered out of another app's conversation: a small cross-tenant leak
   * wearing an HTTP 200.
   *
   * Every field that changes what the model sees goes in: role, content, the
   * speaker `name`, and both halves of a tool loop (an assistant turn's
   * tool_calls and a tool turn's tool_call_id), so a conversation that differs
   * only in which tool result came back is a different entry.
   *
   * Falls back to the prompt when there is no messages array — a caller that
   * only ever passes a prompt string has no history to be blind to.
   */
  conversationCacheSubject(messages, prompt) {
    if (!Array.isArray(messages) || messages.length === 0) return prompt || '';
    return JSON.stringify(messages.map(m => [
      m?.role ?? '',
      m?.content ?? '',
      m?.name ?? '',
      m?.tool_call_id ?? '',
      Array.isArray(m?.tool_calls)
        ? m.tool_calls.map(tc => [tc?.id ?? '', tc?.function?.name ?? '', tc?.function?.arguments ?? ''])
        : ''
    ]));
  }

  /**
   * Structured-output prompt-injection fallback (item 5).
   *
   * When a provider/model lacks native response_format support but the caller
   * wants structured output, wrap the messages with instructions that coax the
   * model into emitting JSON. The response then goes through repairJSONContent
   * to strip markdown fences and trailing prose.
   *
   * Fired only after the capability check decides native handling isn't
   * available; preserves rotation (every provider can "do" structured
   * output this way, so no provider is skipped on capability grounds).
   */
  wrapMessagesForStructuredFallback(messages, prompt, responseFormat) {
    const instruction = this.buildStructuredFallbackInstruction(responseFormat);
    if (!instruction) return { messages, prompt };

    let nextMessages;
    if (messages && Array.isArray(messages) && messages.length > 0) {
      nextMessages = [...messages];
      const systemIdx = nextMessages.findIndex(m => m.role === 'system');
      if (systemIdx >= 0) {
        nextMessages[systemIdx] = {
          ...nextMessages[systemIdx],
          content: `${nextMessages[systemIdx].content ?? ''}\n\n${instruction}`
        };
      } else {
        nextMessages.unshift({ role: 'system', content: instruction });
      }
    } else {
      nextMessages = [
        { role: 'system', content: instruction },
        { role: 'user', content: prompt }
      ];
    }

    const nextPrompt = (nextMessages || []).map(m => `${m.role}: ${m.content ?? ''}`).join('\n');
    return { messages: nextMessages, prompt: nextPrompt };
  }

  buildStructuredFallbackInstruction(responseFormat) {
    if (!responseFormat) return null;
    if (responseFormat.type === 'json_object') {
      return 'You MUST respond with a single valid JSON object and nothing else. Do not wrap the response in markdown code fences or add explanatory prose.';
    }
    if (responseFormat.type === 'json_schema' && responseFormat.json_schema?.schema) {
      const name = responseFormat.json_schema.name || 'output';
      const schemaText = JSON.stringify(responseFormat.json_schema.schema);
      return `You MUST respond with a single valid JSON object named "${name}" that strictly conforms to this JSON Schema:\n${schemaText}\nRespond with only the JSON object. No markdown fences, no commentary, no trailing text.`;
    }
    return null;
  }

  /**
   * Repair fallback-produced content into parseable JSON: strip markdown fences,
   * extract the first balanced {...} or [...] block, trim surrounding prose.
   * Returns the repaired string (still a string — caller parses). If no JSON
   * found, returns the original content unchanged.
   */
  repairJSONContent(content) {
    if (typeof content !== 'string') return content;
    let s = content.trim();
    // Strip ``` or ```json fences
    const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
    if (fenceMatch) s = fenceMatch[1].trim();
    // Extract first top-level JSON object or array
    const first = s.search(/[\[{]/);
    if (first < 0) return content;
    const opener = s[first];
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = first; i < s.length; i++) {
      const c = s[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (c === '\\') { esc = true; continue; }
        if (c === '"') { inStr = false; }
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === opener) depth++;
      else if (c === closer) { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return content;
    return s.slice(first, end + 1);
  }

  /**
   * Get cached response
   */
  getCachedResponse(cacheKey) {
    if (this.responseCache.has(cacheKey)) {
      const cached = this.responseCache.get(cacheKey);
      // Expire stale entries on read — passive expiration avoids a
      // background timer and is sufficient for bounded-size caches.
      if (cached.timestamp && Date.now() - cached.timestamp > this.cacheTtlMs) {
        this.responseCache.delete(cacheKey);
        this.cacheExpirations++;
        this.cacheMisses++;
        return null;
      }
      this.cacheHits++;
      // Move to end (LRU)
      this.responseCache.delete(cacheKey);
      this.responseCache.set(cacheKey, cached);
      logger.debug(`💾 Cache HIT (${this.cacheHits}/${this.cacheHits + this.cacheMisses} = ${Math.round(this.cacheHits / (this.cacheHits + this.cacheMisses) * 100)}%)`);
      return cached;
    }
    this.cacheMisses++;
    return null;
  }

  /**
   * Set cached response (LRU eviction).
   *
   * Accepts either a plain string (legacy content-only call site) or a
   * full result object with { content, toolCalls, finishReason } so
   * tool-call responses survive cache hits. Without storing toolCalls,
   * the second identical request (e.g. Instructor's internal retry)
   * would see content='' and zero tool_calls and fail to parse.
   */
  setCachedResponse(cacheKey, response) {
    // Delete-then-set so an overwrite moves the key to the MRU end rather than
    // updating in place. It also means a refresh of an existing key never
    // triggers an eviction (the old code evicted on `size >= max` before the
    // insert, discarding a live entry to make room for one already present).
    this.responseCache.delete(cacheKey);
    const entry = typeof response === 'object' && response !== null && !Array.isArray(response)
      ? { ...response, timestamp: Date.now() }
      : { content: response, toolCalls: null, finishReason: 'stop', timestamp: Date.now() };
    this.responseCache.set(cacheKey, entry);
    this.enforceCacheBounds();
  }

  /**
   * Drop expired entries, then evict least-recently-used ones until the cache
   * fits maxCacheSize. Expired-first means a burst of writes reclaims dead
   * entries before it starts discarding live ones.
   */
  enforceCacheBounds(now = Date.now()) {
    if (this.responseCache.size > this.maxCacheSize) {
      for (const [key, entry] of this.responseCache) {
        if (this.responseCache.size <= this.maxCacheSize) break;
        if (entry?.timestamp && now - entry.timestamp > this.cacheTtlMs) {
          this.responseCache.delete(key);
          this.cacheExpirations++;
        }
      }
    }
    while (this.responseCache.size > this.maxCacheSize) {
      const lruKey = this.responseCache.keys().next().value;
      if (lruKey === undefined) break;
      this.responseCache.delete(lruKey);
      this.cacheEvictions++;
    }
  }

  /**
   * Retune the cache at runtime (and in tests). Shrinking maxSize evicts
   * immediately rather than waiting for the next write.
   */
  configureCache({ maxSize, ttlMs } = {}) {
    if (maxSize !== undefined) {
      const n = Number.parseInt(maxSize, 10);
      if (Number.isFinite(n) && n > 0) this.maxCacheSize = n;
    }
    if (ttlMs !== undefined) {
      const n = Number.parseInt(ttlMs, 10);
      if (Number.isFinite(n) && n > 0) this.cacheTtlMs = n;
    }
    this.enforceCacheBounds();
    return { maxSize: this.maxCacheSize, ttlMs: this.cacheTtlMs };
  }

  /**
   * Clear cache (can be called manually or on schedule)
   */
  clearCache() {
    const size = this.responseCache.size;
    this.responseCache.clear();
    logger.info(`🗑️  Cleared ${size} cached responses`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.responseCache.size,
      maxSize: this.maxCacheSize,
      ttlMs: this.cacheTtlMs,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      expirations: this.cacheExpirations,
      evictions: this.cacheEvictions,
      hitRate: this.cacheHits + this.cacheMisses > 0
        ? Math.round(this.cacheHits / (this.cacheHits + this.cacheMisses) * 100)
        : 0
    };
  }

  /**
   * Summarize text intelligently using cloud API
   */
  async summarizeText(text, targetTokens = 4000) {
    const currentTokens = this.estimateTokens(text);

    if (currentTokens <= targetTokens) {
      return text; // No need to summarize
    }

    logger.info(`📉 Summarizing ${currentTokens} tokens → target ${targetTokens} tokens (cloud-based)`);
    const startTime = Date.now();

    try {
      // Use a fast, free provider for summarization - load balance between Cerebras and Together
      let summarizationProvider = null;

      // Cerebras first (fastest), then Together, then Groq — skipping any that
      // is inside its own `retry-after`. This used to consult the static
      // per-minute token table; a summarization is a 2,000-token call and the
      // provider's 429 is the only honest answer to whether it will take one.
      for (const candidate of ['cerebras', 'together', 'groq']) {
        const pc = this.providers[candidate];
        if (pc?.enabled && pc.apiKey && !this.isRateLimited(candidate)) {
          summarizationProvider = candidate;
          break;
        }
      }

      if (!summarizationProvider) {
        logger.info('⚠️  No summarization provider available, using truncation');
        return text.substring(0, Math.floor(targetTokens / 0.75));
      }

      const providerConfig = this.providers[summarizationProvider];
      const targetChars = Math.floor(targetTokens / 0.75);

      // Call the AI provider to summarize, through the same adapter a real
      // call takes. This was a hand-rolled `axios.post` to
      // `{baseURL}/chat/completions` until Phase 2 — the eleventh copy of the
      // OpenAI-compatible request, and the one that would have kept working
      // after the ten adapters were replaced, quietly, with its own headers
      // and its own error handling. The three candidates above are all
      // `shape: 'openai'` rows; if a future candidate is not, the registry
      // will speak its dialect and this code will not have to know.
      const result = (await callAdapter(summarizationProvider, providerConfig, {
        messages: [
          {
            role: 'system',
            content: `You are a text summarization assistant. Summarize the following text concisely while preserving key information. Target length: approximately ${targetChars} characters.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        model: providerConfig.model,
        maxTokens: Math.min(2000, targetTokens),
        temperature: 0.3, // Low temperature for consistent summarization
        // A summarization is a step on the way to the *real* call, so it gets
        // a tenth of the adapter's patience: 10 s, as it always had.
        timeoutMs: 10000
      })).content;
      const resultTokens = this.estimateTokens(result);

      logger.info(`✅ Summarized in ${Date.now() - startTime}ms using ${summarizationProvider}: ${currentTokens} → ${resultTokens} tokens (${Math.round((1 - resultTokens/currentTokens) * 100)}% reduction)`);

      return result;
    } catch (error) {
      logger.error({ err: error }, '❌ Cloud summarization failed');
      // Fallback: simple truncation
      logger.info('⚠️  Using truncation fallback');
      return text.substring(0, Math.floor(targetTokens / 0.75));
    }
  }  /**
   * Summarize messages array intelligently
   */
  async summarizeMessages(messages, targetTokens = 4000) {
    if (!messages || messages.length === 0) return messages;

    // Calculate total tokens
    const totalTokens = countMessageTokens(messages);

    if (totalTokens <= targetTokens) {
      return messages; // No need to summarize
    }

    logger.info(`📉 Summarizing ${messages.length} messages (${totalTokens} tokens) → target ${targetTokens} tokens`);

    // Preserve system message if exists
    const systemMsg = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    // Combine user/assistant messages
    const conversationText = otherMessages.map(m => {
      return `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`;
    }).join('\n\n');

    // Summarize the conversation
    const systemTokens = systemMsg ? this.estimateTokens(systemMsg.content) : 0;
    const availableTokens = Math.max(1000, targetTokens - systemTokens); // Ensure positive minimum

    const summarizedText = await this.summarizeText(conversationText, availableTokens);

    // Return condensed messages
    const result = [
      ...(systemMsg ? [systemMsg] : []),
      { role: 'user', content: summarizedText }
    ];

    return result;
  }

  /**
   * Smart preprocessing: summarize if needed based on provider context limits
   */
  async preprocessContext(prompt, messages, targetProvider) {
    if (!this.summarizationEnabled) {
      return { prompt, messages };
    }

    const providerConfig = this.providers[targetProvider];
    if (!providerConfig || !providerConfig.maxContextTokens) {
      return { prompt, messages }; // No limit, no summarization
    }

    // Estimate current size
    const estimatedTokens = Array.isArray(messages)
      ? countMessageTokens(messages)
      : this.estimateTokens(prompt);

    // 50% threshold to leave more room for response (was 70%)
    const threshold = Math.floor(providerConfig.maxContextTokens * 0.5);

    if (estimatedTokens <= threshold) {
      return { prompt, messages }; // Within limits
    }

    logger.info(`📊 Context (${estimatedTokens} tokens) exceeds ${targetProvider} threshold (${threshold} tokens)`);

    // Summarize
    if (messages) {
      logger.info(`🔄 Attempting to summarize ${messages.length} messages from ${estimatedTokens} → ${threshold} tokens`);
      const summarizedMessages = await this.summarizeMessages(messages, threshold);
      const newEstimate = countMessageTokens(summarizedMessages);
      logger.info(`✅ Summarization complete: ${estimatedTokens} → ${newEstimate} tokens (${messages.length} → ${summarizedMessages.length} messages)`);
      const newPrompt = summarizedMessages.map(m => `${m.role}: ${m.content}`).join('\n');
      return { prompt: newPrompt, messages: summarizedMessages };
    } else {
      const summarizedPrompt = await this.summarizeText(prompt, threshold);
      return { prompt: summarizedPrompt, messages: null };
    }
  }



  // Log API key status for debugging
  logApiKeyStatus() {
    logger.info('=== AI Service API Key Status ===');
    for (const [provider, config] of Object.entries(this.providers)) {
      const apiKey = config.apiKey;
      if (apiKey && apiKey.length > 10) {
        // 12 leading + 8 trailing characters is most of a short provider key.
        // config/aiProviders.js already defines the only fragment of a
        // credential that may leave the process, and a log file is "leaving".
        logger.info(`${provider.toUpperCase()} API = ${keyHintFor(apiKey)} ✅`);
      } else {
        logger.info(`${provider.toUpperCase()} API = Not configured ❌`);
      }
    }
    logger.info('================================');
  }

  /**
   * `true` when this provider answered 429 recently enough that its own
   * `retry-after` has not elapsed. The only quota question this service asks
   * before a call, and it is answered from what a provider actually said.
   */
  isRateLimited(provider, now = Date.now()) {
    const until = this.rateLimits[provider]?.rateLimitedUntil;
    return Boolean(until) && now < until;
  }

  /**
   * Mark a provider as rate limited, for as long as it asked.
   *
   * `retryAfterSeconds` comes from the response's `retry-after` header where
   * the provider sent one (see `retryAfterFrom`), and falls back to 60 — which
   * used to be the only value this ever used, whatever the provider said.
   */
  markRateLimited(provider, retryAfterSeconds = 60) {
    const seconds = Number.isFinite(Number(retryAfterSeconds)) && Number(retryAfterSeconds) > 0
      ? Number(retryAfterSeconds)
      : 60;
    const bucket = (this.rateLimits[provider] ||= {});
    bucket.rateLimitedUntil = Date.now() + seconds * 1000;
    logger.info(`⏸️  ${provider} marked as rate limited for ${seconds}s`);
    return bucket.rateLimitedUntil;
  }

  /**
   * How long a provider asked us to wait, out of an error's own response.
   * Returns null when it said nothing, and the caller's default applies.
   */
  retryAfterFrom(error) {
    const headers = error?.response?.headers;
    if (!headers) return null;
    const { retryAfterSeconds } = parseRateLimitHeaders(headers);
    return retryAfterSeconds ?? null;
  }

  /**
   * Learn this row's quota from the response that just came back.
   *
   * The provider is the only party that knows our allowance, and it puts it in
   * every response: `x-ratelimit-limit-*` is the ceiling, `-remaining-*` is
   * what is left, `-reset-*` is when it refills.
   * `aiCatalogDiscovery.parseRateLimitHeaders` normalizes the four dialects
   * this suite meets (Groq/Cerebras/Together/LLM Gateway suffixed, OpenRouter
   * unqualified) and ignores everything else.
   *
   * Ceilings go to `freeLimits` — the same fields `aiUsageService` meters
   * against — and the live reading to `observed`. Debounced to one write per
   * row per minute: a chatty app would otherwise turn this into a Mongo write
   * per AI call to store a number that changes by one.
   *
   * Fire-and-forget by design: the caller is mid-request, and a quota reading
   * is not worth making a user wait for. No upsert — a model with no free row
   * is not made into one by having been called.
   */
  recordObservedLimits(provider, modelId, headers, now = Date.now()) {
    if (!headers || !modelId) return null;
    const { limits, observed } = parseRateLimitHeaders(headers, now);
    if (Object.keys(limits).length === 0 && Object.keys(observed).length === 0) return null;

    const key = this.freeTierKey(provider, modelId);
    const last = this.observedLimitWrites.get(key) || 0;
    if (now - last < 60 * 1000) return { limits, observed, wrote: false };
    this.observedLimitWrites.set(key, now);

    const $set = { 'observed.seenAt': new Date(now) };
    for (const [field, value] of Object.entries(limits)) $set[`freeLimits.${field}`] = value;
    for (const [field, value] of Object.entries(observed)) $set[`observed.${field}`] = value;

    AIFreeTier.updateOne({ provider, modelId }, { $set }).catch((err) => {
      logger.debug({ err, provider, modelId }, '[AIService] failed to record observed limits');
    });

    return { limits, observed, wrote: true };
  }


  /* ─────────────────── free-tier health (R130, 2026-09-06) ─────────────────
   *
   * The free rows in AIFreeTier are a shopping list, not a promise. Vendors
   * retire a model id without warning (groq/llama-3.1-8b-instant), stop serving
   * a "-Free" variant (together), or recycle a ":free" slug (openrouter) — and
   * because selection sorted only on provider priority, the same dead row was
   * picked first on every call, forever. The three methods below are the memory
   * that stops that: a hard failure cools the *row*, not the provider, and the
   * next call picks the next live row instead.
   *
   * This is row-level and orthogonal to two things that already existed and
   * stay untouched:
   *   - `rotationManager.markProviderCooling` / `isCooling` — provider-level,
   *     minutes long. It used to gate the all-provider rotation walk; with
   *     that walk gone (Phase 2) it is written on every 429 and read by
   *     `getServiceStats().rotation` and `getPriorityList`'s ordering, which
   *     is the honest scope for a provider-level signal in a row-level world.
   *   - `markRateLimited` — per-provider 429 handling, also unchanged. A 429 is
   *     not a hard failure here; a retired model is.
   *
   * The Map exists so a failure recorded 40 ms ago is honoured even though its
   * Mongo write is still in flight; the Mongo document is what survives a
   * restart. Both are read, and whichever observed the row more recently wins.
   */

  freeTierKey(provider, modelId) {
    return `${provider}/${modelId}`;
  }

  /**
   * Merge the in-process mirror over a row's stored health. Never awaits.
   * @param {string} provider
   * @param {string} modelId
   * @param {object|null} stored  the `health` subdocument off the AIFreeTier row
   */
  getFreeTierHealth(provider, modelId, stored = null) {
    const base = {
      consecutiveFailures: stored?.consecutiveFailures ?? 0,
      lastFailureAt: stored?.lastFailureAt ?? null,
      lastFailureCode: stored?.lastFailureCode ?? null,
      lastSuccessAt: stored?.lastSuccessAt ?? null,
      coolingUntil: stored?.coolingUntil ?? null
    };
    const live = this.freeTierHealth.get(this.freeTierKey(provider, modelId));
    if (!live) return base;

    // Whichever side observed the row more recently wins, whole. The mirror is
    // usually it — our own Mongo write is still in flight — but not always:
    // `scripts/probe-free-tier.js --mark` and any sibling process write
    // straight to the document, and a stale mirror must not resurrect a row
    // the probe just buried.
    const asOf = (h) => Math.max(
      h?.lastFailureAt ? new Date(h.lastFailureAt).getTime() : 0,
      h?.lastSuccessAt ? new Date(h.lastSuccessAt).getTime() : 0
    );
    return asOf(base) > asOf(live) ? base : { ...base, ...live };
  }

  /**
   * Record a hard failure against one free-tier row: bump the counters and put
   * the row to sleep. Six hours for the first, twenty-four once it has failed
   * three times running — a model that is gone is gone, and re-proving that
   * every six hours costs a user-visible timeout each time.
   *
   * Fire-and-forget on the Mongo side: the caller is in the middle of a request
   * and the mirror already carries the answer selection needs.
   */
  markFreeTierFailure(provider, modelId, code, storedHealth = null) {
    const key = this.freeTierKey(provider, modelId);
    // Count from the merged view, not the mirror alone: after a restart the
    // mirror is empty and the row may already be two hard failures deep.
    const previous = this.getFreeTierHealth(provider, modelId, storedHealth);
    const consecutiveFailures = (previous?.consecutiveFailures ?? 0) + 1;
    const now = new Date();
    const cooldownMs = consecutiveFailures >= FREE_TIER_LONG_COOLDOWN_AFTER
      ? FREE_TIER_LONG_COOLDOWN_MS
      : FREE_TIER_COOLDOWN_MS;
    const health = {
      consecutiveFailures,
      lastFailureAt: now,
      lastFailureCode: code,
      lastSuccessAt: previous?.lastSuccessAt ?? null,
      coolingUntil: new Date(now.getTime() + cooldownMs)
    };
    this.freeTierHealth.set(key, health);

    logger.warn(
      { provider, modelId, code, consecutiveFailures, coolingUntil: health.coolingUntil },
      `[FreeTier] ${provider}/${modelId} failed hard — cooling for ${Math.round(cooldownMs / 3600000)}h`
    );

    AIFreeTier.updateOne(
      { provider, modelId },
      {
        $set: {
          'health.consecutiveFailures': consecutiveFailures,
          'health.lastFailureAt': health.lastFailureAt,
          'health.lastFailureCode': code,
          'health.coolingUntil': health.coolingUntil
        }
      }
    ).catch((err) => {
      logger.warn({ err, provider, modelId }, '[FreeTier] failed to persist health');
    });

    return health;
  }

  /**
   * A row answered. Clear its failure memory so one bad afternoon does not
   * follow it around, and record when it last worked — selection prefers the
   * most recently proven row within a provider tier.
   */
  markFreeTierSuccess(provider, modelId) {
    const key = this.freeTierKey(provider, modelId);
    const now = new Date();
    const health = {
      consecutiveFailures: 0,
      lastFailureAt: null,
      lastFailureCode: null,
      lastSuccessAt: now,
      coolingUntil: null
    };
    this.freeTierHealth.set(key, health);

    AIFreeTier.updateOne(
      { provider, modelId },
      {
        $set: {
          'health.consecutiveFailures': 0,
          'health.lastFailureAt': null,
          'health.lastFailureCode': null,
          'health.lastSuccessAt': now,
          'health.coolingUntil': null
        }
      }
    ).catch((err) => {
      logger.warn({ err, provider, modelId }, '[FreeTier] failed to persist health');
    });

    return health;
  }

  /**
   * The ordered free-tier candidate list for one call.
   *
   * Rows are dropped when the provider has no key or is disabled, and set
   * aside when the row is cooling (R130) or when the provider's own headers
   * said this row has zero requests left before a reset that has not happened
   * yet — the one case where we *know*, rather than guess, that a call would
   * 429 (`observed`, written by `recordObservedLimits`).
   *
   * What is left is ordered within each provider tier by:
   *
   *   1. the provider's auto-router first, where it has one. `openrouter/free`
   *      is alive whenever any free OpenRouter model is, which beats any
   *      single row's odds;
   *   2. `fitness: 'structured'` above `'basic'` above never-probed. Every AI
   *      feature in this suite asks for structured output, so a model that
   *      proved it can produce JSON is worth more than one that only proved it
   *      can talk. Nothing is excluded for being small — it is ranked;
   *   3. most recently proven — a row that answered ten minutes ago outranks
   *      one that has never been tried;
   *   4. fewest failures, so a row that has been failing softly sinks.
   *
   * @returns {{live: object[], cooling: object[]}}
   */
  async selectFreeTierCandidates(now = Date.now()) {
    const freeModels = await AIFreeTier.find({ isFree: true });
    const priorityList = this.rotationManager.getPriorityList();
    const live = [];
    const cooling = [];

    for (const fm of freeModels) {
      const pc = this.providers[fm.provider];
      if (!pc || !pc.apiKey || pc.enabled === false) continue;

      const health = this.getFreeTierHealth(fm.provider, fm.modelId, fm.health);
      const candidate = {
        provider: fm.provider,
        modelId: fm.modelId,
        limits: fm.freeLimits,
        fitness: fm.fitness ?? null,
        probedAt: fm.probedAt ?? null,
        observed: fm.observed ?? null,
        health
      };

      const resetAt = fm.observed?.resetAt ? new Date(fm.observed.resetAt).getTime() : null;
      const exhausted = fm.observed?.remainingRequests === 0 && Number.isFinite(resetAt) && resetAt > now;

      if (isFreeTierCooling(health, now)) cooling.push(candidate);
      else if (exhausted) cooling.push({ ...candidate, exhausted: true });
      else live.push(candidate);
    }

    const priorityOf = (provider) => {
      const idx = priorityList.indexOf(provider);
      return idx === -1 ? 999 : idx;
    };
    const routerFirst = (candidate) =>
      ROUTER_MODEL_IDS[candidate.provider] === candidate.modelId ? 0 : 1;
    const FITNESS_RANK = { structured: 0, basic: 1 };
    const fitnessOf = (candidate) => FITNESS_RANK[candidate.fitness] ?? 2;
    const successAt = (candidate) =>
      candidate.health?.lastSuccessAt ? new Date(candidate.health.lastSuccessAt).getTime() : 0;
    /** When a set-aside row may be tried again: its cooling, or its quota reset. */
    const wakeAt = (candidate) => {
      const until = candidate.health?.coolingUntil ?? candidate.observed?.resetAt ?? null;
      const at = until ? new Date(until).getTime() : 0;
      return Number.isFinite(at) ? at : 0;
    };

    live.sort((a, b) =>
      priorityOf(a.provider) - priorityOf(b.provider) ||
      routerFirst(a) - routerFirst(b) ||
      fitnessOf(a) - fitnessOf(b) ||
      successAt(b) - successAt(a) ||
      (a.health?.consecutiveFailures ?? 0) - (b.health?.consecutiveFailures ?? 0)
    );
    // Soonest to wake first: if every row is cooling we try the one closest to
    // being allowed back rather than answering nothing.
    cooling.sort((a, b) => wakeAt(a) - wakeAt(b));

    return { live, cooling };
  }

  /**
   * Turn the ordered candidates into at most `limit` attempts, preferring a
   * *different provider* for the retry. One vendor having retired a model is
   * weak evidence about its other models and strong evidence about nothing;
   * a 401 on that vendor's key is strong evidence about all of them. Spreading
   * the retry across providers is right in both cases.
   */
  planFreeTierAttempts(candidates, limit = MAX_FREE_TIER_ATTEMPTS) {
    const attempts = [];
    const remaining = [...candidates];
    while (remaining.length && attempts.length < limit) {
      const usedProviders = new Set(attempts.map(a => a.provider));
      let index = remaining.findIndex(c => !usedProviders.has(c.provider));
      if (index === -1) index = 0;
      attempts.push(remaining.splice(index, 1)[0]);
    }
    return attempts;
  }

  /**
   * The app's routing row, with its `lastSeen` touched and a default row
   * created for an app nobody has configured yet.
   *
   * Every `auto` call reads this now, not only the ones that said
   * `useAppConfig` — the row is where `allowPaid`, `sticky` and the token
   * defaults live, and "nothing at all" is `auto` reading the app's row per
   * DOCS/AIGEEK_FRONT_DOOR.md §1. A pin skips it (see `callAI`), so the extra
   * query is one indexed `findOne` on the path that was already doing it for
   * the majority of callers.
   *
   * Auto-discovery writes the *normalized* id, so the collection stops growing
   * a row per spelling, and writes `tier: 'auto'` — the legacy default was
   * `free`, which is read as `auto` anyway but leaves a row that lies about
   * what it does.
   *
   * Never throws: a routing row we cannot read is a reason to fall back to
   * plain `auto`, not a reason to fail the call.
   */
  async routingRowFor(appId) {
    try {
      const row = await this.findAppConfig(appId);
      if (row) {
        row.lastSeen = new Date();
        row.save().catch(() => {}); // fire-and-forget
        return row;
      }
      AIAppConfig.findOneAndUpdate(
        { appName: appId },
        { appName: appId, tier: 'auto', autoDiscovered: true, lastSeen: new Date() },
        { upsert: true, new: true }
      ).catch(() => {});
      logger.info(`[Route] ${appId} → auto-discovered, defaulting to auto`);
      return null;
    } catch (error) {
      logger.error({ err: error, appId }, '[Route] failed to resolve the routing row');
      return null;
    }
  }

  /**
   * Can this pin actually serve a request? Asked only of a pin that did *not*
   * say `noFallback` — §1: a pin is a promise for callers that said so, and a
   * preference for everyone else.
   *
   * "Absent from the catalog" is read narrowly and deliberately. A model id we
   * have simply never heard of is *attempted*: the catalog is observed, it is
   * incomplete by construction (a provider we hold no key for lists nothing),
   * and refusing every unknown id would turn an empty catalog into a total
   * outage. What counts as evidence against a pin is evidence:
   *
   *   - the provider has no key, or is disabled — nothing to call;
   *   - an `AIFreeTier` row for this exact model that is cooling (R130);
   *   - an `AIModel` row for this exact model marked `isActive: false`, which
   *     is what discovery writes when a vendor stops listing it;
   *   - the provider has an active catalog and this id is not in it.
   *
   * @returns {Promise<{ok: boolean, reason: string|null}>}
   */
  async pinIsUsable(provider, modelId) {
    const providerConfig = this.providers[provider];
    if (!providerConfig || !providerConfig.apiKey || providerConfig.enabled === false) {
      return { ok: false, reason: 'provider_unavailable' };
    }
    // A pin that named no model rides the provider's default, which is a
    // roster constant rather than a catalog row — there is nothing to check.
    if (!modelId) return { ok: true, reason: null };

    try {
      const [freeRow, modelRow] = await Promise.all([
        AIFreeTier.findOne({ provider, modelId }).lean(),
        AIModel.findOne({ provider, modelId }).lean()
      ]);

      if (freeRow) {
        const health = this.getFreeTierHealth(provider, modelId, freeRow.health);
        if (isFreeTierCooling(health)) return { ok: false, reason: 'pin_cooling' };
      }
      if (modelRow && modelRow.isActive === false) {
        return { ok: false, reason: 'pin_retired' };
      }
      if (!modelRow) {
        // Only actionable when we demonstrably *have* a catalog for this
        // provider. No catalog means no opinion.
        const hasCatalog = await AIModel.exists({ provider, isActive: true });
        if (hasCatalog) return { ok: false, reason: 'pin_absent' };
      }
      return { ok: true, reason: null };
    } catch (error) {
      // A catalog we cannot read is not evidence against the caller's pin.
      logger.debug({ err: error, provider, modelId }, '[Route] pin check failed — keeping the pin');
      return { ok: true, reason: null };
    }
  }

  /**
   * A pin is one attempt at one model. `model: null` means the provider's own
   * default, which is what `aiProviders.js` keeps `defaultModel` for now that
   * the rotation no longer walks it (§2).
   */
  planPinAttempt(route) {
    const modelId = route.model || this.providers[route.provider]?.model || null;
    return {
      attempts: [{ provider: route.provider, modelId, freeRow: null, paid: false, sticky: false }],
      hints: []
    };
  }

  /**
   * The `auto` walk, as a plan (§2): sticky pick, then health-ranked free
   * rows, then — if the row permits and the governor agrees — one paid
   * fallback attempt.
   *
   * This is now the walk for *every* auto caller, not only `freeOnly`. What it
   * replaced was the "generic provider walk": every provider in
   * `fallbackOrder`, each called with *its own default model*. That was the
   * right answer for a caller that asked for "an answer" and the wrong one for
   * everybody, because it answered — and billed — a request for one app's
   * routing row with whichever vendor's default happened to reply first
   * (R130, 2026-09-06: StartGeek's Ask fell through groq 404 → cerebras 401 →
   * together 400 → openrouter 404, well past its 3 s budget, and nothing
   * remembered any of it). A free-tier caller retries inside the free tier;
   * an auto caller now does the same, and money is a separate, gated step.
   *
   * @param {import('./aiRoute.js').Route} route
   * @param {{appId: string}} ctx
   */
  async planAutoAttempts(route, { appId } = {}) {
    const limit = route.singleAttempt ? 1 : MAX_FREE_TIER_ATTEMPTS;
    const hints = [];
    const attempts = [];

    let live = [];
    let cooling = [];
    try {
      ({ live, cooling } = await this.selectFreeTierCandidates());
    } catch (freeError) {
      logger.error({ err: freeError }, '[Auto] Failed to query free tier');
    }

    let chosen = live;
    if (chosen.length === 0 && cooling.length > 0) {
      // Everything is asleep. Answering nothing is worse than one attempt at
      // whichever row wakes soonest, so the free tier is never a total outage
      // just because the probe marked a batch of rows dead.
      logger.warn(
        { coolingRows: cooling.length },
        '[Auto] every free-tier row is cooling — trying the one closest to waking'
      );
      chosen = cooling.slice(0, 1);
    }

    // ── 1. the sticky pick ────────────────────────────────────────────────
    // Attempt one, ahead of the fitness ranking, because the point of a
    // sticky row is that it does not change while the conversation is alive.
    // It has to be a row selection already considers live: a stored pick that
    // is cooling, no longer free, or no longer in the catalog is not a voice
    // worth keeping.
    let stickyCandidate = null;
    let stored = null;
    if (route.sticky) {
      stored = await AIStickyPick.findOne({ key: route.sticky.key }).lean().catch(() => null);
      if (stored) {
        stickyCandidate = chosen.find(
          c => c.provider === stored.provider && c.modelId === stored.modelId
        ) || null;
        if (stickyCandidate) {
          hints.push('sticky_hit');
          chosen = [stickyCandidate, ...chosen.filter(c => c !== stickyCandidate)];
        } else if (stored.paid && route.allowPaid) {
          // A paid sticky pick is not in the free candidate list at all. It
          // still goes first, and still through the governor at dispatch.
          hints.push('sticky_hit_paid');
          attempts.push({
            provider: stored.provider,
            modelId: stored.modelId,
            freeRow: null,
            paid: true,
            sticky: true
          });
        } else {
          // The pick has died, or `allowPaid` was switched off under it. The
          // ordinary walk re-picks and `callAI` files the old one in
          // `previous` when the replacement answers.
          hints.push('sticky_stale');
        }
      }
    }

    // ── 2. the free rows ──────────────────────────────────────────────────
    for (const candidate of this.planFreeTierAttempts(chosen, Math.max(0, limit - attempts.length))) {
      attempts.push({
        provider: candidate.provider,
        modelId: candidate.modelId,
        freeRow: candidate,
        paid: false,
        sticky: !!(stickyCandidate && candidate === stickyCandidate)
      });
    }

    if (attempts.length > 0) {
      logger.info(
        {
          picked: `${attempts[0].provider}/${attempts[0].modelId}`,
          retries: attempts.slice(1).map(a => `${a.provider}/${a.modelId}`),
          skippedCooling: cooling.length,
          hints: [...route.hints, ...hints]
        },
        `[Auto] Selected ${attempts[0].provider}/${attempts[0].modelId}`
      );
    } else {
      // No row at all — not even a cooling one. There is nothing free to
      // call, and an auto caller must not be answered by a paid default
      // model, so this fails as itself unless the paid step below applies.
      logger.warn('[Auto] No free-tier models available with configured API keys');
    }

    // ── 3. the governed paid fallback ─────────────────────────────────────
    // One attempt, cheapest first, and only for a routing row that opted in.
    // The governor itself runs at dispatch, not here: the estimate needs the
    // preprocessed prompt, and a plan is not a decision to spend.
    if (route.allowPaid && !route.singleAttempt) {
      const paid = await this.selectPaidFallbackCandidates();
      const already = new Set(attempts.map(a => `${a.provider}/${a.modelId}`));
      const next = paid.find(p => !already.has(`${p.provider}/${p.modelId}`));
      if (next) {
        attempts.push({
          provider: next.provider,
          modelId: next.modelId,
          freeRow: null,
          paid: true,
          sticky: false,
          pricing: next.pricing
        });
        hints.push('paid_fallback_planned');
      } else if (paid.length === 0) {
        hints.push('paid_fallback_none');
      }
    }

    return { attempts, hints };
  }

  /**
   * The `paid-fallback` set, cheapest first.
   *
   * Written by the catalog job and nothing else: the three cheapest OpenRouter
   * paid rows that report `structured_outputs` (see
   * `apps/basegeek/DOCS/AIGEEK_CATALOG_JOB.md`). No human picks a paid model —
   * that is D4, and it is also the only way the price stays current.
   *
   * A row with no `AIPricing` entry is kept in the list with `pricing: null`
   * and refused by the governor, which is louder than dropping it silently: a
   * paid-fallback row with no price is a catalog bug, and Phase 3's status
   * page should be able to see it.
   */
  async selectPaidFallbackCandidates() {
    try {
      const rows = await AIModel.find({ role: 'paid-fallback', isActive: true }).lean();
      const usable = rows.filter((row) => {
        const providerConfig = this.providers[row.provider];
        if (!providerConfig || !providerConfig.apiKey || providerConfig.enabled === false) return false;
        // A paid row that just failed hard is skipped like any other; the
        // health mirror is keyed provider/model and does not care about price.
        return !isFreeTierCooling(this.getFreeTierHealth(row.provider, row.modelId));
      });
      if (usable.length === 0) return [];

      const prices = await AIPricing.find({
        $or: usable.map(row => ({ provider: row.provider, modelId: row.modelId }))
      }).lean();
      // A price of zero and no price at all are different facts, and this is
      // the one place where confusing them spends money: `|| 0` on a missing
      // field would present an unpriced paid row to the governor as free, and
      // the governor would wave it through. Only a finite number counts as a
      // price; a row with neither side priced is `null` — unpriced — and the
      // governor refuses it (Phase 1's rule: unknown is never free).
      const finiteOrNull = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };
      const priceOf = new Map();
      for (const p of prices) {
        const inputPrice = finiteOrNull(p.inputPrice);
        const outputPrice = finiteOrNull(p.outputPrice);
        if (inputPrice === null && outputPrice === null) continue;
        priceOf.set(this.freeTierKey(p.provider, p.modelId), {
          inputPrice: inputPrice ?? 0,
          outputPrice: outputPrice ?? 0
        });
      }

      return usable
        .map(row => ({
          provider: row.provider,
          modelId: row.modelId,
          pricing: priceOf.get(this.freeTierKey(row.provider, row.modelId)) || null
        }))
        .sort((a, b) => {
          // Unpriced rows last: they cannot pass the governor, so they must
          // not stand in front of a row that can.
          const cost = (row) => row.pricing
            ? row.pricing.inputPrice + row.pricing.outputPrice
            : Number.POSITIVE_INFINITY;
          return cost(a) - cost(b);
        });
    } catch (error) {
      logger.warn({ err: error }, '[Paid] failed to read the paid-fallback set');
      return [];
    }
  }

  /** Today's total spend across every provider, in dollars (UTC day). */
  async spentTodayUsd(now = new Date()) {
    try {
      const rows = await AISpend.aggregate([
        { $match: { day: spendDay(now) } },
        { $group: { _id: null, costUsd: { $sum: '$costUsd' } } }
      ]);
      return Number(rows?.[0]?.costUsd) || 0;
    } catch (error) {
      // A ledger we cannot read is not permission to spend. Report the cap as
      // already consumed so the paid attempt is skipped.
      logger.warn({ err: error }, '[Paid] failed to read the spend ledger — refusing the paid attempt');
      return Number.POSITIVE_INFINITY;
    }
  }

  /**
   * May this paid attempt happen? The governor of §3, in two layers:
   *
   *   estimate = AIPricing per-1M × (prompt tokens + maxTokens)
   *   estimate ≤ AI_PAID_PER_CALL_USD   (default $0.01)
   *   today's AISpend total + estimate ≤ AI_PAID_PER_DAY_USD   (default $0.05)
   *
   * The arithmetic is pure (`aiRoute.paidBudgetVerdict`); this method is the
   * two reads it needs. Above both caps sits the credit limit on the
   * OpenRouter key, which Chef sets and this code cannot see.
   */
  async paidGovernorVerdict({ provider, modelId, promptTokens = 0, maxTokens = 0, pricing = undefined }) {
    let priced = pricing;
    if (priced === undefined) {
      try {
        const row = await AIPricing.findOne({ provider, modelId }).lean();
        priced = row ? { inputPrice: Number(row.inputPrice) || 0, outputPrice: Number(row.outputPrice) || 0 } : null;
      } catch {
        priced = null;
      }
    }
    const estimateUsd = estimatePaidCostUsd(priced, promptTokens, maxTokens);
    const verdict = paidBudgetVerdict({
      spentTodayUsd: await this.spentTodayUsd(),
      estimateUsd,
      caps: paidCaps()
    });
    return { ...verdict, caps: paidCaps() };
  }

  /**
   * Remember which model answered this conversation, and what it replaced.
   *
   * Written only when a sticky auto call succeeds on a row that differs from
   * the stored one — a hit rewrites nothing, so a long story is not one write
   * per turn. `retired` is the pick that just stopped working, if there was
   * one; it is appended to `previous`, which is what Phase 3's needs-attention
   * list reads to say the GM changed model.
   *
   * Never rejects. A sticky pick is an optimization; failing a turn because we
   * could not write down which model answered it would be absurd.
   */
  recordStickyPick(key, { appId, conversationId, provider, modelId, paid = false, retired = null }) {
    if (!key) return Promise.resolve(null);
    const now = new Date();
    const update = {
      $set: {
        key,
        app: appId || 'unknown',
        conversationId: conversationId ?? null,
        provider,
        modelId,
        paid: !!paid,
        pickedAt: now
      }
    };
    if (retired && (retired.provider !== provider || retired.modelId !== modelId)) {
      update.$push = {
        previous: {
          provider: retired.provider,
          modelId: retired.modelId,
          retiredAt: now,
          reason: retired.reason || 'repin'
        }
      };
    }
    return AIStickyPick.updateOne({ key }, update, { upsert: true })
      .catch((err) => {
        if (err?.code !== 11000) throw err;
        return AIStickyPick.updateOne({ key }, update);
      })
      .catch((err) => {
        logger.debug({ err, key }, '[Sticky] failed to record the pick');
      })
      .then(() => key);
  }

  /**
   * Generic AI call method that walks the resolved route's attempt plan.
   */
  async callAI(prompt, config = {}) {
    // Wait for service to be initialized
    if (!this.initialized) {
      logger.info('Waiting for AI service to initialize...');
      let attempts = 0;
      while (!this.initialized && attempts < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      if (!this.initialized) {
        throw new Error('AI service failed to initialize');
      }
    }

    // What the request is *asking for* rather than where it should go. The
    // eleven ways of saying "where" — `provider`, `model`, `tier`, `freeOnly`,
    // `autoRotate`, `useAppConfig`, `noFallback`, the `basegeek-*` aliases —
    // are no longer read here at all: `services/aiRoute.js` owns that whole
    // vocabulary and answers it with a Route. This destructure is deliberately
    // silent about routing so there is exactly one place to look.
    let {
      maxTokens,
      temperature,
      userId = null,
      appName = 'unknown',
      feature = null,
      messages = null,
      cacheNamespace = 'default',
      responseFormat = null,
      tools = null,
      toolChoice = null,
      // Sampling controls (F-09). Every one of these is a documented
      // CreateChatCompletionRequest field; they are carried here so
      // callProvider can hand them to an adapter that knows what to do with
      // them, and dropped by the adapters that genuinely cannot honour them.
      topP = null,
      stop = null,
      seed = null,
      presencePenalty = null,
      frequencyPenalty = null
    } = config;

    // Fingerprint for structured-output cache-key segregation (item 2).
    const structuredFingerprint = this.structuredOutputFingerprint(responseFormat, tools, toolChoice);

    // The app id reaches here from the caller's credential (see
    // services/callerIdentity.js), never from a body field — routing decides
    // which model answers and at whose expense, and a request body is not a
    // credential. Normalizing again here covers in-process callers.
    const appId = AIAppConfig.normalizeAppName(appName) || 'unknown';
    const featureId = typeof feature === 'string' && feature.trim()
      ? feature.trim().toLowerCase()
      : null;
    const conversationId = typeof config.conversationId === 'string' && config.conversationId
      ? config.conversationId
      : null;

    // ── Where does this go? ─────────────────────────────────────────────────
    //
    // One pure function, one Route, two modes. What this replaced was ~150
    // lines of interacting branches in which the explicit-pin block switched
    // off `autoRotate`/`freeOnly`/`useAppConfig`, the app-config block
    // switched them back on, and the free-tier block overwrote
    // `requestedProvider` again — three writers to the same four variables,
    // each correct on its own and none of them able to say what the caller
    // had actually asked for. See DOCS/AIGEEK_FRONT_DOOR.md §1 for the table.
    const providerIds = Object.keys(this.providers);
    const routeCtx = { providerIds, appId, conversationId };
    let appRow = null;
    let route = config.route?.mode ? config.route : null;
    if (!route) {
      // A pin does not read the routing row, so it does not pay for the
      // query. Everything else does: `allowPaid`, `sticky` and the token
      // defaults all live on the row, and "nothing at all" is `auto` reading
      // the app's row.
      if (!explicitPinOf(config, providerIds)) {
        appRow = await this.routingRowFor(appId);
      }
      route = resolveRoute(config, appRow, routeCtx);
    }

    // A pin whose row the catalog says is cooling, retired or absent degrades
    // to `auto` — **unless** the caller said `noFallback`, in which case the
    // pin is a promise and failing as itself is the honest answer (F-22: "a
    // model pin is a promise"). `/openai/v1` sets `noFallback` on every
    // concrete-model request, so no pinned OpenAI-SDK call is ever silently
    // answered by a different model.
    if (route.mode === 'pin' && !route.singleAttempt) {
      const usable = await this.pinIsUsable(route.provider, route.model);
      if (!usable.ok) {
        if (!appRow) appRow = await this.routingRowFor(appId);
        logger.info(
          { appId, pin: `${route.provider}/${route.model ?? '(default)'}`, reason: usable.reason },
          '[Route] pin unavailable — degrading to auto'
        );
        route = degradePin(route, config, appRow, routeCtx);
      }
    }

    // Server-side defaults from the row, applied only where the request was
    // silent. The row is the app's standing preference; a per-call value is
    // the caller knowing better about this one call.
    if (appRow) {
      if (appRow.maxTokens && !config.maxTokens) maxTokens = appRow.maxTokens;
      if (appRow.temperature != null && config.temperature == null) temperature = appRow.temperature;
    }

    // ── The attempt plan ────────────────────────────────────────────────────
    const planned = route.mode === 'pin'
      ? this.planPinAttempt(route)
      : await this.planAutoAttempts(route, { appId });
    const attemptPlan = planned.attempts;
    const routeHints = [...route.hints, ...planned.hints];

    // The provider whose roster defaults stand in for a silent caller. Under
    // the old code this was `requestedProvider`, which for an auto call was
    // the first free pick — same thing, said once.
    const primaryProvider = attemptPlan[0]?.provider || this.currentProvider;

    maxTokens = maxTokens || this.providers[primaryProvider]?.maxTokens || 4000;
    temperature = temperature ?? (this.providers[primaryProvider]?.temperature || 0.7);

    const normalizedMessages = normalizeMessages(messages);

    let basePrompt = prompt;
    if (!basePrompt && normalizedMessages) {
      basePrompt = normalizedMessages.map(m => `${m.role}: ${m.content ?? ''}`).join('\n');
    }

    // What the cache is actually keyed on: the whole conversation, not the
    // last turn of it (F-03). The structured fingerprint above covers tools
    // and response_format; together they make two requests share an entry only
    // when they would genuinely produce the same answer.
    const cacheSubject = this.conversationCacheSubject(normalizedMessages, basePrompt);

    // Deliberate dead end (R130): an `auto` caller with nothing free to call
    // stops here. Before, it fell through to the generic provider walk, so a
    // caller whose routing row said `tier: free` could be answered — and
    // billed — by whatever default model happened to answer first. Phase 2
    // extends that rule from `freeOnly` callers to every `auto` caller: money
    // is reached only through `allowPaid` plus the governor, never by
    // accident.
    //
    // The wording is load-bearing: `aiFailureEnvelope.classifyFailure` reads
    // `/no .*providers/i` as `unavailable`, so this surfaces as a 503
    // `upstream_unavailable` — "nothing left in the rotation", which is exactly
    // what it is — rather than a 500 that says nothing.
    let lastError = attemptPlan.length === 0
      ? new Error('No free-tier model is available — no free providers left to try')
      : null;

    // The pick that just stopped working, carried out of the loop so a
    // successful re-pick can file it in `AIStickyPick.previous`.
    let retiredSticky = null;

    for (const attempt of attemptPlan) {
      const currentProvider = attempt.provider;
      if (!currentProvider) continue;

      const providerConfig = this.providers[currentProvider];
      if (!providerConfig || !providerConfig.apiKey || providerConfig.enabled === false) {
        continue;
      }

      const freeRow = attempt.freeRow;
      // Every attempt now names its own model: a free row names the row's
      // model, a paid-fallback row names the catalog's, and a pin names the
      // caller's (or the provider's default when the pin named only a
      // provider). The old three-way `isRequestedProvider` conditional is
      // gone with the walk that needed it — nothing is called with a model
      // nobody asked for any more.
      const providerModel = attempt.modelId || providerConfig.model;

      // Structured / tool-calling requests bypass the cache entirely.
      // The cache is tuned for idempotent text completions; for tool_use
      // responses it causes two problems:
      //   1. max_tokens and similar params aren't in the cache key, so a
      //      stale truncated response can survive a caller's max_tokens bump.
      //   2. Instructor's internal retries hit the cache on the second
      //      attempt and get whatever was wrong with the first — masking
      //      every real error behind a frozen-bad-response.
      // Tool-call responses are typically single-use per PR / per session
      // anyway; the cache saves little and breaks the Instructor contract.
      const bypassCache = !!(tools || responseFormat);
      const cacheKeyBase = bypassCache
        ? null
        : this.getCacheKey(cacheSubject, currentProvider, providerModel, temperature, cacheNamespace, structuredFingerprint);
      const cached = bypassCache ? null : this.getCachedResponse(cacheKeyBase);
      if (cached) {
        this.lastProviderInfo = {
          provider: currentProvider,
          model: providerModel,
          cached: true,
          toolCalls: cached.toolCalls || null,
          finishReason: cached.finishReason || 'stop',
          hints: routeHints,
          // A cache hit spends nothing. Zero, not null: "we did not pay for
          // this" is a fact, unlike "we were not told what it cost".
          costUsd: 0
        };
        return cached.content;
      }

      const preprocessed = await this.preprocessContext(basePrompt, normalizedMessages, currentProvider);
      const processedPrompt = preprocessed.prompt;
      const processedMessages = normalizeMessages(preprocessed.messages);
      const estimatedTokens = this.estimateTokens(processedPrompt);

      if (userId) {
        const availability = await aiUsageService.checkIfModelAvailable(currentProvider, providerModel, userId);
        if (!availability.available) {
          lastError = new Error(`Model not available for ${currentProvider}: ${availability.reason}`);
          continue;
        }
      }

      // Skip if provider context is insufficient
      if (providerConfig.maxContextTokens && estimatedTokens > providerConfig.maxContextTokens) {
        logger.debug(`Skipping ${currentProvider}: request size (${estimatedTokens} tokens) exceeds context limit (${providerConfig.maxContextTokens})`);
        continue;
      }

      // The provider's own 429 is the only rate-limit signal here now; the
      // static table that used to predict one is gone (see `this.rateLimits`).
      if (this.isRateLimited(currentProvider)) {
        logger.debug(`Skipping ${currentProvider}: still inside its retry-after`);
        continue;
      }

      // ── The governor (§3) ─────────────────────────────────────────────────
      //
      // The only place in this codebase that decides to spend money, and it
      // decides here rather than in the plan because the estimate needs the
      // preprocessed prompt. A refusal is a *skip*, not a queue: the point of
      // a daily cap is that the calls above it do not happen, and a feature
      // that would have been answered by a paid model falls to its
      // deterministic fallback like any other free-tier miss.
      if (attempt.paid) {
        const verdict = await this.paidGovernorVerdict({
          provider: currentProvider,
          modelId: providerModel,
          promptTokens: estimatedTokens,
          maxTokens,
          pricing: attempt.pricing
        });
        if (!verdict.ok) {
          logger.info(
            {
              provider: currentProvider,
              model: providerModel,
              app: appId,
              feature: featureId,
              reason: verdict.reason,
              estimateUsd: verdict.estimateUsd,
              spentTodayUsd: verdict.spentTodayUsd,
              caps: verdict.caps
            },
            'paid_budget — paid fallback skipped'
          );
          // The log line above was the only trace a refusal left, and a log
          // line cannot answer "did the cap bite this month" a week later.
          // One `$inc` on the day's bucket; never rejects, never awaited —
          // a refusal is already the cheap path and must not become slower
          // than the call it declined (Phase 3, `paid_budget_hit`).
          recordRefusal(currentProvider, appId, featureId);
          lastError = lastError || new Error('No free-tier model is available — no free providers left to try');
          continue;
        }
        logger.info(
          {
            provider: currentProvider,
            model: providerModel,
            estimateUsd: verdict.estimateUsd,
            spentTodayUsd: verdict.spentTodayUsd
          },
          '[Paid] governor cleared a paid fallback attempt'
        );
      }

      // Tool-calling capability check: unlike structured output (which has a
      // prompt-injection fallback), tool calling demands a machine-parseable
      // tool_calls response shape that can only come from native provider
      // support. Skip incapable providers — the rotation will try the next.
      if (tools && Array.isArray(tools) && tools.length > 0 &&
          !aiModelCapabilitiesService.supportsTools(currentProvider, providerModel)) {
        logger.debug(`Skipping ${currentProvider}/${providerModel}: tools requested but provider lacks native tool-calling`);
        continue;
      }

      // Structured-output dispatch decision (items 4 + 5):
      // - If responseFormat is requested and the provider/model supports it
      //   natively (see aiModelCapabilitiesService), pass it through.
      // - Otherwise, apply the prompt-injection fallback here, strip
      //   responseFormat from the downstream call, and flag the response for
      //   JSON repair after it returns. This keeps every provider in rotation.
      let dispatchPrompt = processedPrompt;
      let dispatchMessages = processedMessages;
      let dispatchResponseFormat = responseFormat;
      let needsJSONRepair = false;

      if (responseFormat) {
        const wantSchema = responseFormat.type === 'json_schema';
        const wantObject = responseFormat.type === 'json_object';
        const native = wantSchema
          ? aiModelCapabilitiesService.supportsJSONSchema(currentProvider, providerModel)
          : wantObject
          ? aiModelCapabilitiesService.supportsJSONMode(currentProvider, providerModel)
          : false;

        if (!native) {
          logger.debug(`[structured-output] ${currentProvider}/${providerModel} lacks native ${responseFormat.type}; applying prompt-injection fallback`);
          const wrapped = this.wrapMessagesForStructuredFallback(processedMessages, processedPrompt, responseFormat);
          dispatchMessages = wrapped.messages;
          dispatchPrompt = wrapped.prompt;
          dispatchResponseFormat = null;
          needsJSONRepair = true;
        }
      }

      try {
        const result = await this.callProvider(currentProvider, dispatchPrompt, {
          maxTokens,
          temperature,
          model: providerModel,
          messages: dispatchMessages,
          responseFormat: dispatchResponseFormat,
          tools,
          toolChoice,
          topP,
          stop,
          seed,
          presencePenalty,
          frequencyPenalty
        });

        if (needsJSONRepair && result?.content) {
          result.content = this.repairJSONContent(result.content);
        }

        // Cache only plain-text responses; structured/tool-call responses
        // bypassed the cache at lookup (see comment there). cacheKeyBase is
        // null for those.
        if (cacheKeyBase) {
          this.setCachedResponse(cacheKeyBase, {
            content: result.content,
            toolCalls: result.toolCalls || null,
            finishReason: result.finishReason || 'stop'
          });
        }
        // What the provider just told us about our own quota, straight off the
        // response. Debounced, fire-and-forget, never blocking the answer.
        this.recordObservedLimits(currentProvider, providerModel, result.headers);
        // `updateStats` returns what it booked, so the feature door can report
        // `provenance.costUsd` from the same figure the ledger holds rather
        // than pricing the call a second time. `undefined` when a test has
        // stubbed it out, which becomes a null cost — honestly unknown.
        const booked = await this.updateStats(
          currentProvider,
          result.inputTokens || 0,
          result.outputTokens || 0,
          providerModel,
          appId,
          featureId,
          result.costUsd ?? null
        );

        const trackingUserId = userId || 'session';
        // trackUsage RESOLVES with `{success:false, error}` rather than
        // throwing, so awaiting it without looking at the result meant a
        // failed quota write was completely silent — and the free-tier
        // ceiling this feeds is what stops the rotation overspending.
        const usageResult = await aiUsageService.trackUsage(currentProvider, providerModel, trackingUserId, {
          inputTokens: result.inputTokens || 0,
          outputTokens: result.outputTokens || 0,
          requests: 1
        });
        if (usageResult && usageResult.success === false) {
          logger.warn(
            { provider: currentProvider, model: providerModel, err: usageResult.error },
            '[AIService] free-tier usage was not recorded — quota accounting is behind for this model'
          );
        }

        // A free row that answers with no text at all (gpt-oss through the
        // Cloudflare and Ollama adapters, 2026-09-06) is as useless as a dead
        // one: cool it and move to the next candidate. A *paid* row that does
        // it is worse — we were billed for nothing — so it counts too. A pin
        // is exempt: the caller named that model, an empty completion with
        // `finish_reason: tool_calls` is a legitimate answer, and there is
        // nowhere else to go anyway.
        if ((freeRow || attempt.paid) && !String(result?.content ?? '').trim()) {
          if (freeRow) {
            this.markFreeTierFailure(currentProvider, providerModel, 'empty_content', freeRow.health);
          }
          throw new Error(`empty_content: ${currentProvider}/${providerModel} returned no text`);
        }

        // The row answered: clear its failure memory and stamp it proven.
        if (freeRow) {
          this.markFreeTierSuccess(currentProvider, providerModel);
        }

        // Remember the pick for the rest of this conversation, and file
        // whatever it replaced. Only when it *changed*: a sticky hit rewrites
        // nothing, so a long story is not one write per turn. Awaited, unlike
        // the health writes: the next turn may arrive before a fire-and-forget
        // upsert lands (the full suite showed exactly that race), and a repin
        // nobody can read is not sticky. recordStickyPick never rejects.
        if (route.sticky && route.mode === 'auto' && (!attempt.sticky || retiredSticky)) {
          await this.recordStickyPick(route.sticky.key, {
            appId,
            conversationId,
            provider: currentProvider,
            modelId: providerModel,
            paid: !!attempt.paid,
            retired: retiredSticky
          });
        }

        this.lastProviderInfo = {
          provider: currentProvider,
          model: providerModel,
          cached: false,
          toolCalls: result.toolCalls || null,
          finishReason: result.finishReason || 'stop',
          // Which legacy field, row value or degradation produced this route.
          // Reported so a log line — and `provenance.hints` over HTTP — can
          // say *why* a request landed where it did without re-deriving it.
          hints: routeHints,
          costUsd: booked?.costUsd ?? null
        };
        return result.content;
      } catch (error) {
        lastError = error;

        if (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('quota')) {
          // For as long as the provider asked, not a flat minute.
          const retryAfter = this.retryAfterFrom(error);
          this.markRateLimited(currentProvider, retryAfter ?? 60);
          // Unconditional now. This used to be gated on `autoRotate`, which
          // was the only mode that read `isCooling` back — so with the
          // rotation walk gone the gate would have made the cooldown map
          // write-only. It still feeds `getServiceStats().rotation`, which is
          // what the status page shows, so the signal is worth keeping.
          this.rotationManager.markProviderCooling(currentProvider, (retryAfter ?? 60) * 1000);
        }

        // A free-tier row that fails *hard* — the model is gone, the slug was
        // recycled, the key is refused — is put to sleep so tomorrow's first
        // call does not spend the same three seconds proving it again. A 429,
        // a 5xx or a timeout is not hard and leaves the row's health alone;
        // markRateLimited above already owns that case.
        if (freeRow) {
          const classification = classifyFreeTierFailure(error);
          if (classification.hard) {
            this.markFreeTierFailure(currentProvider, providerModel, classification.code, freeRow.health);
            // If the row that just died was this conversation's sticky pick,
            // carry it out so the successful re-pick can file it in
            // `previous` — which is how Phase 3's needs-attention list knows
            // the GM changed model rather than leaving you to notice.
            if (attempt.sticky) {
              retiredSticky = { provider: currentProvider, modelId: providerModel, reason: classification.code };
            }
          }
        }

        logger.warn({ err: error }, `Provider ${currentProvider} failed`);
      }
    }

    throw lastError || new Error('All AI providers failed');
  }

  /*
   * `callAISmart` was deleted here in Phase 2 (2026-09-07).
   *
   * It was the front of a SECOND routing stack — aiRouterService picked a
   * "family" out of families.json, aiBalancerService scored providers out of
   * Redis, aiHealthJobService swept cooldowns every 60 s while mutating a
   * local copy of the map, so it logged "✓ Cleared cooldown" forever without
   * clearing anything. Phase 0 deleted that stack and left this 57-line shim
   * because `POST /api/ai/conversation/message` read its `{success, content,
   * routing}` shape on both branches and three test files pinned it (Q46).
   *
   * Phase 2 has one front door, so the shim has no reason to exist: the route
   * calls `callAI` directly and builds `routing` from `lastProviderInfo`,
   * which is where the shim was getting it from anyway. The Q46 rule it
   * carried — a provider's own words never reach the caller — moved with it
   * and is enforced by the route's `resolveFailure` catch, which is where the
   * other three front doors have always enforced it.
   */

  /**
   * Call one specific AI provider.
   *
   * Signature is fixed by its callers (`aiCatalogDiscovery`'s probe, the
   * OpenAI-compat surface, every feature through `callAI`). The result gained
   * two *additive* fields in Phase 1: `headers`, the raw response headers, so
   * `recordObservedLimits` can learn the quota; and `costUsd` on OpenRouter,
   * the provider's own dollar figure for the call. Nothing has to read either.
   */
  async callProvider(provider, prompt, config = {}) {
    const providerConfig = this.providers[provider];
    if (!providerConfig.apiKey) {
      throw new Error(`${provider} API key not configured`);
    }

    const {
      maxTokens = providerConfig.maxTokens,
      temperature = providerConfig.temperature,
      model = providerConfig.model,
      messages = null,
      responseFormat = null,
      tools = null,
      toolChoice = null,
      topP = null,
      stop = null,
      seed = null,
      presencePenalty = null,
      frequencyPenalty = null
    } = config;

    // Pass messages + structured-output + sampling params to every adapter.
    // Providers that don't support one ignore it — an unsupported sampling
    // knob is dropped at the adapter, by its descriptor's `dropSampling`,
    // never sent upstream to become a 400 and never silently swallowed at this
    // layer (F-09).
    const request = {
      prompt,
      maxTokens, temperature, model, messages, responseFormat, tools, toolChoice,
      topP, stop, seed, presencePenalty, frequencyPenalty
    };

    // Until Phase 2 this was a ten-case switch over ten `call<Provider>`
    // methods — about 600 lines, five of them the same OpenAI-compatible
    // request with a different base URL, and a `default:` that threw
    // `Unknown provider` for any roster id whose case someone forgot (cohere
    // spent months in exactly that state: a fully configured connection, a
    // working `callCohere`, and no `case 'cohere'` to reach it). The registry
    // reads the shape off the provider's descriptor, so a missing adapter is
    // now a missing *row*, which the roster test catches.
    return await callAdapter(provider, providerConfig, request);
  }

  /**
   * The ten `call<Provider>` methods that used to sit here — callCloudflare,
   * callOllama, callLLMGateway, callGroq, callGemini, callTogether, callCohere,
   * callOpenRouter, callCerebras, and the `geminiContentsFrom` translator they
   * shared — moved to `services/ai/adapters/` in Phase 2 of
   * DOCS/AIGEEK_ELEVATION_PLAN.md. About 600 lines became five files, because
   * five of them were one OpenAI-compatible request with a different base URL
   * and a different bearer token.
   *
   * Every incident note went with its code, not into a changelog:
   *
   *   F-02  the tool-loop translation (`geminiContentsFrom`) and the
   *         synthesized tool-call ids            → adapters/gemini.js
   *   F-04  which adapters really forward `tools` → the `forwardsTools`
   *         descriptor, honoured in openaiCompatible.js and gemini.js, and
   *         deliberately absent from cohere.js and ollama.js
   *   F-09  the five sampling knobs, in each provider's own spelling
   *                                              → openAISamplingFields /
   *                                                stopSequencesFrom /
   *                                                `dropSampling`
   *   F-23  the provider's raw body never reaching a caller → AdapterError
   *   R130 / 2026-09-07 Ask outage  Cloudflare in chat mode with the bare
   *         json_schema and no `stop`            → adapters/cloudflare.js
   *
   * `callProvider` above is the only door, and it keeps its
   * `(provider, prompt, config)` signature and its result shape — the probe
   * (`aiCatalogDiscovery.probeRow`), the OpenAI-compat surface and `callAI`
   * all depend on both.
   */

  /**
   * Parse JSON response from AI
   */
  parseJSONResponse(responseText) {
    try {
      // Extract JSON from response (handle markdown formatting)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      logger.error({ err: error }, 'Failed to parse AI response');
      throw new Error('Invalid AI response format');
    }
  }

  /**
   * Find the routing row for a resolved app id.
   *
   * Two lookups, in this order:
   *   1. the exact normalized id — what every row written from now on uses;
   *   2. a case-insensitive match on the id or any `id:feature` spelling —
   *      the legacy rows (`fitnessGeek`, `fitnessGeek:mealPlan`) an admin
   *      configured before routing was keyed by credential.
   *
   * Without (2), collapsing `fitnessGeek` to `fitnessgeek` would silently
   * un-route an app that has been pinned to a specific model for months.
   * Migrating those rows is an admin decision, not a side effect of a deploy.
   *
   * @param {string} appId  normalized app id
   * @returns {Promise<object|null>}
   */
  async findAppConfig(appId) {
    if (!appId) return null;

    const exact = await AIAppConfig.findOne({ appName: appId, enabled: true });
    if (exact) return exact;

    const escaped = appId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return AIAppConfig.findOne({
      appName: new RegExp(`^${escaped}(:|$)`, 'i'),
      enabled: true
    });
  }

  /**
   * What one call cost, in dollars.
   *
   * Three sources, in order of how much we trust them:
   *
   *   1. **The response.** OpenRouter reports `usage.cost` in dollars, exact,
   *      per call. When the adapter hands one back it is used verbatim — no
   *      price table, no arithmetic, no drift when the vendor reprices.
   *   2. **`AIPricing`.** Dollars per 1,000,000 tokens, per model, written by
   *      the catalog job from the provider's own listing. Cached for ten
   *      minutes so a busy minute is not a Mongo query per call.
   *   3. **Zero.** Which is the truth for every free row, and the honest
   *      answer for a provider whose price we have never been told.
   *
   * The `costPer1kTokens` table this replaced was one blended rate per
   * provider in a *different unit* from AIPricing — see the note on
   * `this.providers`.
   */
  async resolveCostUsd(provider, modelId, inputTokens, outputTokens, reported = null) {
    if (reported != null && Number.isFinite(Number(reported))) return Number(reported);
    if (!modelId) return 0;

    const key = this.freeTierKey(provider, modelId);
    const now = Date.now();
    let price = this.pricingCache.get(key);
    if (!price || now - price.at > 10 * 60 * 1000) {
      try {
        const row = await AIPricing.findOne({ provider, modelId }).lean();
        price = {
          at: now,
          inputPrice: Number(row?.inputPrice) || 0,
          outputPrice: Number(row?.outputPrice) || 0
        };
      } catch (error) {
        logger.debug({ err: error, provider, modelId }, '[AIService] price lookup failed — booking 0');
        price = { at: now, inputPrice: 0, outputPrice: 0 };
      }
      this.pricingCache.set(key, price);
    }

    // AIPricing stores dollars per 1,000,000 tokens (priceUnit: per_1m_tokens).
    const cost = (inputTokens / 1e6) * price.inputPrice + (outputTokens / 1e6) * price.outputPrice;
    return Number.isFinite(cost) ? cost : 0;
  }

  /**
   * Book one call against the daily ledger: one upsert `$inc` per call, keyed
   * (UTC day, provider, app, feature). Free rows book zero cost and still book
   * the call, so "free" is a number rather than an absence.
   *
   * Fire-and-forget for callers: the ledger feeds Phase 2's governor and
   * Phase 3's "dollars left", and neither is worth making a user wait for. The
   * promise is returned anyway — never rejecting — so a test can await the
   * write instead of guessing how many ticks it takes.
   */
  recordSpend(provider, appId, featureId, costUsd, now = new Date()) {
    const key = { day: spendDay(now), provider, app: appId || 'unknown', feature: featureId || '' };
    const inc = { $inc: { calls: 1, costUsd: Number(costUsd) || 0 } };
    return AISpend.updateOne(key, inc, { upsert: true })
      // Two calls in the same millisecond both find no document and both try
      // to insert one; the unique index refuses the loser with E11000. The
      // document exists by then, so the retry is a plain `$inc` and cannot
      // race again. Without this, a burst silently loses calls from the
      // ledger, which is the one collection that has to add up.
      .catch((err) => {
        if (err?.code !== 11000) throw err;
        return AISpend.updateOne(key, inc);
      })
      .catch((err) => {
        logger.debug({ err, ...key }, '[AIService] failed to book spend');
      })
      .then(() => key);
  }

  /**
   * Update usage statistics.
   *
   * `appName` is the resolved app id and `feature` an optional slice of it.
   * Both are grouped here rather than being separate apps: the breakdown used
   * to show `fitnessGeek`, `fitnessgeek` and `fitnessGeek:mealPlan` as three
   * unrelated consumers, which made "what does fitnessgeek cost" unanswerable.
   * Now there is one app row with a `features` map inside it. The map is
   * additive — existing readers of `appUsage[app].calls` are unaffected.
   *
   * `reportedCostUsd` is the provider's own figure where it gave one
   * (OpenRouter). Everything else is priced from `AIPricing`.
   *
   * What is gone from here (Phase 1, 2026-09-07): a per-call `AIFreeTier`
   * lookup followed by `AIUsage.findOne({ date: new Date().toDateString() })`
   * — a Date field compared to a string, so it never matched and the branch it
   * guarded never ran — which decided whether to charge the blended
   * `costPer1kTokens` rate. Cost is resolved once now, from the response or
   * from the price table, and a call is "free" when it cost nothing.
   */
    async updateStats(provider, inputTokens, outputTokens, modelId = null, appName = 'unknown', feature = null, reportedCostUsd = null) {
    const totalTokens = inputTokens + outputTokens;
    const actualCost = await this.resolveCostUsd(provider, modelId, inputTokens, outputTokens, reportedCostUsd);
    const isFreeUsage = actualCost === 0;

    this.sessionStats.totalCalls++;
    this.sessionStats.totalTokens += totalTokens;
    this.sessionStats.totalCost += actualCost;

    logger.debug(`Updated session stats: calls=${this.sessionStats.totalCalls}, tokens=${this.sessionStats.totalTokens}, cost=${this.sessionStats.totalCost}`);

        if (!this.sessionStats.providerUsage[provider]) {
      this.sessionStats.providerUsage[provider] = {
        calls: 0,
        tokens: 0,
        cost: 0,
        freeCalls: 0,
        paidCalls: 0,
        appUsage: {}
      };
    }

    this.sessionStats.providerUsage[provider].calls++;
    this.sessionStats.providerUsage[provider].tokens += totalTokens;
    this.sessionStats.providerUsage[provider].cost += actualCost;

    logger.debug(`Updated provider stats for ${provider}: calls=${this.sessionStats.providerUsage[provider].calls}, tokens=${this.sessionStats.providerUsage[provider].tokens}, cost=${this.sessionStats.providerUsage[provider].cost}`);

    // Track app usage, grouped by the resolved app id.
    const appId = AIAppConfig.normalizeAppName(appName) || 'unknown';
    const featureId = typeof feature === 'string' && feature.trim()
      ? feature.trim().toLowerCase()
      : null;

    if (!this.sessionStats.providerUsage[provider].appUsage[appId]) {
      this.sessionStats.providerUsage[provider].appUsage[appId] = {
        calls: 0,
        tokens: 0,
        cost: 0,
        freeCalls: 0,
        paidCalls: 0,
        features: {}
      };
    }

    const appStats = this.sessionStats.providerUsage[provider].appUsage[appId];
    // Rows recorded before features existed have no map; give them one rather
    // than letting the first featured call throw.
    if (!appStats.features) appStats.features = {};

    appStats.calls++;
    appStats.tokens += totalTokens;
    appStats.cost += actualCost;

    let featureStats = null;
    if (featureId) {
      if (!appStats.features[featureId]) {
        appStats.features[featureId] = {
          calls: 0,
          tokens: 0,
          cost: 0,
          freeCalls: 0,
          paidCalls: 0
        };
      }
      featureStats = appStats.features[featureId];
      featureStats.calls++;
      featureStats.tokens += totalTokens;
      featureStats.cost += actualCost;
    }

    logger.debug(`Updated app stats for ${provider}/${appId}${featureId ? `:${featureId}` : ''}: calls=${appStats.calls}, tokens=${appStats.tokens}, cost=${appStats.cost}`);

    if (isFreeUsage) {
      this.sessionStats.providerUsage[provider].freeCalls =
        (this.sessionStats.providerUsage[provider].freeCalls || 0) + 1;
      appStats.freeCalls++;
      if (featureStats) featureStats.freeCalls++;
    } else {
      this.sessionStats.providerUsage[provider].paidCalls =
        (this.sessionStats.providerUsage[provider].paidCalls || 0) + 1;
      appStats.paidCalls++;
      if (featureStats) featureStats.paidCalls++;
    }

    // sessionStats above is in-process and dies with the container. The ledger
    // is the part that survives a deploy, and the only place a month of
    // spending can be read from.
    this.recordSpend(provider, appId, featureId, actualCost);

    return { costUsd: actualCost, totalTokens, isFreeUsage };
  }

  /**
   * Get session statistics
   */
  getSessionStats() {
    logger.debug({ stats: this.sessionStats }, 'Getting session stats');
    return {
      ...this.sessionStats,
      averageCostPerCall: this.sessionStats.totalCalls > 0 ? this.sessionStats.totalCost / this.sessionStats.totalCalls : 0
    };
  }

  /**
   * Reset session statistics
   */
  resetSessionStats() {
    this.sessionStats = {
      totalCalls: 0,
      totalTokens: 0,
      totalCost: 0,
      providerUsage: {}
    };
  }

  /**
   * Set the current provider
   */
  setProvider(provider) {
    if (this.providers[provider]) {
      this.currentProvider = provider;
      return true;
    }
    return false;
  }

  /**
   * Enable/disable smart summarization
   */
  setSummarizationEnabled(enabled) {
    this.summarizationEnabled = enabled;
    logger.info(`📊 Smart summarization ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set summarization threshold
   */
  setSummarizationThreshold(tokens) {
    this.summarizationThreshold = tokens;
    logger.info(`📊 Summarization threshold set to ${tokens} tokens`);
  }

  /**
   * Get comprehensive service stats
   */
  getServiceStats() {
    return {
      session: this.getSessionStats(),
      cache: this.getCacheStats(),
      summarization: {
        enabled: this.summarizationEnabled,
        threshold: this.summarizationThreshold,
        modelLoaded: this.summarizer !== null
      },
      providers: {
        current: this.currentProvider,
        available: this.getAvailableProviders(),
        // Only what a provider actually told us: which ones are inside their
        // own retry-after, and until when. The declared RPM/TPM columns that
        // used to be here were the static table, and it was wrong — per-row
        // ceilings now live on `AIFreeTier.freeLimits`, observed.
        rateLimited: Object.entries(this.rateLimits)
          .filter(([, limits]) => limits.rateLimitedUntil && Date.now() < limits.rateLimitedUntil)
          .map(([provider, limits]) => ({ provider, until: new Date(limits.rateLimitedUntil).toISOString() })),
        rotation: this.rotationManager.getState()
      }
    };
  }

  /**
   * Simple chat interface - sends a prompt and returns the response text
   */
  async chat(prompt, config = {}) {
    return this.callAI(prompt, config);
  }

  async chatWithHistory(messages, config = {}) {
    // Extract the last user message as the prompt for routing
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    const prompt = lastUser?.content || '';
    return this.callAI(prompt, { ...config, messages });
  }

  /**
   * Get available providers
   */
  getAvailableProviders() {
    return Object.keys(this.providers).filter(provider =>
      this.providers[provider].apiKey &&
      this.providers[provider].apiKey.length > 10 &&
      // `GET /api/ai/providers` used to filter on key length alone, while
      // `GET /api/ai/capabilities` filtered the same map on `.enabled` — so a
      // provider an admin had switched off still appeared in StoryGeek's
      // settings picker, and picking it failed at call time.
      this.providers[provider].enabled !== false
    );
  }
}

export default new AIService();
