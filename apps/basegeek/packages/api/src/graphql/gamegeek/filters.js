import constantsModule from '@geeksuite/schemas/gamegeek/constants';

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
 * Nothing here takes a householdId from the filter: the caller passes the
 * session's, and it is the literal first stage of every pipeline.
 */

const { ENRICHMENT_STATUSES, LENGTH_BUCKETS, LENGTH_BOUNDS, FILTER_PLAYED, RECENT_PLAYED_DAYS } = constantsModule;

const SEARCH_TERM_MAX = 200;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Escaped + bounded, so a user search term is a literal, not a ReDoS. */
export function searchRegex(value) {
  return String(value)
    .slice(0, SEARCH_TERM_MAX)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

  if (filter.q && String(filter.q).trim()) {
    const needle = searchRegex(String(filter.q).trim());
    c.q = {
      stage: 'game',
      match: { $or: ['title', 'developers', 'publishers', 'tags', 'autoTags', 'genres'].map((f) => ({ [f]: { $regex: needle, $options: 'i' } })) },
    };
  }
  if (has(filter.genres)) {
    c.genres = { stage: 'game', match: { genres: all ? { $all: filter.genres } : { $in: filter.genres } } };
  }
  if (has(filter.tags)) {
    const either = (t) => ({ $or: [{ tags: t }, { autoTags: t }] });
    c.tags = {
      stage: 'game',
      match: all ? { $and: filter.tags.map(either) } : { $or: [{ tags: { $in: filter.tags } }, { autoTags: { $in: filter.tags } }] },
    };
  }
  if (has(filter.storefronts)) c.storefronts = { stage: 'game', match: { 'copies.storefront': { $in: filter.storefronts } } };
  if (has(filter.platforms)) c.platforms = { stage: 'game', match: { 'copies.platform': { $in: filter.platforms } } };
  if (has(filter.formats)) c.formats = { stage: 'game', match: { 'copies.format': { $in: filter.formats } } };
  if (has(filter.modes)) c.modes = { stage: 'game', match: { modes: { $in: filter.modes } } };
  if (given(filter.releaseYearMin) || given(filter.releaseYearMax)) {
    const range = {};
    if (given(filter.releaseYearMin)) range.$gte = new Date(Date.UTC(filter.releaseYearMin, 0, 1));
    if (given(filter.releaseYearMax)) range.$lt = new Date(Date.UTC(filter.releaseYearMax + 1, 0, 1));
    c.releaseYears = { stage: 'game', match: { releaseDate: range } };
  }
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

/** `{$and: [...]}` of the chosen dimensions, or `{}` when none. */
export function matchOf(conditions, { stage, except } = {}) {
  const and = Object.entries(conditions)
    .filter(([key, cond]) => key !== except && (!stage || cond.stage === stage))
    .map(([, cond]) => cond.match);
  return and.length ? { $and: and } : {};
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

const setOf = (expr) => ({ $setUnion: [{ $ifNull: [expr, []] }, []] });

/** Count distinct values of an array expression, one per game. */
const valuesFacet = (match, arrayExpr) => [
  { $match: match },
  { $project: { v: setOf(arrayExpr) } },
  { $unwind: '$v' },
  { $match: { v: { $nin: [null, ''] } } },
  { $group: { _id: '$v', n: { $sum: 1 } } },
];

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
  const except = (key) => matchOf(conditions, { except: key });
  const cutoff = new Date(now.getTime() - RECENT_PLAYED_DAYS * DAY_MS);
  const unshelvedExpr = {
    $cond: [{ $in: [{ $ifNull: ['$__me.shelf', ''] }, ['']] }, 'unshelved', '$__me.shelf'],
  };

  return [
    // The tenant is a literal in the first stage — never conditional.
    { $match: { householdId } },
    ...lookupMeStages({ userId, householdId, collection }),
    {
      $facet: {
        total: [{ $match: matchOf(conditions) }, { $count: 'n' }],
        shelves: [{ $match: except('shelves') }, { $group: { _id: unshelvedExpr, n: { $sum: 1 } } }],
        genres: valuesFacet(except('genres'), '$genres'),
        tags: valuesFacet(except('tags'), { $setUnion: [{ $ifNull: ['$tags', []] }, { $ifNull: ['$autoTags', []] }] }),
        storefronts: valuesFacet(except('storefronts'), '$copies.storefront'),
        platforms: valuesFacet(except('platforms'), '$copies.platform'),
        formats: valuesFacet(except('formats'), '$copies.format'),
        modes: valuesFacet(except('modes'), '$modes'),
        played: [{ $match: except('played') }, { $group: { _id: null, ...playedGroupExprs(cutoff) } }],
        lengths: [{ $match: except('lengths') }, { $group: { _id: lengthBucketExpr(), n: { $sum: 1 } } }],
        metadata: [{ $match: except('metadata') }, { $group: { _id: { $ifNull: ['$enrichment.status', 'pending'] }, n: { $sum: 1 } } }],
        releaseYears: [
          { $match: except('releaseYears') },
          { $match: { releaseDate: { $type: 'date' } } },
          { $group: { _id: { $year: '$releaseDate' }, n: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ],
        favorites: [{ $match: except('favorites') }, { $match: { '__me.favorite': true } }, { $count: 'n' }],
        needsDecision: [{ $match: except('needsDecision') }, { $match: { '__me.installFlag': 'uninstalled' } }, { $count: 'n' }],
      },
    },
  ];
}

/** Open-vocabulary facet: values with a count, plus every selected value (0 if none), count desc then value. */
function openFacet(rows, selected = []) {
  const counts = new Map((rows ?? []).map((r) => [String(r._id), r.n]));
  for (const s of selected ?? []) if (!counts.has(s)) counts.set(s, 0);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

/** Closed-vocabulary facet: every value, in vocabulary order, zeros included. */
function fixedFacet(rows, order) {
  const counts = new Map((rows ?? []).map((r) => [String(r._id), r.n]));
  const out = order.map((value) => ({ value, count: counts.get(value) ?? 0 }));
  for (const [value, count] of counts) if (!order.includes(value)) out.push({ value, count });
  return out;
}

/** The `$facet` result → the GameFacets shape. */
export function shapeFacets(result, filter = {}) {
  const r = result ?? {};
  const playedRow = r.played?.[0] ?? {};
  return {
    total: r.total?.[0]?.n ?? 0,
    shelves: openFacet(r.shelves, filter.shelves),
    genres: openFacet(r.genres, filter.genres),
    tags: openFacet(r.tags, filter.tags),
    storefronts: openFacet(r.storefronts, filter.storefronts),
    platforms: openFacet(r.platforms, filter.platforms),
    formats: openFacet(r.formats, filter.formats),
    modes: openFacet(r.modes, filter.modes),
    played: FILTER_PLAYED.map((value) => ({ value, count: playedRow[value] ?? 0 })),
    lengths: fixedFacet(r.lengths, LENGTH_BUCKETS),
    metadata: fixedFacet(r.metadata, ENRICHMENT_STATUSES),
    releaseYears: (r.releaseYears ?? []).filter((y) => Number.isInteger(y._id)).map((y) => ({ year: y._id, count: y.n })),
    favorites: r.favorites?.[0]?.n ?? 0,
    needsDecision: r.needsDecision?.[0]?.n ?? 0,
  };
}

export default { effectiveFilter, buildConditions, matchOf, lookupMeStages, facetsPipeline, shapeFacets, searchRegex };
