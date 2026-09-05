import aiService from './aiService.js';
import AIModel from '../models/AIModel.js';
import AIPricing from '../models/AIPricing.js';
import AIFreeTier from '../models/AIFreeTier.js';
import aiModelCapabilitiesService from './aiModelCapabilitiesService.js';
import logger from '../lib/logger.js';

/**
 * Pricing in the AIPricing collection is stored per *million* tokens — the
 * unit every provider quotes and the unit the seed data uses (anthropic opus
 * at 15/75, gemini-2.5-pro at 1.25/10). Cost math divides by this, never by
 * 1000; getting it wrong overstated every estimate by 1000x.
 */
export const TOKENS_PER_PRICE_UNIT = 1_000_000;

/**
 * Cost of `tokens` tokens at `pricePerMillion` dollars per million tokens.
 * A missing or non-numeric price contributes nothing rather than NaN.
 */
export function costForTokens(tokens, pricePerMillion) {
  const price = typeof pricePerMillion === 'number' ? pricePerMillion : 0;
  return (tokens / TOKENS_PER_PRICE_UNIT) * price;
}

/**
 * The orderings the recommender sorts by. Both used to be redeclared inside
 * the per-provider reduce *and* the final sort; one table each now.
 */
const SPEED_ORDER = { 'ultra-fast': 0, fast: 1, medium: 2, slow: 3 };
const QUALITY_ORDER = { 'state-of-the-art': 0, excellent: 1, good: 2, basic: 3 };

/** Quality tier as points out of 100, for capabilityFitScore. */
const QUALITY_POINTS = { 'state-of-the-art': 100, excellent: 85, good: 70, basic: 50 };

class AIDirectorService {
  constructor() {
    this.providerPricing = {
      anthropic: {
        'claude-opus-4-1-20250805': { input: 15, output: 75 },
        'claude-opus-4-20250514': { input: 15, output: 75 },
        'claude-sonnet-4-20250514': { input: 3, output: 15 },
        'claude-3-7-sonnet-20250219': { input: 3, output: 15 },
        'claude-3-5-sonnet-20241022': { input: 3, output: 15 },
        'claude-3-5-haiku-20241022': { input: 0.8, output: 4 },
        'claude-3-haiku-20240307': { input: 0.25, output: 1.25 }
      },
      groq: {
        'llama-3.1-8b-instant': { input: 0.00027, output: 0.00027 },
        'llama-3.1-70b-versatile': { input: 0.0007, output: 0.0007 },
        'llama-3.1-405b-reasoning': { input: 0.002, output: 0.002 },
        'mixtral-8x7b-instant': { input: 0.00027, output: 0.00027 },
        'gemma-2-9b-it': { input: 0.00027, output: 0.00027 },
        'llama-3.3-70b-versatile': { input: 0.0007, output: 0.0007 },
        'llama3-8b-8192': { input: 0.00027, output: 0.00027 },
        'llama3-70b-8192': { input: 0.0007, output: 0.0007 },
        'gemma2-9b-it': { input: 0.00027, output: 0.00027 },
        'compound-beta': { input: 0.00027, output: 0.00027 },
        'compound-beta-mini': { input: 0.00027, output: 0.00027 },
        'meta-llama/llama-4-scout-17b-16e-instruct': { input: 0.0007, output: 0.0007 },
        'meta-llama/llama-4-maverick-17b-128e-instruct': { input: 0.0007, output: 0.0007 },
        'meta-llama/llama-guard-4-12b': { input: 0.0007, output: 0.0007 },
        'meta-llama/llama-prompt-guard-2-22m': { input: 0.00027, output: 0.00027 },
        'meta-llama/llama-prompt-guard-2-86m': { input: 0.00027, output: 0.00027 },
        'qwen/qwen3-32b': { input: 0.0007, output: 0.0007 },
        'moonshotai/kimi-k2-instruct': { input: 0.0007, output: 0.0007 },
        'openai/gpt-oss-20b': { input: 0.0007, output: 0.0007 },
        'openai/gpt-oss-120b': { input: 0.002, output: 0.002 },
        'allam-2-7b': { input: 0.00027, output: 0.00027 },
        'deepseek-r1-distill-llama-70b': { input: 0.0007, output: 0.0007 },
        'whisper-large-v3': { input: 0.00027, output: 0.00027 },
        'whisper-large-v3-turbo': { input: 0.00027, output: 0.00027 },
        'distil-whisper-large-v3-en': { input: 0.00027, output: 0.00027 },
        'playai-tts': { input: 0.00027, output: 0.00027 },
        'playai-tts-arabic': { input: 0.00027, output: 0.00027 }
      },
      gemini: {
        'gemini-1.5-flash': { input: 0.00035, output: 1.05 },
        'gemini-1.5-pro': { input: 3.5, output: 10.5 },
        'gemini-pro': { input: 0.5, output: 1.5 },
        'gemini-2.0-flash': { input: 0.1, output: 0.4 },
        'gemini-2.0-flash-lite': { input: 0.075, output: 0.3 },
        'gemini-2.5-flash': { input: 0.3, output: 2.5 },
        'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
        'gemini-2.5-pro': { input: 1.25, output: 10 },
        'gemini-flash-latest': { input: 0.3, output: 2.5 },
        'gemini-flash-lite-latest': { input: 0.1, output: 0.4 }
      },
      together: {
        'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free': { input: 0.0002, output: 0.0002 },
        'meta-llama/Llama-3.1-8B-Instruct': { input: 0.0002, output: 0.0002 },
        'togethercomputer/llama-3.1-8b-instruct': { input: 0.0002, output: 0.0002 },
        'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free': { input: 0.0, output: 0.0 }
      },
      cohere: {
        'command-r-plus-08-2024': { input: 2.5, output: 10.0 }
      },
      openrouter: {
        'qwen/qwen3-235b-a22b:free': { input: 0.0, output: 0.0 }
      },
      cerebras: {
        'qwen-3-235b-a22b-instruct-2507': { input: 0.0, output: 0.0 }
      },
      cloudflare: {
        '@cf/openai/gpt-oss-120b': { input: 0.0, output: 0.0 }
      },
      ollama: {
        'qwen3-coder:480b-cloud': { input: 0.0, output: 0.0 }
      },
      llm7: {
        'Qwen2.5-Coder-32B-Instruct': { input: 0.0, output: 0.0 }
      },
      llmgateway: {
        'llama-4-maverick-free': { input: 0.0, output: 0.0 }
      }
    };
  }

  async collectModelInformation() {
    try {
      // Wait for aiService to finish loading configs from DB
      if (!aiService.initialized) {
        logger.info('AI Director waiting for aiService to initialize...');
        let attempts = 0;
        while (!aiService.initialized && attempts < 20) {
          await new Promise(resolve => setTimeout(resolve, 250));
          attempts++;
        }
        if (!aiService.initialized) {
          // Force a reload as a last resort
          logger.warn('aiService not initialized after 5s, forcing config reload...');
          await aiService.loadConfigurations();
        }
      }

      logger.info('Starting AI Director collectModelInformation...');
      const providers = ['anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llm7', 'llmgateway'];
      const modelInfo = {};

      for (const provider of providers) {
        logger.info(`Processing provider: ${provider}`);

        // Check if provider has API key and is enabled
        const hasApiKey = !!aiService.providers[provider]?.apiKey;
        const isEnabled = aiService.providers[provider]?.enabled === true;

        logger.info(`${provider} - hasApiKey: ${hasApiKey}, isEnabled: ${isEnabled}`);

        // Only refresh from API if we have no models in database or if it's been more than 24 hours
        const existingModels = await aiService.getModels(provider);
        const shouldRefresh = existingModels.length === 0 || await this.shouldRefreshProvider(provider);

        if (hasApiKey && isEnabled && shouldRefresh) {
          try {
            logger.info(`Refreshing models for ${provider} from API...`);
            await aiService.refreshModels(provider);
          } catch (error) {
            logger.info({ err: error }, `Failed to refresh ${provider} models`);
          }
        } else {
          logger.info(`Using cached models for ${provider} (${existingModels.length} models found)`);
        }

        // Get models from database (now potentially updated)
        const models = await aiService.getModels(provider);
        logger.info(`${provider} - found ${models.length} models`);

        // Get pricing from database
        const pricingData = await AIPricing.find({
          provider,
          isActive: true
        });
        logger.info(`${provider} - found ${pricingData.length} pricing records`);

        const pricingMap = {};
        pricingData.forEach(pricing => {
          pricingMap[pricing.modelId] = {
            input: pricing.inputPrice,
            output: pricing.outputPrice
          };
        });

        // Update pricing for any new models that don't have pricing
        await this.updatePricingForNewModels();

        // Update capabilities for all models
        for (const model of models) {
          await aiModelCapabilitiesService.updateModelCapabilities(provider, model.id);
        }

        // Get free tier information
        const freeTierData = await AIFreeTier.find({ provider });
        logger.info(`${provider} - found ${freeTierData.length} free tier records`);

        const freeTierMap = {};
        freeTierData.forEach(freeTier => {
          freeTierMap[freeTier.modelId] = {
            isFree: freeTier.isFree,
            limits: freeTier.freeLimits,
            notes: freeTier.notes
          };
        });

        modelInfo[provider] = {
          models: models.map(model => {
            logger.debug(`Processing model: ${model.id} (${typeof model.id})`);
            const capabilities = model.capabilities || aiModelCapabilitiesService.inferCapabilities(model.id);
            return {
              id: model.id,
              name: model.name,
              pricing: pricingMap[model.id] || { input: 'Unknown', output: 'Unknown' },
              freeTier: freeTierMap[model.id] || { isFree: false, limits: {}, notes: '' },
              capabilities
            };
          }),
          totalModels: models.length,
          hasApiKey,
          isEnabled
        };
      }

      const result = {
        success: true,
        data: {
          providers: modelInfo,
          summary: {
            totalProviders: providers.length,
            totalModels: Object.values(modelInfo).reduce((sum, provider) => sum + provider.totalModels, 0),
            providersWithKeys: Object.values(modelInfo).filter(p => p.hasApiKey).length,
            enabledProviders: Object.values(modelInfo).filter(p => p.isEnabled).length
          }
        }
      };

      logger.info({
        success: result.success,
        dataKeys: Object.keys(result.data),
        providersCount: Object.keys(result.data.providers).length,
        summary: result.data.summary
      }, 'AI Director result structure');

      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to collect model information');
      return {
        success: false,
        error: {
          message: 'Failed to collect model information',
          details: error.message
        }
      };
    }
  }

  async seedInitialPricing() {
    try {
      const initialPricing = [
        // Anthropic models
        { provider: 'anthropic', modelId: 'claude-opus-4-1-20250805', inputPrice: 15, outputPrice: 75 },
        { provider: 'anthropic', modelId: 'claude-opus-4-20250514', inputPrice: 15, outputPrice: 75 },
        { provider: 'anthropic', modelId: 'claude-sonnet-4-20250514', inputPrice: 3, outputPrice: 15 },
        { provider: 'anthropic', modelId: 'claude-3-7-sonnet-20250219', inputPrice: 3, outputPrice: 15 },
        { provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022', inputPrice: 3, outputPrice: 15 },
        { provider: 'anthropic', modelId: 'claude-3-5-haiku-20241022', inputPrice: 0.8, outputPrice: 4 },
        { provider: 'anthropic', modelId: 'claude-3-haiku-20240307', inputPrice: 0.25, outputPrice: 1.25 },

        // Groq models
        { provider: 'groq', modelId: 'llama-3.1-8b-instant', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'llama-3.1-70b-versatile', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'llama-3.1-405b-reasoning', inputPrice: 0.002, outputPrice: 0.002 },
        { provider: 'groq', modelId: 'mixtral-8x7b-instant', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'gemma-2-9b-it', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'llama-3.3-70b-versatile', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'llama3-8b-8192', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'llama3-70b-8192', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'gemma2-9b-it', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'compound-beta', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'compound-beta-mini', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'meta-llama/llama-4-scout-17b-16e-instruct', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'meta-llama/llama-4-maverick-17b-128e-instruct', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'meta-llama/llama-guard-4-12b', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'meta-llama/llama-prompt-guard-2-22m', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'meta-llama/llama-prompt-guard-2-86m', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'qwen/qwen3-32b', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'moonshotai/kimi-k2-instruct', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'openai/gpt-oss-20b', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'openai/gpt-oss-120b', inputPrice: 0.002, outputPrice: 0.002 },
        { provider: 'groq', modelId: 'allam-2-7b', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'deepseek-r1-distill-llama-70b', inputPrice: 0.0007, outputPrice: 0.0007 },
        { provider: 'groq', modelId: 'whisper-large-v3', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'whisper-large-v3-turbo', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'distil-whisper-large-v3-en', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'playai-tts', inputPrice: 0.00027, outputPrice: 0.00027 },
        { provider: 'groq', modelId: 'playai-tts-arabic', inputPrice: 0.00027, outputPrice: 0.00027 },

        // Gemini models
        { provider: 'gemini', modelId: 'gemini-1.5-flash', inputPrice: 0.00035, outputPrice: 1.05 },
        { provider: 'gemini', modelId: 'gemini-1.5-pro', inputPrice: 3.5, outputPrice: 10.5 },
        { provider: 'gemini', modelId: 'gemini-pro', inputPrice: 0.5, outputPrice: 1.5 },
        { provider: 'gemini', modelId: 'gemini-2.0-flash', inputPrice: 0.1, outputPrice: 0.4 },
        { provider: 'gemini', modelId: 'gemini-2.0-flash-lite', inputPrice: 0.075, outputPrice: 0.3 },
        { provider: 'gemini', modelId: 'gemini-2.5-flash', inputPrice: 0.3, outputPrice: 2.5 },
        { provider: 'gemini', modelId: 'gemini-2.5-flash-lite', inputPrice: 0.1, outputPrice: 0.4 },
        { provider: 'gemini', modelId: 'gemini-2.5-pro', inputPrice: 1.25, outputPrice: 10 },
        // Stability aliases — priced as current GA flash so cost-based routing
        // and StoryGeek's pinned GM don't show 'Unknown'.
        { provider: 'gemini', modelId: 'gemini-flash-latest', inputPrice: 0.3, outputPrice: 2.5 },
        { provider: 'gemini', modelId: 'gemini-flash-lite-latest', inputPrice: 0.1, outputPrice: 0.4 },

        // Together.ai models
        { provider: 'together', modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free', inputPrice: 0.0002, outputPrice: 0.0002 },
        { provider: 'together', modelId: 'meta-llama/Llama-3.1-8B-Instruct', inputPrice: 0.0002, outputPrice: 0.0002 },
        { provider: 'together', modelId: 'togethercomputer/llama-3.1-8b-instruct', inputPrice: 0.0002, outputPrice: 0.0002 }
      ];

      for (const pricing of initialPricing) {
        await AIPricing.findOneAndUpdate(
          { provider: pricing.provider, modelId: pricing.modelId },
          {
            inputPrice: pricing.inputPrice,
            outputPrice: pricing.outputPrice,
            lastUpdated: new Date(),
            isActive: true
          },
          { upsert: true, new: true }
        );
      }

      logger.info('Initial AI pricing seeded successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to seed initial pricing');
    }
  }

    async updatePricingForNewModels() {
    try {
      // Get all models from database
      const allModels = await AIModel.find({ isActive: true });

      for (const model of allModels) {
        // Check if pricing exists for this model
        const existingPricing = await AIPricing.findOne({
          provider: model.provider,
          modelId: model.modelId
        });

        if (!existingPricing) {
          // Try to find pricing in our hardcoded data
          const hardcodedPricing = this.providerPricing[model.provider]?.[model.modelId];

          if (hardcodedPricing) {
            await AIPricing.create({
              provider: model.provider,
              modelId: model.modelId,
              inputPrice: hardcodedPricing.input,
              outputPrice: hardcodedPricing.output,
              isActive: true
            });
            logger.info(`Added pricing for ${model.provider}/${model.modelId}`);
          }
        }
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to update pricing for new models');
    }
  }

  async shouldRefreshProvider(provider) {
    try {
      // Check if we have any models for this provider
      const models = await aiService.getModels(provider);
      if (models.length === 0) {
        return true; // No models, definitely need to refresh
      }

      // Check the last refresh time (we'll use the oldest model's timestamp as a proxy)
      const oldestModel = await AIModel.findOne({ provider }).sort({ createdAt: 1 });
      if (!oldestModel) {
        return true; // No models found, need to refresh
      }

      // Refresh if it's been more than 24 hours
      const hoursSinceLastRefresh = (Date.now() - oldestModel.createdAt.getTime()) / (1000 * 60 * 60);
      const shouldRefresh = hoursSinceLastRefresh > 24;

      logger.info(`${provider} last refresh: ${hoursSinceLastRefresh.toFixed(1)} hours ago, should refresh: ${shouldRefresh}`);
      return shouldRefresh;
    } catch (error) {
      logger.error({ err: error }, `Error checking refresh status for ${provider}`);
      return true; // Default to refreshing if there's an error
    }
  }

  async seedFreeTierInformation() {
    try {
      logger.info('Seeding free tier information...');
      const freeTierData = [
        // Groq Free Tier - ALL models are free
        // UPDATED: Real-world testing shows ~30 req/min throttle (not 50)
        // Based on https://console.groq.com/docs/rate-limits + actual usage
        {
          provider: 'groq',
          modelId: 'allam-2-7b',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,  // Conservative: real limit triggers here
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Groq throttles aggressively at ~30 req/min'
        },
        {
          provider: 'groq',
          modelId: 'compound-beta',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Groq throttles aggressively at ~30 req/min'
        },
        {
          provider: 'groq',
          modelId: 'compound-beta-mini',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Groq throttles aggressively at ~30 req/min'
        },
        {
          provider: 'groq',
          modelId: 'deepseek-r1-distill-llama-70b',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Groq throttles aggressively at ~30 req/min'
        },
        {
          provider: 'groq',
          modelId: 'distil-whisper-large-v3-en',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000,
            audioSecondsPerHour: 7200,
            audioSecondsPerDay: 28800
          },
          notes: 'Free tier - Audio transcription'
        },
        {
          provider: 'groq',
          modelId: 'gemma2-9b-it',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Groq throttles aggressively at ~30 req/min'
        },
        {
          provider: 'groq',
          modelId: 'llama-3.1-8b-instant',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Fast 8B model'
        },
        {
          provider: 'groq',
          modelId: 'llama-3.3-70b-versatile',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - PRIMARY recommended model for CodeGeek'
        },
        {
          provider: 'groq',
          modelId: 'llama3-70b-8192',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Older 70B model'
        },
        {
          provider: 'groq',
          modelId: 'llama3-8b-8192',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Older 8B model'
        },
        {
          provider: 'groq',
          modelId: 'meta-llama/llama-4-maverick-17b-128e-instruct',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - New Llama 4 (128E MOE)'
        },
        {
          provider: 'groq',
          modelId: 'meta-llama/llama-4-scout-17b-16e-instruct',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - New Llama 4 (16E MOE)'
        },
        {
          provider: 'groq',
          modelId: 'meta-llama/llama-guard-4-12b',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Content moderation model'
        },
        {
          provider: 'groq',
          modelId: 'meta-llama/llama-prompt-guard-2-22m',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Prompt injection detection'
        },
        {
          provider: 'groq',
          modelId: 'meta-llama/llama-prompt-guard-2-86m',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Prompt injection detection'
        },
        {
          provider: 'groq',
          modelId: 'moonshotai/kimi-k2-instruct',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Good for long context tasks'
        },
        {
          provider: 'groq',
          modelId: 'openai/gpt-oss-120b',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Large 120B reasoning model'
        },
        {
          provider: 'groq',
          modelId: 'openai/gpt-oss-20b',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - 20B OpenAI-style model'
        },
        {
          provider: 'groq',
          modelId: 'playai-tts',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000,
            audioSecondsPerHour: 7200,
            audioSecondsPerDay: 28800
          },
          notes: 'Free tier - Text-to-speech generation'
        },
        {
          provider: 'groq',
          modelId: 'playai-tts-arabic',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000,
            audioSecondsPerHour: 7200,
            audioSecondsPerDay: 28800
          },
          notes: 'Free tier - Arabic text-to-speech'
        },
        {
          provider: 'groq',
          modelId: 'qwen/qwen3-32b',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000
          },
          notes: 'Free tier - Qwen3 32B model'
        },
        {
          provider: 'groq',
          modelId: 'whisper-large-v3',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000,
            audioSecondsPerHour: 7200,
            audioSecondsPerDay: 28800
          },
          notes: 'Free tier - BEST audio transcription for CodeGeek'
        },
        {
          provider: 'groq',
          modelId: 'whisper-large-v3-turbo',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 30,
            requestsPerDay: 14400,
            tokensPerMinute: 18000,
            tokensPerDay: 5184000,
            audioSecondsPerHour: 7200,
            audioSecondsPerDay: 28800
          },
          notes: 'Free tier - Faster audio transcription'
        },

        // Gemini Free Tier
        // UPDATED Aug 2026: 1.5-family is RETIRED upstream (404s) — flipped
        // to isFree:false so free-only routing never selects a dead model.
        // The live free entry is gemini-flash-latest, Google's stability
        // alias for the current GA flash — matches the curated production
        // records, so a seed re-run cannot corrupt them.
        {
          provider: 'gemini',
          modelId: 'gemini-1.5-flash',
          isFree: false,
          freeLimits: {},
          notes: 'RETIRED upstream — do not route here'
        },
        {
          provider: 'gemini',
          modelId: 'gemini-flash-latest',
          isFree: true,
          freeLimits: {},
          notes: 'Free tier - stability alias for current GA flash; StoryGeek pinned GM model'
        },
        {
          provider: 'gemini',
          modelId: 'gemini-flash-lite-latest',
          isFree: true,
          freeLimits: {},
          notes: 'Free tier - lite alias'
        },

        // Anthropic - No free tier available
        // Note: Anthropic doesn't offer free tiers, so we don't include them in free tier tracking

        // Together.ai Free Tier Models
        // UPDATED: Conservative estimates based on "Free" designation
        // Together claims "up to 60 RPM" but free models may have lower actual limits
        {
          provider: 'together',
          modelId: 'meta-llama/Llama-Vision-Free',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 60,
            requestsPerDay: 14400, // 60 RPM * 24 hours * 10 minutes (conservative)
            tokensPerMinute: 60000,
            tokensPerDay: 1000000   // Conservative daily limit
          },
          notes: 'Free tier - Vision model (60 RPM)'
        },
        {
          provider: 'together',
          modelId: 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B-free',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 60,
            requestsPerDay: 14400,
            tokensPerMinute: 60000,
            tokensPerDay: 1000000
          },
          notes: 'Free tier - BEST reasoning fallback for CodeGeek when Groq throttles'
        },
        {
          provider: 'together',
          modelId: 'lgai/exaone-deep-32b',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 60,
            requestsPerDay: 14400,
            tokensPerMinute: 60000,
            tokensPerDay: 1000000
          },
          notes: 'Free tier - EXAONE Deep 32B (60 RPM)'
        },
        {
          provider: 'together',
          modelId: 'lgai/exaone-3-5-32b-instruct',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 60,
            requestsPerDay: 14400,
            tokensPerMinute: 60000,
            tokensPerDay: 1000000
          },
          notes: 'Free tier - EXAONE 3.5 32B (60 RPM)'
        },
        {
          provider: 'together',
          modelId: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
          isFree: true,
          freeLimits: {
            requestsPerMinute: 60,
            requestsPerDay: 14400,
            tokensPerMinute: 60000,
            tokensPerDay: 1000000
          },
          notes: 'Free tier - Llama 3.3 70B (rotating availability, 60 RPM)'
        }
      ];

      for (const freeTier of freeTierData) {
        await AIFreeTier.findOneAndUpdate(
          { provider: freeTier.provider, modelId: freeTier.modelId },
          {
            isFree: freeTier.isFree,
            freeLimits: freeTier.freeLimits,
            notes: freeTier.notes
          },
          { upsert: true, new: true }
        );
      }

      logger.info('Free tier information seeded successfully');
      logger.info(`Seeded ${freeTierData.length} free tier records`);
    } catch (error) {
      logger.error({ err: error }, 'Failed to seed free tier information');
    }
  }

  async getCostAnalysis(prompt, expectedResponseLength = 1000) {
    try {
      const modelInfo = await this.collectModelInformation();
      if (!modelInfo.success) {
        return modelInfo;
      }

      const analysis = {};
      const providers = modelInfo.data.providers;

      for (const [providerName, provider] of Object.entries(providers)) {
        if (!provider.hasApiKey || !provider.isEnabled) continue;

        analysis[providerName] = {
          models: provider.models.map(model => {
            const inputTokens = Math.ceil(prompt.length / 4); // Rough estimate
            const outputTokens = expectedResponseLength;

            const inputCost = costForTokens(inputTokens, model.pricing.input);
            const outputCost = costForTokens(outputTokens, model.pricing.output);
            const totalCost = inputCost + outputCost;

            return {
              id: model.id,
              name: model.name,
              estimatedCost: totalCost,
              inputTokens,
              outputTokens,
              pricing: model.pricing
            };
          }).sort((a, b) => a.estimatedCost - b.estimatedCost) // Sort by cost
        };
      }

      return {
        success: true,
        data: {
          analysis,
          promptLength: prompt.length,
          expectedResponseLength
        }
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to analyze costs');
      return {
        success: false,
        error: {
          message: 'Failed to analyze costs',
          details: error.message
        }
      };
    }
  }

  /**
   * recommendProvider — rank the reachable providers for a task description.
   *
   * Two call shapes, both supported for good:
   *
   *   recommendProvider(task, budget, priority, requirements)          // positional
   *   recommendProvider(task, { budget, priority, requirements, freeOnly, limit })
   *
   * StoryGeek's epub pipeline calls the positional form over REST
   * (`POST /api/ai/director/recommend`, apps/storygeek/backend/src/services/
   * aiService.js), so the second argument keeps its old meaning unless it is a
   * plain object — a number, null or undefined is still `budget`.
   *
   * `freeOnly` narrows the candidates to models whose AIFreeTier record says
   * `isFree`, on providers that are both enabled and hold a key. That is the
   * question the model steward surface asks: *which free model fits this?*
   * Free is the free-tier record, never a guess from a $0.00 price — a zero
   * price on a paid account is still a paid account.
   *
   * `limit` caps the returned list (the App Routing dialog shows three); null
   * or absent returns every provider that qualified.
   *
   * The returned entry shape is unchanged — `{ provider, model, reasoning,
   * capabilities }` — with `score` and `isFree` added alongside. StoryGeek
   * reads `recommendations[0].provider` and `.model.id`; both still land.
   */
  async recommendProvider(task, budgetOrOptions = null, priority = 'cost', requirements = {}) {
    try {
      const usedOptions = budgetOrOptions !== null
        && typeof budgetOrOptions === 'object'
        && !Array.isArray(budgetOrOptions);
      const options = usedOptions ? budgetOrOptions : {};

      const budget = usedOptions ? (options.budget ?? null) : budgetOrOptions;
      const effectivePriority = (usedOptions ? options.priority : priority) || 'cost';
      const rawRequirements = (usedOptions ? options.requirements : requirements) || {};
      const freeOnly = options.freeOnly === true;
      const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : null;

      const modelInfo = await this.collectModelInformation();
      if (!modelInfo.success) {
        return modelInfo;
      }

      const recommendations = [];
      const providers = modelInfo.data.providers;

      // Parse task requirements
      const taskRequirements = this.parseTaskRequirements(task, rawRequirements);

      for (const [providerName, provider] of Object.entries(providers)) {
        if (!provider.hasApiKey || !provider.isEnabled) continue;

        // Filter models based on requirements
        const suitableModels = provider.models.filter(model => {
          // freeOnly is decided from the free-tier record, which exists
          // independently of capability data — so it is checked before the
          // "no capabilities, include it" escape hatch below.
          if (freeOnly && !model.freeTier?.isFree) return false;

          if (!model.capabilities) return true; // Include if no capabilities data

          // Check vision requirement
          if (taskRequirements.needsVision && !model.capabilities.supportsVision) {
            return false;
          }

          // Check audio requirement
          if (taskRequirements.needsAudio && !model.capabilities.supportsAudio) {
            return false;
          }

          // Check function calling requirement
          if (taskRequirements.needsFunctionCalling && !model.capabilities.supportsFunctionCalling) {
            return false;
          }

          // Check structured-output requirement. Parsed since the beginning,
          // never enforced until the steward surface needed it: StartGeek Ask
          // asks for a JSON search plan and a model that cannot return one is
          // not a candidate.
          if (taskRequirements.needsJSONOutput && !model.capabilities.supportsJSONOutput) {
            return false;
          }

          // Check reasoning requirement
          if (taskRequirements.needsReasoning && model.capabilities.performance?.reasoning === 'basic') {
            return false;
          }

          // Check code generation requirement
          if (taskRequirements.needsCodeGeneration && !model.capabilities.tasks?.codeGeneration) {
            return false;
          }

          return true;
        });

        if (suitableModels.length === 0) continue;

        // Get the best model for this provider based on priority and requirements
        const bestModel = suitableModels.reduce((best, current) => {
          if (effectivePriority === 'cost') {
            const costA = (current.pricing.input || 0) + (current.pricing.output || 0);
            const costB = (best.pricing.input || 0) + (best.pricing.output || 0);
            return costA < costB ? current : best;
          } else if (effectivePriority === 'speed') {
            const speedA = SPEED_ORDER[current.capabilities?.performance?.speed || 'medium'];
            const speedB = SPEED_ORDER[best.capabilities?.performance?.speed || 'medium'];
            return speedA < speedB ? current : best;
          } else if (effectivePriority === 'quality') {
            const qualityA = QUALITY_ORDER[current.capabilities?.performance?.quality || 'good'];
            const qualityB = QUALITY_ORDER[best.capabilities?.performance?.quality || 'good'];
            return qualityA < qualityB ? current : best;
          }
          return best;
        });

        const reasoning = this.generateReasoning(bestModel, taskRequirements, effectivePriority);

        recommendations.push({
          provider: providerName,
          model: bestModel,
          reasoning,
          capabilities: bestModel.capabilities,
          isFree: Boolean(bestModel.freeTier?.isFree),
          score: this.capabilityFitScore(bestModel, taskRequirements)
        });
      }

      // Sort by priority — unchanged — then break ties on capability fit, so
      // two equally free (or equally fast) models order by how well they
      // actually answer the task.
      recommendations.sort((a, b) => {
        if (effectivePriority === 'cost') {
          const costA = (a.model.pricing.input || 0) + (a.model.pricing.output || 0);
          const costB = (b.model.pricing.input || 0) + (b.model.pricing.output || 0);
          if (costA !== costB) return costA - costB;
        } else if (effectivePriority === 'speed') {
          const speedA = SPEED_ORDER[a.model.capabilities?.performance?.speed || 'medium'];
          const speedB = SPEED_ORDER[b.model.capabilities?.performance?.speed || 'medium'];
          if (speedA !== speedB) return speedA - speedB;
        } else if (effectivePriority === 'quality') {
          const qualityA = QUALITY_ORDER[a.model.capabilities?.performance?.quality || 'good'];
          const qualityB = QUALITY_ORDER[b.model.capabilities?.performance?.quality || 'good'];
          if (qualityA !== qualityB) return qualityA - qualityB;
        }
        return b.score - a.score;
      });

      return {
        success: true,
        data: {
          recommendations: limit ? recommendations.slice(0, limit) : recommendations,
          task,
          budget,
          priority: effectivePriority,
          freeOnly,
          requirements: taskRequirements
        }
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to recommend provider');
      return {
        success: false,
        error: {
          message: 'Failed to recommend provider',
          details: error.message
        }
      };
    }
  }

  /**
   * listFreeModels — every model the suite can call for nothing, right now,
   * with the properties needed to choose between them by hand.
   *
   * Two filters, both deliberate:
   *   - the AIFreeTier record says `isFree` (not a $0.00 price);
   *   - the provider is enabled *and* holds a key, because a free model on a
   *     provider aiGeek cannot reach is not an option, it is a tease.
   *
   * `lastSeen` is AIModel.lastChecked — when the catalog last confirmed the id
   * exists upstream. `updatedAt` is the newer of the model row's and the
   * free-tier row's, i.e. when what we believe about this model last changed.
   * Both are null when the catalog has no row; the shape does not vary.
   */
  async listFreeModels() {
    try {
      const modelInfo = await this.collectModelInformation();
      if (!modelInfo.success) {
        return modelInfo;
      }

      const meta = await this.catalogTimestamps();
      const models = [];

      for (const [providerName, provider] of Object.entries(modelInfo.data.providers || {})) {
        if (!provider.hasApiKey || !provider.isEnabled) continue;

        for (const model of provider.models || []) {
          if (!model.freeTier?.isFree) continue;
          models.push(this.describeModel(providerName, model, meta[`${providerName}::${model.id}`]));
        }
      }

      models.sort((a, b) =>
        a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name));

      return {
        success: true,
        data: {
          models,
          count: models.length,
          providers: [...new Set(models.map(m => m.provider))]
        }
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to list free models');
      return {
        success: false,
        error: {
          message: 'Failed to list free models',
          details: error.message
        }
      };
    }
  }

  /**
   * catalogTimestamps — `provider::modelId` → { lastSeen, updatedAt } from the
   * AIModel / AIFreeTier rows. A catalog read failure degrades to no
   * timestamps rather than failing the whole listing: the properties are the
   * answer, the freshness stamps are the footnote.
   */
  async catalogTimestamps() {
    const meta = {};
    try {
      const [modelRows, freeTierRows] = await Promise.all([
        AIModel.find({ isActive: true }).select('provider modelId lastChecked updatedAt').lean(),
        AIFreeTier.find({}).select('provider modelId updatedAt').lean()
      ]);

      for (const row of modelRows) {
        meta[`${row.provider}::${row.modelId}`] = {
          lastSeen: row.lastChecked || null,
          updatedAt: row.updatedAt || null
        };
      }
      for (const row of freeTierRows) {
        const key = `${row.provider}::${row.modelId}`;
        const entry = meta[key] || (meta[key] = { lastSeen: null, updatedAt: null });
        if (row.updatedAt && (!entry.updatedAt || row.updatedAt > entry.updatedAt)) {
          entry.updatedAt = row.updatedAt;
        }
      }
    } catch (error) {
      logger.warn({ err: error }, 'Could not read catalog timestamps for free model listing');
    }
    return meta;
  }

  /**
   * describeModel — one `collectModelInformation` model, flattened into the
   * record both the free-model listing and the GraphQL recommendation return.
   *
   * Everything is normalized to a scalar or null: `pricing` arrives as the
   * string 'Unknown' when no AIPricing row exists, which a Float field cannot
   * carry, and absent capability data must read as false rather than
   * undefined so a client can trust `supportsJSONOutput === false`.
   */
  describeModel(provider, model, meta = {}) {
    const caps = model.capabilities || {};
    const limits = model.freeTier?.limits || {};
    const pricing = model.pricing || {};
    const num = (value) => (typeof value === 'number' ? value : null);

    return {
      provider,
      modelId: model.id,
      name: model.name || model.id,
      contextWindow: num(caps.contextWindow),
      maxTokens: num(caps.maxTokens),
      supportsFunctionCalling: Boolean(caps.supportsFunctionCalling),
      supportsToolCalling: Boolean(caps.supportsToolCalling ?? caps.supportsFunctionCalling),
      supportsJSONOutput: Boolean(caps.supportsJSONOutput),
      supportsJSONMode: Boolean(caps.supportsJSONMode),
      supportsJSONSchema: Boolean(caps.supportsJSONSchema),
      supportsVision: Boolean(caps.supportsVision),
      supportsAudio: Boolean(caps.supportsAudio),
      isFree: Boolean(model.freeTier?.isFree),
      performance: {
        speed: caps.performance?.speed || null,
        quality: caps.performance?.quality || null,
        reasoning: caps.performance?.reasoning || null
      },
      freeLimits: {
        requestsPerMinute: num(limits.requestsPerMinute),
        requestsPerDay: num(limits.requestsPerDay),
        tokensPerMinute: num(limits.tokensPerMinute),
        tokensPerDay: num(limits.tokensPerDay)
      },
      pricing: { input: num(pricing.input), output: num(pricing.output) },
      notes: model.freeTier?.notes || '',
      lastSeen: meta?.lastSeen || null,
      updatedAt: meta?.updatedAt || null
    };
  }

  /**
   * capabilityFitScore — 0-100, how well a model's advertised capabilities
   * answer the parsed requirements.
   *
   * It does *not* set the ordering: the priority comparator (cost / speed /
   * quality) still does, exactly as it did before, and this only breaks ties
   * inside it. Shown in the App Routing dialog as "fit" so a human can see why
   * two free models are not interchangeable.
   *
   * With no specific requirement parsed out of the task, there is nothing to
   * cover, so the score falls back to the model's general quality tier — the
   * number stays meaningful on a bare "summarize this text".
   */
  capabilityFitScore(model, requirements = {}) {
    const caps = model.capabilities || {};
    const qualityPoints = QUALITY_POINTS[caps.performance?.quality] ?? 70;

    const asked = [
      [requirements.needsVision, caps.supportsVision],
      [requirements.needsAudio, caps.supportsAudio],
      [requirements.needsFunctionCalling, caps.supportsFunctionCalling],
      [requirements.needsJSONOutput, caps.supportsJSONOutput],
      [requirements.needsCodeGeneration, caps.tasks?.codeGeneration],
      [requirements.needsReasoning, caps.performance?.reasoning !== 'basic']
    ].filter(([needed]) => needed);

    if (asked.length === 0) return qualityPoints;

    const met = asked.filter(([, supported]) => Boolean(supported)).length;
    return Math.round((met / asked.length) * 70 + (qualityPoints / 100) * 30);
  }

  /**
   * parseTaskRequirements — sniff a plain-English task description for the
   * capabilities it implies. An explicit `requirements` field always wins; the
   * keywords only fill the gaps, so a caller that knows what it needs is never
   * second-guessed.
   *
   * Keywords, matched as case-insensitive substrings of the description:
   *
   *   needsVision           image, vision, photo, screenshot, ocr
   *   needsAudio            audio, speech, whisper, transcri(be|ption)
   *   needsFunctionCalling  function, tool
   *   needsReasoning        reason, logic, solve
   *   needsCodeGeneration   code, program, script
   *   needsJSONOutput       json, structured, schema, search plan
   *
   * "search plan" is there for StartGeek Ask, whose whole job is turning a
   * query into a JSON plan — the phrase has to imply structured output or the
   * steward recommends a model that cannot answer it.
   */
  parseTaskRequirements(task, requirements = {}) {
    const taskLower = String(task || '').toLowerCase();
    const mentions = (...words) => words.some(word => taskLower.includes(word));

    return {
      needsVision: requirements.needsVision || mentions('image', 'vision', 'photo', 'screenshot', 'ocr'),
      needsAudio: requirements.needsAudio || mentions('audio', 'speech', 'whisper', 'transcri'),
      needsFunctionCalling: requirements.needsFunctionCalling || mentions('function', 'tool'),
      needsReasoning: requirements.needsReasoning || mentions('reason', 'logic', 'solve'),
      needsCodeGeneration: requirements.needsCodeGeneration || mentions('code', 'program', 'script'),
      needsJSONOutput: requirements.needsJSONOutput || mentions('json', 'structured', 'schema', 'search plan'),
      maxTokens: requirements.maxTokens || 4096
    };
  }

  generateReasoning(model, requirements, priority) {
    const reasons = [];
    const caps = model.capabilities || {};

    if (model.freeTier?.isFree) {
      reasons.push('Free tier available');
    }

    if (requirements.needsVision && caps.supportsVision) {
      reasons.push('Supports vision tasks');
    }

    if (requirements.needsAudio && caps.supportsAudio) {
      reasons.push('Handles audio input');
    }

    if (requirements.needsFunctionCalling && caps.supportsFunctionCalling) {
      reasons.push('Native function calling');
    }

    if (requirements.needsJSONOutput && caps.supportsJSONOutput) {
      reasons.push('Returns structured JSON');
    }

    if (requirements.needsCodeGeneration && caps.tasks?.codeGeneration) {
      reasons.push('Good at code generation');
    }

    if (requirements.needsReasoning && caps.performance?.reasoning !== 'basic') {
      reasons.push('Good reasoning capabilities');
    }

    if (priority === 'speed' && caps.performance?.speed === 'ultra-fast') {
      reasons.push('Ultra-fast inference');
    }

    if (priority === 'quality' && caps.performance?.quality === 'state-of-the-art') {
      reasons.push('State-of-the-art quality');
    }

    if (priority === 'cost' && model.freeTier?.isFree) {
      reasons.push('Cost-effective (free tier)');
    }

    if (typeof caps.contextWindow === 'number' && caps.contextWindow >= 128000) {
      reasons.push(`${Math.round(caps.contextWindow / 1000)}k context window`);
    }

    return reasons.join(', ') || `Best ${priority} option`;
  }
}

export default new AIDirectorService();
