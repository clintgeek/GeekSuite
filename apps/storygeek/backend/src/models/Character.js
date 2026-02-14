const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema({
  storyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Story', required: true },
  name: { type: String, required: true },

  // Basic Info
  description: { type: String, default: '' },
  relationship: { type: String, default: '' }, // 'ally', 'enemy', 'neutral', 'unknown'
  status: { type: String, enum: ['alive', 'dead', 'missing', 'injured'], default: 'alive' },

  // Location & Movement
  lastSeenLocation: { type: String, default: '' },
  lastSeenTime: { type: Date, default: Date.now },
  currentLocation: { type: String, default: '' },

  // Skills & Capabilities
  skills: [{
    name: { type: String, required: true },
    level: { type: String, enum: ['none', 'basic', 'intermediate', 'expert'], default: 'basic' },
    description: { type: String, default: '' }
  }],

  // Position & Role
  position: { type: String, default: '' }, // 'leader', 'scout', 'medic', 'engineer', etc.
  organization: { type: String, default: '' }, // Which group they belong to

  // Alliances & Relationships
  alliances: [{
    characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },
    relationship: { type: String, enum: ['ally', 'enemy', 'neutral', 'romantic', 'family'], default: 'neutral' },
    notes: { type: String, default: '' }
  }],

  // Known Information
  knownInfo: [{
    category: { type: String, enum: ['background', 'motivation', 'secrets', 'goals'], required: true },
    info: { type: String, required: true },
    discoveredAt: { type: Date, default: Date.now },
    source: { type: String, default: 'player' } // 'player', 'npc', 'observation'
  }],

  // Game State
  isPlayerCharacter: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update timestamp on save
characterSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Character', characterSchema);