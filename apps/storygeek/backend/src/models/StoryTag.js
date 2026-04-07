import mongoose from 'mongoose';

const storyTagSchema = new mongoose.Schema({
  storyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true },

  // Tag Information
  tag: { type: String, required: true },
  value: { type: String, required: true },
  category: { type: String, enum: ['character', 'location', 'item', 'event', 'concept', 'relationship', 'quest'], required: true },

  // Context Information
  source: { type: String, enum: ['narrative', 'player', 'dice', 'observation'], default: 'narrative' },
  context: { type: String, default: '' },
  relevance: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' },

  // Relationships
  relatedTags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StoryTag' }],
  characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },

  // Metadata
  firstMentioned: { type: Date, default: Date.now },
  lastMentioned: { type: Date, default: Date.now },
  mentionCount: { type: Number, default: 1 },

  // Search optimization
  searchText: { type: String, default: '' },
  keywords: [String],

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

export default mongoose.model('StoryTag', storyTagSchema);
