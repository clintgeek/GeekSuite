/**
 * gamegeek `Game` — the household catalog entry. Single source of truth for
 * the field set; DOCS/GameGeekPlan.md §3.
 *
 * Two writers share the `gamegeek.games` collection:
 *   1. basegeek's GraphQL gateway (graphql/gamegeek/) — all plain data.
 *   2. gamegeek's backend (apps/gamegeek/backend) — covers and imports only.
 * Both build their model from this factory, so the fields cannot drift
 * (BookGeek's hand-synced `Book` copies are the cautionary tale).
 *
 * Personal state (shelf, rating, hours) is NOT here — see gamePlayer.js.
 */
const { PLATFORMS, STOREFRONTS, COPY_FORMATS, GAME_MODES, GAME_SOURCES, ENRICHMENT_STATUSES, ENRICHMENT_PROVIDERS, bounds } = require('./constants.js');

function gameDefinition(mongoose) {
  if (!mongoose || !mongoose.Schema) {
    throw new TypeError('@geeksuite/schemas/gamegeek/game: pass your own mongoose instance');
  }
  const { Schema } = mongoose;

  const copySchema = new Schema(
    {
      platform: { type: String, enum: PLATFORMS, required: true },
      format: { type: String, enum: COPY_FORMATS, default: 'digital' },
      storefront: { type: String, enum: STOREFRONTS, default: null },
      acquiredAt: { type: Date, default: null }, // calendar date, UTC midnight
      notes: { type: String, maxlength: 500, default: '' },
      // Set when the copy came from a Playnite export (DOCS/GameGeekPlan.md §15).
      // playniteId is the stable key a re-import updates by; one Game can hold
      // several Playnite entries (the same title owned on Epic and GOG).
      playnite: {
        type: new Schema(
          {
            playniteId: { type: String, required: true },
            providerGameId: { type: String, default: null },
            sourceName: { type: String, default: null },
            playtimeSeconds: { type: Number, default: 0 },
            lastActivity: { type: Date, default: null },
            hidden: { type: Boolean, default: false },
            // Playnite's own "installed on this machine" (PLAYNITE_IMPORT.md
            // §Installed → Playing). null = not yet known (imported before
            // the field existed); the next import fills it.
            isInstalled: { type: Boolean, default: null },
            // When an import last saw isInstalled flip (either way). Compared
            // against GamePlayer.installFlagDismissedAt so "Still playing" is
            // not re-flagged until the game is installed-then-uninstalled again.
            installedChangedAt: { type: Date, default: null },
          },
          { _id: false }
        ),
        default: null,
      },
    },
    { _id: true }
  );

  return {
    householdId: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: bounds.title.maxlength },
    sortTitle: { type: String, default: '' },
    parentId: { type: Schema.Types.ObjectId, default: null },
    series: {
      name: { type: String, default: null },
      index: { type: Number, default: null },
    },
    developers: { type: [String], default: [] },
    publishers: { type: [String], default: [] },
    releaseDate: { type: Date, default: null }, // calendar date, UTC midnight
    description: { type: String, maxlength: bounds.description.maxlength, default: '' },
    genres: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    // Enrichment-derived tags from the canonical vocabulary (./tags.js) — never
    // the user's own; apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §A3. Filters and
    // the Tags facet read tags ∪ autoTags.
    autoTags: { type: [String], default: [] },
    modes: { type: [{ type: String, enum: GAME_MODES }], default: [] },
    maxLocalPlayers: { type: Number, default: null },
    platformsAvailable: { type: [String], default: [] },
    timeToBeat: {
      main: { type: Number, default: null },
      extra: { type: Number, default: null },
      complete: { type: Number, default: null },
    },
    coverPath: { type: String, default: null }, // file name under COVERS_PATH; never a URL
    externalIds: {
      igdb: { type: String, default: null },
      steamAppId: { type: String, default: null },
      rawg: { type: String, default: null },
      gog: { type: String, default: null },
      epic: { type: String, default: null },
    },
    copies: { type: [copySchema], default: [] },
    owned: { type: Boolean, default: false },
    source: { type: String, enum: GAME_SOURCES, default: 'manual' },
    createdBy: { type: String, default: null },
    // Metadata/cover enrichment record — apps/gamegeek/DOCS/METADATA_ENRICHMENT.md.
    // `filled` names exactly the fields enrichment wrote, so an unlink can undo them.
    enrichment: {
      type: new Schema(
        {
          status: { type: String, enum: ENRICHMENT_STATUSES, default: 'pending' },
          provider: { type: String, enum: [...ENRICHMENT_PROVIDERS, null], default: null },
          providerId: { type: String, default: null },
          matchedTitle: { type: String, default: null },
          filled: { type: [String], default: [] },
          // { <field path>: sha256-16 of the value enrichment wrote }. An unlink
          // clears a filled field only while it still hashes the same, so an
          // edit made after the match survives the unlink.
          filledHashes: { type: Schema.Types.Mixed, default: null },
          // Platforms enrichment unioned into platformsAvailable (unlink pulls them).
          addedPlatforms: { type: [String], default: [] },
          coverFromEnrichment: { type: Boolean, default: false },
          manual: { type: Boolean, default: false },
          attempts: { type: Number, default: 0 },
          lastTriedAt: { type: Date, default: null },
          matchedAt: { type: Date, default: null },
          error: { type: String, maxlength: 300, default: null },
          providersTried: { type: [String], default: [] },
          // The tags pass (TAGS_AND_FILTERS.md §A4): when it last ran for this
          // match, and which providers supplied terms.
          tagsFetchedAt: { type: Date, default: null },
          tagSources: { type: [String], default: [] },
        },
        { _id: false }
      ),
      default: null,
    },
  };
}

/** "The Legend of Zelda" → "legend of zelda, the" — lowercased for a stable sort. */
function computeSortTitle(title) {
  const t = String(title || '').trim();
  const m = t.match(/^(the|a|an)\s+(.+)$/i);
  return (m ? `${m[2]}, ${m[1]}` : t).toLowerCase();
}

function createGameSchema(mongoose) {
  const schema = new mongoose.Schema(gameDefinition(mongoose), { timestamps: true });

  schema.pre('validate', function gameDerived(next) {
    // A new document keeps a sortTitle its writer supplied (the Playnite import
    // carries the store's own `sortingName`); a rename always recomputes it.
    const keepSupplied = this.isNew && this.sortTitle;
    if (!keepSupplied && (this.isModified('title') || !this.sortTitle)) this.sortTitle = computeSortTitle(this.title);
    this.owned = Array.isArray(this.copies) && this.copies.length > 0;
    next();
  });

  // Every index leads with the tenant. External ids are unique PER HOUSEHOLD,
  // never globally — two households can own the same game.
  schema.index({ householdId: 1, sortTitle: 1 });
  schema.index({ householdId: 1, createdAt: -1 });
  schema.index({ householdId: 1, 'enrichment.status': 1 });
  schema.index(
    { householdId: 1, 'externalIds.steamAppId': 1 },
    { unique: true, partialFilterExpression: { 'externalIds.steamAppId': { $type: 'string' } } }
  );
  schema.index(
    { householdId: 1, 'copies.playnite.playniteId': 1 },
    { partialFilterExpression: { 'copies.playnite.playniteId': { $type: 'string' } } }
  );
  schema.index(
    { householdId: 1, 'externalIds.igdb': 1 },
    { unique: true, partialFilterExpression: { 'externalIds.igdb': { $type: 'string' } } }
  );
  return schema;
}

module.exports = { gameDefinition, createGameSchema, computeSortTitle };
