import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';

const aiModelSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    enum: ['anthropic', 'groq', 'gemini', 'together', 'cohere', 'openrouter', 'cerebras', 'cloudflare', 'ollama', 'llm7', 'llmgateway']
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
  // Model capabilities
  capabilities: {
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
