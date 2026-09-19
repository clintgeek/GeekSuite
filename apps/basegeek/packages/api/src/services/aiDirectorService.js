import aiService from './aiService.js';
import AIModel from '../models/AIModel.js';
import AIPricing from '../models/AIPricing.js';
import AIFreeTier, { weightClassOf } from '../models/AIFreeTier.js';
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
 * The orderings the recommender sorts by (priority: 'speed' / 'quality'), and
 * the tie-break `capabilityFitScore` computes underneath them.
 *
 * Until 2026-09-19 all three read `capabilities.performance.*` —
 * string-matched off the model id (`aiModelCapabilitiesService.js`: "70b" or
 * "405b" -> excellent, "8b" -> ultra-fast). `DOCS/AIGEEK_CAPABILITY_ROUTING.md`
 * §2 calls that "demonstrably wrong in both directions", and the live `need:`
 * routing path (`aiNeedResolver.js`) deliberately never reads it — it moved
 * onto three measured/vendor-stated facts on 2026-09-16: `fitness` (a probe
 * extracted JSON from this row, or it did not), `latency.p50Ms` (timed over
 * five runs) and golden-set `quality.score` (six questions with known
 * answers, scored by code, `aiGoldenSet.js`). This file's admin-facing
 * "Suggest a model" tool (`ModelStewardBlock.jsx`) was the one caller that
 * had not moved — fixed here, review §1.4. A numeric "fit 87" chip built on a
 * name guess is worse than no ranking at all, because it *looks*
 * authoritative.
 *
 * Both tables below mirror a rule `aiNeedResolver.js` already worked out and
 * documents at length: an unmeasured row must not be scored as a *bad* row,
 * or a newly discovered model could never be picked for that priority, and
 * therefore could never be measured. So `unknown` (never timed) sits mid-
 * table for speed, between `fast` and `deep`, and an unscored quality
 * (`QUALITY_UNMEASURED_FRACTION` below) sits mid-scale rather than at zero —
 * the same placement `aiNeedResolver.js`'s `WEIGHT_POINTS.unknown` and
 * `QUALITY_UNMEASURED` give the identical situation.
 */
const SPEED_BAND_ORDER = { fast: 0, balanced: 1, unknown: 2, deep: 3 };

/**
 * Where an unscored row sits on the golden set's 0-1 scale — between
 * measured-good and measured-bad, not at either end. See the block comment
 * above for why.
 */
const QUALITY_UNMEASURED_FRACTION = 0.5;

class AIDirectorService {
  /**
   * A pricing figure as a number, for ordering purposes.
   *
   * `collectModelInformation` sets `pricing` to `{input:'Unknown',
   * output:'Unknown'}` for any model with no AIPricing row — which is most of
   * the catalog. `('Unknown' || 0)` evaluates to the string `'Unknown'`, so the
   * cheapest-model reduce was concatenating (`'UnknownUnknown'`) and comparing
   * strings, and the sort's `costA - costB` was `NaN` — i.e. the default
   * `priority: 'cost'` ordering was arbitrary, and `recommendProvider` reads
   * `recommendations[0]` straight off that ordering.
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
   * A model's measured speed band, for `priority: 'speed'` ordering. See the
   * `SPEED_BAND_ORDER` comment for why this replaced
   * `capabilities.performance.speed` and why `unknown` (never timed) sits
   * mid-table rather than last.
   */
  static speedBandRank(model) {
    const band = weightClassOf(model?.freeTier?.latency?.p50Ms);
    return SPEED_BAND_ORDER[band ?? 'unknown'];
  }

  /**
   * A model's golden-set quality, 0-1, for `priority: 'quality'` ordering and
   * for `capabilityFitScore`. `QUALITY_UNMEASURED_FRACTION` — not zero — for
   * a row the golden set has never asked, so it is not permanently outranked
   * by a measured-but-mediocre one.
   */
  static measuredQualityOf(model) {
    const score = model?.freeTier?.quality?.score;
    return typeof score === 'number' ? score : QUALITY_UNMEASURED_FRACTION;
  }

  /**
   * Whether this row carries *any* measured signal at all — fitness ever
   * probed, latency ever timed, or a golden-set score. Used to tell "ranked
   * on a real but middling signal" from "nothing has ever been measured",
   * because those are different facts and the Suggest UI should not present
   * the second one as a confident number (review §1.4).
   */
  static hasMeasuredSignal(model) {
    const freeTier = model?.freeTier || {};
    return freeTier.fitness === 'structured' || freeTier.fitness === 'basic'
      || typeof freeTier.latency?.p50Ms === 'number'
      || typeof freeTier.quality?.score === 'number';
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
          // The whole row, not just the flag: the status page's catalog shows
          // fitness, cooling and the live quota reading off this, and the
          // override drawer reads `override` to render its switches.
          //
          // `acceptsImageInput`, `latency` and `quality` joined this literal
          // 2026-09-19 (review §3.4). They are the three measured/vendor-
          // stated facts added specifically to replace
          // `capabilities.performance.*`/`tasks.*` as a routing signal
          // (§1.4, `aiNeedResolver.js`), and until now this was the one place
          // in the whole request path that read the AIFreeTier row and threw
          // them away — so the director view, the one page whose job is to
          // prevent a bad model choice, could not show which rows accept an
          // image, how fast a row actually answers, or how it scored on the
          // golden set. `candidateProjection` (aiService.js, a different
          // caller reading the same collection for live routing) already
          // carried all three; this was the gap, not that one.
          freeTierMap[freeTier.modelId] = {
            isFree: freeTier.isFree,
            limits: freeTier.freeLimits,
            notes: freeTier.notes,
            fitness: freeTier.fitness ?? null,
            probedAt: freeTier.probedAt ?? null,
            observed: freeTier.observed ?? null,
            health: freeTier.health ?? null,
            override: freeTier.override ?? null,
            acceptsImageInput: freeTier.acceptsImageInput ?? null,
            latency: freeTier.latency ?? null,
            quality: freeTier.quality ?? null
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
      // `/director/analyze-cost` (plus their GraphQL twins) fanned out a live
      // vendor `models` call per enabled provider — spending provider quota on
      // a read. `lastChecked` is the field the refresh actually writes, so the
      // guard now measures the thing it was always meant to.
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
   * The positional form was kept for StoryGeek's epub pipeline, which called
   * it over REST (`POST /api/ai/director/recommend`). That integration was
   * removed in Phase 2 of DOCS/AIGEEK_ELEVATION_PLAN.md — StoryGeek's own
   * `services/aiService.js` documents the cutover, and its
   * `recommendProviderModel` is gone. The only live callers today are
   * basegeek's own console (`ModelStewardBlock.jsx` → `useAIGeek.js`'s
   * `aiRecommendModel` GraphQL query, and `AliveModelPicker.jsx`), and all of
   * them use the options-object form. The second argument still keeps its old
   * positional meaning unless it is a plain object — a number, null or
   * undefined is still `budget` — because nothing has yet had reason to drop
   * that compatibility; see aiModelSteward.test.js for the regression coverage
   * that pins it.
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
   * The returned entry shape is `{ provider, model, reasoning, capabilities,
   * score, isFree }`. The console reads `recommendations[0].provider` and
   * `.model.id`.
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
            // Measured latency band, not the guessed `performance.speed`
            // tier — see the `SPEED_BAND_ORDER` comment (review §1.4).
            const speedA = AIDirectorService.speedBandRank(current);
            const speedB = AIDirectorService.speedBandRank(best);
            return speedA < speedB ? current : best;
          } else if (effectivePriority === 'quality') {
            // Golden-set score, not the guessed `performance.quality` tier.
            // Higher is better, unlike the speed/cost bands above.
            const qualityA = AIDirectorService.measuredQualityOf(current);
            const qualityB = AIDirectorService.measuredQualityOf(best);
            return qualityA > qualityB ? current : best;
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
          score: this.capabilityFitScore(bestModel)
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
          const speedA = AIDirectorService.speedBandRank(a.model);
          const speedB = AIDirectorService.speedBandRank(b.model);
          if (speedA !== speedB) return speedA - speedB;
        } else if (effectivePriority === 'quality') {
          const qualityA = AIDirectorService.measuredQualityOf(a.model);
          const qualityB = AIDirectorService.measuredQualityOf(b.model);
          if (qualityA !== qualityB) return qualityB - qualityA; // higher score first
        }
        // `score` can be `null` (§1.4 — a row with no measured signal at
        // all); `null` coerces to 0 in subtraction, which sinks it below
        // every row that has a real number here without throwing NaN at
        // the comparator.
        return (b.score ?? 0) - (a.score ?? 0);
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
   * capabilityFitScore — 0-100, how well a model's *measured* track record
   * supports being suggested at all. Shown in the Suggest control
   * (`ModelStewardBlock.jsx`) as a "fit N" chip.
   *
   * It does *not* set the ordering: the priority comparator (cost / speed /
   * quality, above in `recommendProvider`) still does, exactly as it did
   * before, and this only breaks ties inside it.
   *
   * Until 2026-09-19 this scored `capabilities.performance.quality` — a
   * name-guessed tier — optionally blended with whether the model's
   * `capabilities.tasks`/`performance` flags matched the task's parsed
   * requirements. Both are exactly the signal `DOCS/AIGEEK_CAPABILITY_
   * ROUTING.md` §2 calls "demonstrably wrong in both directions", and — a
   * separate problem, found while fixing this — every one of those parsed
   * requirements was *already* a hard filter in `recommendProvider`'s
   * `suitableModels.filter` above, so by the time a model reaches this
   * function every requirement that was asked for is already guaranteed
   * true. The met/asked ratio the old code computed from them was
   * therefore always 1, contributing nothing; it existed only to smuggle in
   * a second read of the same disowned fields. Removed rather than kept as
   * dead weight, per review §1.4.
   *
   * Ranked instead on the same three measured/vendor-stated facts
   * `aiNeedResolver.js` ranks the live `need:` path on: `fitness` (a probe
   * extracted JSON from this row, or it did not), `latency.p50Ms` (timed,
   * via `weightClassOf`) and golden-set `quality.score` (six questions with
   * known answers, scored by code). Quality is weighted heaviest (60%) for
   * the same reason `aiNeedResolver.js` weighs it heaviest: a fast, cleanly-
   * shaped wrong answer is worth less than a slow right one.
   *
   * Returns `null` — not a number — when a row carries no measured signal
   * at all: never probed for fitness, never timed, never golden-set scored.
   * `ModelStewardBlock.jsx`'s `RecommendationRow` already hides the "fit"
   * chip when `score` is not a number, so a genuinely unmeasured row reads
   * as unmeasured rather than carrying a confident, made-up number — the
   * one place review §1.4 asks for that explicitly, rather than the
   * per-axis "unmeasured is not bad" mid-banding everywhere else in this
   * function.
   */
  capabilityFitScore(model) {
    if (!AIDirectorService.hasMeasuredSignal(model)) return null;

    const freeTier = model.freeTier || {};

    // A row the probe watched emit valid JSON outranks one it has never
    // asked, which in turn outranks one that answered and did not manage
    // JSON — the same ordering `aiNeedResolver.js`'s `isStructured` bonus
    // implies, just expressed as points on this 0-100 scale.
    const fitnessPoints = freeTier.fitness === 'structured' ? 100
      : freeTier.fitness === 'basic' ? 40
      : 60; // never probed — closer to "proven" than to "proven and failed"

    // Measured latency band. `weightClassOf` returns null for a row never
    // timed; that sits at the same neutral point speedBandRank gives it.
    const band = weightClassOf(freeTier.latency?.p50Ms);
    const speedPoints = band === 'fast' ? 100 : band === 'balanced' ? 70 : band === 'deep' ? 40 : 50;

    const qualityPoints = Math.round(AIDirectorService.measuredQualityOf(model) * 100);

    return Math.round(fitnessPoints * 0.2 + speedPoints * 0.2 + qualityPoints * 0.6);
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

  /**
   * The human sentence next to a suggestion's "fit" chip.
   *
   * Until 2026-09-19 two of these lines read `capabilities.tasks.
   * codeGeneration` and `capabilities.performance.{reasoning,speed,quality}`
   * — the same name-guessed fields `capabilityFitScore` stopped ranking on
   * above, for the same reason (review §1.4). A guessed sentence sitting
   * next to a now-honest number would just move the problem from the chip
   * to the caption underneath it. "Good at code generation" is dropped
   * outright: the golden set has no code-generation class
   * (`aiGoldenSet.js`'s `GOLDEN_CLASSES`), so there is no measured claim to
   * make here at all, and no reason beats a guessed one. The other three
   * are rephrased onto what is actually measured: the golden set's
   * per-class `reasoning` score, the measured latency band, and the
   * golden-set overall score.
   */
  generateReasoning(model, requirements, priority) {
    const reasons = [];
    const caps = model.capabilities || {};
    const freeTier = model.freeTier || {};
    const quality = freeTier.quality || {};

    if (freeTier.isFree) {
      reasons.push('Free tier available');
    }

    // Vendor-stated, not guessed — the same field `aiNeedResolver.js`'s
    // `isVisionCapable` filters `vision:*` need calls on.
    if (requirements.needsVision && freeTier.acceptsImageInput === true) {
      reasons.push('Accepts image input (vendor-listed)');
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

    // Golden-set per-class score, not the guessed `performance.reasoning`
    // tier. Silent when this row has never been asked a reasoning question
    // — no claim beats a guessed one.
    if (requirements.needsReasoning && typeof quality.byClass?.reasoning === 'number'
      && quality.byClass.reasoning >= 0.7) {
      reasons.push(`Scored well on reasoning (golden set ${quality.byClass.reasoning})`);
    }

    if (priority === 'speed' && weightClassOf(freeTier.latency?.p50Ms) === 'fast') {
      reasons.push(`Fast, measured (${freeTier.latency.p50Ms}ms median)`);
    }

    if (priority === 'quality' && typeof quality.score === 'number' && quality.score >= 0.8) {
      reasons.push(`High golden-set score (${quality.score})`);
    }

    if (priority === 'cost' && freeTier.isFree) {
      reasons.push('Cost-effective (free tier)');
    }

    if (typeof caps.contextWindow === 'number' && caps.contextWindow >= 128000) {
      reasons.push(`${Math.round(caps.contextWindow / 1000)}k context window`);
    }

    // The one case worth saying plainly rather than filling with a generic
    // fallback: nothing here has ever measured this row at all (review
    // §1.4 — same condition `capabilityFitScore` returns `null` for).
    if (!AIDirectorService.hasMeasuredSignal(model)) {
      reasons.push('Not yet measured — no fitness, latency or golden-set score for this row');
    }

    return reasons.join(', ') || `Best ${priority} option`;
  }
}

export default new AIDirectorService();
