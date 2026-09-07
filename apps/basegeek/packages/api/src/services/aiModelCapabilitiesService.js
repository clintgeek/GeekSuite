import AIModel from '../models/AIModel.js';
import { PROVIDER_IDS } from '../config/aiProviders.js';
import logger from '../lib/logger.js';

// ─── Adapter facts ───────────────────────────────────────────────────────────
//
// The three constants below are facts about *our adapters*, not claims about
// models: they say which provider/model pairs aiService can actually put
// `tools` or a `response_format` on the wire for. Nothing here is a vendor
// catalogue and nothing here needs feeding — a pair joins a set the day the
// adapter beside it learns the parameter, and leaves it the day the adapter
// goes.
//
// The ~1,210-line `knownCapabilities` table that used to sit under them (model
// context windows, speed and quality tiers, per-model tool and JSON flags,
// hand-typed for nine vendors) was deleted on 2026-09-07 in Phase 1 of
// DOCS/AIGEEK_ELEVATION_PLAN.md. What a model can do is now observed, not
// declared: the catalog job writes `AIModel.capabilities` from OpenRouter's
// `supported_parameters` or from a live probe, and `inferCapabilities` below is
// the fallback for a listing that says nothing. `TOOL_CALLING_CORRECTIONS` — a
// dozen groq ids that existed only to patch that table's stale
// `supportsFunctionCalling: false` rows — went with it; groq's entry in
// TOOL_FORWARDING_PROVIDERS is the whole of that fact now.
//
// JSON_SCHEMA_SUPPORTED / JSON_MODE_SUPPORTED:
//   Provider/model pairs where aiService has a NATIVE translation implemented
//   in its call*() method for response_format:{type: "json_schema"|"json_object"}.
//
// Pairs NOT in these sets fall through to the prompt-injection fallback —
// which preserves rotation: every provider can "do" structured output one way
// or the other, just at varying fidelity.
//
// Expand these sets as native implementations land in callGroq / callCerebras /
// callOpenRouter / etc. The legacy supportsJSONOutput flag is a softer "can
// produce JSON when asked" signal used elsewhere (aiDirectorService model
// selection); these are the stricter "we forward response_format correctly"
// signals.
//
// `anthropic:*` was the other member of both sets until 2026-09-07, when the
// provider was retired (out of credit, gone for good). `gemini` is the one
// bespoke adapter left that forwards both response_format shapes natively.
const JSON_SCHEMA_SUPPORTED = new Set([
  'gemini:*'
]);
const JSON_MODE_SUPPORTED = new Set([
  'gemini:*'
]);

// TOOL_FORWARDING_PROVIDERS: the providers whose adapter in aiService actually
// puts `tools` on the wire and reads `tool_calls` back off it.
//
// FINDING F-04: this set is the difference between a capability matrix and a
// wish. `supportsToolCalling` gates the rotation (aiService.js — a `tools`
// request skips any provider the matrix calls incapable), so a provider marked
// capable with no adapter behind it does not fail loudly: it is *selected*, the
// `tools` array is quietly dropped at the adapter, and the caller gets prose and
// finish_reason "stop" where the contract promised tool_calls. Groq was marked
// capable on twelve models for exactly that reason, and both aiGeek docs said
// so; callGroq now forwards, so the claim is true.
//
// The rule: a provider goes in here the same day its call*() learns to forward
// `tools` — never before. Everything else falls out of the rotation for tool
// requests, which is the correct answer, because tool calling has no
// prompt-injection fallback the way structured output does: a tool_calls
// response shape can only come from native provider support.
const TOOL_FORWARDING_PROVIDERS = new Set([
  'gemini',     // callGemini — functionDeclarations + toolConfig + functionCall readback
  'groq'        // callGroq   — OpenAI-shaped tools/tool_choice, verbatim
]);
// `anthropic` was the first entry here (callClaude forwarded tools and all four
// tool_choice forms and read tool_use blocks back); removed 2026-09-07 with the
// provider. Gemini is now the only adapter with both native tool forwarding and
// native json_schema.


function forwardsTools(provider) {
  return TOOL_FORWARDING_PROVIDERS.has(provider);
}

function schemaSupportedFor(provider, modelId) {
  return JSON_SCHEMA_SUPPORTED.has(`${provider}:*`) ||
         JSON_SCHEMA_SUPPORTED.has(`${provider}:${modelId}`);
}

function jsonModeSupportedFor(provider, modelId) {
  return JSON_MODE_SUPPORTED.has(`${provider}:*`) ||
         JSON_MODE_SUPPORTED.has(`${provider}:${modelId}`);
}

/**
 * Has anything actually observed this row's capabilities?
 *
 * The AIModel schema gives every capability field a default (4096 tokens,
 * false, false, false...), so a row written by a plain catalog upsert reads
 * back as a complete object that claims a 4096-token context and no JSON
 * support. "Nothing known" and "known to do nothing" are the same document,
 * and preferring that document over `inferCapabilities` would make every
 * refreshed model look worse than the guess.
 *
 * So: a stored object counts as observed when it says something a default
 * never would. It can be replaced with a single flag the day the catalog job
 * stamps one (a `capabilities.source`, or the additive `contextTokens`).
 */
function looksObserved(stored) {
  if (!stored || typeof stored !== 'object') return false;
  if (
    stored.supportsVision || stored.supportsAudio ||
    stored.supportsFunctionCalling || stored.supportsToolCalling ||
    stored.supportsJSONOutput || stored.supportsJSONMode || stored.supportsJSONSchema
  ) return true;
  return Number(stored.contextWindow) > 4096 || Number(stored.maxTokens) > 4096;
}

class AIModelCapabilitiesService {
  /**
   * Canonical accessor: returns the full capabilities object for a provider/model,
   * falling back to inferCapabilities() for unknown models. Always returns an
   * object with the canonical flag set populated.
   */
  getCapabilities(provider, modelId, storedCapabilities = null) {
    // An observed row wins over the guess; a row that is only schema defaults
    // is not an observation (see looksObserved).
    const caps = looksObserved(storedCapabilities)
      ? { ...storedCapabilities }
      : this.inferCapabilities(modelId);
    // F-04: `supportsToolCalling` answers 'will a `tools` request routed here
    // actually arrive?' — a fact about our adapter, and the gate aiService
    // rotates on. It is the adapter set and nothing else, because a request
    // that reaches an adapter which drops `tools` comes back as prose with
    // finish_reason 'stop'. The legacy `supportsFunctionCalling` is the looser
    // 'can this model call functions at all?' signal the director scores on, so
    // it is true whenever either the listing or the adapter says so.
    caps.supportsToolCalling = forwardsTools(provider);
    caps.supportsFunctionCalling = !!caps.supportsFunctionCalling || caps.supportsToolCalling;
    caps.supportsJSONMode = jsonModeSupportedFor(provider, modelId);
    caps.supportsJSONSchema = schemaSupportedFor(provider, modelId);
    return caps;
  }

  /**
   * True if a `tools` request routed to this provider/model will actually reach
   * it as `tools` — i.e. the model can call functions AND aiService's adapter
   * for this provider forwards the parameter. See TOOL_FORWARDING_PROVIDERS.
   */
  supportsTools(provider, modelId) {
    return !!this.getCapabilities(provider, modelId).supportsToolCalling;
  }

  /** True for response_format: {type: "json_object"}. */
  supportsJSONMode(provider, modelId) {
    return !!this.getCapabilities(provider, modelId).supportsJSONMode;
  }

  /** True for response_format: {type: "json_schema", json_schema: {...}}. */
  supportsJSONSchema(provider, modelId) {
    return !!this.getCapabilities(provider, modelId).supportsJSONSchema;
  }

  /**
   * Bring one AIModel row's `capabilities` up to date.
   *
   * Reads what the catalog already knows (the job writes `capabilities` from
   * OpenRouter's `supported_parameters` or from a probe) and falls back to
   * `inferCapabilities` when the row says nothing. It consults no table: the
   * hand-typed one it used to prefer over both is gone.
   */
  async updateModelCapabilities(provider, modelId) {
    try {
      const existing = await AIModel.findOne({ provider, modelId })
        .select('capabilities')
        .lean();
      const capabilities = this.getCapabilities(provider, modelId, existing?.capabilities);

      await AIModel.findOneAndUpdate(
        { provider, modelId },
        {
          $set: {
            capabilities,
            lastChecked: new Date()
          }
        },
        { upsert: true }
      );

      return { success: true, capabilities };
    } catch (error) {
      logger.error({ err: error }, 'Error updating model capabilities');
      return { success: false, error: error.message };
    }
  }

  inferCapabilities(modelId) {
    // Handle null/undefined modelId
    if (!modelId) {
      return {
        maxTokens: 4096,
        supportsVision: false,
        supportsAudio: false,
        supportsFunctionCalling: false,
        supportsToolCalling: false,
        supportsJSONOutput: true,
        supportsJSONMode: true,
        supportsJSONSchema: false,
        supportsStreaming: true,
        contextWindow: 4096,
        tasks: {
          textGeneration: true,
          codeGeneration: true,
          reasoning: false,
          analysis: true,
          summarization: true,
          translation: true,
          questionAnswering: true,
          creativeWriting: true,
          structuredOutput: true
        },
        performance: {
          speed: 'medium',
          quality: 'good',
          reasoning: 'basic'
        }
      };
    }

    const capabilities = {
      maxTokens: 4096,
      supportsVision: false,
      supportsAudio: false,
      supportsFunctionCalling: false,
      supportsToolCalling: false,
      supportsJSONOutput: true,
      supportsJSONMode: true,
      supportsJSONSchema: false,
      supportsStreaming: true,
      contextWindow: 4096,
      tasks: {
        textGeneration: true,
        codeGeneration: true,
        reasoning: false,
        analysis: true,
        summarization: true,
        translation: true,
        questionAnswering: true,
        creativeWriting: true,
        structuredOutput: true
      },
      performance: {
        speed: 'medium',
        quality: 'good',
        reasoning: 'basic'
      }
    };

    // Infer from model name patterns
    const modelLower = modelId.toLowerCase();

    // Vision capabilities
    if (modelLower.includes('vision') || modelLower.includes('multimodal')) {
      capabilities.supportsVision = true;
    }

    // Audio capabilities
    if (modelLower.includes('whisper') || modelLower.includes('tts') || modelLower.includes('audio')) {
      capabilities.supportsAudio = true;
      capabilities.tasks.codeGeneration = false;
      capabilities.tasks.creativeWriting = false;
      capabilities.tasks.structuredOutput = false;
    }

    // Model size and performance inference
    if (modelLower.includes('70b') || modelLower.includes('70b') || modelLower.includes('405b')) {
      capabilities.maxTokens = 8192;
      capabilities.contextWindow = 8192;
      capabilities.tasks.reasoning = true;
      capabilities.performance.reasoning = 'excellent';
      capabilities.performance.quality = 'excellent';
    }

    if (modelLower.includes('405b')) {
      capabilities.performance.reasoning = 'state-of-the-art';
      capabilities.performance.quality = 'state-of-the-art';
    }

    if (modelLower.includes('8b') || modelLower.includes('9b')) {
      capabilities.maxTokens = 8192;
      capabilities.contextWindow = 8192;
      capabilities.performance.speed = 'ultra-fast';
    }

    if (modelLower.includes('instant') || modelLower.includes('turbo')) {
      capabilities.performance.speed = 'ultra-fast';
    }

    // Function calling inference. `claude` was the other id fragment matched
    // here until 2026-09-07, when the anthropic provider was retired.
    if (modelLower.includes('gemini')) {
      capabilities.supportsFunctionCalling = true;
      capabilities.supportsToolCalling = true;
      capabilities.supportsJSONSchema = true;
    }

    // Guard models are specialized
    if (modelLower.includes('guard')) {
      capabilities.tasks.codeGeneration = false;
      capabilities.tasks.creativeWriting = false;
      capabilities.tasks.structuredOutput = false;
      capabilities.tasks.translation = false;
    }

    // Large context models
    if (modelLower.includes('200k') || modelLower.includes('1m')) {
      capabilities.maxTokens = 200000;
      capabilities.contextWindow = 200000;
    }

    if (modelLower.includes('1048576') || modelLower.includes('1m')) {
      capabilities.maxTokens = 1048576;
      capabilities.contextWindow = 1048576;
    }

    return capabilities;
  }

  // `getModelsForTask(task, requirements)` lived here until 2026-09-07. It had
  // zero callers in the tree — and could not have had a working one: its query
  // ended in `.populate('pricing').populate('freeTier')`, and AIModel declares
  // neither path, so mongoose 8 throws StrictPopulateError on every call. The
  // ranking idea (free first, then price, or speed, or quality) survives in
  // aiDirectorService.recommendProvider, which is the version that runs.

  async updateAllModelCapabilities() {
    try {
      // The roster is the one list of providers (config/aiProviders.js). This
      // used to be a hand-typed ['groq', 'gemini', 'together'], which quietly
      // skipped the six providers added after it was written.
      let updatedCount = 0;

      for (const provider of PROVIDER_IDS) {
        const models = await AIModel.find({ provider, isActive: true });

        for (const model of models) {
          const updated = await this.updateModelCapabilities(provider, model.modelId);
          if (updated) updatedCount++;
        }
      }

      logger.info(`Updated capabilities for ${updatedCount} models`);
      return {
        success: true,
        updatedCount
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to update all model capabilities');
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new AIModelCapabilitiesService();