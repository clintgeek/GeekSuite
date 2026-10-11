/**
 * Golden-set candidate pairs (N1 clustering, phase 1). The plan: "A golden
 * set before tuning" — JOIN is chosen from labelled live pairs, never guessed.
 * Design + runbook: apps/newsgeek/DOCS/CLUSTERING.md.
 *
 * From the articles published in a window (default 7 days) that have a
 * vector for the current model, we form PAIRS that clustering would actually
 * have to decide:
 *   - from DIFFERENT outlets (publisherDomain, else publisher, else source):
 *     one outlet's two stories are never coverage of each other, and an
 *     aggregator's items count under their real publisher, so AP vs Reuters
 *     out of one Google News search IS a pair;
 *   - published within 72 h of each other (the plan's candidate window);
 *   - not already the same titleKey (display dedupe handles those) unless
 *     `includeExact`.
 * Every pair gets a cosine, and a STRATIFIED sample is kept across cosine
 * bands (≥0.90 … 0.60–0.70) so the labels cover the decision boundary instead
 * of being 95 % obvious "different". Pairs under the lowest band are not
 * sampled (assumed different; documented as a recall blind spot).
 *
 * Each sampled pair carries `weight` = (pairs in its band) / (pairs sampled
 * from its band), so evaluate.js can turn the stratified sample back into
 * population precision/recall.
 *
 * COST (bounded): articles are sorted by time and each one is compared only
 * with the later ones inside 72 h (a sliding window), so comparisons are
 * n × (articles per 72 h) / 1, not n². Production (660/day, 7 days): ~4,600
 * articles × ≤ ~2,000 neighbours ≈ 9 M dot products of 1,024 floats, a few
 * seconds of CPU on Float32Arrays. `maxComparisons` (default 25 M) is a hard
 * stop; when it trips, `stats.truncated` is true and the sample is from the
 * earlier part of the window. Memory: the vectors (n × 4 KB ≈ 19 MB) plus
 * one reservoir of `total` pairs per band — the full pair list is never held.
 */

export const DEFAULT_BANDS = Object.freeze([
  Object.freeze({ label: '>=0.90', min: 0.90, max: Infinity }),
  Object.freeze({ label: '0.85-0.90', min: 0.85, max: 0.90 }),
  Object.freeze({ label: '0.80-0.85', min: 0.80, max: 0.85 }),
  Object.freeze({ label: '0.75-0.80', min: 0.75, max: 0.80 }),
  Object.freeze({ label: '0.70-0.75', min: 0.70, max: 0.75 }),
  Object.freeze({ label: '0.60-0.70', min: 0.60, max: 0.70 }),
]);

export const DEFAULT_WINDOW_HOURS = 72;
export const DEFAULT_TOTAL = 200;
export const DEFAULT_MAX_COMPARISONS = 25_000_000;
export const EXCERPT_PREVIEW = 200;
const HOUR_MS = 3_600_000;

/** Seeded PRNG (mulberry32), so an export is reproducible with --seed. */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Who wrote it, for "different sources": publisher domain, else publisher name, else the source. */
export function outletKey(article) {
  return String(article.publisherDomain || article.publisher || article.sourceId || '').trim().toLowerCase();
}

function unit(vec) {
  const out = Float32Array.from(vec);
  let s = 0;
  for (let i = 0; i < out.length; i += 1) s += out[i] * out[i];
  const n = Math.sqrt(s) || 1;
  for (let i = 0; i < out.length; i += 1) out[i] /= n;
  return out;
}

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) s += a[i] * b[i];
  return s;
}

function bandIndex(c, bands) {
  for (let i = 0; i < bands.length; i += 1) if (c >= bands[i].min && c < bands[i].max) return i;
  return -1;
}

/**
 * Split `total` across bands as evenly as their populations allow: an equal
 * share each, and whatever a thin band can't use goes to the others.
 */
export function allocate(total, available) {
  const quota = available.map(() => 0);
  let left = Math.min(total, available.reduce((n, x) => n + x, 0));
  while (left > 0) {
    const open = available.map((a, i) => (a > quota[i] ? i : -1)).filter((i) => i >= 0);
    if (!open.length) break;
    const share = Math.max(1, Math.floor(left / open.length));
    for (const i of open) {
      if (left <= 0) break;
      const take = Math.min(share, available[i] - quota[i], left);
      quota[i] += take;
      left -= take;
    }
  }
  return quota;
}

function side(a) {
  const excerpt = String(a.excerpt || '');
  return {
    id: String(a.id),
    source: a.source ?? null,
    publisher: a.publisher ?? null,
    title: a.title,
    excerpt: excerpt.length > EXCERPT_PREVIEW ? `${excerpt.slice(0, EXCERPT_PREVIEW - 1).trimEnd()}…` : excerpt,
    publishedAt: new Date(a.publishedAt).toISOString(),
    url: a.url ?? null,
  };
}

/**
 * Generate the stratified candidate sample (pure; no database).
 *
 * @param {Array<{ id, sourceId, source, publisher, publisherDomain, title, titleKey, excerpt,
 *   publishedAt, url, vector: number[], placeSlugs?: string[] }>} articles
 *   `placeSlugs`: the places the article's TEXT names (not inherited from its source).
 * @param {object} [opts]
 * @returns {{ pairs: object[], stats: object }}
 */
export function generateCandidates(articles, {
  windowHours = DEFAULT_WINDOW_HOURS,
  bands = DEFAULT_BANDS,
  total = DEFAULT_TOTAL,
  includeExact = false,
  maxComparisons = DEFAULT_MAX_COMPARISONS,
  seed = 1,
} = {}) {
  const rng = makeRng(seed);
  const windowMs = windowHours * HOUR_MS;
  const rows = articles
    .filter((a) => Array.isArray(a.vector) || ArrayBuffer.isView(a.vector))
    .map((a) => ({ ...a, t: new Date(a.publishedAt).getTime(), v: unit(a.vector), outlet: outletKey(a) }))
    .sort((x, y) => x.t - y.t);

  const population = bands.map(() => 0);
  const reservoirs = bands.map(() => []);
  let comparisons = 0;
  let truncated = false;
  let skippedSameOutlet = 0;
  let skippedExact = 0;

  outer:
  for (let i = 0; i < rows.length; i += 1) {
    const a = rows[i];
    for (let j = i + 1; j < rows.length; j += 1) {
      const b = rows[j];
      if (b.t - a.t > windowMs) break; // sorted: everything after is further
      if (a.outlet === b.outlet) { skippedSameOutlet += 1; continue; }
      if (!includeExact && a.titleKey && a.titleKey === b.titleKey) { skippedExact += 1; continue; }
      if (comparisons >= maxComparisons) { truncated = true; break outer; }
      comparisons += 1;
      const c = dot(a.v, b.v);
      const k = bandIndex(c, bands);
      if (k < 0) continue;
      population[k] += 1;
      // Reservoir sample of up to `total` per band (Algorithm R).
      const res = reservoirs[k];
      if (res.length < total) res.push({ a, b, c });
      else {
        const r = Math.floor(rng() * population[k]);
        if (r < total) res[r] = { a, b, c };
      }
    }
  }

  const quota = allocate(total, reservoirs.map((r) => r.length));
  const pairs = [];
  bands.forEach((band, k) => {
    // Shuffle before taking the quota: a reservoir that never filled is in
    // stream (time) order, and a prefix of it would be the window's oldest.
    const res = reservoirs[k];
    for (let i = res.length - 1; i > 0; i -= 1) {
      const r = Math.floor(rng() * (i + 1));
      [res[i], res[r]] = [res[r], res[i]];
    }
    const chosen = res.slice(0, quota[k]);
    const weight = chosen.length ? population[k] / chosen.length : 0;
    for (const { a, b, c } of chosen) {
      const [x, y] = String(a.id) < String(b.id) ? [a, b] : [b, a];
      const placesB = new Set(b.placeSlugs || []);
      pairs.push({
        pairId: `${x.id}:${y.id}`,
        a: side(x),
        b: side(y),
        cosine: Math.round(c * 10_000) / 10_000,
        hoursApart: Math.round((Math.abs(b.t - a.t) / HOUR_MS) * 10) / 10,
        sharedPlaces: [...new Set((a.placeSlugs || []).filter((s) => placesB.has(s)))].sort(),
        band: band.label,
        weight: Math.round(weight * 1000) / 1000,
        label: null,
      });
    }
  });
  // Shuffled, so the labeller doesn't read the bands in cosine order.
  for (let i = pairs.length - 1; i > 0; i -= 1) {
    const r = Math.floor(rng() * (i + 1));
    [pairs[i], pairs[r]] = [pairs[r], pairs[i]];
  }

  return {
    pairs,
    stats: {
      articles: rows.length,
      comparisons,
      truncated,
      skippedSameOutlet,
      skippedExact,
      bands: bands.map((band, k) => ({ band: band.label, population: population[k], sampled: quota[k] })),
    },
  };
}

/**
 * Read the window's articles (with vectors for `model`) from Mongo and shape
 * them for generateCandidates. `placeSlugs` are re-matched from the text
 * with the article's source places as CONTEXT only (ingest's own rule), and
 * state/country places are dropped: two stories both saying "Arkansas" is
 * not evidence of one event, and two Little Rock stations inherit Little
 * Rock on every story.
 */
export async function loadCandidateArticles({ Article, Source, Place, model, since, until = new Date(), buildPlaceMatcher }) {
  const [articles, sources, places] = await Promise.all([
    Article.find({
      publishedAt: { $gte: since, $lte: until },
      'embedding.model': model,
      'embedding.vector.0': { $exists: true },
    }, {
      sourceId: 1, publisher: 1, publisherDomain: 1, title: 1, titleKey: 1, excerpt: 1, publishedAt: 1, url: 1, 'embedding.vector': 1,
    }).lean(),
    Source.find({}, { slug: 1, places: 1 }).lean(),
    Place.find({}, { slug: 1, name: 1, aliases: 1, parentId: 1, kind: 1 }).lean(),
  ]);
  const sourceById = new Map(sources.map((s) => [String(s._id), s]));
  const placeById = new Map(places.map((p) => [String(p._id), p]));
  const matcher = buildPlaceMatcher(places);
  return articles.map((a) => {
    const src = sourceById.get(String(a.sourceId));
    const ids = matcher.match(`${a.title} \n ${a.excerpt || ''}`, (src?.places || []).map(String));
    const placeSlugs = ids
      .map((id) => placeById.get(String(id)))
      .filter((p) => p && p.kind !== 'state' && p.kind !== 'country')
      .map((p) => p.slug);
    return {
      id: a._id,
      sourceId: a.sourceId,
      source: src?.slug ?? null,
      publisher: a.publisher,
      publisherDomain: a.publisherDomain,
      title: a.title,
      titleKey: a.titleKey,
      excerpt: a.excerpt,
      publishedAt: a.publishedAt,
      url: a.url,
      vector: a.embedding.vector,
      placeSlugs,
    };
  });
}

export default { generateCandidates, loadCandidateArticles, allocate, outletKey, makeRng, DEFAULT_BANDS };
