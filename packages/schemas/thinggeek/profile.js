/** thinggeek per-user profile: saved views (the @geeksuite/collection shape) and prefs. */
function profileDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) throw new TypeError('@geeksuite/schemas/thinggeek/profile: pass your own mongoose instance');
  const { Schema } = mongoose;
  return {
    householdId: { type: String, required: true },
    userId: { type: String, required: true, unique: true },
    savedFilters: {
      type: [new Schema({
        id: { type: String, required: true },
        name: { type: String, required: true, maxlength: 80 },
        filter: { type: Schema.Types.Mixed, default: {} },
        sortBy: { type: String, default: null },
        sortDir: { type: String, default: null },
      }, { _id: false })],
      default: [],
    },
    starterTypesSeededAt: { type: Date, default: null },
    // The STARTER_TYPES_VERSION this household's types were seeded or upgraded
    // to. Unset on a profile seeded before containment (= version 1).
    starterTypesVersion: { type: Number, default: null },
  };
}
function createThingProfileSchema(mongoose) {
  return new mongoose.Schema(profileDefinition(mongoose), { timestamps: true, minimize: false });
}
module.exports = { profileDefinition, createThingProfileSchema };
