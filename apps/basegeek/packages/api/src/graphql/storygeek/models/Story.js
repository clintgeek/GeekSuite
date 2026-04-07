import mongoose from 'mongoose';
import { getAppConnection } from '../../shared/appConnections.js';

const storyConn = getAppConnection('storygeek');

const characterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  personality: { type: String, default: '' },
  appearance: { type: String, default: '' },
  background: { type: String, default: '' },
  relationships: [{
    characterId: { type: mongoose.Schema.Types.ObjectId },
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
  history: { type: String, default: '' },
  isDiscovered: { type: Boolean, default: false }
});

const diceResultSchema = new mongoose.Schema({
  diceType: { type: String, required: true },
  result: { type: Number, required: true },
  interpretation: { type: String, required: true },
  context: { type: String, default: '' },
  timestamp: { type: Date, default: Date.now }
});

const storyEventSchema = new mongoose.Schema({
  type: { type: String, enum: ['narrative', 'combat', 'dialogue', 'exploration', 'discovery', 'conflict', 'resolution'], required: true },
  description: { type: String, required: true },
  diceResults: [diceResultSchema],
  playerChoices: [{
    choice: { type: String, required: true },
    outcome: { type: String, required: true }
  }],
  timestamp: { type: Date, default: Date.now }
});

const storySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  genre: { type: String, required: true },
  description: { type: String, default: '' },
  worldState: {
    setting: { type: String },
    currentSituation: { type: String },
    mood: { type: String },
    weather: { type: String },
    timeOfDay: { type: String }
  },
  characters: [characterSchema],
  locations: [locationSchema],
  diceResults: [diceResultSchema],
  events: [storyEventSchema],
  aiContext: {
    storyTone: { type: String, default: 'adventure' },
    magicSystem: { type: String, default: '' },
    technologyLevel: { type: String, default: 'medieval' }
  },
  storyState: {
    establishedFacts: [{
      category: String,
      fact: String,
      source: String,
      timestamp: Date
    }],
    activeCharacters: [{
      name: String,
      relationship: String,
      status: String,
      details: String
    }],
    currentLocation: {
      name: String,
      description: String,
      atmosphere: String
    }
  },
  stats: {
    totalInteractions: { type: Number, default: 0 },
    totalDiceRolls: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now }
  },
  status: { type: String, enum: ['active', 'paused', 'completed', 'abandoned', 'setup'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

storySchema.index({ userId: 1, status: 1 });
storySchema.index({ createdAt: -1 });

export default storyConn.models.Story || storyConn.model('Story', storySchema);
