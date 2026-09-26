import {
  buildFacetStage,
  buildSearchFilter,
  countFacetStages,
  groupFacetStages,
  histogramStages,
  inList,
  matchOf,
  searchRegex,
  shapeCount,
  shapeHistogram,
  shapeOpenFacet,
  valuesFacetStages,
  yearHistogramStages,
  yearRange,
} from '@geeksuite/collection/server';
// Default import + destructure: the shared module is CommonJS. The tag
// vocabulary rides on the book module (see its note).
import bookSchemaModule from '@geeksuite/schemas/bookgeek/book';

const { canonicalTagName, canonicalTagsFor } = bookSchemaModule.tagVocabulary;

/**
 * BookFilterInput → Mongo, and the faceted counts behind `bookFacets`
 * (DOCS/BOOKGEEK_CLEANUP_PLAN.md, Phase C2).
 *
 * One builder serves both `books(filter:)` and `bookFacets`, so a filter and
 * the count shown beside it can never disagree. Each active dimension is one
 * condition keyed by the facet it belongs to; `buildFacetStage` then gives
 * every facet all the conditions EXCEPT its own (picking "Neal Stephenson"
 * still shows what every other author would give).
 *
 * The generic machinery is `@geeksuite/collection/server`. What is BookGeek's
 * here: the field paths, the `unread` shelf rule (it has to match the
 * resolver's `shelfMatch()` exactly), case-insensitive file formats, the
 * half-star-tolerant rating buckets, the legacy author "contains" search
 * old saved filters still carry, and the tag vocabulary
 * (apps/bookgeek/DOCS/TAGS.md): the Tags facet over canonical ∪ My ∪
 * Unsorted tags, raw values from old links still matching, and `tag:`.
 *
 * No tenant stage: BookGeek's library is household-SHARED — `Book` has no
 * owner field (see resolvers.js `requireUser`). The resolver authenticates;
 * nothing here narrows by user.
 */

/** Built-in shelves (resolvers.js `shelfNames`, the web's BUILT_IN_SHELVES). */
export const SHELF_NAMES = ['unread', 'reading', 'on-reader', 'read', 'want-to-read', 'abandoned', 'need-to-find'];

/**
 * The fields a library search looks in: the three the old `q` arg searched
 * (raw `tags` stays, so a saved "Must Read" search still finds its books),
 * plus the canonical and the person's own tags (apps/bookgeek/DOCS/TAGS.md).
 */
export const SEARCH_FIELDS = ['title', 'authors', 'tags', 'libraryTags', 'myTags'];

/**
 * The value set the Tags facet counts and the `tags` filter matches: the
 * canonical tags, the person's own and the Unsorted raw ones. A value is
 * the same value wherever it comes from ("Fantasy" typed as a My tag is
 * the canonical Fantasy).
 */
const tagUnionExpr = {
  $setUnion: [{ $ifNull: ['$libraryTags', []] }, { $ifNull: ['$myTags', []] }, { $ifNull: ['$unsortedTags', []] }],
};

/**
 * One chosen tag as a query. A canonical name matches the canonical tags
 * and anyone's My tag of the same name — exactly what the facet counted.
 * Anything else (an Unsorted tag, a My tag, or a raw tag from an old link
 * or saved view) matches My tags and the raw tags as written, plus the
 * canonical tags it maps to, so "Thrillers" from a pre-vocabulary view
 * still finds every thriller.
 */
export function tagValueMatch(value) {
  if (canonicalTagName(value) === value) return { $or: [{ libraryTags: value }, { myTags: value }] };
  const mapped = canonicalTagsFor(value);
  const or = [{ myTags: value }, { tags: value }];
  if (mapped.length) or.unshift({ libraryTags: { $in: mapped } });
  return { $or: or };
}

/** The `tags` filter: any-of, or every-of under tagMatch "all". */
export function tagsMatch(values, { all = false } = {}) {
  const list = [...new Set(values)];
  if (list.length === 1) return tagValueMatch(list[0]);
  const each = list.map(tagValueMatch);
  return all ? { $and: each } : { $or: each };
}

/**
 * `tag:` in a search: `tag:sf`, `tag:"science fiction"`, `tag:kurt`. The
 * term matches the canonical tags it names or maps to (canonical names and
 * their synonyms), and otherwise the raw and My tags equal to it, ignoring
 * case. The term reaches mongod as an escaped, bounded literal
 * (`searchRegex`) — the ReDoS rule every search here keeps.
 */
const TAG_TOKEN = /(?:^|\s)tag:(?:"([^"]*)"|(\S+))/gi;

export function parseTagSearch(q) {
  const tags = [];
  const rest = String(q ?? '').replace(TAG_TOKEN, (_m, quoted, bare) => {
    const term = String(quoted ?? bare ?? '').trim();
    if (term) tags.push(term);
    return ' ';
  });
  return { text: rest.replace(/\s+/g, ' ').trim(), tags };
}

export function tagSearchMatch(term) {
  const exact = { $regex: `^${searchRegex(term)}$`, $options: 'i' };
  const or = [{ tags: exact }, { myTags: exact }];
  const mapped = canonicalTagsFor(term);
  if (mapped.length) or.unshift({ libraryTags: { $in: mapped } });
  return { $or: or };
}

/** A whole `q`: its `tag:` terms (each must match) and the free text. Null when blank. */
export function searchMatch(q) {
  const { text, tags } = parseTagSearch(q);
  const and = tags.map(tagSearchMatch);
  const free = text ? buildSearchFilter(text, SEARCH_FIELDS) : null;
  if (free) and.push(free);
  if (!and.length) return null;
  return and.length === 1 ? and[0] : { $and: and };
}

const has = (list) => Array.isArray(list) && list.length > 0;
const given = (v) => v !== undefined && v !== null;

/**
 * A shelf as a query. `unread` is "shelf unread or empty, and not finished":
 * a Goodreads import leaves many books with no shelf, and a finished book
 * with no shelf is not unread. Every other shelf is an exact match.
 */
export function shelfMatch(name) {
  if (name === 'unread') {
    return {
      $and: [
        { $or: [{ shelf: 'unread' }, { shelf: { $exists: false } }, { shelf: null }, { shelf: '' }] },
        {
          $nor: [
            { shelf: 'read' },
            { shelf: 'abandoned' },
            { readCount: { $gt: 0 } },
            { dateFinished: { $exists: true, $ne: null } },
          ],
        },
      ],
    };
  }
  return { shelf: name };
}

/**
 * The same rule as an aggregation expression: the shelf a book is counted
 * under, or null (a finished book with no shelf sits on none). `$gt` in an
 * expression compares across BSON types, so `readCount` must be a number to
 * count — exactly what the query form's `{ $gt: 0 }` type-brackets to.
 */
function shelfBucketExpr() {
  const shelf = { $ifNull: ['$shelf', ''] };
  const finished = {
    $or: [
      { $and: [{ $isNumber: '$readCount' }, { $gt: ['$readCount', 0] }] },
      { $ne: [{ $ifNull: ['$dateFinished', null] }, null] },
    ],
  };
  return {
    $cond: [{ $in: [shelf, ['', 'unread']] }, { $cond: [finished, null, 'unread'] }, '$shelf'],
  };
}

/** A whole-word, case-insensitive file format ("epub" matches "EPUB"). */
const formatRegex = (value) => new RegExp(`^${searchRegex(String(value).trim())}$`, 'i');

/** Every file's format, lowercased. */
const formatsExpr = {
  $map: { input: { $ifNull: ['$files', []] }, as: 'f', in: { $toLower: { $ifNull: ['$$f.format', ''] } } },
};

/**
 * Ratings are whole stars on input but five imported books carry halves, so a
 * star bucket is the floor (3.5 is a 3) and a range `min–max` is
 * `min ≤ rating < max + 1`. Unrated (0 / missing) is in no bucket.
 */
function ratingRange(min, max) {
  if (!given(min) && !given(max)) return null;
  return { rating: { $gte: given(min) ? min : 1, $lt: (given(max) ? max : 5) + 1 } };
}

/**
 * The active dimensions of a filter.
 * @returns {Record<string, {match: object}>} keyed by the facet each belongs
 *   to (readYears for the read-year range, ratings for the star range, owned
 *   and hasFile for their switches; q and authorText belong to no facet).
 */
export function buildConditions(filter = {}) {
  const c = {};
  const all = filter.tagMatch === 'all';

  const search = filter.q ? searchMatch(filter.q) : null;
  if (search) c.q = { match: search };
  // The old `author` arg's "contains" (saved filters from before C2 carry it).
  const byText = filter.authorText ? String(filter.authorText).trim() : '';
  if (byText) c.authorText = { match: { authors: { $regex: searchRegex(byText), $options: 'i' } } };

  if (has(filter.shelves)) {
    const shelves = [...new Set(filter.shelves)];
    c.shelves = { match: shelves.length === 1 ? shelfMatch(shelves[0]) : { $or: shelves.map(shelfMatch) } };
  }
  if (has(filter.authors)) c.authors = { match: inList('authors', filter.authors) };
  if (has(filter.series)) c.series = { match: inList('series.name', filter.series) };
  if (has(filter.tags)) c.tags = { match: tagsMatch(filter.tags, { all }) };
  if (has(filter.formats)) c.formats = { match: { 'files.format': { $in: filter.formats.map(formatRegex) } } };
  if (has(filter.languages)) c.languages = { match: inList('language', filter.languages) };
  if (given(filter.owned)) c.owned = { match: filter.owned ? { owned: true } : { owned: { $ne: true } } };
  if (given(filter.hasFile)) {
    c.hasFile = { match: filter.hasFile ? { 'files.0': { $exists: true } } : { 'files.0': { $exists: false } } };
  }
  const years = yearRange('dateFinished', filter.readYearMin, filter.readYearMax);
  if (years) c.readYears = { match: years };
  const stars = ratingRange(filter.ratingMin, filter.ratingMax);
  if (stars) c.ratings = { match: stars };
  return c;
}

/** The filter as one `$match` for the `books` list. */
export function filterMatch(filter = {}) {
  return matchOf(buildConditions(filter));
}

/** The single aggregation behind `bookFacets`. */
export function facetsPipeline(filter = {}) {
  const conditions = buildConditions(filter);
  return [
    buildFacetStage(conditions, {
      shelves: (match) => [...groupFacetStages(match, shelfBucketExpr()), { $match: { _id: { $ne: null } } }],
      authors: (match) => valuesFacetStages(match, '$authors'),
      series: (match) => [
        { $match: match },
        { $match: { 'series.name': { $type: 'string', $nin: [''] } } },
        { $group: { _id: '$series.name', n: { $sum: 1 } } },
      ],
      tags: (match) => valuesFacetStages(match, tagUnionExpr),
      // Which of those values are someone's own (the web groups them under
      // "My tags"); counted under the same match, so it excludes `tags` too.
      myTags: { exclude: 'tags', stages: (match) => valuesFacetStages(match, '$myTags') },
      formats: (match) => valuesFacetStages(match, formatsExpr),
      languages: (match) => [
        { $match: match },
        { $match: { language: { $type: 'string', $nin: [''] } } },
        { $group: { _id: '$language', n: { $sum: 1 } } },
      ],
      readYears: (match) => yearHistogramStages(match, 'dateFinished'),
      ratings: (match) =>
        histogramStages(match, { require: { rating: { $type: 'number', $gte: 1 } }, bucket: { $min: [5, { $floor: '$rating' }] } }),
      owned: (match) => countFacetStages(match, { owned: true }),
      hasFile: (match) => countFacetStages(match, { 'files.0': { $exists: true } }),
    }),
  ];
}

/** The `$facet` result → the BookFacets shape. */
export function shapeFacets(result, filter = {}) {
  const r = result ?? {};
  return {
    total: shapeCount(r.total),
    shelves: shapeOpenFacet(r.shelves, filter.shelves),
    authors: shapeOpenFacet(r.authors, filter.authors),
    series: shapeOpenFacet(r.series, filter.series),
    tags: shapeOpenFacet(r.tags, filter.tags),
    myTags: shapeOpenFacet(r.myTags),
    formats: shapeOpenFacet(r.formats, (filter.formats ?? []).map((f) => String(f).toLowerCase())),
    languages: shapeOpenFacet(r.languages, filter.languages),
    readYears: shapeHistogram(r.readYears, 'year'),
    ratings: shapeHistogram(r.ratings, 'rating'),
    owned: shapeCount(r.owned),
    hasFile: shapeCount(r.hasFile),
  };
}

/**
 * The filter a `books` call means: the old flat args (`q`, `author`, `tag`,
 * `shelf`, `owned`) AND `filter`. Old tabs and old clients send only the flat
 * args, the new library sends only `filter`; given both, every one narrows.
 * The old args keep their own semantics exactly (author "contains", tag
 * exact, owned "false" = stored false), so nothing an old client sees moves.
 */
export function legacyConditions({ author, tag, shelf, owned, q } = {}) {
  const and = [];
  if (author) and.push({ authors: { $regex: searchRegex(author), $options: 'i' } });
  if (tag) and.push({ tags: tag });
  if (shelf) and.push(shelfMatch(shelf));
  if (owned === 'true') and.push({ owned: true });
  else if (owned === 'false') and.push({ owned: false });
  const search = q ? searchMatch(q) : null;
  if (search) and.push(search);
  return and;
}

export default { SHELF_NAMES, shelfMatch, buildConditions, filterMatch, facetsPipeline, shapeFacets, legacyConditions };
