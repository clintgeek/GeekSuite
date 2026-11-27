/**
 * newsgeek `Story` — one real-world event as several outlets told it (N1
 * phase 2, apps/newsgeek/DOCS/CLUSTERING.md). Written by the backend's story
 * assigner only. The gateway never reads this collection: it groups articles
 * by `Article.storyId` and counts the outlets among the articles the reader
 * can see. Collection `newsgeek.stories`.
 *
 * `sum` is the running SUM of the member articles' unit vectors (its
 * direction is the centroid) and `seed` the first article's vector: the two
 * things a new article is compared with. A story of one article stores no
 * `seed` (it is its `sum`). Both are dropped once the story can no longer be
 * joined (jobs/purge.js), so an old story is a few hundred bytes.
 */
function storyDefinition() {
  return {
    title: { type: String, default: '', maxlength: 500 },     // the first article's headline; never shown, for an operator's eyes
    model: { type: String, required: true },                  // the embedding model of `sum` and `seed`
    sum: { type: [Number], default: undefined },
    seed: { type: [Number], default: undefined },
    articleCount: { type: Number, default: 1 },
    outlets: { type: [String], default: [] },                 // distinct publisher keys; syndicated copies add none
    titleKeys: { type: [String], default: [] },               // the syndication test: a known key is a copy
    firstArticleAt: { type: Date, required: true },
    lastArticleAt: { type: Date, required: true },
    // A story of one, never joined: an official notice (NWS alert, agenda,
    // press office), or an article with too little text to compare.
    solo: { type: Boolean, default: false },
  };
}

function createStorySchema(mongoose) {
  const schema = new mongoose.Schema(storyDefinition(), { timestamps: true });
  schema.index({ lastArticleAt: -1 });
  return schema;
}

module.exports = { storyDefinition, createStorySchema };
