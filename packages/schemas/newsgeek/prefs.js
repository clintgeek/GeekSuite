/**
 * newsgeek per-reader prefs. One row per suite user, created on the first
 * write; a user with no row gets the defaults. Collection `newsgeek.prefs`.
 *
 * `freeToReadOnly`: the "Free to read" switch. On → stories that need a
 * subscription (metered or hard, see ./paywalls.js) are left out of the
 * reader's lists. Off (the default) → everything shows. Nothing is deleted.
 *
 * DOCS/NEWSGEEK_PLAN.md "Data model" lists the prefs N2 will add (home
 * places, quotas, follows, mutes); they belong here too.
 */
const READER_LINKS_MAX = 5;
const READER_LINK_LABEL_MAX = 40;
const READER_LINK_TEMPLATE_MAX = 500;

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
};
