import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import { normalizeAppId } from '../services/callerIdentity.js';

const PROVIDERS = ['anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llmgateway'];

const aiAppConfigSchema = new mongoose.Schema({
  appName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  displayName: {
    type: String,
    default: ''
  },
  // "free" = free-tier rotation, "rotation" = all-provider rotation, "specific" = pinned provider/model
  tier: {
    type: String,
    enum: ['free', 'rotation', 'specific'],
    default: 'free'
  },
  // Only used when tier = "specific"
  provider: {
    type: String,
    enum: [...PROVIDERS, null],
    default: null
  },
  model: {
    type: String,
    default: null
  },
  // Ordered list of fallback providers when primary fails
  fallbackOrder: {
    type: [String],
    default: []
  },
  // Default generation parameters (app can still override per-request)
  maxTokens: {
    type: Number,
    default: null
  },
  temperature: {
    type: Number,
    default: null
  },
  // Admin notes
  notes: {
    type: String,
    default: ''
  },
  // Auto-discovered vs manually created
  autoDiscovered: {
    type: Boolean,
    default: false
  },
  enabled: {
    type: Boolean,
    default: true
  },
  lastSeen: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

/**
 * The one spelling of an app id.
 *
 * Rows were created from whatever string a caller put in its request body, so
 * the collection holds `fitnessGeek`, `fitnessgeek` and `fitnessGeek:mealPlan`
 * for what is one app with one feature. Routing now resolves the caller's app
 * from its credential and normalizes it through here before the lookup; the
 * lookup itself still matches the legacy spellings case-insensitively (see
 * aiService.findAppConfig), so no stored row is orphaned.
 *
 * Schema fields are deliberately untouched — the AIGeek UI reads them by name.
 *
 * @param {*} value
 * @returns {string|null}
 */
aiAppConfigSchema.statics.normalizeAppName = function normalizeAppName(value) {
  return normalizeAppId(value);
};

const aiGeekConnection = getAIGeekConnection();
const AIAppConfig = aiGeekConnection.model('AIAppConfig', aiAppConfigSchema);

export default AIAppConfig;
