import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';

const aiPricingSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llmgateway']
  },
  modelId: {
    type: String,
    required: true
  },
  inputPrice: {
    type: Number,
    required: true,
    default: 0
  },
  outputPrice: {
    type: Number,
    required: true,
    default: 0
  },
  currency: {
    type: String,
    default: 'USD'
  },
  // Documentation of the stored unit, not a switch: nothing reads this field.
  // Prices are dollars per 1,000,000 tokens (see aiDirectorService's
  // TOKENS_PER_PRICE_UNIT and the seed data it ships).
  priceUnit: {
    type: String,
    default: 'per_1m_tokens'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index to ensure unique pricing per model
aiPricingSchema.index({ provider: 1, modelId: 1 }, { unique: true });

// Use aiGeek database connection
const aiGeekConnection = getAIGeekConnection();
const AIPricing = aiGeekConnection.model('AIPricing', aiPricingSchema);

export default AIPricing;
