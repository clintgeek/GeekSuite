const mongoose = require('mongoose');

const aiFoodPromptCacheSchema = new mongoose.Schema({
  user_id: {
    type: String,
    required: true,
    index: true,
  },
  normalized_prompt: {
    type: String,
    required: true,
  },
  prompt_hash: {
    type: String,
    required: true,
    index: true,
  },
  context_hash: {
    type: String,
    required: true,
  },
  user_input: {
    type: String,
    required: true,
  },
  source_prompt: {
    type: String,
  },
  result: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  hit_count: {
    type: Number,
    default: 0,
  },
  last_used_at: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
});

aiFoodPromptCacheSchema.index({ user_id: 1, prompt_hash: 1, context_hash: 1 }, { unique: true });
aiFoodPromptCacheSchema.index({ last_used_at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 45 });

module.exports = mongoose.model('AIFoodPromptCache', aiFoodPromptCacheSchema);
