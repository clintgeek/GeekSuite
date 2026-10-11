/**
 * newsgeek per-reader prefs. One row per suite user, created on the first
 * write; a user with no row gets the defaults. Collection `newsgeek.prefs`.
 *
 * `freeToReadOnly`: the "Free to read" switch. On → stories that need a
 * subscription (metered or hard, see ./paywalls.js) are left out of the
 * reader's lists. Off (the default) → everything shows. Nothing is deleted.
 *
 * DOCS/NEWSGEEK_PLAN.md "Data model" lists the prefs N2 will add (follows,
 * mutes); they belong here too.
 *
 * Front page (Chef, 2026-10-11; plan "Ranking: the front page"):
 * - `homePlaces`: the reader's ring, ORDERED closest first (place ids). A story
 *   tagged with a ring place, or a place inside one, is Local for this reader.
 * - `favoriteSourceIds` / `lessSourceIds`: a source's priority (a source is in
 *   at most one; Normal = neither).
 * - `sectionQuotas`: per-section caps for Today; a missing key = the default
 *   (SECTION_QUOTA_DEFAULTS). Caps, never targets.
 */
const READER_LINKS_MAX = 5;
const READER_LINK_LABEL_MAX = 40;
const READER_LINK_TEMPLATE_MAX = 500;
// Source sheet (Chef, 2026-10-10): publisher domains a reader subscribes to
// (kept through "Free to read") or hides (aggregator items only).
const SUBSCRIBED_DOMAINS_MAX = 100;
const MUTED_DOMAINS_MAX = 200;
// Front page (2026-10-11).
const HOME_PLACES_MAX = 12;
const PRIORITY_SOURCES_MAX = 500;
const SECTION_QUOTA_DEFAULTS = Object.freeze({ local: 8, state: 5, national: 5, world: 3, tech: 4 });
const SECTION_QUOTA_MAX = 20;

function prefsDefinition() {
  return {
    userId: { type: String, required: true },
    freeToReadOnly: { type: Boolean, default: false },
    // Per-reader source switches (DOCS/NEWSGEEK_PLAN.md "Reader-added sources"):
    // sourcesOn turns on a source that is off by default for this reader;
    // sourcesOff turns off one that would otherwise show. Source ids.
    sourcesOn: { type: [String], default: [] },
    sourcesOff: { type: [String], default: [] },
    // "Open with…" links (Chef, 2026-10-10): the reader's own link templates,
    // e.g. https://example.com/read?u={url}. Placeholders {url} (required) and
    // {title}. Stored only; nothing ever fetches them. The gateway validates
    // (scheme, placeholders, lengths); these limits are the backstop.
    readerLinks: {
      type: [{
        _id: false,
        label: { type: String, required: true, maxlength: READER_LINK_LABEL_MAX },
        template: { type: String, required: true, maxlength: READER_LINK_TEMPLATE_MAX },
      }],
      default: [],
      validate: { validator: (v) => !v || v.length <= READER_LINKS_MAX, message: `at most ${READER_LINKS_MAX} reader links` },
    },
    // Source sheet (Chef, 2026-10-10; plan "Source sheet"):
    // subscribedSourceIds: sources this reader pays for — "Free to read" keeps
    //   their articles even when the source is paywalled.
    // subscribedDomains: the same for aggregator (Google News) items, by the
    //   publisher's domain (lower-case host, no www.; subdomains match).
    // mutedDomains: aggregator items from these publishers never show for this
    //   reader. Direct sources are switched off per source, never by domain.
    subscribedSourceIds: { type: [String], default: [] },
    subscribedDomains: {
      type: [String],
      default: [],
      validate: { validator: (v) => !v || v.length <= SUBSCRIBED_DOMAINS_MAX, message: `at most ${SUBSCRIBED_DOMAINS_MAX} subscribed domains` },
    },
    mutedDomains: {
      type: [String],
      default: [],
      validate: { validator: (v) => !v || v.length <= MUTED_DOMAINS_MAX, message: `at most ${MUTED_DOMAINS_MAX} hidden domains` },
    },
    homePlaces: {
      type: [String],
      default: [],
      validate: { validator: (v) => !v || v.length <= HOME_PLACES_MAX, message: `at most ${HOME_PLACES_MAX} home places` },
    },
    favoriteSourceIds: {
      type: [String],
      default: [],
      validate: { validator: (v) => !v || v.length <= PRIORITY_SOURCES_MAX, message: `at most ${PRIORITY_SOURCES_MAX} favorite sources` },
    },
    lessSourceIds: {
      type: [String],
      default: [],
      validate: { validator: (v) => !v || v.length <= PRIORITY_SOURCES_MAX, message: `at most ${PRIORITY_SOURCES_MAX} less-often sources` },
    },
    // Overrides only; a missing key reads as SECTION_QUOTA_DEFAULTS.
    sectionQuotas: {
      local: { type: Number, min: 0, max: SECTION_QUOTA_MAX, default: undefined },
      state: { type: Number, min: 0, max: SECTION_QUOTA_MAX, default: undefined },
      national: { type: Number, min: 0, max: SECTION_QUOTA_MAX, default: undefined },
      world: { type: Number, min: 0, max: SECTION_QUOTA_MAX, default: undefined },
      tech: { type: Number, min: 0, max: SECTION_QUOTA_MAX, default: undefined },
    },
  };
}

function createPrefsSchema(mongoose) {
  if (!mongoose || !mongoose.Schema) throw new TypeError('@geeksuite/schemas/newsgeek/prefs: pass your own mongoose instance');
  const schema = new mongoose.Schema(prefsDefinition(), { timestamps: true });
  schema.index({ userId: 1 }, { unique: true });
  return schema;
}

module.exports = {
  prefsDefinition, createPrefsSchema, READER_LINKS_MAX, READER_LINK_LABEL_MAX, READER_LINK_TEMPLATE_MAX,
  SUBSCRIBED_DOMAINS_MAX, MUTED_DOMAINS_MAX,
  HOME_PLACES_MAX, PRIORITY_SOURCES_MAX, SECTION_QUOTA_DEFAULTS, SECTION_QUOTA_MAX,
};
