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
  };
}

function createPlayniteTombstoneSchema(mongoose) {
  const schema = new mongoose.Schema(playniteTombstoneDefinition(mongoose), { timestamps: false });
  schema.index({ householdId: 1, playniteId: 1 }, { unique: true });
  return schema;
}

module.exports = { playniteTombstoneDefinition, createPlayniteTombstoneSchema };
