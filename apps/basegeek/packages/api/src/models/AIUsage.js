import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import { PROVIDER_IDS } from '../config/aiProviders.js';

const aiUsageSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: PROVIDER_IDS
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
  /**
   * Dollars this record's calls have cost — OpenRouter's own `usage.cost` where
   * it reported one, otherwise `AIPricing` (per 1,000,000 tokens) × tokens,
   * otherwise 0. Free rows book 0 and still book their calls.
   *
   * The per-day / per-app / per-feature roll-up of the same figure lives in
   * `AISpend`; this field is the per-model detail behind it.
   */
  costUsd: {
    type: Number,
    default: 0
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
