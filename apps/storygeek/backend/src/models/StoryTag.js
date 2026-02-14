const mongoose = require('mongoose');

const storyTagSchema = new mongoose.Schema({
  storyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true },

  // Tag Information
  tag: { type: String, required: true }, // 'character', 'location', 'item', 'event', 'concept'
  value: { type: String, required: true }, // The actual tag value
  category: { type: String, enum: ['character', 'location', 'item', 'event', 'concept', 'relationship', 'quest'], required: true },

  // Context Information
  source: { type: String, enum: ['narrative', 'player', 'dice', 'observation'], default: 'narrative' },
  context: { type: String, default: '' }, // Brief description of when/where this was mentioned
  relevance: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },

  // Relationships
  relatedTags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StoryTag' }],
  characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' }, // If related to a character

  // Metadata
  firstMentioned: { type: Date, default: Date.now },
  lastMentioned: { type: Date, default: Date.now },
  mentionCount: { type: Number, default: 1 },

  // Search optimization
  searchText: { type: String, default: '' }, // For full-text search
  keywords: [String], // For semantic search

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save
storyTagSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Create index for efficient querying
storyTagSchema.index({ storyId: 1, category: 1, tag: 1 });
storyTagSchema.index({ storyId: 1, relevance: 1 });
storyTagSchema.index({ storyId: 1, searchText: 'text' });

module.exports = mongoose.model('StoryTag', storyTagSchema);