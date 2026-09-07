import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';

const aiModelSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llmgateway']
  },
  modelId: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastChecked: {
    type: Date,
    default: Date.now
  },
  /**
   * What this model is *for*, when it is for something in particular. Written
   * only by `aiCatalogDiscovery`: the three cheapest OpenRouter paid rows that
   * report `structured_outputs` are tagged `paid-fallback`, which is the set
   * Phase 2's governed paid walk may reach for once every free row is
   * exhausted. Nothing else is ever tagged, and Phase 1 spends nothing here.
   */
  role: {
    type: String,
    enum: ['paid-fallback'],
    default: null
  },
  /**
   * Context window and output ceiling as the *provider's listing* reports them
   * (OpenRouter's `context_length` and `top_provider.max_completion_tokens`).
   * `capabilities.contextWindow` below is the older, hand-seeded field; these
   * two are observed, and where both exist these win.
   */
  contextTokens: {
    type: Number,
    default: 0
  },
  maxOutputTokens: {
    type: Number,
    default: 0
  },
  // Model capabilities
  capabilities: {
    /**
     * Where the rest of this block came from, or `null` when nobody observed
     * it and every field below is a schema default.
     *
     * This field exists because the defaults *lie by omission*: an AIModel row
     * written by a plain upsert reads back as a complete capabilities object
     * claiming `maxTokens: 4096` and no JSON support, indistinguishable from a
     * row somebody actually measured. `aiModelCapabilitiesService.looksObserved()`
     * is the guard that tells them apart, and this is what it reads.
     *
     *   `openrouter-listing` — from `supported_parameters` in OpenRouter's own
     *                          `/models` response. Machine-readable, exact.
     *   `probe`              — from the catalog probe: the model answered, and
     *                          `tasks.structuredOutput` says whether it did so
     *                          in parseable JSON.
     */
    source: {
      type: String,
      enum: ['openrouter-listing', 'probe'],
      default: null
    },
    maxTokens: {
      type: Number,
      default: 4096
    },
    supportsVision: {
      type: Boolean,
      default: false
    },
    supportsAudio: {
      type: Boolean,
      default: false
    },
    supportsFunctionCalling: {
      type: Boolean,
      default: false
    },
    supportsToolCalling: {
      type: Boolean,
      default: false
    },
    supportsJSONOutput: {
      type: Boolean,
      default: false
    },
    supportsJSONMode: {
      type: Boolean,
      default: false
    },
    supportsJSONSchema: {
      type: Boolean,
      default: false
    },
    supportsStreaming: {
      type: Boolean,
      default: true
    },
    contextWindow: {
      type: Number,
      default: 4096
    },
    // Task-specific capabilities
    tasks: {
      textGeneration: { type: Boolean, default: true },
      codeGeneration: { type: Boolean, default: false },
      reasoning: { type: Boolean, default: false },
      analysis: { type: Boolean, default: true },
      summarization: { type: Boolean, default: true },
      translation: { type: Boolean, default: false },
      questionAnswering: { type: Boolean, default: true },
      creativeWriting: { type: Boolean, default: true },
      structuredOutput: { type: Boolean, default: false }
    },
    // Performance characteristics
    performance: {
      speed: {
        type: String,
        enum: ['slow', 'medium', 'fast', 'ultra-fast'],
        default: 'medium'
      },
      quality: {
        type: String,
        enum: ['basic', 'good', 'excellent', 'state-of-the-art'],
        default: 'good'
      },
      reasoning: {
        type: String,
        enum: ['basic', 'good', 'excellent', 'state-of-the-art'],
        default: 'good'
      }
    }
  }
}, {
  timestamps: true
});

// Compound index to ensure unique model per provider
aiModelSchema.index({ provider: 1, modelId: 1 }, { unique: true });

// Use aiGeek database connection
const aiGeekConnection = getAIGeekConnection();
const AIModel = aiGeekConnection.model('AIModel', aiModelSchema);

export default AIModel;
