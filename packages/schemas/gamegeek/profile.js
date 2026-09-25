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
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    platformsOwned: { type: [{ type: String, enum: PLATFORMS }], default: [] },
    defaultPlatform: { type: String, enum: [...PLATFORMS, null], default: null },
    steamId: { type: String, default: null }, // 64-bit SteamID, digits only
    lastSteamSyncAt: { type: Date, default: null },
  };
}

function createGameProfileSchema(mongoose) {
  return new mongoose.Schema(profileDefinition(mongoose), { timestamps: true });
}

module.exports = { profileDefinition, createGameProfileSchema };
