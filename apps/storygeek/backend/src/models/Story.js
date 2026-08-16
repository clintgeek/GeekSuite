import mongoose from 'mongoose';

const characterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  personality: { type: String, default: '' },
  appearance: { type: String, default: '' },
  background: { type: String, default: '' },
  // Canonical life/presence state — validators enforce transitions (dead stays dead).
  status: { type: String, enum: ['alive', 'dead', 'missing', 'unknown'], default: 'alive' },
  motivation: { type: String, default: '' },
  isPlayer: { type: Boolean, default: false },
  // Where this character currently is (location name, matched against story.locations).
  locationName: { type: String, default: '' },
  // What this character knows. factId references storyState.establishedFacts[].id.
  // NPCs may only be portrayed as knowing facts listed here.
  knowledge: [{
    factId: { type: String, required: true },
    learnedVia: { type: String, enum: ['witnessed', 'told', 'inference', 'initial'], default: 'initial' },
    learnedFrom: { type: String, default: '' },
    turn: { type: Number, default: 0 }
  }],
  firstAppearedTurn: { type: Number, default: 0 },
  lastSeenTurn: { type: Number, default: 0 },
  relationships: [{
    characterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Character' },
    characterName: { type: String, default: '' },
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
  isDiscovered: { type: Boolean, default: false },
  // Canonical physical state — validators enforce transitions (destroyed can't
  // silently become intact again).
  state: { type: String, enum: ['intact', 'damaged', 'destroyed', 'altered'], default: 'intact' },
  stateNotes: { type: String, default: '' },
  lastVisitedTurn: { type: Number, default: 0 }
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
  turn: { type: Number, default: 0 },
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
  // What kind of open loop this is — used for surfacing dormant threads.
  type: { type: String, enum: ['quest', 'promise', 'debt', 'secret', 'hunt', 'consequence', 'other'], default: 'other' },
  // Names of characters this thread involves (kept as names for prompt rendering).
  characterNames: [{ type: String }],
  openedTurn: { type: Number, default: 0 },
  updatedTurn: { type: Number, default: 0 },
  resolution: { type: String, default: '' },
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
    // Name of the location the player is currently in (matches locations[].name).
    currentLocationName: { type: String, default: '' },
    // Monotonic turn counter — the timeline spine for facts/knowledge/threads.
    turnNumber: { type: Number, default: 0 },
    // In-story elapsed time since the story began, in hours. The STORY CLOCK:
    // anchors world decay, distances, and NPC schedules so the GM cannot
    // imply years have passed in a story that is one day old.
    hoursElapsed: { type: Number, default: 0 },
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
  storySummaries: [storySummarySchema],

  // Checkpoints for going back. A checkpoint is a FULL snapshot of narrative
  // state — restoring one must return the game to a consistent point, so it
  // captures threads, facts, summaries, and dice history alongside events.
  // Stored as Mixed to survive schema evolution; restore code validates shape.
  checkpoints: [{
    id: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    description: { type: String, default: 'Checkpoint' },
    turnNumber: { type: Number, default: 0 },
    events: [storyEventSchema],
    worldState: { type: mongoose.Schema.Types.Mixed, default: {} },
    characters: [characterSchema],
    locations: [locationSchema],
    storyThreads: { type: mongoose.Schema.Types.Mixed, default: [] },
    storyState: { type: mongoose.Schema.Types.Mixed, default: {} },
    storySummaries: { type: mongoose.Schema.Types.Mixed, default: [] },
    diceResults: { type: mongoose.Schema.Types.Mixed, default: [] },
    stats: { type: mongoose.Schema.Types.Mixed, default: {} }
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
      // Stable id so character knowledge can reference facts.
      id: { type: String, default: '' },
      category: { type: String, enum: ['character', 'location', 'event', 'detail'], required: true },
      fact: { type: String, required: true },
      // Entity names (characters/locations) this fact is about — used for relevance selection.
      subjects: [{ type: String }],
      // Is this common knowledge, or secret (known only to characters holding it)?
      visibility: { type: String, enum: ['public', 'secret'], default: 'public' },
      source: { type: String, default: 'narrative' },
      turn: { type: Number, default: 0 },
      // Facts are never deleted; superseded facts are retired with a reason,
      // preserving the audit trail of how canon evolved.
      isRetired: { type: Boolean, default: false },
      retiredReason: { type: String, default: '' },
      timestamp: { type: Date, default: Date.now }
    }],
    activeCharacters: [{
      name: { type: String, required: true },
      relationship: { type: String, default: '' },
      status: { type: String, default: 'alive' },
      details: { type: String, default: '' }
    }],
    currentLocation: {
      name: { type: String, default: '' },
      description: { type: String, default: '' },
      atmosphere: { type: String, default: '' }
    },
    // Contradictions caught by validation last turn — rendered as CANON
    // ALERTS in the next turn's context so the GM course-corrects, then cleared.
    canonAlerts: { type: mongoose.Schema.Types.Mixed, default: [] }
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

export default mongoose.model('Story', storySchema);
