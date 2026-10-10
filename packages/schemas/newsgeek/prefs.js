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
function prefsDefinition() {
  return {
    userId: { type: String, required: true },
    freeToReadOnly: { type: Boolean, default: false },
  };
}

function createPrefsSchema(mongoose) {
  if (!mongoose || !mongoose.Schema) throw new TypeError('@geeksuite/schemas/newsgeek/prefs: pass your own mongoose instance');
  const schema = new mongoose.Schema(prefsDefinition(), { timestamps: true });
  schema.index({ userId: 1 }, { unique: true });
  return schema;
}

module.exports = { prefsDefinition, createPrefsSchema };
