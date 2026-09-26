import constantsModule from '@geeksuite/schemas/gamegeek/constants';
import {
  buildSearchFilter,
  buildFacetStage,
  countFacetStages,
  groupFacetStages,
  inList,
  matchOf,
  searchRegex,
  shapeCount,
  shapeFixedFacet,
  shapeHistogram,
  shapeOpenFacet,
  valuesFacetStages,
  yearHistogramStages,
  yearRange,
} from '@geeksuite/collection/server';

/**
 * GameFilterInput → Mongo, and the faceted counts
 * (apps/gamegeek/DOCS/TAGS_AND_FILTERS.md §B1).
 *
 * One builder serves both the `games` query and `gameFacets`, so a filter
 * and the count shown next to it can never disagree. Each active dimension
 * becomes one `$match` clause, tagged with the stage it can run at:
 *   'game'   — reads only the Game document (runs before the GamePlayer lookup);
 *   'player' — reads the caller's GamePlayer row, joined as `__me`.
 *
 * Faceting rule: each facet's counts apply every active dimension EXCEPT its
 * own, so picking "Epic" still shows what GOG would give. The whole thing is
 * a single `$facet` aggregation over the caller's household.
 *
 * The generic machinery (escaped search, the exclude-own `$facet`, the
 * value/histogram/count facets and their shapers) is
 * `@geeksuite/collection/server`; what stays here is GameGeek's: the field
 * paths, the played/length/metadata/needsDecision semantics, and the
 * caller's GamePlayer join.
 *
 * Nothing here takes a householdId from the filter: the caller passes the
 * session's, and it is the literal first stage of every pipeline.
 */

const { ENRICHMENT_STATUSES, LENGTH_BUCKETS, LENGTH_BOUNDS, FILTER_PLAYED, RECENT_PLAYED_DAYS } = constantsModule;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The fields a library search looks in. */
const SEARCH_FIELDS = ['title', 'developers', 'publishers', 'tags', 'autoTags', 'genres'];

export { searchRegex, matchOf };

const has = (list) => Array.isArray(list) && list.length > 0;
const given = (v) => v !== undefined && v !== null;

/**
 * The filter a `games` call means: `filter` wins per field where it is
 * given; the old `q`, `shelf` and `platform` args fill in where it isn't.
 * (`owned` has no filter counterpart and stays a separate, global clause.)
 */
export function effectiveFilter(args = {}) {
  const f = { ...(args.filter ?? {}) };
  if (!given(f.q) && args.q) f.q = args.q;
  if (!given(f.shelves) && args.shelf) f.shelves = [args.shelf];
  if (!given(f.platforms) && args.platform) f.platforms = [args.platform];
  return f;
}

/** time-to-beat `main` (hours) buckets as Mongo query clauses. */
function lengthClause(bucket) {
  const path = 'timeToBeat.main';
  switch (bucket) {
    case 'short':
      return { [path]: { $gt: 0, $lt: LENGTH_BOUNDS.short } };
    case 'medium':
      return { [path]: { $gte: LENGTH_BOUNDS.short, $lt: LENGTH_BOUNDS.medium } };
    case 'long':
      return { [path]: { $gte: LENGTH_BOUNDS.medium, $lt: LENGTH_BOUNDS.long } };
    case 'epic':
      return { [path]: { $gte: LENGTH_BOUNDS.long } };
    default:
      return { $or: [{ [path]: null }, { [path]: { $lte: 0 } }] };
  }
}

function playedClause(value, cutoff) {
  const last = '__me.lastPlayedAt';
  const hours = '__me.hoursPlayed';
  if (value === 'recent') return { [last]: { $gte: cutoff } };
  if (value === 'played') return { $or: [{ [hours]: { $gt: 0 } }, { [last]: { $ne: null } }] };
  // never: no hours and no lastPlayed (no row at all counts as never).
  return { $and: [{ $or: [{ [hours]: null }, { [hours]: { $lte: 0 } }] }, { [last]: null }] };
}

/**
 * The active dimensions of a filter.
 * @returns {Record<string, {stage: 'game'|'player', match: object}>} keyed by
 *   the facet each one belongs to (releaseYears for the year range,
 *   favorites for favorite, needsDecision for itself; q and hasCover belong
 *   to no facet).
 */
export function buildConditions(filter = {}, { now = new Date() } = {}) {
  const c = {};
  const all = filter.tagMatch === 'all';

  const search = filter.q ? buildSearchFilter(filter.q, SEARCH_FIELDS) : null;
  if (search) c.q = { stage: 'game', match: search };
  if (has(filter.genres)) c.genres = { stage: 'game', match: inList('genres', filter.genres, { all }) };
  if (has(filter.tags)) {
    const either = (t) => ({ $or: [{ tags: t }, { autoTags: t }] });
    c.tags = {
      stage: 'game',
      match: all ? { $and: filter.tags.map(either) } : { $or: [{ tags: { $in: filter.tags } }, { autoTags: { $in: filter.tags } }] },
    };
  }
  if (has(filter.storefronts)) c.storefronts = { stage: 'game', match: inList('copies.storefront', filter.storefronts) };
  if (has(filter.platforms)) c.platforms = { stage: 'game', match: inList('copies.platform', filter.platforms) };
  if (has(filter.formats)) c.formats = { stage: 'game', match: inList('copies.format', filter.formats) };
  if (has(filter.modes)) c.modes = { stage: 'game', match: inList('modes', filter.modes) };
  const years = yearRange('releaseDate', filter.releaseYearMin, filter.releaseYearMax);
  if (years) c.releaseYears = { stage: 'game', match: years };
  if (has(filter.lengths)) c.lengths = { stage: 'game', match: { $or: filter.lengths.map(lengthClause) } };
  if (has(filter.metadata)) {
    // A game never enriched (enrichment null) counts as pending.
    const statuses = filter.metadata.includes('pending') ? [...filter.metadata, null] : [...filter.metadata];
    c.metadata = { stage: 'game', match: { 'enrichment.status': { $in: statuses } } };
  }
  if (given(filter.hasCover)) {
    c.hasCover = { stage: 'game', match: { coverPath: filter.hasCover ? { $nin: [null, ''] } : { $in: [null, ''] } } };
  }
  if (has(filter.shelves)) {
    const named = filter.shelves.filter((s) => s !== 'unshelved');
    const or = [];
    if (named.length) or.push({ '__me.shelf': { $in: named } });
    if (filter.shelves.includes('unshelved')) or.push({ '__me.shelf': { $in: [null, ''] } });
    c.shelves = { stage: 'player', match: { $or: or } };
  }
  if (given(filter.played) && FILTER_PLAYED.includes(filter.played)) {
    c.played = { stage: 'player', match: playedClause(filter.played, new Date(now.getTime() - RECENT_PLAYED_DAYS * DAY_MS)) };
  }
  if (given(filter.favorite)) {
    c.favorites = { stage: 'player', match: filter.favorite ? { '__me.favorite': true } : { '__me.favorite': { $ne: true } } };
  }
  if (given(filter.needsDecision)) {
    c.needsDecision = {
      stage: 'player',
      match: filter.needsDecision ? { '__me.installFlag': 'uninstalled' } : { '__me.installFlag': { $ne: 'uninstalled' } },
    };
  }
  return c;
}

/** The caller's GamePlayer row joined as `__me` (null when they have none). */
export function lookupMeStages({ userId, householdId, collection }) {
  return [
    {
      $lookup: {
        from: collection,
        let: { gid: '$_id' },
        pipeline: [{ $match: { userId, householdId, $expr: { $eq: ['$gameId', '$$gid'] } } }, { $limit: 1 }],
        as: '__meArr',
      },
    },
    { $addFields: { __me: { $ifNull: [{ $arrayElemAt: ['$__meArr', 0] }, null] } } },
    { $project: { __meArr: 0 } },
  ];
}

// ── Facets ───────────────────────────────────────────────────────────────────

function playedGroupExprs(cutoff) {
  const hours = { $ifNull: ['$__me.hoursPlayed', 0] };
  const last = { $ifNull: ['$__me.lastPlayedAt', null] };
  const played = { $or: [{ $gt: [hours, 0] }, { $ne: [last, null] }] };
  return {
    never: { $sum: { $cond: [played, 0, 1] } },
    played: { $sum: { $cond: [played, 1, 0] } },
    recent: { $sum: { $cond: [{ $and: [{ $ne: [last, null] }, { $gte: [last, cutoff] }] }, 1, 0] } },
  };
}

function lengthBucketExpr() {
  const main = { $ifNull: ['$timeToBeat.main', null] };
  return {
    $switch: {
      branches: [
        { case: { $or: [{ $eq: [main, null] }, { $not: [{ $isNumber: main }] }, { $lte: [main, 0] }] }, then: 'unknown' },
        { case: { $lt: [main, LENGTH_BOUNDS.short] }, then: 'short' },
        { case: { $lt: [main, LENGTH_BOUNDS.medium] }, then: 'medium' },
        { case: { $lt: [main, LENGTH_BOUNDS.long] }, then: 'long' },
      ],
      default: 'epic',
    },
  };
}

/**
 * The single aggregation behind `gameFacets`.
 * @param {{householdId: string, userId: string, collection: string, filter: object, now?: Date}} params
 */
export function facetsPipeline({ householdId, userId, collection, filter = {}, now = new Date() }) {
  const conditions = buildConditions(filter, { now });
  const cutoff = new Date(now.getTime() - RECENT_PLAYED_DAYS * DAY_MS);
  const unshelvedExpr = {
    $cond: [{ $in: [{ $ifNull: ['$__me.shelf', ''] }, ['']] }, 'unshelved', '$__me.shelf'],
  };

  return [
    // The tenant is a literal in the first stage — never conditional.
    { $match: { householdId } },
    ...lookupMeStages({ userId, householdId, collection }),
    buildFacetStage(conditions, {
      shelves: (match) => groupFacetStages(match, unshelvedExpr),
      genres: (match) => valuesFacetStages(match, '$genres'),
      tags: (match) => valuesFacetStages(match, { $setUnion: [{ $ifNull: ['$tags', []] }, { $ifNull: ['$autoTags', []] }] }),
      storefronts: (match) => valuesFacetStages(match, '$copies.storefront'),
      platforms: (match) => valuesFacetStages(match, '$copies.platform'),
      formats: (match) => valuesFacetStages(match, '$copies.format'),
      modes: (match) => valuesFacetStages(match, '$modes'),
      played: (match) => [{ $match: match }, { $group: { _id: null, ...playedGroupExprs(cutoff) } }],
      lengths: (match) => groupFacetStages(match, lengthBucketExpr()),
      metadata: (match) => groupFacetStages(match, { $ifNull: ['$enrichment.status', 'pending'] }),
      releaseYears: (match) => yearHistogramStages(match, 'releaseDate'),
      favorites: (match) => countFacetStages(match, { '__me.favorite': true }),
      needsDecision: (match) => countFacetStages(match, { '__me.installFlag': 'uninstalled' }),
    }),
  ];
}

/** The `$facet` result → the GameFacets shape. */
export function shapeFacets(result, filter = {}) {
  const r = result ?? {};
  const playedRow = r.played?.[0] ?? {};
  return {
    total: shapeCount(r.total),
    shelves: shapeOpenFacet(r.shelves, filter.shelves),
    genres: shapeOpenFacet(r.genres, filter.genres),
    tags: shapeOpenFacet(r.tags, filter.tags),
    storefronts: shapeOpenFacet(r.storefronts, filter.storefronts),
    platforms: shapeOpenFacet(r.platforms, filter.platforms),
    formats: shapeOpenFacet(r.formats, filter.formats),
    modes: shapeOpenFacet(r.modes, filter.modes),
    played: FILTER_PLAYED.map((value) => ({ value, count: playedRow[value] ?? 0 })),
    lengths: shapeFixedFacet(r.lengths, LENGTH_BUCKETS),
    metadata: shapeFixedFacet(r.metadata, ENRICHMENT_STATUSES),
    releaseYears: shapeHistogram(r.releaseYears, 'year'),
    favorites: shapeCount(r.favorites),
    needsDecision: shapeCount(r.needsDecision),
  };
}

export default { effectiveFilter, buildConditions, matchOf, lookupMeStages, facetsPipeline, shapeFacets, searchRegex };
