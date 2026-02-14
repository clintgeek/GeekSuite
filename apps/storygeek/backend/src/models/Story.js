const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  personality: { type: String, default: '' },
  appearance: { type: String, default: '' },
  background: { type: String, default: '' },
  relationships: [{
    characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },
    relationshipType: { type: String, enum: ['friend', 'enemy', 'lover', 'family', 'mentor', 'student', 'rival', 'neutral'] },
    description: { type: String, default: '' }
  }],
  inventory: [{
    name: { type: String, required: true },
    description: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    isEquipped: { type: Boolean, default: false }
  }],
  skills: [{
    name: { type: String, required: true },
    level: { type: Number, default: 1 },
    description: { type: String, default: '' }
  }],
  currentState: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const locationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  type: { type: String, enum: ['city', 'forest', 'dungeon', 'castle', 'village', 'wilderness', 'shop', 'tavern', 'temple', 'other'] },
  atmosphere: { type: String, default: '' },
  inhabitants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],
  items: [{
    name: { type: String, required: true },
    description: { type: String, default: '' },
    isHidden: { type: Boolean, default: false }
  }],
  connections: [{
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Location' },
    description: { type: String, default: '' }
  }],
  history: { type: String, default: '' },
  isDiscovered: { type: Boolean, default: false }
});

const diceResultSchema = new mongoose.Schema({
  diceType: { type: String, required: true }, // 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'
  result: { type: Number, required: true },
  interpretation: { type: String, required: true },
  context: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});

const storyEventSchema = new mongoose.Schema({
  type: { type: String, enum: ['narrative', 'combat', 'dialogue', 'exploration', 'discovery', 'conflict', 'resolution'], required: true },
  description: { type: String, required: true },
  characters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],
  locations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }],
  diceResults: [diceResultSchema],
  playerChoices: [{
    choice: { type: String, required: true },
    outcome: { type: String, required: true }
  }],
  timestamp: { type: Date, default: Date.now }
});

const storyThreadSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['active', 'resolved', 'abandoned'], default: 'active' },
  events: [storyEventSchema],
  characters: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Character' }],
  locations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Location' }],
  createdAt: { type: Date, default: Date.now }
});

const storySummarySchema = new mongoose.Schema({
  summary: { type: String, required: true },
  keywords: {
    characters: [String],
    locations: [String],
    items: [String],
    concepts: [String],
    events: [String]
  },
  importantDetails: [{
    type: { type: String, enum: ['character', 'location', 'item', 'concept', 'event'] },
    name: String,
    description: String,
    relevance: { type: String, enum: ['high', 'medium', 'low'], default: 'medium' }
  }],
  timestamp: { type: Date, default: Date.now },
  eventCount: { type: Number, default: 0 }
});

const storySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  genre: { type: String, required: true },
  description: { type: String, default: '' },

  // World state
  worldState: {
    setting: { type: String, required: true },
    currentSituation: { type: String, required: true },
    mood: { type: String, enum: ['dark', 'hopeful', 'tense', 'peaceful', 'mysterious', 'chaotic', 'neutral'], default: 'neutral' },
    weather: { type: String, enum: ['stormy', 'clear', 'foggy', 'windy', 'calm', 'rainy'], default: 'clear' },
    timeOfDay: { type: String, enum: ['dawn', 'morning', 'afternoon', 'evening', 'night', 'midnight'], default: 'morning' }
  },

  // Story elements
  characters: [characterSchema],
  locations: [locationSchema],
  storyThreads: [storyThreadSchema],
  diceResults: [diceResultSchema],
  events: [storyEventSchema],
  storySummaries: [storySummarySchema], // Added storySummaries

  // Checkpoints for going back
  checkpoints: [{
    id: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    description: { type: String, default: 'Checkpoint' },
    events: [storyEventSchema],
    worldState: {
      setting: { type: String, required: true },
      currentSituation: { type: String, required: true },
      mood: { type: String, enum: ['dark', 'hopeful', 'tense', 'peaceful', 'mysterious', 'chaotic', 'neutral'], default: 'neutral' },
      weather: { type: String, enum: ['stormy', 'clear', 'foggy', 'windy', 'calm', 'rainy'], default: 'clear' },
      timeOfDay: { type: String, enum: ['dawn', 'morning', 'afternoon', 'evening', 'night', 'midnight'], default: 'morning' }
    },
    characters: [characterSchema],
    locations: [locationSchema]
  }],

  // AI context management
  aiContext: {
    lastPrompt: { type: String, default: '' },
    worldRules: { type: String, default: '' },
    characterArcs: [{ type: String }],
    storyTone: { type: String, default: 'adventure' },
    magicSystem: { type: String, default: '' },
    technologyLevel: { type: String, enum: ['primitive', 'medieval', 'renaissance', 'industrial', 'modern', 'futuristic'], default: 'medieval' }
  },

  // Story state tracking for consistency
  storyState: {
    establishedFacts: [{
      category: { type: String, enum: ['character', 'location', 'event', 'detail'], required: true },
      fact: { type: String, required: true },
      source: { type: String, default: 'narrative' }, // 'narrative', 'player', 'dice'
      timestamp: { type: Date, default: Date.now }
    }],
    activeCharacters: [{
      name: { type: String, required: true },
      relationship: { type: String, default: '' }, // 'husband', 'brother', 'friend', etc.
      status: { type: String, default: 'alive' }, // 'alive', 'dead', 'missing'
      details: { type: String, default: '' }
    }],
    currentLocation: {
      name: { type: String, default: '' },
      description: { type: String, default: '' },
      atmosphere: { type: String, default: '' }
    }
  },

  // Game statistics
  stats: {
    totalInteractions: { type: Number, default: 0 },
    totalDiceRolls: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 },

    lastActive: { type: Date, default: Date.now }
  },

  // Status
  status: { type: String, enum: ['active', 'paused', 'completed', 'abandoned', 'setup'], default: 'active' },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field on save
storySchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Indexes for performance
storySchema.index({ userId: 1, status: 1 });
storySchema.index({ createdAt: -1 });

// Virtual for active characters
storySchema.virtual('activeCharacters').get(function() {
  return this.characters.filter(char => char.isActive);
});

// Virtual for discovered locations
storySchema.virtual('discoveredLocations').get(function() {
  return this.locations.filter(loc => loc.isDiscovered);
});

// Virtual for active story threads
storySchema.virtual('activeThreads').get(function() {
  return this.storyThreads.filter(thread => thread.status === 'active');
});

module.exports = mongoose.model('Story', storySchema);