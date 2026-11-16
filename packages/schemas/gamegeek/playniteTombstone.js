/**
 * gamegeek `PlayniteTombstone` — Playnite games someone deleted from GameGeek
 * (Chef, 2026-10-09: "remember the delete"). One row per (household,
 * playniteId). The gateway writes a row when a game is deleted or a Playnite
 * copy is removed from it; the Playnite import (apps/gamegeek/backend,
 * playnite/importPlanner.js) never creates or adds a copy for a tombstoned
 * playniteId again — whatever Playnite still lists.
 *
 * Hiding a game in Playnite is different and needs no row here: the import
 * removes a hidden copy and brings it back if it is unhidden.
 *
 * Restore (SUITE_REVIEW_2026-11 S-D1, 2026-11-16): a delete also writes one
 * `DeletedGame` row (below) holding the catalog row and EVERY member's
 * GamePlayer row as they were. Settings → Deleted games restores from it and
 * clears the tombstones, so the import treats the game normally again.
 * Tombstones written before S-D1 have no snapshot: restoring one only clears
 * it, and the next Playnite import re-creates the game (no shelves/ratings).
 */
function playniteTombstoneDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/gamegeek/playniteTombstone: pass your own mongoose instance');
  }
  return {
    householdId: { type: String, required: true },
    playniteId: { type: String, required: true },
    // For a person reading the collection; never matched on.
    title: { type: String, default: '' },
    deletedBy: { type: String, default: null },
    deletedAt: { type: Date, default: Date.now },
    // Why the row exists (added 2026-11-16): 'game-deleted' (deleteGame) or
    // 'copy-removed' (updateGame dropped this Playnite copy by hand). null on
    // rows written before the field existed — either of the two.
    reason: { type: String, enum: ['game-deleted', 'copy-removed', null], default: null },
    // The DeletedGame snapshot this tombstone belongs to; null = no snapshot.
    deletedGameId: { type: mongoose.Schema.Types.ObjectId, default: null },
  };
}

function createPlayniteTombstoneSchema(mongoose) {
  const schema = new mongoose.Schema(playniteTombstoneDefinition(mongoose), { timestamps: false });
  schema.index({ householdId: 1, playniteId: 1 }, { unique: true });
  return schema;
}

/**
 * gamegeek `DeletedGame` — what a delete took, so it can be restored
 * (S-D1). One row per deleted game, written by the gateway's deleteGame
 * BEFORE the game and its player rows go. `game` and `players` are the raw
 * documents (ObjectIds and Dates kept as stored), so restore re-inserts them
 * as they were — same _id, same Playnite copies, same per-member state.
 * Removed again by restore. A manual-only game (no Playnite copy) gets a row
 * too: it has no tombstone, but it is just as restorable.
 */
function deletedGameDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/gamegeek/playniteTombstone: pass your own mongoose instance');
  }
  const { Schema } = mongoose;
  return {
    householdId: { type: String, required: true },
    // The deleted game's _id (restore re-uses it).
    gameId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, default: '' },
    // The Playnite ids whose tombstones restore clears.
    playniteIds: { type: [String], default: [] },
    game: { type: Schema.Types.Mixed, required: true },
    players: { type: [Schema.Types.Mixed], default: [] },
    deletedBy: { type: String, default: null },
    deletedAt: { type: Date, default: Date.now },
  };
}

function createDeletedGameSchema(mongoose) {
  // minimize:false keeps empty objects inside the snapshot as they were.
  const schema = new mongoose.Schema(deletedGameDefinition(mongoose), { timestamps: false, minimize: false });
  schema.index({ householdId: 1, deletedAt: -1 });
  schema.index({ householdId: 1, gameId: 1 });
  return schema;
}

module.exports = {
  playniteTombstoneDefinition,
  createPlayniteTombstoneSchema,
  deletedGameDefinition,
  createDeletedGameSchema,
};
