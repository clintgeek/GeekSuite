/**
 * gamegeek `GamePlayer` — one user's relationship with one household game:
 * shelf, rating, hours, playthroughs, sessions. DOCS/GameGeekPlan.md §2.1, §3.
 *
 * Unique on (userId, gameId). Always carries householdId so household views
 * ("who else has this") never cross a tenant.
 */
const { HOURS_SOURCES, COMPLETION_LEVELS, bounds } = require('./constants.js');

function gamePlayerDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/gamegeek/gamePlayer: pass your own mongoose instance');
  }
  const { Schema } = mongoose;

  const playthroughSchema = new Schema(
    {
      startedAt: { type: Date, default: null }, // calendar date
      finishedAt: { type: Date, default: null }, // calendar date
      hours: { type: Number, default: null },
      platform: { type: String, default: null },
      difficulty: { type: String, maxlength: 60, default: null },
      completion: { type: String, enum: [...COMPLETION_LEVELS, null], default: null },
      notes: { type: String, maxlength: 1000, default: '' },
    },
    { _id: true }
  );

  const sessionSchema = new Schema(
    {
      playedOn: { type: Date, required: true }, // calendar date
      minutes: { type: Number, required: true, min: bounds.sessionMinutes.min, max: bounds.sessionMinutes.max },
      platform: { type: String, default: null },
      note: { type: String, maxlength: 500, default: '' },
    },
    { _id: true, timestamps: { createdAt: true, updatedAt: false } }
  );

  return {
    householdId: { type: String, required: true },
    userId: { type: String, required: true },
    gameId: { type: Schema.Types.ObjectId, required: true },
    shelf: { type: String, default: null }, // built-in or custom-<slug>; null = not shelved by me
    rating: { type: Number, min: bounds.rating.min, max: bounds.rating.max, default: null },
    review: { type: String, maxlength: bounds.review.maxlength, default: '' },
    notes: { type: String, maxlength: bounds.notes.maxlength, default: '' },
    progress: { type: Number, min: bounds.progress.min, max: bounds.progress.max, default: null },
    hoursPlayed: { type: Number, min: bounds.hours.min, max: bounds.hours.max, default: 0 },
    hoursSource: { type: String, enum: HOURS_SOURCES, default: 'manual' },
    favorite: { type: Boolean, default: false },
    lastPlayedAt: { type: Date, default: null }, // instant
    playthroughs: { type: [playthroughSchema], default: [] },
    sessions: { type: [sessionSchema], default: [] },
  };
}

function createGamePlayerSchema(mongoose) {
  const schema = new mongoose.Schema(gamePlayerDefinition(mongoose), { timestamps: true });
  schema.index({ userId: 1, gameId: 1 }, { unique: true });
  schema.index({ householdId: 1, gameId: 1 });
  schema.index({ userId: 1, shelf: 1 });
  schema.index({ userId: 1, lastPlayedAt: -1 });
  return schema;
}

module.exports = { gamePlayerDefinition, createGamePlayerSchema };
