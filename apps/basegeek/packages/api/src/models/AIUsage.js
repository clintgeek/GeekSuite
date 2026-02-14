import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';

const aiUsageSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llm7', 'llmgateway', 'onemin']
  },
  modelId: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  // Current minute tracking
  currentMinute: {
    requests: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
    audioSeconds: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
  },
  // Current day tracking
  currentDay: {
    requests: { type: Number, default: 0 },
    tokens: { type: Number, default: 0 },
    audioSeconds: { type: Number, default: 0 },
    date: { type: Date, default: Date.now }
  },
  // Current hour tracking (for audio)
  currentHour: {
    audioSeconds: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
  },
  // Free tier limits for this model
  freeLimits: {
    requestsPerMinute: { type: Number, default: 0 },
    requestsPerDay: { type: Number, default: 0 },
    tokensPerMinute: { type: Number, default: 0 },
    tokensPerDay: { type: Number, default: 0 },
    audioSecondsPerHour: { type: Number, default: 0 },
    audioSecondsPerDay: { type: Number, default: 0 }
  },
  // Usage percentage tracking
  usagePercentages: {
    requestsPerMinute: { type: Number, default: 0 },
    requestsPerDay: { type: Number, default: 0 },
    tokensPerMinute: { type: Number, default: 0 },
    tokensPerDay: { type: Number, default: 0 },
    audioSecondsPerHour: { type: Number, default: 0 },
    audioSecondsPerDay: { type: Number, default: 0 }
  },
  // Status tracking
  isNearLimit: {
    requestsPerMinute: { type: Boolean, default: false },
    requestsPerDay: { type: Boolean, default: false },
    tokensPerMinute: { type: Boolean, default: false },
    tokensPerDay: { type: Boolean, default: false },
    audioSecondsPerHour: { type: Boolean, default: false },
    audioSecondsPerDay: { type: Boolean, default: false }
  },
  isAtLimit: {
    requestsPerMinute: { type: Boolean, default: false },
    requestsPerDay: { type: Boolean, default: false },
    tokensPerMinute: { type: Boolean, default: false },
    tokensPerDay: { type: Boolean, default: false },
    audioSecondsPerHour: { type: Boolean, default: false },
    audioSecondsPerDay: { type: Boolean, default: false }
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
aiUsageSchema.index({ provider: 1, modelId: 1, userId: 1, date: 1 }, { unique: true });

// Use aiGeek database connection
const aiGeekConnection = getAIGeekConnection();
const AIUsage = aiGeekConnection.model('AIUsage', aiUsageSchema);

export default AIUsage;
