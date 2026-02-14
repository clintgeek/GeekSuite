import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';

const aiConfigSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llm7', 'llmgateway'],
    unique: true
  },
  apiKey: {
    type: String,
    required: true
  },
  accountId: {
    type: String,
    default: '' // For Cloudflare account ID
  },
  enabled: {
    type: Boolean,
    default: true
  },
  model: {
    type: String,
    default: ''
  },
  maxTokens: {
    type: Number,
    default: 1000
  },
  temperature: {
    type: Number,
    default: 0.7
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
aiConfigSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Use aiGeek database connection
const aiGeekConnection = getAIGeekConnection();
export default aiGeekConnection.model('AIConfig', aiConfigSchema);
