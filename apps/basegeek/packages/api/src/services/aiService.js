// MUST import WASM backend initializer FIRST to prevent native binding attempts
// DISABLED: Causing Docker issues with onnxruntime-node dependency
// import '../wasm-backend-init.js';

import axios from 'axios';
import logger from '../lib/logger.js';
import AIConfig from '../models/AIConfig.js';
import { DEFAULT_MODELS, FALLBACK_ORDER, ROTATION_MODEL_OVERRIDES, keyHintFor } from '../config/aiProviders.js';
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
import RotationManager from './rotationManager.js';
import aiModelCapabilitiesService from './aiModelCapabilitiesService.js';
// Using cloud-based summarization instead of local transformers.js
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { countTextTokens, countMessageTokens } from './tokenCounter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * How many free-tier rows one `freeOnly` call may try before giving up (R130).
 * Three is the whole budget: StartGeek's Ask lives inside a 3 s GlanceIntent
 * timeout, so a fourth attempt is a timeout dressed as a retry.
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

/**
 * The OpenAI sampling parameters, in OpenAI's own spelling, ready to spread
 * into the body of any OpenAI-shaped provider (groq, cerebras, together,
 * openrouter, llmgateway — all of which take these verbatim).
 *
 * FINDING F-09: these five used to be read off the request at the proxy door
 * and then dropped — `callAI` never destructured them and `callProvider` built
 * its downstream config from a whitelist that did not include them. They
 * travelled exactly one function call and died, at HTTP 200, with no hint to
 * the caller that `stop: ["\n\n"]` had been ignored.
 *
 * Absent values are omitted rather than sent as null, so a provider never has
 * to have an opinion about a key the caller never set.
 */
function openAISamplingFields({ topP, stop, seed, presencePenalty, frequencyPenalty } = {}) {
  return {
    ...(topP != null && { top_p: topP }),
    ...(stop != null && { stop }),
    ...(seed != null && { seed }),
    ...(presencePenalty != null && { presence_penalty: presencePenalty }),
    ...(frequencyPenalty != null && { frequency_penalty: frequencyPenalty })
  };
}

/**
 * OpenAI's `stop` (string | string[] | null) as the array form Anthropic
 * (`stop_sequences`) and Gemini (`generationConfig.stopSequences`) want.
 * Returns null when there is nothing worth sending.
 */
function stopSequencesFrom(stop) {
  if (typeof stop === 'string') return stop ? [stop] : null;
  if (Array.isArray(stop)) {
    const list = stop.filter(s => typeof s === 'string' && s.length > 0);
    return list.length > 0 ? list : null;
  }
  return null;
}

// Cloud-based summarization using existing free AI providers

/**
 * Prompt Strategy Modifiers
 * These are prepended to system prompts based on model family behavior.
 * Helps normalize responses across different model personalities.
 */
const PROMPT_STRATEGIES = {
  'tool-decisive': `

CRITICAL INSTRUCTION: You are interfacing with a tool-based system. When you have sufficient information to proceed:
- Execute the appropriate tool call IMMEDIATELY
- Do NOT ask unnecessary follow-up questions
- Do NOT explain what you're about to do before doing it
- Be action-oriented and decisive
- Only use ask_followup_question when critical information is genuinely missing

If the user says "read THE_STEPS.md" or similar, just read it. Don't ask permission.
If the user provides a task with clear steps, start executing. Don't ask if you should proceed.
Your responses should be: brief explanation + tool call, not lengthy discussions about what you might do.`,

  'reasoning-focused': `

INSTRUCTION: You excel at reasoning and problem-solving. Take time to think through complex problems step-by-step.
Break down difficult tasks into logical components and explain your reasoning process.
Use tools when needed, but prioritize deep analysis over quick actions.`,

  'analytical': `

INSTRUCTION: Focus on thorough analysis and well-structured responses.
Consider edge cases, provide detailed explanations, and maintain high accuracy.
Ask clarifying questions when ambiguity could lead to incorrect assumptions.`,

  'concise': `

INSTRUCTION: Provide fast, concise responses. Minimize explanations unless explicitly requested.
Execute tool calls efficiently. Optimize for speed and brevity.`,

  'balanced': `

INSTRUCTION: Balance thoughtful analysis with efficient execution.
Ask clarifying questions when needed, but don't over-engineer simple tasks.
Provide clear explanations while remaining concise.`
};

class AIService {
  constructor() {
    // Load model families configuration
    this.families = this.loadFamilies();
    
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

    // Provider rotation state
    const rotationStateDir = path.join(__dirname, '../../logs');
    try {
      fs.mkdirSync(rotationStateDir, { recursive: true });
    } catch (error) {
      logger.warn({ err: error }, '[AIService] Failed to ensure rotation state directory');
    }
    this.rotationManager = new RotationManager(path.join(rotationStateDir, 'rotation-state.json'));

    // Per-(provider, model) free-tier health, mirroring AIFreeTier.health so
    // selection never waits on Mongo (R130). Keyed `<provider>/<modelId>`.
    this.freeTierHealth = new Map();

    // The rotation pins each provider to its default model, overriding any
    // model stored on the provider's database row. Derived from the same table
    // the defaults below come from, so the two cannot drift apart.
    this.rotationProviderOverrides = ROTATION_MODEL_OVERRIDES;

    // `costPer1kTokens` below is dollars per 1,000 tokens — a different unit
    // from the AIPricing collection, which stores dollars per 1,000,000 (see
    // aiDirectorService's costForTokens). Both are correct as written: the
    // values here match their per-1M equivalents divided by 1000 (anthropic
    // 0.005 = $5/MTok, cohere 0.0025 = $2.50/MTok), and updateStats() divides
    // token counts by 1000 to match. Do not "fix" one to look like the other.
    // These are single blended rates per provider, not per-model input/output
    // prices — the AIPricing table is the accurate source for those.
    this.providers = {
      anthropic: {
        name: 'Claude Sonnet 5',
        apiKey: '',
        baseURL: 'https://api.anthropic.com/v1',
        model: DEFAULT_MODELS.anthropic,
        // 2026-09-05: repriced for claude-sonnet-5, which is $2/MTok in and
        // $10/MTok out — i.e. 0.002 and 0.010 per 1K; the flat average is
        // 0.006. This table is a single blended per-provider rate, not a
        // per-model in/out price (AIPricing holds those, per 1M). Was 0.003 —
        // the $3/MTok input price of claude-3-5-sonnet, three generations stale.
        costPer1kTokens: 0.006,
        maxTokens: 4000,
        temperature: 0.7,
        enabled: false
      },
      groq: {
        name: 'Groq Llama 3.3 70B',
        apiKey: '',
        baseURL: 'https://api.groq.com/openai/v1',
        model: DEFAULT_MODELS.groq,
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 32768, // 32K context limit
        temperature: 0.7,
        enabled: false
      },
      gemini: {
        name: 'Gemini 2.5 Flash',
        apiKey: '',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        // Stable GA id — the -exp preview ids get retired without notice
        model: DEFAULT_MODELS.gemini,
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 1000000, // 1M token context limit
        temperature: 0.7,
        enabled: false
      },
      together: {
        name: 'Together Llama 3.3 70B Turbo Free',
        apiKey: '',
        baseURL: 'https://api.together.xyz/v1',
        model: DEFAULT_MODELS.together,
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 131072, // 128K context limit
        temperature: 0.7,
        enabled: false
      },
      cohere: {
        name: 'Cohere Command R+',
        apiKey: '',
        baseURL: 'https://api.cohere.ai/v1',
        model: DEFAULT_MODELS.cohere,
        costPer1kTokens: 0.0025,
        maxTokens: 4000,
        temperature: 0.7,
        enabled: false
      },
      openrouter: {
        name: 'OpenRouter Llama 3.1 70B Free',
        apiKey: '',
        baseURL: 'https://openrouter.ai/api/v1',
        model: DEFAULT_MODELS.openrouter,
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 131072, // 128K context limit
        temperature: 0.7,
        enabled: false
      },
      cerebras: {
        name: 'Cerebras Qwen 3 235B Instruct',
        apiKey: '',
        baseURL: 'https://api.cerebras.ai/v1',
        model: DEFAULT_MODELS.cerebras,
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 65536, // 64K context limit
        temperature: 0.7,
        enabled: false
      },
      cloudflare: {
        name: 'Cloudflare Llama 3.3 70B FP8 Fast',
        apiKey: '',
        baseURL: 'https://api.cloudflare.com/client/v4/accounts',
        accountId: '', // Cloudflare account ID
        model: DEFAULT_MODELS.cloudflare,
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 131072, // 128K context limit
        temperature: 0.7,
        enabled: false,
        dailyNeuronLimit: 10000
      },
      ollama: {
        name: 'Ollama Cloud Qwen3 Coder 480B',
        apiKey: '',
        baseURL: 'https://ollama.com/api',
        model: DEFAULT_MODELS.ollama,
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        temperature: 0.7,
        enabled: false
      },
      llmgateway: {
        name: 'LLM Gateway Llama 4 Maverick',
        apiKey: '',
        baseURL: 'https://api.llmgateway.io/v1',
        model: DEFAULT_MODELS.llmgateway,
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 1000000, // 1M context limit
        temperature: 0.7,
        enabled: false
      },
    };

    this.currentProvider = 'groq';
    this.fallbackOrder = [...FALLBACK_ORDER];

    // Rate limit tracking per provider
    this.rateLimits = {
      cerebras: {
        tokensPerMinute: 60000, // ACTUAL: 60K TPM (was incorrectly 120K)
        requestsPerMinute: 30,
        requestsPerDay: 14400, // NEW: Daily limit
        lastReset: Date.now(),
        tokensUsed: 0,
        requestsUsed: 0,
        dailyRequestsUsed: 0, // NEW: Daily tracking
        lastDailyReset: Date.now(), // NEW
        rateLimitedUntil: null
      },
      together: {
        tokensPerMinute: 180000, // Together Build Tier 1
        requestsPerMinute: 600,
        lastReset: Date.now(),
        tokensUsed: 0,
        requestsUsed: 0,
        rateLimitedUntil: null
      },
      groq: {
        tokensPerMinute: 12000, // Average, varies by model (6K-30K)
        requestsPerMinute: 30,
        requestsPerDay: 14400, // NEW: Most models, but 70b only gets 1K/day
        lastReset: Date.now(),
        tokensUsed: 0,
        requestsUsed: 0,
        dailyRequestsUsed: 0, // NEW: Daily tracking
        lastDailyReset: Date.now(), // NEW
        rateLimitedUntil: null
      },
      cohere: {
        // NO tokensPerMinute limit for trial keys
        requestsPerMinute: 20,
        requestsPerMonth: 1000, // NEW: Trial key monthly limit
        lastReset: Date.now(),
        tokensUsed: 0, // Keep for compatibility but not enforced
        requestsUsed: 0,
        monthlyRequestsUsed: 0, // NEW: Monthly tracking
        lastMonthlyReset: Date.now(), // NEW
        rateLimitedUntil: null
      },
      cloudflare: {
        // NO tokensPerMinute limit for Cloudflare Workers AI
        requestsPerMinute: 300, // ACTUAL: 300 RPM for text generation (was incorrectly 50)
        lastReset: Date.now(),
        tokensUsed: 0, // Keep for compatibility but not enforced
        requestsUsed: 0,
        rateLimitedUntil: null
      },
      gemini: {
        tokensPerMinute: 250000, // NEW: Observed from logs (250K TPM free tier)
        requestsPerMinute: 60, // Estimate
        lastReset: Date.now(),
        tokensUsed: 0,
        requestsUsed: 0,
        rateLimitedUntil: null
      }
    };

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
      await this.seedInitialModels();
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

  async refreshModels(provider) {
    try {
      let models = [];

      switch (provider) {
        case 'groq':
          if (this.providers.groq.apiKey) {
            const response = await axios.get('https://api.groq.com/openai/v1/models', {
              headers: { 'Authorization': `Bearer ${this.providers.groq.apiKey}` },
              // The one models fetch that had no cap; Together, Gemini and the
              // rest all pass 10s, and axios's own default is "wait forever".
              timeout: 10000
            });
            models = response.data.data || [];
          }
          break;

        case 'together':
          if (this.providers.together.apiKey) {
            try {
              logger.info('Fetching Together.ai models...');
              const response = await axios.get('https://api.together.xyz/v1/models', {
                headers: { 'Authorization': `Bearer ${this.providers.together.apiKey}` },
                timeout: 10000
              });
              logger.debug({ data: response.data }, 'Together.ai response');
              // Together.ai returns an array directly, not wrapped in data property
              const togetherModels = response.data || [];
              // Transform to match our expected format and save pricing
              models = togetherModels.map(model => {
                // Save pricing to database if available
                if (model.pricing) {
                  AIPricing.findOneAndUpdate(
                    { provider: 'together', modelId: model.id },
                    {
                      inputPrice: model.pricing.input,
                      outputPrice: model.pricing.output,
                      lastUpdated: new Date(),
                      isActive: true
                    },
                    { upsert: true, new: true }
                  ).catch(error => {
                      logger.error({ err: error }, `Failed to save pricing for ${model.id}`);
                  });
                }

                return {
                  id: model.id,
                  name: model.display_name
                };
              });
              logger.debug({ count: models.length }, 'Transformed Together.ai models');
            } catch (error) {
              logger.error({ err: error }, 'Together.ai API error');
              if (error.response) {
                logger.error({ status: error.response.status, data: error.response.data }, 'Together.ai response error details');
              }
              throw new Error(`Together.ai API error: ${error.message}`);
            }
          } else {
            logger.info('Together.ai API key not configured');
            throw new Error('Together.ai API key not configured');
          }
          break;

        case 'anthropic':
          if (this.providers.anthropic.apiKey) {
            try {
              logger.info('Fetching Anthropic models via API...');
              const response = await axios.get('https://api.anthropic.com/v1/models', {
                headers: {
                  'x-api-key': this.providers.anthropic.apiKey,
                  'anthropic-version': '2023-06-01'
                },
                timeout: 10000
              });
              const anthropicModels = response.data?.data || [];
              models = anthropicModels.map(m => ({
                id: m.id,
                name: m.display_name || m.id
              }));
              logger.info(`Fetched ${models.length} Anthropic models from API`);
            } catch (apiError) {
              logger.info({ err: apiError }, 'Anthropic models API failed, using hardcoded fallback');
              models = [
                { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
                { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
                { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
                { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7' },
                { id: 'claude-3-5-sonnet-20241022', name: 'Claude Sonnet 3.5' },
                { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5' },
                { id: 'claude-3-haiku-20240307', name: 'Claude Haiku 3' }
              ];
            }
          } else {
            // No API key — use hardcoded fallback
            models = [
              { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
              { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
              { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
              { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7' },
              { id: 'claude-3-5-sonnet-20241022', name: 'Claude Sonnet 3.5' },
              { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5' },
              { id: 'claude-3-haiku-20240307', name: 'Claude Haiku 3' }
            ];
          }
          break;

        case 'gemini':
          if (this.providers.gemini.apiKey) {
            try {
              logger.info('Fetching Gemini models via API...');
              // The key goes in a header, not `?key=`. @geeksuite/logger's err
              // serializer keeps `err.config.url` (it is the one thing that
              // says which call failed) and drops `err.config.headers`, so a
              // key in the query string was the one provider credential that
              // still reached the logs in the clear on any failure.
              const response = await axios.get(
                'https://generativelanguage.googleapis.com/v1beta/models',
                {
                  headers: { 'x-goog-api-key': this.providers.gemini.apiKey },
                  timeout: 10000
                }
              );
              const geminiModels = response.data?.models || [];
              // Filter to models that support generateContent (chat/text models)
              models = geminiModels
                .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
                .map(m => ({
                  id: m.name.replace('models/', ''),
                  name: m.displayName || m.name.replace('models/', '')
                }));
              logger.info(`Fetched ${models.length} Gemini models from API (filtered for generateContent)`);
            } catch (apiError) {
              logger.info({ err: apiError }, 'Gemini models API failed, using hardcoded fallback');
              // 1.5 family retired upstream (Aug 2026) — fallback lists only live families
              models = [
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
              ];
            }
          } else {
            models = [
              { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
              { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
              { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
              { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
              { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
            ];
          }
          break;
      }

      // Update database with new models
      for (const model of models) {
        await AIModel.findOneAndUpdate(
          { provider, modelId: model.id },
          {
            name: model.name,
            lastChecked: new Date(),
            isActive: true
          },
          { upsert: true, new: true }
        );
      }

      // Mark models as inactive if they're no longer available
      await AIModel.updateMany(
        {
          provider,
          lastChecked: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Older than 24 hours
        },
        { isActive: false }
      );

      return models;
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

    async seedInitialModels() {
    try {
      const initialModels = {
        anthropic: [
          { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
          { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
          { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
          { id: 'claude-3-7-sonnet-20250219', name: 'Claude Sonnet 3.7' },
          { id: 'claude-3-5-sonnet-20241022', name: 'Claude Sonnet 3.5' },
          { id: 'claude-3-5-haiku-20241022', name: 'Claude Haiku 3.5' },
          { id: 'claude-3-haiku-20240307', name: 'Claude Haiku 3' }
        ],
        groq: [
          { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Free)' },
          { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B Versatile (Free)' },
          { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Free)' },
          { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (Free)' }
        ],
        gemini: [
          // 1.5 family retired upstream (Aug 2026) — seed only live families
          { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Free)' },
          { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (Free)' },
          { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Free)' },
          { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite (Free)' },
          { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' }
        ],
        together: [
          { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', name: 'Llama 3.1 70B Turbo (Free - Best for tool use)' },
          { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', name: 'Llama 3.3 70B (Free)' },
          { id: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free', name: 'DeepSeek R1 70B (Free - Reasoning)' }
        ],
        cohere: [
          { id: 'command-r-plus-08-2024', name: 'Command R+ (08-2024)' },
          { id: 'command-r-plus', name: 'Command R+' },
          { id: 'command-r', name: 'Command R' },
          { id: 'command', name: 'Command' }
        ],
        openrouter: [
          { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash (Free)' },
          { id: 'meta-llama/llama-3.1-70b-instruct:free', name: 'Llama 3.1 70B (Free)' },
          { id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B (Free)' },
          { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 3 Llama 405B (Free - may be limited)' },
          { id: 'google/gemini-flash-1.5', name: 'Gemini Flash 1.5' },
          { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
          { id: 'openai/gpt-4o', name: 'GPT-4o' }
        ],
        cerebras: [
          { id: 'llama-3.3-70b', name: 'Llama 3.3 70B (Free - Best for tool use)' },
          { id: 'qwen-3-235b-a22b-instruct-2507', name: 'Qwen3 235B Instruct (Free)' },
          { id: 'llama3.1-8b', name: 'Llama 3.1 8B (Free)' },
          { id: 'llama3.1-70b', name: 'Llama 3.1 70B (Free)' }
        ],
        cloudflare: [
          { id: '@cf/openai/gpt-oss-120b', name: 'GPT OSS 120B (Free)' },
          { id: 'llama-3.3-70b-instruct-fp8-fast', name: 'Llama 3.3 70B Instruct FP8 Fast (Free)' }
        ],
        ollama: [
          { id: 'qwen3-coder:480b', name: 'Qwen3 Coder 480B (Free)' },
          { id: 'deepseek-v3.1:671b', name: 'DeepSeek V3.1 671B (Free)' },
          { id: 'gpt-oss:120b', name: 'GPT OSS 120B (Free)' },
          { id: 'gpt-oss:20b', name: 'GPT OSS 20B (Free)' },
          { id: 'kimi-k2:1t', name: 'Kimi K2 1T (Free)' },
          { id: 'glm-4.6', name: 'GLM 4.6 (Free)' },
          { id: 'qwen3-vl:235b', name: 'Qwen3 VL 235B (Free)' }
        ],
        llmgateway: [
          { id: 'llama-4-maverick-free', name: 'Llama 4 Maverick (Free - 1M context)' }
        ]
      };

      for (const [provider, models] of Object.entries(initialModels)) {
        for (const model of models) {
          await AIModel.findOneAndUpdate(
            { provider, modelId: model.id },
            {
              name: model.name,
              lastChecked: new Date(),
              isActive: true
            },
            { upsert: true, new: true }
          );
        }
      }

      logger.info('Initial AI models seeded successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to seed initial models');
    }
  }

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

      // Check Cerebras first (fastest)
      if (this.providers.cerebras.enabled && this.providers.cerebras.apiKey &&
          this.checkRateLimit('cerebras', 2000)) {
        summarizationProvider = 'cerebras';
      }
      // Fallback to Together (3X higher rate limit)
      else if (this.providers.together.enabled && this.providers.together.apiKey &&
               this.checkRateLimit('together', 2000)) {
        summarizationProvider = 'together';
      }
      // Last resort: Groq
      else if (this.providers.groq.enabled && this.providers.groq.apiKey &&
               this.checkRateLimit('groq', 2000)) {
        summarizationProvider = 'groq';
      }

      if (!summarizationProvider) {
        logger.info('⚠️  No summarization provider available, using truncation');
        return text.substring(0, Math.floor(targetTokens / 0.75));
      }

      const providerConfig = this.providers[summarizationProvider];
      const targetChars = Math.floor(targetTokens / 0.75);

      // Call the AI provider to summarize
      const response = await axios.post(
        `${providerConfig.baseURL}/chat/completions`,
        {
          model: providerConfig.model,
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
          max_tokens: Math.min(2000, targetTokens),
          temperature: 0.3 // Low temperature for consistent summarization
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${providerConfig.apiKey}`
          },
          timeout: 10000 // 10 second timeout
        }
      );

      const result = response.data.choices[0].message.content;
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
   * Load model families configuration
   */
  loadFamilies() {
    try {
      const familiesPath = path.resolve(__dirname, '../../../../families.json');
      logger.debug(`[AIService] Loading families from: ${familiesPath}`);
      const familiesConfig = JSON.parse(fs.readFileSync(familiesPath, 'utf-8'));
      logger.debug(`[AIService] Loaded ${Object.keys(familiesConfig.families || {}).length} families`);

      // Debug: Log which family cerebras belongs to
      for (const [familyName, familyConfig] of Object.entries(familiesConfig.families || {})) {
        if (familyConfig.providers && familyConfig.providers.includes('cerebras')) {
          logger.debug(`[AIService] cerebras found in family: ${familyName} (strategy: ${familyConfig.promptStrategy})`);
        }
      }

      return familiesConfig.families || {};
    } catch (error) {
      logger.warn({ err: error }, '[AIService] Could not load families.json, using default behavior');
      return {};
    }
  }

  /**
   * Get prompt strategy for a provider based on its family
   * @param {string} provider - Provider name (e.g., 'cerebras', 'together')
   * @returns {string} - Prompt strategy modifier text
   */
  getPromptStrategy(provider) {
    // Find which family this provider belongs to
    for (const [familyName, familyConfig] of Object.entries(this.families)) {
      if (familyConfig.providers && familyConfig.providers.includes(provider)) {
        const strategy = familyConfig.promptStrategy || 'balanced';
        return PROMPT_STRATEGIES[strategy] || '';
      }
    }
    // Default to balanced if provider not found in any family
    return PROMPT_STRATEGIES['balanced'] || '';
  }

  /**
   * Check and update rate limits for a provider
   */
  checkRateLimit(provider, estimatedTokens = 1000) {
    const limits = this.rateLimits[provider];
    if (!limits) return true; // No rate limiting for this provider

    const now = Date.now();

    // Check if we're currently rate limited
    if (limits.rateLimitedUntil && now < limits.rateLimitedUntil) {
      const waitSeconds = Math.ceil((limits.rateLimitedUntil - now) / 1000);
      logger.info(`⏳ ${provider} is rate limited, wait ${waitSeconds}s`);
      return false;
    }

    // Reset per-minute counters if a minute has passed
    if (now - limits.lastReset > 60000) {
      limits.tokensUsed = 0;
      limits.requestsUsed = 0;
      limits.lastReset = now;
      limits.rateLimitedUntil = null;
    }

    // Reset daily counters if a day has passed (for Cerebras, Groq)
    if (limits.lastDailyReset && now - limits.lastDailyReset > 86400000) { // 24 hours
      limits.dailyRequestsUsed = 0;
      limits.lastDailyReset = now;
    }

    // Reset monthly counters if a month has passed (for Cohere, 1min.ai)
    if (limits.lastMonthlyReset && now - limits.lastMonthlyReset > 2592000000) { // 30 days
      limits.monthlyRequestsUsed = 0;
      limits.monthlyCreditsUsed = 0;
      limits.lastMonthlyReset = now;
    }

    // Check per-minute token limits (only if provider has tokensPerMinute)
    const hasTokenLimit = limits.tokensPerMinute && limits.tokensPerMinute > 0;
    if (hasTokenLimit) {
      // Allow the first request even if it exceeds the limit (as long as we haven't used tokens yet this minute)
      // But block if adding this request would exceed AND we've already used tokens
      if (limits.tokensUsed > 0 && limits.tokensUsed + estimatedTokens > limits.tokensPerMinute) {
        limits.rateLimitedUntil = limits.lastReset + 60000;
        const waitSeconds = Math.ceil((limits.rateLimitedUntil - now) / 1000);
        logger.info(`🚫 ${provider} would exceed token limit (${limits.tokensUsed}/${limits.tokensPerMinute} tokens, trying to add ${estimatedTokens}), pausing for ${waitSeconds}s`);
        return false;
      }

      // If this single request is MUCH larger than the per-minute limit (2X), reject it
      if (estimatedTokens > limits.tokensPerMinute * 2) {
        logger.info(`🚫 ${provider} single request too large (${estimatedTokens} tokens exceeds 2x limit of ${limits.tokensPerMinute})`);
        return false;
      }
    }

    // Check per-minute request limits
    if (limits.requestsUsed + 1 > limits.requestsPerMinute) {
      limits.rateLimitedUntil = limits.lastReset + 60000;
      const waitSeconds = Math.ceil((limits.rateLimitedUntil - now) / 1000);
      logger.info(`🚫 ${provider} would exceed request limit (${limits.requestsUsed}/${limits.requestsPerMinute} reqs), pausing for ${waitSeconds}s`);
      return false;
    }

    // Check daily request limits (for Cerebras, Groq)
    if (limits.requestsPerDay && limits.dailyRequestsUsed + 1 > limits.requestsPerDay) {
      limits.rateLimitedUntil = limits.lastDailyReset + 86400000; // Rate limited until next day
      const waitHours = Math.ceil((limits.rateLimitedUntil - now) / 3600000);
      logger.info(`🚫 ${provider} would exceed daily limit (${limits.dailyRequestsUsed}/${limits.requestsPerDay} reqs/day), pausing for ${waitHours}h`);
      return false;
    }

    // Check monthly request limits (for Cohere)
    if (limits.requestsPerMonth && limits.monthlyRequestsUsed + 1 > limits.requestsPerMonth) {
      limits.rateLimitedUntil = limits.lastMonthlyReset + 2592000000; // Rate limited until next month
      const waitDays = Math.ceil((limits.rateLimitedUntil - now) / 86400000);
      logger.info(`🚫 ${provider} would exceed monthly limit (${limits.monthlyRequestsUsed}/${limits.requestsPerMonth} calls/month), pausing for ${waitDays} days`);
      return false;
    }

    // Check monthly credit limits (for 1min.ai)
    if (limits.creditsPerMonth && limits.monthlyCreditsUsed + estimatedTokens > limits.creditsPerMonth) {
      limits.rateLimitedUntil = limits.lastMonthlyReset + 2592000000; // Rate limited until next month
      const waitDays = Math.ceil((limits.rateLimitedUntil - now) / 86400000);
      logger.info(`🚫 ${provider} would exceed monthly credit limit (${limits.monthlyCreditsUsed}/${limits.creditsPerMonth} credits/month), pausing for ${waitDays} days`);
      return false;
    }

    return true;
  }

  /**
   * Update rate limit usage after a successful call
   */
  updateRateLimitUsage(provider, tokensUsed) {
    const limits = this.rateLimits[provider];
    if (limits) {
      // Update per-minute counters
      if (limits.tokensPerMinute && limits.tokensPerMinute > 0) {
        limits.tokensUsed += tokensUsed;
      }
      limits.requestsUsed += 1;

      // Update daily counters (for Cerebras, Groq)
      if (limits.dailyRequestsUsed !== undefined) {
        limits.dailyRequestsUsed += 1;
      }

      // Update monthly counters (for Cohere)
      if (limits.monthlyRequestsUsed !== undefined) {
        limits.monthlyRequestsUsed += 1;
      }

      // Update monthly credits (for 1min.ai)
      if (limits.monthlyCreditsUsed !== undefined) {
        limits.monthlyCreditsUsed += tokensUsed; // Approximate: 1 token ≈ 1 credit
      }

      logger.debug(`📊 ${provider} rate limit: ${limits.tokensUsed || 0}/${limits.tokensPerMinute || 'none'} tokens/min, ${limits.requestsUsed}/${limits.requestsPerMinute} reqs/min${limits.dailyRequestsUsed !== undefined ? `, ${limits.dailyRequestsUsed}/${limits.requestsPerDay} reqs/day` : ''}${limits.monthlyRequestsUsed !== undefined ? `, ${limits.monthlyRequestsUsed}/${limits.requestsPerMonth} calls/month` : ''}${limits.monthlyCreditsUsed !== undefined ? `, ${limits.monthlyCreditsUsed}/${limits.creditsPerMonth} credits/month` : ''}`);
    }
  }

  /**
   * Mark a provider as rate limited (from API 429 response)
   */
  markRateLimited(provider, retryAfterSeconds = 60) {
    const limits = this.rateLimits[provider];
    if (limits) {
      limits.rateLimitedUntil = Date.now() + (retryAfterSeconds * 1000);
      logger.info(`⏸️  ${provider} marked as rate limited for ${retryAfterSeconds}s`);
    }
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
   *     minutes long, consulted only when `autoRotate` is on (the free path
   *     sets it off, deliberately: it has already chosen).
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
   * Rows are dropped when the provider has no key or is disabled (as before)
   * and when the row is cooling (new). What is left is ordered by provider
   * priority, then by *most recently proven*, then by fewest failures — so a
   * row that answered ten minutes ago outranks one that has never been tried,
   * and a row that has been failing softly sinks.
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
        health
      };
      if (isFreeTierCooling(health, now)) cooling.push(candidate);
      else live.push(candidate);
    }

    const priorityOf = (provider) => {
      const idx = priorityList.indexOf(provider);
      return idx === -1 ? 999 : idx;
    };
    const successAt = (candidate) =>
      candidate.health?.lastSuccessAt ? new Date(candidate.health.lastSuccessAt).getTime() : 0;

    live.sort((a, b) =>
      priorityOf(a.provider) - priorityOf(b.provider) ||
      successAt(b) - successAt(a) ||
      (a.health?.consecutiveFailures ?? 0) - (b.health?.consecutiveFailures ?? 0)
    );
    // Soonest to wake first: if every row is cooling we try the one closest to
    // being allowed back rather than answering nothing.
    cooling.sort((a, b) =>
      new Date(a.health.coolingUntil).getTime() - new Date(b.health.coolingUntil).getTime()
    );

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
   * Generic AI call method that tries providers in fallback order
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

    let {
      provider: requestedProvider = this.currentProvider,
      maxTokens,
      temperature,
      model,
      userId = null,
      appName = 'unknown',
      feature = null,
      messages = null,
      autoRotate = false,
      freeOnly = false,
      useAppConfig = false,
      // No cross-provider fallback: try the requested provider and stop.
      //
      // The fallback list below calls every other provider with *its own*
      // default model, which is the right answer for a caller that asked for
      // "an answer" and the wrong one for a caller that named a model. The
      // OpenAI surface sets this whenever the request named a concrete model —
      // a `<provider>/<model>` pin or a bare catalog id — so a pinned request
      // whose provider is down or rate-limited fails as itself rather than
      // being answered, and billed, as a model nobody asked for.
      noFallback = false,
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

    // Explicit provider/model pinning (item 7): "<provider>/<model>" pins the
    // request to that exact provider with no rotation. Useful for workflows
    // that need a single consistent provider per call (e.g., geekPR PR reviews).
    // We only split when the prefix is a known provider — otherwise slashes
    // in real model IDs (e.g., "meta-llama/llama-3.1-70b") are preserved.
    if (typeof model === 'string' && model.includes('/')) {
      const KNOWN_PROVIDERS = new Set(Object.keys(this.providers));
      const slashIdx = model.indexOf('/');
      const prefix = model.slice(0, slashIdx);
      const rest = model.slice(slashIdx + 1);
      if (KNOWN_PROVIDERS.has(prefix) && rest) {
        requestedProvider = prefix;
        model = rest;
        autoRotate = false;
        freeOnly = false;
        useAppConfig = false;
        logger.info(`[ExplicitPin] routed to ${prefix}/${rest} (rotation bypassed)`);
      }
    }

    // App config resolution: look up server-side routing for the *resolved*
    // app id. The id reaches here from the caller's credential (see
    // services/callerIdentity.js), never from a body field — routing decides
    // which model answers and at whose expense, and a request body is not a
    // credential. Normalizing again here covers in-process callers.
    const appId = AIAppConfig.normalizeAppName(appName) || 'unknown';
    const featureId = typeof feature === 'string' && feature.trim()
      ? feature.trim().toLowerCase()
      : null;

    if (useAppConfig || requestedProvider === 'basegeek-app') {
      try {
        const appConfig = await this.findAppConfig(appId);
        if (appConfig) {
          // Update lastSeen
          appConfig.lastSeen = new Date();
          appConfig.save().catch(() => {}); // fire-and-forget

          if (appConfig.tier === 'specific' && appConfig.provider && appConfig.model) {
            requestedProvider = appConfig.provider;
            model = appConfig.model;
            autoRotate = false;
            freeOnly = false;
            logger.info(`[AppConfig] ${appId} → specific: ${appConfig.provider}/${appConfig.model}`);
          } else if (appConfig.tier === 'free') {
            freeOnly = true;
            logger.info(`[AppConfig] ${appId} → free tier`);
          } else if (appConfig.tier === 'rotation') {
            autoRotate = true;
            logger.info(`[AppConfig] ${appId} → rotation`);
          }

          // Apply server-side defaults only if not specified in the request
          if (appConfig.maxTokens && !config.maxTokens) maxTokens = appConfig.maxTokens;
          if (appConfig.temperature != null && config.temperature == null) temperature = appConfig.temperature;
          if (appConfig.fallbackOrder?.length > 0) {
            // Will be used if provider fails — stored for fallback logic
            config._appFallbackOrder = appConfig.fallbackOrder;
          }
        } else {
          // Auto-discover: create a default config entry for this app
          // Auto-discovery writes the normalized id, so the collection stops
          // growing a new row per spelling.
          AIAppConfig.findOneAndUpdate(
            { appName: appId },
            { appName: appId, tier: 'free', autoDiscovered: true, lastSeen: new Date() },
            { upsert: true, new: true }
          ).catch(() => {});
          freeOnly = true;
          logger.info(`[AppConfig] ${appId} → auto-discovered, defaulting to free tier`);
        }
      } catch (appConfigError) {
        logger.error({ err: appConfigError }, `[AppConfig] Failed to resolve config for ${appId}`);
        // Fall through to normal routing
      }
    }

    // "free" mode: query the DB for available free-tier models and plan the
    // whole walk — the pick *and* its retries — rather than one pick and a
    // silent slide into the paid fallback order (R130, 2026-09-06).
    //
    // What changed and why: the old code took `prioritized[0]` and stopped
    // caring. When that row was a model its vendor had retired, the request
    // fell into the generic provider walk below, which calls every other
    // provider with *its own default model* — models nobody asked for and, for
    // a caller whose routing row says `tier: free`, models that are not free.
    // A free-tier caller now retries inside the free tier and nowhere else.
    const isFreeCaller = freeOnly || requestedProvider === 'free';
    let freeTierAttempts = [];
    if (isFreeCaller) {
      try {
        const { live, cooling } = await this.selectFreeTierCandidates();
        let chosen = live;
        if (chosen.length === 0 && cooling.length > 0) {
          // Everything is asleep. Answering nothing is worse than one attempt
          // at whichever row wakes soonest, so the free tier is never a total
          // outage just because the probe marked a batch of rows dead.
          logger.warn(
            { coolingRows: cooling.length },
            '[FreeOnly] every free-tier row is cooling — trying the one closest to waking'
          );
          chosen = cooling.slice(0, 1);
        }

        if (chosen.length > 0) {
          freeTierAttempts = this.planFreeTierAttempts(chosen, noFallback ? 1 : MAX_FREE_TIER_ATTEMPTS);
          const pick = freeTierAttempts[0];
          requestedProvider = pick.provider;
          model = pick.modelId;
          autoRotate = false; // We've already picked
          logger.info(
            {
              picked: `${pick.provider}/${pick.modelId}`,
              lastSuccessAt: pick.health?.lastSuccessAt ?? null,
              retries: freeTierAttempts.slice(1).map(a => `${a.provider}/${a.modelId}`),
              skippedCooling: cooling.length
            },
            `[FreeOnly] Selected ${pick.provider}/${pick.modelId}`
          );
        } else {
          // No row at all — not even a cooling one. There is nothing free to
          // call, and a free-tier caller must not be answered by a paid
          // default model, so this fails as itself.
          logger.warn('[FreeOnly] No free-tier models available with configured API keys');
        }
      } catch (freeError) {
        logger.error({ err: freeError }, '[FreeOnly] Failed to query free tier');
      }
    }

    maxTokens = maxTokens || this.providers[requestedProvider]?.maxTokens || 4000;
    temperature = temperature ?? (this.providers[requestedProvider]?.temperature || 0.7);
    model = model || this.providers[requestedProvider]?.model;

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

    const rotationProviders = autoRotate
      ? this.rotationManager.getPriorityList()
      : noFallback
        ? [requestedProvider]
        : [requestedProvider, ...this.fallbackOrder.filter(p => p !== requestedProvider)];

    if (autoRotate) {
      const selection = this.rotationManager.selectProvider();
      const index = rotationProviders.indexOf(selection.provider);
      if (index > 0) {
        rotationProviders.splice(index, 1);
        rotationProviders.unshift(selection.provider);
      }
    }

    // The walk, as (provider, free-tier row) pairs. A `freeRow` says two
    // things: call *this* model rather than the provider's default, and record
    // the outcome against the row's health. Every non-free caller gets exactly
    // the list it got before — provider ids, `freeRow: null`, same order.
    const attemptPlan = freeTierAttempts.length > 0
      ? freeTierAttempts.map(candidate => ({ provider: candidate.provider, freeRow: candidate }))
      : rotationProviders.map(provider => ({ provider, freeRow: null }));

    // Deliberate dead end (R130): a free-tier caller with nothing free to call
    // stops here. Before, it fell through to the paid provider walk, so a
    // caller whose routing row says `tier: free` could be answered — and
    // billed — by whatever default model happened to answer first.
    //
    // The wording is load-bearing: `aiFailureEnvelope.classifyFailure` reads
    // `/no .*providers/i` as `unavailable`, so this surfaces as a 503
    // `upstream_unavailable` — "nothing left in the rotation", which is exactly
    // what it is — rather than a 500 that says nothing.
    const freeTierExhausted = isFreeCaller && freeTierAttempts.length === 0;
    let lastError = freeTierExhausted
      ? new Error('No free-tier model is available — no free providers left to try')
      : null;

    for (const { provider: currentProvider, freeRow } of (freeTierExhausted ? [] : attemptPlan)) {
      if (!currentProvider) continue;

      const providerConfig = this.providers[currentProvider];
      if (!providerConfig || !providerConfig.apiKey || providerConfig.enabled === false) {
        continue;
      }

      if (autoRotate && this.rotationManager.isCooling(currentProvider)) {
        continue;
      }

      // Only honor the caller-specified model on the originally requested provider —
      // fallback providers (different family) reject it (e.g. gemini model on groq → 404).
      // A free-tier retry names its own model, which is the whole point of it.
      const isRequestedProvider = currentProvider === requestedProvider;
      let providerModel = freeRow
        ? freeRow.modelId
        : isRequestedProvider
          ? (model || providerConfig.model)
          : providerConfig.model;
      if (autoRotate) {
        const rotationOverride = this.rotationProviderOverrides[currentProvider];
        if (rotationOverride?.model) {
          providerModel = rotationOverride.model;
        }
      }

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
          finishReason: cached.finishReason || 'stop'
        };
        if (autoRotate) {
          this.rotationManager.recordUsage(currentProvider, { requests: 1, tokens: 0 });
        }
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

      if (!this.checkRateLimit(currentProvider, estimatedTokens)) {
        logger.debug(`Skipping ${currentProvider}: rate limit would be exceeded`);
        if (autoRotate) {
          this.rotationManager.markProviderCooling(currentProvider, 60 * 1000);
        }
        continue;
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

        const totalTokens = (result.inputTokens || 0) + (result.outputTokens || 0);

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
        this.updateRateLimitUsage(currentProvider, totalTokens);
        await this.updateStats(currentProvider, result.inputTokens || 0, result.outputTokens || 0, providerModel, appId, featureId);

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

        if (autoRotate) {
          this.rotationManager.recordUsage(currentProvider, { requests: 1, tokens: totalTokens });
        }

        // A free row that answers with no text at all (gpt-oss through the
        // Cloudflare and Ollama adapters, 2026-09-06) is as useless as a dead
        // one: cool it and move to the next candidate.
        if (freeRow && !String(result?.content ?? '').trim()) {
          this.markFreeTierFailure(currentProvider, providerModel, 'empty_content', freeRow.health);
          throw new Error(`empty_content: ${currentProvider}/${providerModel} returned no text`);
        }

        // The row answered: clear its failure memory and stamp it proven.
        if (freeRow) {
          this.markFreeTierSuccess(currentProvider, providerModel);
        }

        this.lastProviderInfo = {
          provider: currentProvider,
          model: providerModel,
          cached: false,
          toolCalls: result.toolCalls || null,
          finishReason: result.finishReason || 'stop'
        };
        return result.content;
      } catch (error) {
        lastError = error;

        if (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('quota')) {
          this.markRateLimited(currentProvider, 60);
          if (autoRotate) {
            this.rotationManager.markProviderCooling(currentProvider, 60 * 1000);
          }
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
          }
        }

        logger.warn({ err: error }, `Provider ${currentProvider} failed`);
      }
    }

    throw lastError || new Error('All AI providers failed');
  }

  /**
   * Smart AI call using Phase 2A routing
   * @param {array} messages - Conversation messages
   * @param {object} options - Routing options
   * @param {string} options.conversationId - Conversation ID for context
   * @param {string} options.taskTypeHint - Optional task type hint
   * @param {boolean} options.dryRun - Dry-run mode (default: from config)
   * @param {string} options.userId - User ID for usage tracking
   * @param {string} options.appName - App name for usage tracking
   * @returns {Promise<object>} - AI response with routing metadata
   */
  async callAISmart(messages, options = {}) {
    // If freeOnly requested, skip smart routing and go straight to free-tier selection
    if (options.freeOnly) {
      const prompt = messages[messages.length - 1]?.content || '';
      const startTime = Date.now();
      try {
        const response = await this.callAI(prompt, {
          freeOnly: true,
          messages,
          userId: options.userId,
          appName: options.appName || 'free-tier',
          feature: options.feature || null
        });
        return {
          success: true,
          content: response,
          routing: { taskType: 'free-tier', provider: 'free-selection', latency: Date.now() - startTime }
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    const ModelFamilyRouter = (await import('./aiRouterService.js')).default;
    const LoadBalancer = (await import('./aiBalancerService.js')).default;

    const router = new ModelFamilyRouter();
    const loadBalancer = new LoadBalancer();

    // Extract prompt from messages
    const prompt = messages[messages.length - 1]?.content || '';

    // Route to optimal provider
    const routingDecision = await router.routeTask({
      conversationId: options.conversationId || `conv-${Date.now()}`,
      prompt,
      taskTypeHint: options.taskTypeHint,
      dryRun: options.dryRun
    });

    // If dry-run, return routing decision only
    if (routingDecision.dryRun) {
      return {
        success: true,
        dryRun: true,
        routing: routingDecision,
        content: '[DRY-RUN] No API call executed'
      };
    }

    // Execute actual AI call using selected provider
    const provider = routingDecision.selectedProvider;
    const startTime = Date.now();

    try {
      // Call the provider using existing callAI method
      const response = await this.callAI(prompt, {
        provider,
        messages,
        userId: options.userId,
        appName: options.appName || 'smart-routing',
        feature: options.feature || null
      });

      // Track latency and update provider score
      const latency = Date.now() - startTime;
      await loadBalancer.trackProviderLatency(provider, latency);

      // Return response with routing metadata
      return {
        success: true,
        content: response,
        routing: {
          family: routingDecision.family,
          taskType: routingDecision.taskType,
          provider: routingDecision.selectedProvider,
          latency,
          score: routingDecision.providerScore
        }
      };

    } catch (error) {
      // Mark provider unavailable on failure
      await loadBalancer.markProviderUnavailable(provider);

      // Log error with routing context
      logger.error({ err: error, provider, family: routingDecision.family, taskType: routingDecision.taskType }, '[Smart Routing] Provider failed');

      // Try fallback within the same family
      const family = routingDecision.family;
      logger.info(`[Smart Routing] Trying next provider in ${family} family...`);

      try {
        const fallbackProvider = await loadBalancer.getNextProvider(family);
        const fallbackResponse = await this.callAI(prompt, {
          provider: fallbackProvider,
          messages,
          userId: options.userId,
          appName: options.appName || 'smart-routing',
          feature: options.feature || null
        });

        const fallbackLatency = Date.now() - startTime;
        await loadBalancer.trackProviderLatency(fallbackProvider, fallbackLatency);

        return {
          success: true,
          content: fallbackResponse,
          routing: {
            family,
            taskType: routingDecision.taskType,
            provider: fallbackProvider,
            fallbackFrom: provider,
            latency: fallbackLatency
          }
        };

      } catch (fallbackError) {
        // All providers in family failed, return error
        return {
          success: false,
          error: `All providers in ${family} family failed: ${fallbackError.message}`,
          routing: {
            family,
            taskType: routingDecision.taskType,
            attemptedProviders: [provider, 'fallback']
          }
        };
      }
    }
  }

  /**
   * Call specific AI provider
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

    // Pass messages + structured-output + sampling params to all provider
    // calls. Providers that don't support one ignore it — an unsupported
    // sampling knob is dropped at the adapter, never sent upstream to become a
    // 400 and never silently swallowed at this layer (F-09).
    const callConfig = {
      maxTokens, temperature, model, messages, responseFormat, tools, toolChoice,
      topP, stop, seed, presencePenalty, frequencyPenalty
    };

    switch (provider) {
      case 'anthropic':
        return await this.callClaude(prompt, callConfig);
      case 'groq':
        return await this.callGroq(prompt, callConfig);
      case 'gemini':
        return await this.callGemini(prompt, callConfig);
      case 'together':
        return await this.callTogether(prompt, callConfig);
      case 'cohere':
        return await this.callCohere(prompt, callConfig);
      case 'openrouter':
        return await this.callOpenRouter(prompt, callConfig);
      case 'cerebras':
        return await this.callCerebras(prompt, callConfig);
      case 'cloudflare':
        return await this.callCloudflare(prompt, callConfig);
      case 'ollama':
        return await this.callOllama(prompt, callConfig);
      case 'llmgateway':
        return await this.callLLMGateway(prompt, callConfig);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Call Cloudflare API (OpenAI-compatible)
   */
  /**
   * Call Cloudflare Workers AI API
   */
  async callCloudflare(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.cloudflare, messages = null } = config;

    const accountId = this.providers.cloudflare.accountId;
    if (!accountId) {
      throw new Error('Cloudflare account ID not configured');
    }

    // Use provided messages array or convert prompt to messages
    const requestMessages = messages || [{ role: 'user', content: prompt }];

    // Chat mode, not a flattened `prompt`. Workers AI applies the model's own
    // chat template to `messages` and stops at end-of-turn; the old "System:
    // …\n\nAssistant: …" string had no template and no stop, so llama kept
    // generating turns until max_tokens — 15 s+ for a two-word JSON answer
    // (2026-09-07, the StartGeek Ask outage). `response_format` is Workers
    // AI's JSON mode: the schema goes in directly, without OpenAI's
    // { name, schema } wrapper.
    const cfMessages = requestMessages.map(m => ({
      role: m.role === 'system' || m.role === 'assistant' ? m.role : 'user',
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
    }));
    const rf = config.responseFormat;
    const cfResponseFormat = rf?.type === 'json_schema'
      ? { type: 'json_schema', json_schema: rf.json_schema?.schema || rf.json_schema }
      : rf?.type === 'json_object'
        ? { type: 'json_object' }
        : null;

    try {
      const response = await axios.post(
        `${this.providers.cloudflare.baseURL}/${accountId}/ai/run/${model}`,
        {
          messages: cfMessages,
          max_tokens: maxTokens,
          temperature,
          ...(cfResponseFormat && { response_format: cfResponseFormat }),
          // Workers AI documents top_p / seed / the two penalties for
          // text-generation but not `stop`, and validates its input schema
          // strictly — an unknown property is a 400, so `stop` is dropped here.
          ...(config.topP != null && { top_p: config.topP }),
          ...(config.seed != null && { seed: config.seed }),
          ...(config.presencePenalty != null && { presence_penalty: config.presencePenalty }),
          ...(config.frequencyPenalty != null && { frequency_penalty: config.frequencyPenalty })
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.providers.cloudflare.apiKey}`
          },
          timeout: 60000
        }
      );

      // JSON mode returns `response` as an object; callers expect text.
      let result = response.data.result?.response ?? response.data.result?.content ?? '';
      if (result && typeof result === 'object') result = JSON.stringify(result);

      return {
        content: result,
        inputTokens: response.data.result?.usage?.prompt_tokens || 0,
        outputTokens: response.data.result?.usage?.completion_tokens || 0
      };
    } catch (error) {
      logger.error({ err: error }, 'Cloudflare API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'Cloudflare response error details');

        // Handle 402 (out of neurons)
        if (error.response.status === 402) {
          // Same prefix rule as every other adapter, so the 402 is classified
          // rather than flattened to a 500 — the words after it never reach
          // the caller, only the status does.
          throw new Error(`Cloudflare API error (402): daily neuron limit exceeded ${JSON.stringify(error.response.data)}`);
        }

        throw new Error(`Cloudflare API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call Ollama Cloud API
   */
  async callOllama(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.ollama, messages = null } = config;

    const requestMessages = messages || [{ role: 'user', content: prompt }];

    try {
      const response = await axios.post(`${this.providers.ollama.baseURL}/chat`, {
        model: model,
        messages: requestMessages,
        stream: false,
        options: {
          temperature: temperature,
          num_predict: maxTokens,
          // Ollama takes the same knobs under different names, in `options`.
          ...(config.topP != null && { top_p: config.topP }),
          ...(stopSequencesFrom(config.stop) && { stop: stopSequencesFrom(config.stop) }),
          ...(config.seed != null && { seed: config.seed }),
          ...(config.presencePenalty != null && { presence_penalty: config.presencePenalty }),
          ...(config.frequencyPenalty != null && { frequency_penalty: config.frequencyPenalty })
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.ollama.apiKey}`
        },
        timeout: 60000
      });

      const result = response.data.message?.content || response.data.response || '';

      return {
        content: result,
        inputTokens: response.data.prompt_eval_count || 0,
        outputTokens: response.data.eval_count || 0
      };
    } catch (error) {
      logger.error({ err: error }, 'Ollama Cloud API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'Ollama response error details');
        throw new Error(`Ollama Cloud API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call LLM Gateway API
   */
  async callLLMGateway(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.llmgateway, messages = null } = config;

    const requestMessages = messages || [{ role: 'user', content: prompt }];

    try {
      const response = await axios.post(`${this.providers.llmgateway.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: requestMessages,
        ...openAISamplingFields(config)
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.llmgateway.apiKey}`
        },
        timeout: 60000
      });

      const result = response.data.choices[0].message.content;

      return {
        content: result,
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0
      };
    } catch (error) {
      logger.error({ err: error }, 'LLM Gateway API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'LLM Gateway response error details');
        throw new Error(`LLM Gateway API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * The OpenAI conversation as Anthropic content blocks.
   *
   * FINDING F-02 — the second half of the tool loop. This used to be one line:
   *
   *   messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user',
   *                        content: m.content ?? '' }))
   *
   * which is correct for plain chat and destroys a tool loop. An assistant
   * turn carrying `tool_calls` became an assistant turn with empty content
   * (which Anthropic rejects outright), and the `role:"tool"` result became a
   * `user` turn with its `tool_call_id` thrown away — so Anthropic saw a
   * tool_use it had never been given a result for. The first tool call worked;
   * the turn that feeds the result back did not. Every agent framework runs
   * exactly that loop.
   *
   * The translation:
   *   assistant + tool_calls[] → content blocks: the text (if any), then one
   *     {type:"tool_use", id, name, input} per call, `input` parsed back out
   *     of OpenAI's JSON-string `arguments`.
   *   role:"tool"              → a user turn holding
   *     {type:"tool_result", tool_use_id, content}. Consecutive tool results
   *     merge into one user turn, because Anthropic wants the results for a
   *     parallel tool_use batch in a single message.
   *   everything else          → unchanged.
   *
   * System turns are the caller's job to strip (Anthropic takes `system` at
   * the top level); they are skipped here.
   */
  anthropicMessagesFrom(messages) {
    const out = [];

    for (const m of messages) {
      if (!m || m.role === 'system') continue;

      if (m.role === 'tool') {
        const block = {
          type: 'tool_result',
          tool_use_id: m.tool_call_id,
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '')
        };
        const prev = out[out.length - 1];
        if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
          prev.content.push(block);
        } else {
          out.push({ role: 'user', content: [block] });
        }
        continue;
      }

      if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        const blocks = [];
        const text = typeof m.content === 'string' ? m.content : '';
        if (text) blocks.push({ type: 'text', text });
        for (const tc of m.tool_calls) {
          let input = {};
          try {
            const raw = tc?.function?.arguments;
            input = typeof raw === 'string' ? (raw ? JSON.parse(raw) : {}) : (raw ?? {});
          } catch {
            // A model that emitted unparseable arguments is a provider problem,
            // not a reason to drop the block and desynchronize the loop.
            input = {};
          }
          blocks.push({ type: 'tool_use', id: tc?.id, name: tc?.function?.name, input });
        }
        out.push({ role: 'assistant', content: blocks });
        continue;
      }

      out.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content ?? '' });
    }

    return out;
  }

  /**
   * The OpenAI conversation as Gemini `contents[]`.
   *
   * Same finding as anthropicMessagesFrom (F-02), same collapse: every
   * non-assistant role became `user` and every tool detail was dropped.
   *
   *   assistant + tool_calls[] → {role:"model", parts:[{functionCall:{name,args}}]}
   *   role:"tool"              → {role:"user", parts:[{functionResponse:{name,response}}]}
   *
   * Gemini keys a function response by *name*, not by an id — it issues no
   * tool-call ids at all (callGemini synthesizes them on the way out). So the
   * id→name map built while walking the assistant turns is what lets a
   * `tool_call_id` coming back from a client be resolved to the name Gemini
   * expects.
   *
   * System turns are skipped; they go in `systemInstruction`.
   */
  geminiContentsFrom(messages) {
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

  /**
   * Call Claude API
   */
  async callClaude(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.anthropic, messages = null, responseFormat = null, tools = null, toolChoice = null } = config;

    // Anthropic takes `system` as a top-level field, not a message role.
    // Extract system turns from the messages array and collapse them into a
    // single `system` string; pass the remaining user/assistant turns as messages.
    let systemText = '';
    let chatMessages;
    if (messages && Array.isArray(messages) && messages.length > 0) {
      const systemMsgs = messages.filter(m => m.role === 'system');
      systemText = systemMsgs.map(m => m.content ?? '').filter(Boolean).join('\n\n');
      chatMessages = this.anthropicMessagesFrom(messages);
      if (chatMessages.length === 0) {
        chatMessages = [{ role: 'user', content: prompt }];
      }
    } else {
      chatMessages = [{ role: 'user', content: prompt }];
    }

    try {
      const body = {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: chatMessages
      };
      if (systemText) body.system = systemText;

      // Sampling controls the Messages API actually has (F-09). Anthropic
      // offers top_p and stop_sequences; it has no seed and no presence/
      // frequency penalties, so those two are dropped here rather than sent
      // upstream to become a 400.
      if (config.topP != null) body.top_p = config.topP;
      const anthStop = stopSequencesFrom(config.stop);
      if (anthStop) body.stop_sequences = anthStop;

      // Translate OpenAI-style response_format into Anthropic's idioms.
      // Anthropic has no native response_format field, so:
      //   - json_object: append a "reply with valid JSON only" instruction
      //     and prefill the assistant turn with '{' to anchor the output.
      //   - json_schema: synthesize a tool with the schema and force it via
      //     tool_choice; the response arrives as a tool_use block whose input
      //     IS the schema-conformant object.
      let forcedSchemaToolName = null;
      if (responseFormat?.type === 'json_object') {
        body.system = (body.system ? body.system + '\n\n' : '') +
          'Respond with a single valid JSON object and nothing else. Do not wrap in markdown fences.';
        body.messages = [...chatMessages, { role: 'assistant', content: '{' }];
      } else if (responseFormat?.type === 'json_schema' && responseFormat.json_schema?.schema) {
        forcedSchemaToolName = responseFormat.json_schema.name || 'structured_output';
        body.tools = [{
          name: forcedSchemaToolName,
          description: responseFormat.json_schema.description || 'Return the user-requested structured output.',
          input_schema: responseFormat.json_schema.schema
        }];
        body.tool_choice = { type: 'tool', name: forcedSchemaToolName };
      }

      // Translate OpenAI-style tools/tool_choice into Anthropic format.
      // OpenAI: { function: { name, description, parameters } }
      // Anthropic: { name, description, input_schema }
      if (tools && Array.isArray(tools) && tools.length > 0) {
        const anthTools = tools.map(t => {
          const fn = t.function || t;
          return {
            name: fn.name,
            description: fn.description || '',
            input_schema: fn.parameters || { type: 'object', properties: {} }
          };
        });
        body.tools = body.tools ? [...body.tools, ...anthTools] : anthTools;

        if (!forcedSchemaToolName) {
          // json_schema already set tool_choice; don't overwrite.
          if (!toolChoice || toolChoice === 'auto') {
            body.tool_choice = { type: 'auto' };
          } else if (toolChoice === 'required') {
            body.tool_choice = { type: 'any' };
          } else if (toolChoice === 'none') {
            delete body.tools;
            delete body.tool_choice;
          } else if (toolChoice?.type === 'function' && toolChoice.function?.name) {
            body.tool_choice = { type: 'tool', name: toolChoice.function.name };
          }
        }
      }

      const response = await axios.post(`${this.providers.anthropic.baseURL}/messages`, body, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.providers.anthropic.apiKey,
          'anthropic-version': '2023-06-01'  // Compatible with current Claude models
        },
        timeout: 60000
      });

      let result;
      let toolCalls = null;
      let finishReason = 'stop';
      const stopReason = response.data.stop_reason;

      if (forcedSchemaToolName) {
        const toolUse = (response.data.content || []).find(b => b.type === 'tool_use' && b.name === forcedSchemaToolName);
        if (!toolUse) {
          throw new Error('Anthropic response missing expected tool_use block for forced schema');
        }
        result = JSON.stringify(toolUse.input);
      } else if (tools && Array.isArray(tools) && tools.length > 0 && stopReason === 'tool_use') {
        // Caller-provided tools: surface tool_use blocks as OpenAI tool_calls.
        let useBlocks = (response.data.content || []).filter(b => b.type === 'tool_use');

        // Defensive single-call collapse: when the caller pinned a specific
        // function via tool_choice (the Instructor pattern, and anything
        // using OpenAI's `tool_choice: {type: "function", function: {...}}`),
        // the OpenAI contract expects exactly one entry in tool_calls.
        // Claude *should* respect disable_parallel_tool_use, but if it ever
        // returns extras we keep the first matching block (or the first
        // block if none match) instead of letting multiple leak out.
        const forcedName = toolChoice?.function?.name;
        if (forcedName && useBlocks.length > 1) {
          const match = useBlocks.find(b => b.name === forcedName) || useBlocks[0];
          useBlocks = [match];
        }

        toolCalls = useBlocks.map(b => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input) }
        }));
        result = (response.data.content || []).find(b => b.type === 'text')?.text ?? '';
        finishReason = 'tool_calls';
      } else if (responseFormat?.type === 'json_object') {
        // Assistant prefill '{' is NOT echoed in response.content — re-attach it.
        const text = (response.data.content || []).find(b => b.type === 'text')?.text ?? '';
        result = '{' + text;
      } else {
        // Same shape as the two branches above. Blind `content[0].text` threw
        // a TypeError whenever Anthropic's first block was not text (a
        // max_tokens-truncated turn can start with a thinking or tool block,
        // and `content` can be empty), and that TypeError was rethrown raw —
        // so the rotation recorded Anthropic as failed and answered from a
        // different provider for a response that had already arrived.
        result = (response.data.content || []).find(b => b.type === 'text')?.text ?? '';
      }

      if (stopReason === 'max_tokens') finishReason = 'length';

      return {
        content: result,
        inputTokens: response.data.usage?.input_tokens || 0,
        outputTokens: response.data.usage?.output_tokens || 0,
        toolCalls,
        finishReason
      };
    } catch (error) {
      logger.error({ err: error }, 'Claude API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'Claude response error details');
        throw new Error(`Anthropic API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call Groq API
   */
  async callGroq(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.groq, messages = null, tools = null, toolChoice = null } = config;

    const requestMessages = (messages && Array.isArray(messages) && messages.length > 0)
      ? messages
      : [{ role: 'user', content: prompt }];

    try {
      const body = {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: requestMessages,
        ...openAISamplingFields(config)
      };

      // FINDING F-04. Groq's chat/completions is OpenAI-shaped down to the
      // field names — verified against console.groq.com/docs/api-reference
      // (2026-09-05): `tools` is "a list of tools the model may call", and
      // `tool_choice` takes none / auto / required / {type:"function",...}.
      // So there is nothing to translate: the caller's own objects go on the
      // wire verbatim, and the whole OpenAI-format conversation above
      // (assistant.tool_calls turns, role:"tool" results with tool_call_id)
      // is already in Groq's format too — no message rewriting either.
      //
      // Before this, callGroq destructured only {maxTokens, temperature,
      // model, messages} while the capability matrix advertised twelve Groq
      // models as tool-capable, so the rotation routed tool requests here and
      // the caller got prose.
      if (Array.isArray(tools) && tools.length > 0 && toolChoice !== 'none') {
        body.tools = tools;
        if (toolChoice) body.tool_choice = toolChoice;
      }

      const response = await axios.post(`${this.providers.groq.baseURL}/chat/completions`, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.groq.apiKey}`
        },
        timeout: 60000
      });

      const choice = response.data.choices?.[0] || {};
      const result = choice.message?.content ?? '';

      // Read tool_calls back off the response in the same shape the OpenAI
      // surface hands to the client — Groq already emits it, so this is a
      // pass-through with a defensive normalize.
      let toolCalls = null;
      let finishReason = choice.finish_reason || 'stop';
      const rawCalls = choice.message?.tool_calls;
      if (Array.isArray(rawCalls) && rawCalls.length > 0) {
        toolCalls = rawCalls.map((tc, i) => ({
          id: tc?.id || `call_${i}`,
          type: 'function',
          function: {
            name: tc?.function?.name,
            arguments: typeof tc?.function?.arguments === 'string'
              ? tc.function.arguments
              : JSON.stringify(tc?.function?.arguments ?? {})
          }
        }));
        finishReason = 'tool_calls';
      } else if (finishReason === 'length') {
        finishReason = 'length';
      } else if (finishReason !== 'stop') {
        finishReason = 'stop';
      }

      return {
        content: result,
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0,
        toolCalls,
        finishReason
      };
    } catch (error) {
      logger.error({ err: error }, 'Groq API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'Groq response error details');
        throw new Error(`Groq API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call Gemini API
   */
  async callGemini(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.gemini, messages = null, responseFormat = null, tools = null, toolChoice = null } = config;

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
      contents = this.geminiContentsFrom(messages);
      if (contents.length === 0) {
        contents = [{ role: 'user', parts: [{ text: prompt }] }];
      }
    } else {
      contents = [{ role: 'user', parts: [{ text: prompt }] }];
    }

    try {
      const generationConfig = {
        maxOutputTokens: maxTokens,
        temperature: temperature,
        // Gemini's names for the two knobs it shares with OpenAI (F-09).
        // seed and the two penalties are not in generationConfig for the
        // model families this proxy routes to, so they are dropped here.
        ...(config.topP != null && { topP: config.topP }),
        ...(stopSequencesFrom(config.stop) && { stopSequences: stopSequencesFrom(config.stop) })
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
      if (tools && Array.isArray(tools) && tools.length > 0) {
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

      // Key in a header, never the query string — see refreshModels('gemini').
      const response = await axios.post(`${this.providers.gemini.baseURL}/models/${model}:generateContent`, body, {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.providers.gemini.apiKey
        },
        timeout: 60000
      });

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
        finishReason
      };
    } catch (error) {
      logger.error({ err: error }, 'Gemini API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'Gemini response error details');
        throw new Error(`Gemini API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call Together AI API
   */
  async callTogether(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.together, messages = null } = config;

    const requestMessages = (messages && Array.isArray(messages) && messages.length > 0)
      ? messages
      : [{ role: 'user', content: prompt }];

    try {
      const response = await axios.post(`${this.providers.together.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: requestMessages,
        stream: false,
        ...openAISamplingFields(config)
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.together.apiKey}`
        },
        timeout: 60000
      });

      const result = response.data.choices[0].message.content;

      return {
        content: result,
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0
      };
    } catch (error) {
      logger.error({ err: error }, 'Together AI API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'Together AI response error details');
        // "Together AI API error", not "Together AI error": aiFailureEnvelope's
        // upstreamStatusOf() reads the status out of the literal prefix
        // `API error (<status>)`, and this was the one adapter that did not
        // use it — so every Together failure, whatever its real status, was
        // classified `internal` and answered 500 `internal_error` where a bad
        // model pin is documented to be 404 `model_not_found`.
        throw new Error(`Together AI API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call Cohere API
   */
  async callCohere(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.cohere, messages = null } = config;

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

    try {
      const body = {
        model: model,
        message: currentMessage,
        max_tokens: maxTokens,
        temperature: temperature
      };
      if (preamble) body.preamble = preamble;
      if (chatHistory.length > 0) body.chat_history = chatHistory;

      // Cohere's /chat sampling knobs, in Cohere's own spelling (F-09 for
      // cohere): `p` is its top_p, `stop_sequences` takes up to 5 strings,
      // and seed/frequency_penalty/presence_penalty are named the same as
      // OpenAI's. Absent values are omitted rather than sent as null/0, same
      // convention as openAISamplingFields.
      if (config.topP != null) body.p = config.topP;
      const cohereStop = stopSequencesFrom(config.stop);
      if (cohereStop) body.stop_sequences = cohereStop;
      if (config.seed != null) body.seed = config.seed;
      if (config.presencePenalty != null) body.presence_penalty = config.presencePenalty;
      if (config.frequencyPenalty != null) body.frequency_penalty = config.frequencyPenalty;

      // No `tools` forwarding here, deliberately. Cohere's native tool-use
      // contract (tool_results, force_single_step) is not the OpenAI
      // {type:"function",...} shape the other adapters translate — doing it
      // right needs its own translation layer, which is out of scope for
      // this pass. TOOL_FORWARDING_PROVIDERS in aiModelCapabilitiesService.js
      // does not include 'cohere', so supportsToolCalling stays false for
      // every Cohere model regardless of what supportsFunctionCalling says,
      // and the rotation will not route a `tools` request here (F-04).

      const response = await axios.post(`${this.providers.cohere.baseURL}/chat`, body, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.cohere.apiKey}`
        },
        timeout: 60000
      });

      const result = response.data.text;

      return {
        content: result,
        inputTokens: response.data.meta?.tokens?.input_tokens || 0,
        outputTokens: response.data.meta?.tokens?.output_tokens || 0
      };
    } catch (error) {
      logger.error({ err: error }, 'Cohere API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'Cohere response error details');
        throw new Error(`Cohere API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call OpenRouter API
   */
  async callOpenRouter(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.openrouter, messages = null } = config;

    const requestMessages = (messages && Array.isArray(messages) && messages.length > 0)
      ? messages
      : [{ role: 'user', content: prompt }];

    try {
      const response = await axios.post(`${this.providers.openrouter.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: requestMessages,
        ...openAISamplingFields(config)
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.openrouter.apiKey}`,
          'HTTP-Referer': 'https://basegeek.clintgeek.com', // Optional: for rankings
          'X-Title': 'BaseGeek aiGeek' // Optional: shows in OpenRouter dashboard
        },
        timeout: 60000
      });

      const result = response.data.choices[0].message.content;

      return {
        content: result,
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0
      };
    } catch (error) {
      logger.error({ err: error }, 'OpenRouter API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'OpenRouter response error details');
        throw new Error(`OpenRouter API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call Cerebras API (OpenAI-compatible)
   */
  async callCerebras(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = DEFAULT_MODELS.cerebras, messages = null } = config;

    // Use provided messages array or convert prompt to messages
    let requestMessages = messages || [
      {
        role: 'user',
        content: prompt
      }
    ];

    // Inject prompt strategy based on family configuration
    const promptStrategy = this.getPromptStrategy('cerebras');
    if (promptStrategy) {
      logger.debug(`[Cerebras] Applying prompt strategy: ${promptStrategy.substring(0, 50)}...`);
      // Prepend strategy to the first system message, or create one
      const systemIndex = requestMessages.findIndex(m => m.role === 'system');
      if (systemIndex >= 0) {
        logger.debug(`[Cerebras] Appending strategy to existing system message (index ${systemIndex})`);
        requestMessages[systemIndex].content += promptStrategy;
      } else {
        logger.debug(`[Cerebras] Creating new system message with strategy`);
        // Add as first message
        requestMessages = [
          { role: 'system', content: `System instructions:${promptStrategy}` },
          ...requestMessages
        ];
      }
      // Log the final system message for verification
      const finalSystemMsg = requestMessages.find(m => m.role === 'system');
      if (finalSystemMsg) {
        logger.debug(`[Cerebras] Final system message length: ${finalSystemMsg.content.length} chars`);
      }
    } else {
      logger.debug(`[Cerebras] No prompt strategy found for cerebras provider`);
    }

    try {
      const response = await axios.post(`${this.providers.cerebras.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: requestMessages,
        ...openAISamplingFields(config)
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.cerebras.apiKey}`
        },
        timeout: 60000
      });

      const result = response.data.choices[0].message.content;

      return {
        content: result,
        inputTokens: response.data.usage?.prompt_tokens || 0,
        outputTokens: response.data.usage?.completion_tokens || 0
      };
    } catch (error) {
      logger.error({ err: error }, 'Cerebras API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'Cerebras response error details');
        throw new Error(`Cerebras API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

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
   * Update usage statistics.
   *
   * `appName` is the resolved app id and `feature` an optional slice of it.
   * Both are grouped here rather than being separate apps: the breakdown used
   * to show `fitnessGeek`, `fitnessgeek` and `fitnessGeek:mealPlan` as three
   * unrelated consumers, which made "what does fitnessgeek cost" unanswerable.
   * Now there is one app row with a `features` map inside it. The map is
   * additive — existing readers of `appUsage[app].calls` are unaffected.
   */
    async updateStats(provider, inputTokens, outputTokens, modelId = null, appName = 'unknown', feature = null) {
    // Cost below is (tokens / 1000) * costPer1kTokens — per-1K, matching the
    // provider table's unit, NOT the per-1M unit of AIPricing/costForTokens.
    const totalTokens = inputTokens + outputTokens;

    // Check if this model is free and within limits
    let actualCost = 0;
    let isFreeUsage = false;

    if (modelId) {
      try {
        // Check if model is in free tier
        const freeTier = await AIFreeTier.findOne({ provider, modelId });
        if (freeTier?.isFree) {
          // Check current usage for this model
          const usage = await AIUsage.findOne({
            provider,
            modelId,
            userId: 'session', // We'll need to pass actual userId
            date: new Date().toDateString()
          });

          if (usage) {
            // Check if we're still within free limits
            const isWithinLimits = !usage.isAtLimit.requestsPerDay &&
                                 !usage.isAtLimit.tokensPerDay &&
                                 !usage.isAtLimit.requestsPerMinute &&
                                 !usage.isAtLimit.tokensPerMinute;

            if (isWithinLimits) {
              isFreeUsage = true;
              actualCost = 0; // Free!
            } else {
              // Exceeded free tier - calculate cost
              actualCost = (totalTokens / 1000) * this.providers[provider].costPer1kTokens;
            }
          } else {
            // No usage record yet - assume free
            isFreeUsage = true;
            actualCost = 0;
          }
        } else {
          // Not a free model - always charge
          actualCost = (totalTokens / 1000) * this.providers[provider].costPer1kTokens;
        }
      } catch (error) {
        logger.error({ err: error }, 'Error checking free tier status');
        // Fallback to charging
        actualCost = (totalTokens / 1000) * this.providers[provider].costPer1kTokens;
      }
    } else {
      // No modelId provided - charge normally
      actualCost = (totalTokens / 1000) * this.providers[provider].costPer1kTokens;
    }

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
        rateLimits: Object.entries(this.rateLimits).map(([provider, limits]) => ({
          provider,
          tokensUsed: limits.tokensUsed || 0,
          tokensPerMinute: limits.tokensPerMinute || 'none',
          requestsUsed: limits.requestsUsed,
          requestsPerMinute: limits.requestsPerMinute,
          rateLimited: limits.rateLimitedUntil && Date.now() < limits.rateLimitedUntil
        }))
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
