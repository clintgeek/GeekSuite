// MUST import WASM backend initializer FIRST to prevent native binding attempts
// DISABLED: Causing Docker issues with onnxruntime-node dependency
// import '../wasm-backend-init.js';

import axios from 'axios';
import logger from '../lib/logger.js';
import AIConfig from '../models/AIConfig.js';
import AIModel from '../models/AIModel.js';
import AIPricing from '../models/AIPricing.js';
import aiUsageService from './aiUsageService.js';
import AIFreeTier from '../models/AIFreeTier.js';
import AIAppConfig from '../models/AIAppConfig.js';
import AIUsage from '../models/AIUsage.js';
import RotationManager from './rotationManager.js';
// Using cloud-based summarization instead of local transformers.js
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { countTextTokens, countMessageTokens } from './tokenCounter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

    // Response caching (LRU cache with 100 entries)
    this.responseCache = new Map();
    this.maxCacheSize = 100;
    this.cacheHits = 0;
    this.cacheMisses = 0;

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

    this.rotationProviderOverrides = {
      groq: { model: 'llama-3.3-70b-versatile' },
      cerebras: { model: 'qwen-3-235b-a22b-instruct-2507' },
      together: { model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free' },
      openrouter: { model: 'meta-llama/llama-3.1-70b-instruct:free' },
      cloudflare: { model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
      ollama: { model: 'qwen3-coder:480b-cloud' },
      llmgateway: { model: 'llama-4-maverick-free' }
    };

    this.providers = {
      anthropic: {
        name: 'Claude 3.5 Sonnet',
        apiKey: '',
        baseURL: 'https://api.anthropic.com/v1',
        model: 'claude-3-5-sonnet-20241022',
        costPer1kTokens: 0.003,
        maxTokens: 4000,
        temperature: 0.7,
        enabled: false
      },
      groq: {
        name: 'Groq Llama 3.3 70B',
        apiKey: '',
        baseURL: 'https://api.groq.com/openai/v1',
        model: 'llama-3.3-70b-versatile',
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 32768, // 32K context limit
        temperature: 0.7,
        enabled: false
      },
      gemini: {
        name: 'Gemini 2.0 Flash',
        apiKey: '',
        baseURL: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-2.0-flash-exp',
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
        model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
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
        model: 'command-r-plus-08-2024',
        costPer1kTokens: 0.0025,
        maxTokens: 4000,
        temperature: 0.7,
        enabled: false
      },
      openrouter: {
        name: 'OpenRouter Llama 3.1 70B Free',
        apiKey: '',
        baseURL: 'https://openrouter.ai/api/v1',
        model: 'meta-llama/llama-3.1-70b-instruct:free',
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
        model: 'qwen-3-235b-a22b-instruct-2507',
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
        model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
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
        model: 'qwen3-coder:480b-cloud',
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        temperature: 0.7,
        enabled: false
      },
      llmgateway: {
        name: 'LLM Gateway Llama 4 Maverick',
        apiKey: '',
        baseURL: 'https://api.llmgateway.io/v1',
        model: 'llama-4-maverick-free',
        costPer1kTokens: 0.0,
        maxTokens: 8000,
        maxContextTokens: 1000000, // 1M context limit
        temperature: 0.7,
        enabled: false
      },
    };

    this.currentProvider = 'groq';
    this.fallbackOrder = ['groq', 'cerebras', 'together', 'openrouter', 'cloudflare', 'ollama', 'llmgateway'];

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
      llm7: {
        tokensPerMinute: 100000, // Estimate
        requestsPerMinute: 150, // 4500 req/h = ~75 req/min avg, but 150/min burst
        lastReset: Date.now(),
        tokensUsed: 0,
        requestsUsed: 0,
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
      onemin: {
        // NO tokensPerMinute limit - uses monthly credits instead
        requestsPerMinute: 180, // ACTUAL: 180 RPM (was incorrectly 60)
        creditsPerMonth: 1000000, // NEW: 1M credits/month (credit ≠ token)
        lastReset: Date.now(),
        tokensUsed: 0, // Keep for compatibility but not enforced
        requestsUsed: 0,
        monthlyCreditsUsed: 0, // NEW: Monthly credit tracking
        lastMonthlyReset: Date.now(), // NEW
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
          this.providers[config.provider].apiKey = config.apiKey ? config.apiKey.trim() : '';
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
              headers: { 'Authorization': `Bearer ${this.providers.groq.apiKey}` }
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
              const response = await axios.get(
                `https://generativelanguage.googleapis.com/v1beta/models?key=${this.providers.gemini.apiKey}`,
                { timeout: 10000 }
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
              models = [
                { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
                { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
                { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
              ];
            }
          } else {
            models = [
              { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
              { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
              { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' }
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
          { id: 'gemini-1.5-flash-latest', name: 'Gemini 1.5 Flash (Free)' },
          { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro' },
          { id: 'gemini-pro', name: 'Gemini Pro' }
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
        llm7: [
          { id: 'Qwen2.5-Coder-32B-Instruct', name: 'Qwen2.5 Coder 32B Instruct (Free)' }
        ],
        llmgateway: [
          { id: 'llama-4-maverick-free', name: 'Llama 4 Maverick (Free - 1M context)' }
        ],
        onemin: [
          { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet (Best for tool use - 1M free credits/month)' },
          { id: 'claude-4-sonnet', name: 'Claude 4 Sonnet' },
          { id: 'claude-3-5-haiku', name: 'Claude 3.5 Haiku (Fast)' },
          { id: 'gpt-5-chat-latest', name: 'GPT-5 Chat Latest' },
          { id: 'gpt-5', name: 'GPT-5' },
          { id: 'gpt-4o', name: 'GPT-4o' },
          { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)' },
          { id: 'deepseek-chat', name: 'DeepSeek Chat' },
          { id: 'grok-code-fast-1', name: 'xAI Grok Code Fast 1' }
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
   * Generate cache key for request
   */
  getCacheKey(prompt, provider, model, temperature, namespace = 'default') {
    const hash = crypto.createHash('md5')
      .update(`${prompt}:${provider}:${model}:${temperature}:${namespace}`)
      .digest('hex');
    return hash;
  }

  /**
   * Get cached response
   */
  getCachedResponse(cacheKey) {
    if (this.responseCache.has(cacheKey)) {
      this.cacheHits++;
      const cached = this.responseCache.get(cacheKey);
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
   * Set cached response (LRU eviction)
   */
  setCachedResponse(cacheKey, response) {
    // LRU eviction: remove oldest if at max size
    if (this.responseCache.size >= this.maxCacheSize) {
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }
    this.responseCache.set(cacheKey, {
      content: response,
      timestamp: Date.now()
    });
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
      hits: this.cacheHits,
      misses: this.cacheMisses,
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
        const maskedKey = `${apiKey.substring(0, 12)}...${apiKey.substring(apiKey.length - 8)}`;
        logger.info(`${provider.toUpperCase()} API = ${maskedKey} ✅`);
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
      messages = null,
      autoRotate = false,
      freeOnly = false,
      useAppConfig = false,
      cacheNamespace = 'default'
    } = config;

    // App config resolution: look up server-side routing for this appName
    // Triggered by useAppConfig flag, model "basegeek-app", or when no explicit provider/model is given
    if (useAppConfig || requestedProvider === 'basegeek-app') {
      try {
        const appConfig = await AIAppConfig.findOne({ appName, enabled: true });
        if (appConfig) {
          // Update lastSeen
          appConfig.lastSeen = new Date();
          appConfig.save().catch(() => {}); // fire-and-forget

          if (appConfig.tier === 'specific' && appConfig.provider && appConfig.model) {
            requestedProvider = appConfig.provider;
            model = appConfig.model;
            autoRotate = false;
            freeOnly = false;
            logger.info(`[AppConfig] ${appName} → specific: ${appConfig.provider}/${appConfig.model}`);
          } else if (appConfig.tier === 'free') {
            freeOnly = true;
            logger.info(`[AppConfig] ${appName} → free tier`);
          } else if (appConfig.tier === 'rotation') {
            autoRotate = true;
            logger.info(`[AppConfig] ${appName} → rotation`);
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
          AIAppConfig.findOneAndUpdate(
            { appName },
            { appName, tier: 'free', autoDiscovered: true, lastSeen: new Date() },
            { upsert: true, new: true }
          ).catch(() => {});
          freeOnly = true;
          logger.info(`[AppConfig] ${appName} → auto-discovered, defaulting to free tier`);
        }
      } catch (appConfigError) {
        logger.error({ err: appConfigError }, `[AppConfig] Failed to resolve config for ${appName}`);
        // Fall through to normal routing
      }
    }

    // "free" mode: query DB for available free-tier models and pick the best one
    if (freeOnly || requestedProvider === 'free') {
      try {
        const freeModels = await AIFreeTier.find({ isFree: true });
        // Group by provider and find one that's enabled with an API key
        const candidates = [];
        for (const fm of freeModels) {
          const pc = this.providers[fm.provider];
          if (pc && pc.apiKey && pc.enabled !== false) {
            candidates.push({ provider: fm.provider, modelId: fm.modelId, limits: fm.freeLimits });
          }
        }
        if (candidates.length > 0) {
          // Prefer rotation-style selection: pick from the priority list if available
          const priorityList = this.rotationManager.getPriorityList();
          const prioritized = candidates.sort((a, b) => {
            const aIdx = priorityList.indexOf(a.provider);
            const bIdx = priorityList.indexOf(b.provider);
            return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
          });
          const pick = prioritized[0];
          requestedProvider = pick.provider;
          model = pick.modelId;
          autoRotate = false; // We've already picked
          logger.info(`[FreeOnly] Selected ${pick.provider}/${pick.modelId}`);
        } else {
          logger.warn('[FreeOnly] No free-tier models available with configured API keys, falling back to rotation');
          autoRotate = true;
        }
      } catch (freeError) {
        logger.error({ err: freeError }, '[FreeOnly] Failed to query free tier, falling back to rotation');
        autoRotate = true;
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

    const rotationProviders = autoRotate
      ? this.rotationManager.getPriorityList()
      : [requestedProvider, ...this.fallbackOrder.filter(p => p !== requestedProvider)];

    if (autoRotate) {
      const selection = this.rotationManager.selectProvider();
      const index = rotationProviders.indexOf(selection.provider);
      if (index > 0) {
        rotationProviders.splice(index, 1);
        rotationProviders.unshift(selection.provider);
      }
    }

    let lastError = null;

    for (const currentProvider of rotationProviders) {
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
      const isRequestedProvider = currentProvider === requestedProvider;
      let providerModel = isRequestedProvider
        ? (model || providerConfig.model)
        : providerConfig.model;
      if (autoRotate) {
        const rotationOverride = this.rotationProviderOverrides[currentProvider];
        if (rotationOverride?.model) {
          providerModel = rotationOverride.model;
        }
      }

      // Check cache per provider/model combination
      const cacheKeyBase = this.getCacheKey(basePrompt || '', currentProvider, providerModel, temperature, cacheNamespace);
      const cached = this.getCachedResponse(cacheKeyBase);
      if (cached) {
        this.lastProviderInfo = { provider: currentProvider, model: providerModel, cached: true };
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

      try {
        const result = await this.callProvider(currentProvider, processedPrompt, {
          maxTokens,
          temperature,
          model: providerModel,
          messages: processedMessages
        });

        const totalTokens = (result.inputTokens || 0) + (result.outputTokens || 0);

        this.setCachedResponse(cacheKeyBase, result.content);
        this.updateRateLimitUsage(currentProvider, totalTokens);
        await this.updateStats(currentProvider, result.inputTokens || 0, result.outputTokens || 0, providerModel, appName);

        const trackingUserId = userId || 'session';
        await aiUsageService.trackUsage(currentProvider, providerModel, trackingUserId, {
          inputTokens: result.inputTokens || 0,
          outputTokens: result.outputTokens || 0,
          requests: 1
        });

        if (autoRotate) {
          this.rotationManager.recordUsage(currentProvider, { requests: 1, tokens: totalTokens });
        }

        this.lastProviderInfo = { provider: currentProvider, model: providerModel, cached: false };
        return result.content;
      } catch (error) {
        lastError = error;

        if (error.message.includes('429') || error.message.includes('rate limit') || error.message.includes('quota')) {
          this.markRateLimited(currentProvider, 60);
          if (autoRotate) {
            this.rotationManager.markProviderCooling(currentProvider, 60 * 1000);
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
          appName: options.appName || 'free-tier'
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
        appName: options.appName || 'smart-routing'
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
          appName: options.appName || 'smart-routing'
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

    const { maxTokens = providerConfig.maxTokens, temperature = providerConfig.temperature, model = providerConfig.model, messages = null } = config;

    // Pass messages to all provider calls
    const callConfig = { maxTokens, temperature, model, messages };

    switch (provider) {
      case 'anthropic':
        return await this.callClaude(prompt, callConfig);
      case 'groq':
        return await this.callGroq(prompt, callConfig);
      case 'gemini':
        return await this.callGemini(prompt, callConfig);
      case 'together':
        return await this.callTogether(prompt, callConfig);
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
    const { maxTokens = 1000, temperature = 0.7, model = '@cf/openai/gpt-oss-120b', messages = null } = config;

    const accountId = this.providers.cloudflare.accountId;
    if (!accountId) {
      throw new Error('Cloudflare account ID not configured');
    }

    // Use provided messages array or convert prompt to messages
    const requestMessages = messages || [{ role: 'user', content: prompt }];

    // Format prompt for Cloudflare Workers AI text generation
    const formattedPrompt = requestMessages.map(m => {
      if (m.role === 'system') return `System: ${m.content}`;
      if (m.role === 'assistant') return `Assistant: ${m.content}`;
      return m.content;
    }).join('\n\n');

    try {
      const response = await axios.post(
        `${this.providers.cloudflare.baseURL}/${accountId}/ai/run/${model}`,
        {
          prompt: formattedPrompt,
          max_tokens: maxTokens
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.providers.cloudflare.apiKey}`
          },
          timeout: 60000
        }
      );

      const result = response.data.result?.response || response.data.result?.content || '';

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
          throw new Error(`Cloudflare daily neuron limit exceeded (402): ${JSON.stringify(error.response.data)}`);
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
    const { maxTokens = 1000, temperature = 0.7, model = 'qwen3-coder:480b', messages = null } = config;

    const requestMessages = messages || [{ role: 'user', content: prompt }];

    try {
      const response = await axios.post(`${this.providers.ollama.baseURL}/chat`, {
        model: model,
        messages: requestMessages,
        stream: false,
        options: {
          temperature: temperature,
          num_predict: maxTokens
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
   * Call LLM7 API
   */
  async callLLM7(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = 'Qwen2.5-Coder-32B-Instruct', messages = null } = config;

    const requestMessages = messages || [{ role: 'user', content: prompt }];

    try {
      const response = await axios.post(`${this.providers.llm7.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: requestMessages
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.llm7.apiKey}`
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
      logger.error({ err: error }, 'LLM7 API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, 'LLM7 response error details');
        throw new Error(`LLM7 API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call LLM Gateway API
   */
  async callLLMGateway(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = 'llama-4-maverick-free', messages = null } = config;

    const requestMessages = messages || [{ role: 'user', content: prompt }];

    try {
      const response = await axios.post(`${this.providers.llmgateway.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: requestMessages
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
   * Call 1min.ai Code Generator API
   * Docs: https://docs.1min.ai/docs/api/ai-for-code/code-generator/code-generator-tag
   */
  async callOneMin(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = 'deepseek-reasoner', messages = null } = config;

    // Convert messages to prompt if provided
    let promptText = prompt;
    if (messages && Array.isArray(messages)) {
      promptText = messages.map(m => {
        if (m.role === 'system') return `System: ${m.content}`;
        if (m.role === 'assistant') return `Assistant: ${m.content}`;
        return m.content;
      }).join('\n\n');
    }

    try {
      const response = await axios.post(`${this.providers.onemin.baseURL}/features`, {
        type: this.providers.onemin.type || 'CODE_GENERATOR',
        model: model,
        conversationId: 'CODE_GENERATOR',
        promptObject: {
          prompt: promptText,
          webSearch: false
        }
      }, {
        headers: {
          'Content-Type': 'application/json',
          'API-KEY': this.providers.onemin.apiKey
        },
        timeout: 60000
      });

      // 1min.ai returns response in data.response or data.content or data.result
      const result = response.data?.response || response.data?.content || response.data?.result || response.data?.output || '';

      if (!result) {
        logger.warn({ data: response.data }, '1min.ai returned empty response');
        throw new Error('Empty response from 1min.ai API');
      }

      return {
        content: result,
        inputTokens: response.data?.usage?.prompt_tokens || 0,
        outputTokens: response.data?.usage?.completion_tokens || 0
      };
    } catch (error) {
      logger.error({ err: error }, '1min.ai API error');
      if (error.response) {
        logger.error({ status: error.response.status, data: error.response.data }, '1min.ai response error details');
        throw new Error(`1min.ai API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call Claude API
   */
  async callClaude(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = 'claude-3-5-sonnet-20241022' } = config;

    try {
      const response = await axios.post(`${this.providers.anthropic.baseURL}/messages`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.providers.anthropic.apiKey,
          'anthropic-version': '2023-06-01'  // Compatible with current Claude models
        },
        timeout: 60000
      });

      const result = response.data.content[0].text;

      return {
        content: result,
        inputTokens: response.data.usage?.input_tokens || 0,
        outputTokens: response.data.usage?.output_tokens || 0
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
    const { maxTokens = 1000, temperature = 0.7, model = 'llama-3.3-70b-versatile' } = config;

    try {
      const response = await axios.post(`${this.providers.groq.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.providers.groq.apiKey}`
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
    const { maxTokens = 1000, temperature = 0.7, model = 'gemini-1.5-flash-latest' } = config;

    try {
      const response = await axios.post(`${this.providers.gemini.baseURL}/models/${model}:generateContent?key=${this.providers.gemini.apiKey}`, {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          maxOutputTokens: maxTokens,
          temperature: temperature
        }
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 60000
      });

      const result = response.data.candidates[0].content.parts[0].text;

      return {
        content: result,
        inputTokens: response.data.usageMetadata?.promptTokenCount || 0,
        outputTokens: response.data.usageMetadata?.candidatesTokenCount || 0
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
    const { maxTokens = 1000, temperature = 0.7, model = 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free' } = config;

    try {
      const response = await axios.post(`${this.providers.together.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false
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
        throw new Error(`Together AI error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }

  /**
   * Call Cohere API
   */
  async callCohere(prompt, config = {}) {
    const { maxTokens = 1000, temperature = 0.7, model = 'command-r-plus-08-2024' } = config;

    try {
      const response = await axios.post(`${this.providers.cohere.baseURL}/chat`, {
        model: model,
        message: prompt,
        max_tokens: maxTokens,
        temperature: temperature
      }, {
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
    const { maxTokens = 1000, temperature = 0.7, model = 'google/gemini-2.0-flash-exp:free' } = config;

    try {
      const response = await axios.post(`${this.providers.openrouter.baseURL}/chat/completions`, {
        model: model,
        max_tokens: maxTokens,
        temperature: temperature,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
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
    const { maxTokens = 1000, temperature = 0.7, model = 'qwen-3-235b-a22b-instruct-2507', messages = null } = config;

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
        messages: requestMessages
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
   * Update usage statistics
   */
    async updateStats(provider, inputTokens, outputTokens, modelId = null, appName = 'unknown') {
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

    // Track app usage
    if (!this.sessionStats.providerUsage[provider].appUsage[appName]) {
      this.sessionStats.providerUsage[provider].appUsage[appName] = {
        calls: 0,
        tokens: 0,
        cost: 0,
        freeCalls: 0,
        paidCalls: 0
      };
    }

    this.sessionStats.providerUsage[provider].appUsage[appName].calls++;
    this.sessionStats.providerUsage[provider].appUsage[appName].tokens += totalTokens;
    this.sessionStats.providerUsage[provider].appUsage[appName].cost += actualCost;

    logger.debug(`Updated app stats for ${provider}/${appName}: calls=${this.sessionStats.providerUsage[provider].appUsage[appName].calls}, tokens=${this.sessionStats.providerUsage[provider].appUsage[appName].tokens}, cost=${this.sessionStats.providerUsage[provider].appUsage[appName].cost}`);

    if (isFreeUsage) {
      this.sessionStats.providerUsage[provider].freeCalls =
        (this.sessionStats.providerUsage[provider].freeCalls || 0) + 1;
      this.sessionStats.providerUsage[provider].appUsage[appName].freeCalls++;
    } else {
      this.sessionStats.providerUsage[provider].paidCalls =
        (this.sessionStats.providerUsage[provider].paidCalls || 0) + 1;
      this.sessionStats.providerUsage[provider].appUsage[appName].paidCalls++;
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
      this.providers[provider].apiKey && this.providers[provider].apiKey.length > 10
    );
  }
}

export default new AIService();
