import { describe, expect, it } from 'vitest';
import { createFilterCodec, integerBetween } from '../filter/codec';
import { BOOK_CODEC as C } from './fixtures';

const read = (search) => C.read(new URLSearchParams(search));

const FULL = {
  filter: {
    ...C.EMPTY_FILTER,
    q: 'le guin, ursula',
    shelves: ['to-read', 'unshelved'],
    authors: ['Le Guin, Ursula K.', 'Banks, Iain M.'],
    series: ['Earthsea'],
    tags: ['Sci-fi', 'Found family'],
    formats: ['epub', 'paper'],
    tagMatch: 'all',
    owned: false,
    hasFile: true,
    readYearMin: 2015,
    readYearMax: 2020,
    ratingMin: 4,
    ratingMax: null,
  },
  view: 'compact',
  sort: 'rating',
  dir: 'asc',
  seed: null,
};

describe('createFilterCodec', () => {
  it('the empty state is an empty URL and the defaults come from the schema', () => {
    expect(C.toParams(C.DEFAULT_STATE).toString()).toBe('');
    expect(C.DEFAULT_STATE).toMatchObject({ view: 'full', sort: 'title', dir: 'asc', seed: null });
    expect(C.EMPTY_FILTER).toMatchObject({ q: '', authors: [], tagMatch: 'any', owned: null, hasFile: null, readYearMin: null, ratingMax: null });
    expect(Object.isFrozen(C.EMPTY_FILTER)).toBe(true);
  });

  it('round-trips every field type, state fields and a non-default direction', () => {
    const params = C.toParams(FULL);
    expect(read(`?${params.toString()}`)).toEqual(FULL);
  });

  it('writes lists as repeated params (a comma survives) and in schema order', () => {
    const params = C.toParams(FULL);
    expect(params.getAll('author')).toEqual(['Le Guin, Ursula K.', 'Banks, Iain M.']);
    expect([...new Set([...params.keys()])]).toEqual(['q', 'shelf', 'author', 'series', 'tag', 'format', 'match', 'owned', 'file', 'read', 'stars', 'v', 'sort', 'dir']);
    expect(params.get('owned')).toBe('0');
    expect(params.get('file')).toBe('1');
    expect(params.get('read')).toBe('2015-2020');
    expect(params.get('stars')).toBe('4-');
  });

  it('reads one-sided and reversed ranges, and drops out-of-bounds sides', () => {
    expect(read('?read=2015-').filter).toMatchObject({ readYearMin: 2015, readYearMax: null });
    expect(read('?read=-1999').filter).toMatchObject({ readYearMin: null, readYearMax: 1999 });
    expect(read('?read=2020-2010').filter).toMatchObject({ readYearMin: 2010, readYearMax: 2020 });
    expect(read('?stars=0-9').filter).toMatchObject({ ratingMin: null, ratingMax: null });
    expect(read('?read=banana').filter).toMatchObject({ readYearMin: null, readYearMax: null });
  });

  it('drops `drop` values, closed-vocabulary misses, bad enums, bad booleans and unknown sorts', () => {
    const s = read('?shelf=all&shelf=read&format=scroll&format=epub&match=most&owned=maybe&file=0&sort=bogus&v=huge');
    expect(s.filter.shelves).toEqual(['read']);
    expect(s.filter.formats).toEqual(['epub']);
    expect(s.filter.tagMatch).toBe('any');
    expect(s.filter.owned).toBeNull();
    expect(s.filter.hasFile).toBeNull(); // a flag only reads true
    expect(s.sort).toBe('title');
    expect(s.view).toBe('full');
  });

  it('booleans read 1/0 and true/false; a flag writes only true', () => {
    expect(read('?owned=true').filter.owned).toBe(true);
    expect(read('?owned=0').filter.owned).toBe(false);
    expect(C.toParams({ ...C.DEFAULT_STATE, filter: { ...C.EMPTY_FILTER, hasFile: false } }).toString()).toBe('');
  });

  it('a new sort resets the direction; defaults leave the URL; foreign params survive', () => {
    const p = C.write(new URLSearchParams('?sort=title&dir=desc&author=Banks&tab=paste'), { sort: 'dateAdded' });
    expect(p.get('sort')).toBe('dateAdded');
    expect(p.get('dir')).toBeNull();
    expect(p.get('tab')).toBe('paste');
    expect(C.write(p, { sort: 'title', authors: [] }).toString()).toBe('tab=paste');
    // dir alone keeps the sort
    expect(C.write(new URLSearchParams('?sort=author'), { dir: 'desc' }).toString()).toBe('sort=author&dir=desc');
  });

  it('a patch may carry filter fields, a whole filter, or state fields', () => {
    let p = C.write(new URLSearchParams(''), { tags: ['Cozy'], view: 'compact' });
    expect(p.toString()).toBe('tag=Cozy&v=compact');
    p = C.write(p, { filter: { series: ['Culture'] } });
    expect(p.getAll('series')).toEqual(['Culture']);
    expect(p.getAll('tag')).toEqual(['Cozy']);
    p = C.write(p, C.clearPatch());
    expect(p.toString()).toBe('');
  });

  it('the random sort mints a seed, keeps it while filtering, and drops it on leaving', () => {
    const p = C.write(new URLSearchParams(''), { sort: 'random' });
    const seed = Number(p.get('seed'));
    expect(seed).toBeGreaterThan(0);
    expect(read(`?${p}`).seed).toBe(seed);
    const narrowed = C.write(p, { tags: ['Cozy'] });
    expect(Number(narrowed.get('seed'))).toBe(seed);
    // Choosing random again keeps the shuffle; an explicit seed replaces it.
    expect(Number(C.write(narrowed, { sort: 'random' }).get('seed'))).toBe(seed);
    expect(C.write(narrowed, { seed: 7 }).get('seed')).toBe('7');
    const titled = C.write(narrowed, { sort: 'title' });
    expect(titled.get('seed')).toBeNull();
    expect(read(`?${titled}`).seed).toBeNull();
    // A seed on a non-random sort is ignored.
    expect(read('?sort=author&seed=5').seed).toBeNull();
  });

  it('toFilterInput sends only what narrows; `requires` holds a modifier back', () => {
    expect(C.toFilterInput(C.EMPTY_FILTER)).toBeNull();
    expect(C.toFilterInput({ ...C.EMPTY_FILTER, tagMatch: 'all' })).toBeNull();
    expect(C.toFilterInput({ ...C.EMPTY_FILTER, q: '  dune ', tags: ['A', 'A '], tagMatch: 'all', owned: false, ratingMin: 3 })).toEqual({
      q: 'dune',
      tags: ['A'],
      tagMatch: 'all',
      owned: false,
      ratingMin: 3,
    });
  });

  it('counts each list value, set booleans, flags, ranges and state fields — not search or modifiers', () => {
    expect(C.activeCount(C.DEFAULT_STATE)).toBe(0);
    expect(C.activeCount(read('?author=A&author=B&match=all&owned=1&file=1&read=2000-&v=compact&q=x'))).toBe(6);
    expect(C.isNarrowed(read('?q=x'))).toBe(true);
    expect(C.isNarrowed(read('?q=%20'))).toBe(false);
  });

  it('viewSearch opens a stored view, validating it, with a fresh shuffle for random', () => {
    const s = C.viewSearch({ filter: { authors: ['Banks'] }, sort: 'rating', dir: 'asc', view: 'compact' });
    expect(read(s)).toMatchObject({ sort: 'rating', dir: 'asc', view: 'compact' });
    expect(read(s).filter.authors).toEqual(['Banks']);
    expect(C.viewSearch({ sort: 'nope', dir: 'sideways', view: 'huge' })).toBe('');
    expect(Number(new URLSearchParams(C.viewSearch({ sort: 'random' })).get('seed'))).toBeGreaterThan(0);
  });

  it('canonicalSearch ignores param order and the seed; searchWith adds one value', () => {
    expect(C.canonicalSearch('?author=A&tag=B')).toBe(C.canonicalSearch('?tag=B&author=A'));
    expect(C.canonicalSearch('?sort=random&seed=4')).toBe(C.canonicalSearch('?sort=random&seed=99'));
    expect(C.searchWith('?format=epub', 'authors', 'Banks')).toBe('?author=Banks&format=epub');
    expect(C.searchWith('?author=Banks', 'authors', 'Banks')).toBe('?author=Banks');
    expect(C.searchWith('', 'tags', 'Cozy')).toBe('?tag=Cozy');
  });

  it('a legacy reader runs last, and custom param names are honoured', () => {
    const codec = createFilterCodec({
      fields: [
        { key: 'q', type: 'search', param: 'search' },
        { key: 'shelves', type: 'list', param: 's' },
        { key: 'year', type: 'range', param: 'y', minKey: 'yMin', maxKey: 'yMax', parse: integerBetween(1, 3000) },
      ],
      sorts: { order: ['title', 'added'], defaultDir: { added: 'desc' } },
      params: { sort: 'o', dir: 'd' },
      // Old links said ?status=reading for one shelf.
      legacy: (params, state) =>
        params.get('status') && !state.filter.shelves.length ? { ...state, filter: { ...state.filter, shelves: [params.get('status')] } } : state,
    });
    const s = codec.read(new URLSearchParams('?status=reading&o=added&search=x'));
    expect(s.filter.shelves).toEqual(['reading']);
    expect(s).toMatchObject({ sort: 'added', dir: 'desc' });
    expect(codec.toParams(s).toString()).toBe('search=x&s=reading&o=added');
    // No random sort configured: never a seed.
    expect(codec.read(new URLSearchParams('?o=random&seed=3')).seed).toBeNull();
  });
});
