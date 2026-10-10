/**
 * newsgeek `Article` — one item from one feed: title, the feed's own excerpt
 * (capped at EXCERPT_MAX — never the article body), link and metadata.
 * Written by the backend's ingest worker only; the gateway reads it.
 * Collection `newsgeek.articles`, purged after ARTICLE_RETENTION_DAYS.
 *
 * Dedupe order (DOCS/NEWSGEEK_PLAN.md "Ingest"): `guid` within a source, then
 * `canonicalUrl`, then same source + same `titleKey` within 24h.
 *
 * `publisher` is who actually wrote it. For a direct feed it's the source's
 * name; for an aggregator item it's the item's <source> (never "Google News").
 */
const { EXCERPT_MAX } = require('./constants.js');

function articleDefinition(mongoose) {
  return {
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    feedUrl: { type: String, required: true },
    guid: { type: String, required: true, maxlength: 2000 },
    url: { type: String, required: true, maxlength: 4000 },
    canonicalUrl: { type: String, required: true, maxlength: 4000 },
    title: { type: String, required: true, maxlength: 500 },
    titleKey: { type: String, required: true },    // normalized title (dedupe + syndication)
    excerpt: { type: String, default: '', maxlength: EXCERPT_MAX },
    author: { type: String, default: null, maxlength: 200 },
    publisher: { type: String, required: true, maxlength: 200 },
    publisherDomain: { type: String, default: null, maxlength: 255 },
    publishedAt: { type: Date, required: true },   // feed date, or fetchedAt if absent/future
    fetchedAt: { type: Date, required: true },
    expiresAt: { type: Date, default: null },      // NWS alerts: leaves the briefing after this
    places: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    // N1 (clustering) fills these; N0 leaves them empty.
    embedding: {
      model: { type: String, default: null },
      vector: { type: [Number], default: undefined },
    },
    storyId: { type: mongoose.Schema.Types.ObjectId, default: null },
  };
}

function createArticleSchema(mongoose) {
  const schema = new mongoose.Schema(articleDefinition(mongoose), { timestamps: true });
  schema.index({ sourceId: 1, guid: 1 }, { unique: true });
  schema.index({ canonicalUrl: 1 });
  schema.index({ sourceId: 1, titleKey: 1, publishedAt: -1 });
  schema.index({ publishedAt: -1 });
  schema.index({ places: 1, publishedAt: -1 });
  schema.index({ storyId: 1 });
  return schema;
}

module.exports = { articleDefinition, createArticleSchema };
