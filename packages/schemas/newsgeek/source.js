/**
 * newsgeek `Source` — a publisher (or official body, or aggregator query) and
 * its feeds. Shared by every user; admins manage it. The backend's ingest
 * worker writes each feed's poll state and health; the gateway reads it for
 * the Sources screen. Collection `newsgeek.sources`.
 *
 * A feed never dies quietly: `consecutiveFailures` reaching
 * BROKEN_AFTER_FAILURES flips the source to `broken`, and a feed that answers
 * but stops producing items is flagged `stale` (DOCS/NEWSGEEK_PLAN.md "Ingest").
 */
const {
  SOURCE_KINDS, SECTIONS, SOURCE_STATUSES, FEED_FORMATS, PAYWALLS, CONTENT_LEVELS,
} = require('./constants.js');

function feedDefinition() {
  return {
    url: { type: String, required: true, maxlength: 2000 },
    format: { type: String, enum: FEED_FORMATS, default: 'rss' },
    pollEveryMin: { type: Number, default: 15, min: 5 },
    // Conditional GET state.
    etag: { type: String, default: null },
    lastModified: { type: String, default: null },
    // Health.
    lastFetchAt: { type: Date, default: null },
    lastOkAt: { type: Date, default: null },
    lastItemAt: { type: Date, default: null },     // newest item publishedAt ever seen
    lastNewItemAt: { type: Date, default: null },  // when we last stored a NEW item
    consecutiveFailures: { type: Number, default: 0 },
    lastError: { type: String, default: null, maxlength: 500 },
    lastHttpStatus: { type: Number, default: null },
    stale: { type: Boolean, default: false },
    nextPollAt: { type: Date, default: null },
  };
}

function sourceDefinition(mongoose) {
  return {
    slug: { type: String, required: true, maxlength: 80 },
    name: { type: String, required: true, maxlength: 160 },
    homepage: { type: String, default: null, maxlength: 2000 },
    kind: { type: String, enum: SOURCE_KINDS, required: true },
    sections: { type: [{ type: String, enum: SECTIONS }], default: [] },
    places: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    feeds: { type: [new mongoose.Schema(feedDefinition(), { _id: true })], default: [] },
    status: { type: String, enum: SOURCE_STATUSES, default: 'discovered' },
    access: {
      paywall: { type: String, enum: PAYWALLS, default: 'none' },
      content: { type: String, enum: CONTENT_LEVELS, default: 'excerpt' },
    },
    // aggregator only: publisher domains whose items are dropped (weather.com
    // forecast pages answer Google News town searches).
    blockedDomains: { type: [String], default: [] },
    notes: { type: String, default: '', maxlength: 2000 },
  };
}

function createSourceSchema(mongoose) {
  const schema = new mongoose.Schema(sourceDefinition(mongoose), { timestamps: true });
  schema.index({ slug: 1 }, { unique: true });
  schema.index({ status: 1, 'feeds.nextPollAt': 1 });
  return schema;
}

module.exports = { feedDefinition, sourceDefinition, createSourceSchema };
