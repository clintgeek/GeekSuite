/**
 * Mongo query helpers for a collection's list and facet queries, shared by
 * the gateway's GameGeek and (next) BookGeek resolvers.
 *
 * Nothing here knows a domain: field paths come in as arguments. Nothing here
 * scopes a tenant either — the app resolver builds the household/user base
 * `$match` and puts it first in its pipeline, before anything from here.
 *
 * The pattern (GameGeek's, apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §B1):
 *   1. The app turns its filter input into CONDITIONS: one entry per active
 *      dimension, keyed by the facet it belongs to, `{ stage?, match }`.
 *      `stage` is free-form (GameGeek tags 'game' vs 'player' so it can match
 *      game fields before a per-user $lookup).
 *   2. The list query ANDs them all (`matchOf(conditions)`), sorts with
 *      `nullsLastSort`, and pages with `pageFacetStage`.
 *   3. The facet query runs ONE `$facet` (`buildFacetStage`) in which each
 *      facet's counts apply every condition EXCEPT its own — so picking one
 *      store still shows what the other stores would give.
 */

const SEARCH_TERM_MAX = 200;

/** Escaped + bounded, so a user search term is a literal, not a ReDoS. */
export function searchRegex(value, { max = SEARCH_TERM_MAX } = {}) {
  return String(value)
    .slice(0, max)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A case-insensitive "contains" search over several fields:
 * `{ $or: [{ title: { $regex, $options: 'i' } }, …] }`, or null for a blank term.
 */
export function buildSearchFilter(q, fields) {
  const term = q == null ? '' : String(q).trim();
  if (!term) return null;
  const needle = searchRegex(term);
  return { $or: fields.map((f) => ({ [f]: { $regex: needle, $options: 'i' } })) };
}

/** Any-of (or, with `all`, every-of) over an array or scalar field. */
export function inList(path, values, { all = false } = {}) {
  return { [path]: all ? { $all: values } : { $in: values } };
}

/** A calendar-year range over a Date field (UTC): `min`-01-01 ≤ date < (`max`+1)-01-01. Null when open both ends. */
export function yearRange(path, min, max) {
  const range = {};
  if (min !== undefined && min !== null) range.$gte = new Date(Date.UTC(min, 0, 1));
  if (max !== undefined && max !== null) range.$lt = new Date(Date.UTC(max + 1, 0, 1));
  return Object.keys(range).length ? { [path]: range } : null;
}

/** An inclusive numeric range. Null when open both ends. */
export function numberRange(path, min, max) {
  const range = {};
  if (min !== undefined && min !== null) range.$gte = min;
  if (max !== undefined && max !== null) range.$lte = max;
  return Object.keys(range).length ? { [path]: range } : null;
}

/**
 * `{$and: [...]}` of the chosen conditions, or `{}` when none.
 * `stage` keeps only conditions tagged with it; `except` drops one key (the
 * facet's own, for the exclude-own-filter rule).
 */
export function matchOf(conditions, { stage, except } = {}) {
  const and = Object.entries(conditions)
    .filter(([key, cond]) => key !== except && (!stage || cond.stage === stage))
    .map(([, cond]) => cond.match);
  return and.length ? { $and: and } : {};
}

/**
 * The single `$facet` stage behind a facet query.
 *
 *   buildFacetStage(conditions, {
 *     genres: (match) => valuesFacetStages(match, '$genres'),
 *     releaseYears: (match) => histogramStages(match, …),
 *     tagsAlt: { exclude: 'tags', stages: (match) => … },  // a facet whose own
 *   })                                                     // condition has another key
 *
 * Each facet gets `match` = every condition except the one keyed like the
 * facet (or its `exclude`). A `total` facet (the full filter's count) is
 * always first.
 */
export function buildFacetStage(conditions, facets) {
  const out = { total: [{ $match: matchOf(conditions) }, { $count: 'n' }] };
  for (const [name, def] of Object.entries(facets)) {
    const stages = typeof def === 'function' ? def : def.stages;
    const exclude = typeof def === 'function' ? name : def.exclude ?? name;
    out[name] = stages(matchOf(conditions, { except: exclude }));
  }
  return { $facet: out };
}

const setOf = (expr) => ({ $setUnion: [{ $ifNull: [expr, []] }, []] });

/** Count distinct values of an array expression, once per document (`{_id: value, n}`). */
export function valuesFacetStages(match, arrayExpr) {
  return [
    { $match: match },
    { $project: { v: setOf(arrayExpr) } },
    { $unwind: '$v' },
    { $match: { v: { $nin: [null, ''] } } },
    { $group: { _id: '$v', n: { $sum: 1 } } },
  ];
}

/** Count documents per value of a scalar expression (`{_id: value, n}`). */
export function groupFacetStages(match, idExpr) {
  return [{ $match: match }, { $group: { _id: idExpr, n: { $sum: 1 } } }];
}

/** Count documents that also match `where` (`[{ n }]`). */
export function countFacetStages(match, where) {
  return [{ $match: match }, { $match: where }, { $count: 'n' }];
}

/**
 * A histogram: documents per `bucket` expression, ascending. `require` is an
 * extra `$match` (e.g. the field has the right type).
 */
export function histogramStages(match, { bucket, require }) {
  return [{ $match: match }, ...(require ? [{ $match: require }] : []), { $group: { _id: bucket, n: { $sum: 1 } } }, { $sort: { _id: 1 } }];
}

/** Documents per calendar year of a Date field. */
export function yearHistogramStages(match, path) {
  return histogramStages(match, { require: { [path]: { $type: 'date' } }, bucket: { $year: `$${path}` } });
}

/** Open vocabulary: values with a count, plus every selected value (0 if none); count desc, then value. */
export function shapeOpenFacet(rows, selected = []) {
  const counts = new Map((rows ?? []).map((r) => [String(r._id), r.n]));
  for (const s of selected ?? []) if (!counts.has(s)) counts.set(s, 0);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

/** Closed vocabulary: every value in `order`, zeros included; unknown extras last. */
export function shapeFixedFacet(rows, order) {
  const counts = new Map((rows ?? []).map((r) => [String(r._id), r.n]));
  const out = order.map((value) => ({ value, count: counts.get(value) ?? 0 }));
  for (const [value, count] of counts) if (!order.includes(value)) out.push({ value, count });
  return out;
}

/** Integer histogram rows → `[{ [key]: bucket, count }]`. */
export function shapeHistogram(rows, key = 'value') {
  return (rows ?? []).filter((r) => Number.isInteger(r._id)).map((r) => ({ [key]: r._id, count: r.n }));
}

/** A `$count` facet's result → the number. */
export function shapeCount(rows) {
  return rows?.[0]?.n ?? 0;
}

/**
 * A seeded shuffle key: a hash of the document's id and the client's seed,
 * so the order is shuffled per seed yet identical on every page of it.
 */
export function randomSortKey(seed, idPath = '$_id') {
  return { $toHashedIndexKey: { $concat: [{ $toString: idPath }, ':', String(seed ?? 0)] } };
}

/**
 * Nulls last in BOTH directions, then a stable tiebreak.
 *
 *   const s = nullsLastSort({ key: { $ifNull: ['$releaseDate', null] }, dir: -1, tiebreak: { sortTitle: 1, _id: 1 } });
 *   pipeline.push(...s.stages);           // adds __sortKey, __sortNull
 *   … { $sort: s.sort } … { $project: s.project }   // project drops the helpers
 */
export function nullsLastSort({ key, dir = 1, tiebreak = { _id: 1 } }) {
  return {
    stages: [{ $addFields: { __sortKey: key } }, { $addFields: { __sortNull: { $cond: [{ $eq: ['$__sortKey', null] }, 1, 0] } } }],
    sort: { __sortNull: 1, __sortKey: dir, ...tiebreak },
    project: { __sortKey: 0, __sortNull: 0 },
  };
}

/** `page`/`limit` args → safe numbers (page ≥ 1, 1 ≤ limit ≤ maxLimit). */
export function pageArgs({ page, limit } = {}, { defaultLimit = 48, maxLimit = 100 } = {}) {
  return { page: Math.max(1, page ?? 1), limit: Math.max(1, Math.min(maxLimit, limit ?? defaultLimit)) };
}

/** One page and the total in a single `$facet`: `{ items, total }`. */
export function pageFacetStage({ sort, page, limit, project }) {
  return {
    $facet: {
      items: [{ $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }, ...(project ? [{ $project: project }] : [])],
      total: [{ $count: 'n' }],
    },
  };
}

/** The `pageFacetStage` result → `{ items, total, page, pages }`. */
export function shapePage(result, { page, limit }) {
  const total = result?.total?.[0]?.n ?? 0;
  return { items: result?.items ?? [], total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}
