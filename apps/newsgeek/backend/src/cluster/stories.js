/**
 * Story assignment, the pure part — N1 phase 2 (apps/newsgeek/DOCS/CLUSTERING.md,
 * DOCS/NEWSGEEK_PLAN.md "Clustering"). No Mongo, no clock: the job
 * (jobs/storyAssigner.js) loads and writes; this decides which story an
 * article belongs to.
 *
 * A STORY is one real-world event as several outlets told it. Articles arrive
 * oldest first; each one either joins an open story or starts its own.
 *
 * The rule, leaning toward keeping stories apart (UNDER-MERGE: two cards for
 * one event is an annoyance, one card for two events is a lie):
 *
 * 1. SYNDICATION. An article whose `titleKey` an open story already holds
 *    joins it (AP copy on three stations). It is a COPY: it never adds a
 *    voice to the story's coverage.
 * 2. Otherwise the best open story by cosine to its CENTROID joins when
 *      cosine(article, centroid) ≥ JOIN, and
 *      cosine(article, seed)     ≥ SEED_FLOOR.
 *    The seed is the story's first article. The second test stops a story
 *    drifting: a running mean can walk from "Huang reinstated" to "markets
 *    today" one near-miss at a time, the seed cannot.
 * 3. A story is OPEN to an article published within WINDOW_MS (72 h) after
 *    the story's newest article and within MAX_SPAN_MS (7 days) of its first,
 *    so no story rolls on for ever.
 * 4. SOLO articles never join and are never joined: each is a story of one.
 *    - OFFICIAL ones (NWS alerts, agendas, press offices): a notice is not
 *      coverage.
 *    - Ones with too little text to compare (title + excerpt under
 *      MIN_TEXT_CHARS): "Happy Thanksgiving" from a town paper joined "Tell
 *      HN: Happy Thanksgiving" at 0.80. A syndicated copy (rule 1) is exempt:
 *      the same headline is the same story however short.
 *
 * Vectors are unit length (cluster/embeddings.js normalises them), so cosine
 * is a dot product. The centroid is kept as the running SUM of its members'
 * vectors; its direction is all that matters.
 *
 * JOIN and SEED_FLOOR were chosen on live data, 2026-11-27: the numbers are
 * beside them and in CLUSTERING.md "How the numbers were chosen". A change
 * only affects articles assigned afterwards.
 */

/**
 * cosine(article, centroid) to join. Read by hand on the stories live data
 * formed, 2026-11-27 (7 days, 5,600 articles): at 0.80 the multi-outlet
 * stories read as one event each; at 0.76 "tariffs on China" joined "tariffs
 * on Brazil". Pairwise (the October golden set, 200 pairs): 0.82 → P 97.5 %.
 */
export const JOIN = 0.8;
/** cosine(article, seed) to join: the drift guard. */
export const SEED_FLOOR = 0.74;
export const WINDOW_MS = 72 * 60 * 60 * 1000;
export const MAX_SPAN_MS = 7 * 24 * 60 * 60 * 1000;
/** A story remembers this many title keys (syndication) and outlets. */
export const KEYS_MAX = 200;
/** Title + excerpt shorter than this is too little to compare (rule 4). */
export const MIN_TEXT_CHARS = 40;

export function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) s += a[i] * b[i];
  return s;
}

/**
 * Who published it, as one comparable key: the name, lower case, without
 * "the", punctuation or a trailing ".com" — "The Arkadelphian" direct and
 * "Arkadelphian" through Google News are one outlet.
 */
export function outletKey(article) {
  const name = String(article.publisher || article.publisherDomain || '')
    .toLowerCase()
    .replace(/\.(com|org|net|gov|co\.uk)$/, '')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return name || `source:${String(article.sourceId || '')}`;
}

const ms = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/** A story as the clusterer holds it. `sum` is a Float64Array and `norm` its length, kept in step. */
export function newStory(id, article, { solo = false } = {}) {
  const at = ms(article.publishedAt);
  return {
    id,
    title: article.title || '',
    sum: Float64Array.from(article.vector),
    norm: Math.sqrt(dot(article.vector, article.vector)) || 1,
    seed: Float64Array.from(article.vector),
    articleCount: 1,
    outlets: [outletKey(article)],
    titleKeys: article.titleKey ? [article.titleKey] : [],
    firstArticleAt: at,
    lastArticleAt: at,
    solo,
    dirty: true,
    created: true,
  };
}

/** Is `story` open to an article published at `at` (rule 3)? */
export function isOpen(story, at, { windowMs = WINDOW_MS, maxSpanMs = MAX_SPAN_MS } = {}) {
  if (story.solo) return false;
  return at >= story.firstArticleAt - windowMs
    && at - story.lastArticleAt <= windowMs
    && at - story.firstArticleAt <= maxSpanMs;
}

/**
 * The story this article joins, or null (start a new one).
 * @returns {{ story, copy: boolean, cosine: number } | null}
 */
export function findStory(article, stories, {
  join = JOIN, seedFloor = SEED_FLOOR, windowMs = WINDOW_MS, maxSpanMs = MAX_SPAN_MS, copiesOnly = false,
} = {}) {
  const at = ms(article.publishedAt);
  let best = null;
  let bestCos = -1;
  for (const story of stories) {
    if (!isOpen(story, at, { windowMs, maxSpanMs })) continue;
    if (article.titleKey && story.titleKeys.includes(article.titleKey)) return { story, copy: true, cosine: 1 };
    const c = dot(article.vector, story.sum) / story.norm;
    if (c > bestCos) { bestCos = c; best = story; }
  }
  if (copiesOnly || !best || bestCos < join) return null;
  if (dot(article.vector, best.seed) < seedFloor) return null;
  return { story: best, copy: false, cosine: bestCos };
}

/** Add the article to the story (mutates it). A copy adds no voice. */
export function addToStory(story, article, { copy = false } = {}) {
  const at = ms(article.publishedAt);
  const v = article.vector;
  for (let i = 0; i < story.sum.length; i += 1) story.sum[i] += v[i];
  story.norm = Math.sqrt(dot(story.sum, story.sum)) || 1;
  story.articleCount += 1;
  story.firstArticleAt = Math.min(story.firstArticleAt, at);
  story.lastArticleAt = Math.max(story.lastArticleAt, at);
  if (!copy) {
    const outlet = outletKey(article);
    if (!story.outlets.includes(outlet) && story.outlets.length < KEYS_MAX) story.outlets.push(outlet);
    if (article.titleKey && !story.titleKeys.includes(article.titleKey) && story.titleKeys.length < KEYS_MAX) story.titleKeys.push(article.titleKey);
  }
  story.dirty = true;
  return story;
}

/**
 * Assign a batch. `articles` must be sorted oldest first; `stories` is the
 * open set (mutated: joined stories change, new ones are appended).
 * @param {object} o
 * @param {Array<{ _id, vector, publishedAt, title, titleKey, publisher, publisherDomain, sourceId }>} o.articles
 * @param {object[]} o.stories
 * @param {(article) => boolean} [o.isOfficial]
 * @param {() => any} o.newId   a fresh story id
 *   An article may carry `textLength` (title + excerpt); absent = long enough.
 * @returns {Array<{ articleId, storyId, joined: boolean, copy: boolean }>}
 */
export function assignBatch({ articles, stories, isOfficial = () => false, newId, options }) {
  const out = [];
  for (const article of articles) {
    const official = isOfficial(article);
    const short = Number.isFinite(article.textLength) && article.textLength < MIN_TEXT_CHARS;
    const hit = official ? null : findStory(article, stories, { ...options, copiesOnly: short });
    if (hit) {
      addToStory(hit.story, article, { copy: hit.copy });
      out.push({ articleId: article._id, storyId: hit.story.id, joined: true, copy: hit.copy });
    } else {
      const story = newStory(newId(), article, { solo: official || short });
      stories.push(story);
      out.push({ articleId: article._id, storyId: story.id, joined: false, copy: false });
    }
  }
  return out;
}

export default { JOIN, SEED_FLOOR, WINDOW_MS, MAX_SPAN_MS, MIN_TEXT_CHARS, dot, outletKey, newStory, isOpen, findStory, addToStory, assignBatch };
