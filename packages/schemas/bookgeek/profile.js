/**
 * bookgeek `Profile` — per-user data in an otherwise shared library: the
 * Kindle address, the device-basket secret word, custom shelves and saved
 * library filters. Single source of truth for the field set.
 *
 * Two writers share the `bookgeek.profiles` collection:
 *   1. basegeek's GraphQL gateway (graphql/bookgeek/models/profile.js) — every
 *      profile read and write the web app makes.
 *   2. bookgeek's own API (apps/bookgeek/api/src/models/profile.js) — reads
 *      `kindleEmail` for send-to-Kindle and `deviceWord` for /download-basket.
 *
 * Mongoose strict mode silently DROPS unknown paths on `$set`/`$push` (how
 * fitnessgeek lost its keto config in April 2026), so both models build from
 * this factory. Add a field here, never in either model.
 *
 * Reproduces the two hand-kept copies exactly as they stood at 48a1397a,
 * including what looks accidental: `customShelves` and `savedFilters` entries
 * are implicit sub-documents, so each carries its own `_id` (real profiles
 * have them). Changing that is a data change, not a tidy-up.
 *
 * Takes the caller's mongoose and neither opens a connection nor registers a
 * model.
 *
 * 2026-09-25 (C2): `savedFilters[].filter` added — additive; old documents
 * simply lack it.
 */

function profileDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/bookgeek/profile: pass your own mongoose instance');
  }
  return {
    userId: { type: String, required: true, unique: true },
    kindleEmail: { type: String },
    // Personal "secret word" typed on a device keyboard at /download-basket to
    // resolve the user's newest active basket. Deliberately low-security.
    deviceWord: { type: String, lowercase: true, trim: true },
    // User-defined shelves. `id` is "custom-<slug>" and is what gets written
    // to Book.shelf; `label` is what the UI shows.
    customShelves: [
      {
        id: { type: String, required: true },
        label: { type: String, required: true },
      },
    ],
    savedFilters: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        sortBy: { type: String },
        sortDir: { type: String },
        searchQuery: { type: String },
        authorFilter: { type: String },
        tagFilter: { type: String },
        shelfFilter: { type: String },
        ownedOnly: { type: Boolean },
        ownedFilter: { type: String },
        // The whole BookFilterInput the view was saved with (Phase C2 of
        // DOCS/BOOKGEEK_CLEANUP_PLAN.md), validated by the gateway. Absent on
        // views saved before it existed — those still open through the legacy
        // fields above (web/src/utils/libraryFilter.js `savedViewSearch`).
        filter: { type: mongoose.Schema.Types.Mixed, default: undefined },
      },
    ],
  };
}

const profileSchemaOptions = Object.freeze({ timestamps: true });

function createBookProfileSchema(mongoose) {
  const schema = new mongoose.Schema(profileDefinition(mongoose), { ...profileSchemaOptions });
  // Sparse so profiles without a deviceWord don't collide on the missing value.
  schema.index({ deviceWord: 1 }, { unique: true, sparse: true });
  return schema;
}

module.exports = { profileDefinition, profileSchemaOptions, createBookProfileSchema };
