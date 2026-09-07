import aiService from './aiService.js';
import AIModel from '../models/AIModel.js';
import AIPricing from '../models/AIPricing.js';
import AIFreeTier from '../models/AIFreeTier.js';
import aiModelCapabilitiesService from './aiModelCapabilitiesService.js';
import { PROVIDER_IDS } from '../config/aiProviders.js';
import logger from '../lib/logger.js';

/**
 * Pricing in the AIPricing collection is stored per *million* tokens — the
 * unit every provider quotes and the unit the seed data uses (gemini-2.5-pro at
 * 1.25/10, groq llama-3.3-70b at 0.7/0.7). Cost math divides by this, never by
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
  /**
   * A pricing figure as a number, for ordering purposes.
   *
   * `collectModelInformation` sets `pricing` to `{input:'Unknown',
   * output:'Unknown'}` for any model with no AIPricing row — which is most of
   * the catalog. `('Unknown' || 0)` evaluates to the string `'Unknown'`, so the
   * cheapest-model reduce was concatenating (`'UnknownUnknown'`) and comparing
   * strings, and the sort's `costA - costB` was `NaN` — i.e. the default
   * `priority: 'cost'` ordering was arbitrary, and that is exactly the call
   * StoryGeek's epub pipeline makes before reading `recommendations[0]`.
   * An unpriced model now sorts LAST, not free.
   */
  static numericPrice(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : Infinity;
  }

  /** Input + output price of one model, for cost ordering. */
  static totalPriceOf(model) {
    const input = AIDirectorService.numericPrice(model?.pricing?.input);
    const output = AIDirectorService.numericPrice(model?.pricing?.output);
    if (input === Infinity || output === Infinity) return Infinity;
    return input + output;
  }

  /**
   * collectModelInformation — the catalog as the database has it.
   *
   * Until 2026-09-07 this method fanned out a live `models` call to every
   * enabled vendor whose catalog was more than 24 h old, on every director
   * read: `/director/models`, `/director/free-models`, `/director/recommend`,
   * `/director/analyze-cost`, their GraphQL twins and StoryGeek's epub
   * pipeline all spent provider quota to answer a question Mongo already knew.
   * It also ran one `updateModelCapabilities` upsert per model per call, and
   * seeded prices out of a hand-typed table, mid-read.
   *
   * Phase 1 makes it a read: `AIModel` (active) + `AIPricing` + `AIFreeTier`,
   * three indexed queries per provider and nothing written. The catalog job
   * (DOCS/AIGEEK_CATALOG_JOB.md) is what keeps those rows current now.
   *
   * `{ refresh: true }` is the one door back to the old behaviour — a vendor
   * listing call for each keyed, enabled provider whose rows are stale. Only
   * an admin path may pass it; the ordinary reads never do.
   */
  async collectModelInformation(options = {}) {
    const refresh = options?.refresh === true;
    try {
      // aiService owns the provider keys, and hasApiKey/isEnabled below are
      // read off it — so a director read that lands during boot has to wait for
      // them or it reports a catalog nobody can reach.
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

      // config/aiProviders.js is the one roster. This used to be a copy of it
      // typed out here, which is how `llm7` stayed in the walk for three months
      // after the provider was retired everywhere else.
      const modelInfo = {};

      for (const provider of PROVIDER_IDS) {
        const hasApiKey = !!aiService.providers[provider]?.apiKey;
        const isEnabled = aiService.providers[provider]?.enabled === true;

        if (refresh && hasApiKey && isEnabled) {
          try {
            if (await this.shouldRefreshProvider(provider)) {
              logger.info(`Refreshing models for ${provider} from API...`);
              await aiService.refreshModels(provider);
            }
          } catch (error) {
            logger.warn({ err: error }, `Failed to refresh ${provider} models`);
          }
        }

        const [modelRows, pricingRows, freeTierRows] = await Promise.all([
          AIModel.find({ provider, isActive: true }).sort({ name: 1 }).lean(),
          AIPricing.find({ provider, isActive: true }).lean(),
          AIFreeTier.find({ provider }).lean()
        ]);

        const pricingMap = {};
        for (const pricing of pricingRows) {
          pricingMap[pricing.modelId] = {
            input: pricing.inputPrice,
            output: pricing.outputPrice
          };
        }

        const freeTierMap = {};
        for (const freeTier of freeTierRows) {
          freeTierMap[freeTier.modelId] = {
            isFree: freeTier.isFree,
            limits: freeTier.freeLimits,
            notes: freeTier.notes
          };
        }

        modelInfo[provider] = {
          models: modelRows.map(row => ({
            id: row.modelId,
            name: row.name,
            // 'Unknown' rather than 0 for a model with no AIPricing row: a
            // missing price is not a free one, and numericPrice sorts it last.
            pricing: pricingMap[row.modelId] || { input: 'Unknown', output: 'Unknown' },
            freeTier: freeTierMap[row.modelId] || { isFree: false, limits: {}, notes: '' },
            // What the row was observed to do, with our adapter facts layered
            // on; inference fills in for a row the job has not reached yet.
            capabilities: aiModelCapabilitiesService.getCapabilities(
              provider, row.modelId, row.capabilities
            )
          })),
          totalModels: modelRows.length,
          hasApiKey,
          isEnabled
        };
      }

      const result = {
        success: true,
        data: {
          providers: modelInfo,
          summary: {
            totalProviders: PROVIDER_IDS.length,
            totalModels: Object.values(modelInfo).reduce((sum, provider) => sum + provider.totalModels, 0),
            providersWithKeys: Object.values(modelInfo).filter(p => p.hasApiKey).length,
            enabledProviders: Object.values(modelInfo).filter(p => p.isEnabled).length
          }
        }
      };

      logger.debug({ refresh, summary: result.data.summary }, 'AI Director catalog read');

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

  async shouldRefreshProvider(provider) {
    try {
      // Check if we have any models for this provider
      const models = await aiService.getModels(provider);
      if (models.length === 0) {
        return true; // No models, definitely need to refresh
      }

      // When did the catalog last CONFIRM this provider's models?
      //
      // This used to read the oldest row's `createdAt`, which `refreshModels`
      // never touches — it upserts `lastChecked`. So two days after seeding the
      // 24h guard was permanently true, and every `/director/models`,
      // `/director/free-models`, `/director/recommend` and
      // `/director/analyze-cost` (plus their GraphQL twins and StoryGeek's
      // epub pipeline) fanned out a live vendor `models` call per enabled
      // provider — spending provider quota on a read. `lastChecked` is the
      // field the refresh actually writes, so the guard now measures the thing
      // it was always meant to.
      const freshestModel = await AIModel.findOne({ provider })
        .sort({ lastChecked: -1 })
        .select('lastChecked createdAt');
      if (!freshestModel) {
        return true; // No models found, need to refresh
      }

      // Refresh if it's been more than 24 hours
      const lastRefreshAt = freshestModel.lastChecked || freshestModel.createdAt;
      if (!lastRefreshAt) return true;
      const hoursSinceLastRefresh = (Date.now() - lastRefreshAt.getTime()) / (1000 * 60 * 60);
      const shouldRefresh = hoursSinceLastRefresh > 24;

      logger.info(`${provider} last refresh: ${hoursSinceLastRefresh.toFixed(1)} hours ago, should refresh: ${shouldRefresh}`);
      return shouldRefresh;
    } catch (error) {
      logger.error({ err: error }, `Error checking refresh status for ${provider}`);
      return true; // Default to refreshing if there's an error
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
            const costA = AIDirectorService.totalPriceOf(current);
            const costB = AIDirectorService.totalPriceOf(best);
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
          const costA = AIDirectorService.totalPriceOf(a.model);
          const costB = AIDirectorService.totalPriceOf(b.model);
          // Infinity - Infinity is NaN, which makes a comparator return
          // "equal" for every unpriced pair rather than shuffling them.
          if (costA !== costB) return costA === Infinity ? 1 : costB === Infinity ? -1 : costA - costB;
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
