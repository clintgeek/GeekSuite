/**
 * gamegeek per-user `Profile`: custom shelves, saved filters, hardware,
 * storefront account ids. Same shelf/filter shape as BookGeek's profile.
 */
const { PLATFORMS } = require('./constants.js');

function profileDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/gamegeek/profile: pass your own mongoose instance');
  }
  const { Schema } = mongoose;
  return {
    householdId: { type: String, required: true },
    userId: { type: String, required: true, unique: true },
    customShelves: {
      type: [new Schema({ id: { type: String, required: true }, label: { type: String, required: true, maxlength: 60 } }, { _id: false })],
      default: [],
    },
    savedFilters: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            name: { type: String, required: true, maxlength: 80 },
            sortBy: String,
            sortDir: String,
            searchQuery: String,
            shelfFilter: String,
            platformFilter: String,
            ownedFilter: String,
            // The whole GameFilterInput (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §B1),
            // validated by the gateway. Absent on filters saved before it existed.
            filter: { type: Schema.Types.Mixed, default: undefined },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    platformsOwned: { type: [{ type: String, enum: PLATFORMS }], default: [] },
    defaultPlatform: { type: String, enum: [...PLATFORMS, null], default: null },
    // Last Playnite library import (apps/gamegeek/DOCS/PLAYNITE_IMPORT.md §Profile):
    // when it ran, when the export itself was generated, and how many entries it had.
    playnite: {
      lastImportAt: { type: Date, default: null },
      lastGeneratedAtUtc: { type: Date, default: null },
      lastTotal: { type: Number, default: null },
    },
  };
}

function createGameProfileSchema(mongoose) {
  return new mongoose.Schema(profileDefinition(mongoose), { timestamps: true });
}

module.exports = { profileDefinition, createGameProfileSchema };
