// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildFacetStage,
  buildSearchFilter,
  countFacetStages,
  groupFacetStages,
  inList,
  matchOf,
  nullsLastSort,
  numberRange,
  pageArgs,
  pageFacetStage,
  randomSortKey,
  searchRegex,
  shapeCount,
  shapeFixedFacet,
  shapeHistogram,
  shapeOpenFacet,
  shapePage,
  valuesFacetStages,
  yearHistogramStages,
  yearRange,
} from '../server/index.js';

describe('search', () => {
  it('escapes regex metacharacters and bounds the term', () => {
    expect(searchRegex('a.b*(c)?[d]')).toBe('a\\.b\\*\\(c\\)\\?\\[d\\]');
    expect(searchRegex('x'.repeat(500))).toHaveLength(200);
    expect(new RegExp(searchRegex('(a+)+$')).test('(a+)+$')).toBe(true);
  });

  it('buildSearchFilter: a contains-search over the given fields, null when blank', () => {
    expect(buildSearchFilter('  le guin ', ['title', 'authors'])).toEqual({
      $or: [{ title: { $regex: 'le guin', $options: 'i' } }, { authors: { $regex: 'le guin', $options: 'i' } }],
    });
    expect(buildSearchFilter('   ', ['title'])).toBeNull();
    expect(buildSearchFilter(null, ['title'])).toBeNull();
  });
});

describe('conditions', () => {
  it('inList, yearRange, numberRange', () => {
    expect(inList('tags', ['a'])).toEqual({ tags: { $in: ['a'] } });
    expect(inList('tags', ['a', 'b'], { all: true })).toEqual({ tags: { $all: ['a', 'b'] } });
    expect(yearRange('readAt', 2010, 2012)).toEqual({ readAt: { $gte: new Date('2010-01-01T00:00:00Z'), $lt: new Date('2013-01-01T00:00:00Z') } });
    expect(yearRange('readAt', null, undefined)).toBeNull();
    expect(numberRange('rating', 3, null)).toEqual({ rating: { $gte: 3 } });
    expect(numberRange('rating')).toBeNull();
  });

  it('matchOf ANDs conditions, by stage, minus one', () => {
    const c = { a: { stage: 'doc', match: { a: 1 } }, b: { stage: 'user', match: { b: 1 } } };
    expect(matchOf(c)).toEqual({ $and: [{ a: 1 }, { b: 1 }] });
    expect(matchOf(c, { stage: 'user' })).toEqual({ $and: [{ b: 1 }] });
    expect(matchOf(c, { except: 'a' })).toEqual({ $and: [{ b: 1 }] });
    expect(matchOf({})).toEqual({});
  });
});

describe('buildFacetStage', () => {
  const conditions = { authors: { match: { authors: { $in: ['A'] } } }, tags: { match: { tags: { $in: ['t'] } } } };

  it('each facet excludes its own condition; total applies all; an explicit exclude names another key', () => {
    const { $facet: f } = buildFacetStage(conditions, {
      authors: (m) => valuesFacetStages(m, '$authors'),
      tags: (m) => groupFacetStages(m, '$tags'),
      tagCloud: { exclude: 'tags', stages: (m) => countFacetStages(m, { cloud: true }) },
    });
    expect(Object.keys(f)).toEqual(['total', 'authors', 'tags', 'tagCloud']);
    expect(f.total).toEqual([{ $match: { $and: [{ authors: { $in: ['A'] } }, { tags: { $in: ['t'] } }] } }, { $count: 'n' }]);
    expect(f.authors[0]).toEqual({ $match: { $and: [{ tags: { $in: ['t'] } }] } });
    expect(f.tags[0]).toEqual({ $match: { $and: [{ authors: { $in: ['A'] } }] } });
    expect(f.tagCloud).toEqual([{ $match: { $and: [{ authors: { $in: ['A'] } }] } }, { $match: { cloud: true } }, { $count: 'n' }]);
  });

  it('valuesFacetStages counts each value once per document, skipping blanks', () => {
    expect(valuesFacetStages({}, '$tags')).toEqual([
      { $match: {} },
      { $project: { v: { $setUnion: [{ $ifNull: ['$tags', []] }, []] } } },
      { $unwind: '$v' },
      { $match: { v: { $nin: [null, ''] } } },
      { $group: { _id: '$v', n: { $sum: 1 } } },
    ]);
  });

  it('yearHistogramStages buckets Date fields by year, ascending', () => {
    expect(yearHistogramStages({ x: 1 }, 'readAt')).toEqual([
      { $match: { x: 1 } },
      { $match: { readAt: { $type: 'date' } } },
      { $group: { _id: { $year: '$readAt' }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
  });
});

describe('shapers', () => {
  it('open facets: counts desc, then value; selected values present at 0', () => {
    expect(shapeOpenFacet([{ _id: 'b', n: 2 }, { _id: 'a', n: 2 }, { _id: 'c', n: 5 }], ['z'])).toEqual([
      { value: 'c', count: 5 },
      { value: 'a', count: 2 },
      { value: 'b', count: 2 },
      { value: 'z', count: 0 },
    ]);
  });

  it('fixed facets keep vocabulary order with zeros; extras last', () => {
    expect(shapeFixedFacet([{ _id: 'pdf', n: 1 }, { _id: 'audio', n: 2 }], ['epub', 'pdf'])).toEqual([
      { value: 'epub', count: 0 },
      { value: 'pdf', count: 1 },
      { value: 'audio', count: 2 },
    ]);
  });

  it('histograms keep integer buckets; counts default to 0', () => {
    expect(shapeHistogram([{ _id: 2020, n: 3 }, { _id: null, n: 9 }], 'year')).toEqual([{ year: 2020, count: 3 }]);
    expect(shapeHistogram([{ _id: 4, n: 1 }])).toEqual([{ value: 4, count: 1 }]);
    expect(shapeCount([{ n: 4 }])).toBe(4);
    expect(shapeCount([])).toBe(0);
  });
});

describe('sorting and paging', () => {
  it('nullsLastSort: helper fields, null flag first in the sort, then the tiebreak', () => {
    const s = nullsLastSort({ key: { $ifNull: ['$rating', null] }, dir: -1, tiebreak: { sortTitle: 1, _id: 1 } });
    expect(s.stages).toEqual([
      { $addFields: { __sortKey: { $ifNull: ['$rating', null] } } },
      { $addFields: { __sortNull: { $cond: [{ $eq: ['$__sortKey', null] }, 1, 0] } } },
    ]);
    expect(Object.entries(s.sort)).toEqual([
      ['__sortNull', 1],
      ['__sortKey', -1],
      ['sortTitle', 1],
      ['_id', 1],
    ]);
    expect(s.project).toEqual({ __sortKey: 0, __sortNull: 0 });
  });

  it('randomSortKey hashes id and seed', () => {
    expect(randomSortKey(42)).toEqual({ $toHashedIndexKey: { $concat: [{ $toString: '$_id' }, ':', '42'] } });
    expect(randomSortKey(undefined, '$bookId').$toHashedIndexKey.$concat).toEqual([{ $toString: '$bookId' }, ':', '0']);
  });

  it('pageArgs clamps; pageFacetStage + shapePage page it', () => {
    expect(pageArgs({})).toEqual({ page: 1, limit: 48 });
    expect(pageArgs({ page: -3, limit: 500 }, { maxLimit: 100 })).toEqual({ page: 1, limit: 100 });
    expect(pageArgs({ page: 2, limit: 0 })).toEqual({ page: 2, limit: 1 });
    expect(pageFacetStage({ sort: { _id: 1 }, page: 3, limit: 10, project: { x: 0 } })).toEqual({
      $facet: { items: [{ $sort: { _id: 1 } }, { $skip: 20 }, { $limit: 10 }, { $project: { x: 0 } }], total: [{ $count: 'n' }] },
    });
    expect(shapePage({ items: [1], total: [{ n: 21 }] }, { page: 3, limit: 10 })).toEqual({ items: [1], total: 21, page: 3, pages: 3 });
    expect(shapePage(undefined, { page: 1, limit: 10 })).toEqual({ items: [], total: 0, page: 1, pages: 1 });
  });
});
