import mongoose from 'mongoose';
import { getAIGeekConnection } from '../config/database.js';
import { encrypt, safeDecrypt, isEncrypted } from '../lib/cryptoVault.js';
import { logger } from '../lib/logger.js';

// Track doc IDs for which we have already emitted the legacy-plaintext warning,
// so we don't spam the logs on every read.
const _legacyWarnedIds = new Set();

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

// ---------------------------------------------------------------------------
// Instance helpers for the encrypted apiKey field
// ---------------------------------------------------------------------------

/**
 * Returns the decrypted API key plaintext.
 * If the stored value is legacy plaintext (not yet migrated), returns it
 * as-is and emits a one-per-doc warn so the migration need is visible.
 */
aiConfigSchema.methods.getDecryptedKey = function() {
  const stored = this.apiKey;
  if (!stored) return stored;

  if (isEncrypted(stored)) {
    return safeDecrypt(stored);
  }

  // Legacy plaintext path — warn once per doc id per process
  const docId = String(this._id);
  if (!_legacyWarnedIds.has(docId)) {
    _legacyWarnedIds.add(docId);
    logger.warn(
      { provider: this.provider, docId },
      '[AIConfig] apiKey is stored as legacy plaintext; run encrypt-keys migration'
    );
  }
  return stored;
};

/**
 * Encrypt a new plaintext key and assign it to this.apiKey.
 * Call this before save() whenever the key changes.
 * @param {string} plaintext
 */
aiConfigSchema.methods.setKey = function(plaintext) {
  this.apiKey = encrypt(plaintext);
};

// Use aiGeek database connection
const aiGeekConnection = getAIGeekConnection();
export default aiGeekConnection.model('AIConfig', aiConfigSchema);
