import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';

const PROVIDERS = ['anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llm7', 'llmgateway'];

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

const aiGeekConnection = getAIGeekConnection();
const AIAppConfig = aiGeekConnection.model('AIAppConfig', aiAppConfigSchema);

export default AIAppConfig;
