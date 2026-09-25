import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STATE,
  EMPTY_FILTER,
  activeFilterCount,
  buildGamesVariables,
  canonicalSearch,
  librarySearchWith,
  readLibraryState,
  savedViewSearch,
  stateToParams,
  toFilterInput,
  writeLibraryState,
} from '../../utils/libraryFilter';

const read = (search) => readLibraryState(new URLSearchParams(search));
const vars = (search, page) => buildGamesVariables(read(search), page);

const FULL = {
  filter: {
    ...EMPTY_FILTER,
    q: 'zelda, tears',
    shelves: ['backlog', 'unshelved'],
    genres: ['RPG', 'Card & Board', 'Odd, With Comma'],
    tags: ['Roguelike', "Beat 'em up"],
    tagMatch: 'all',
    storefronts: ['steam', 'gog'],
    platforms: ['pc'],
    formats: ['subscription'],
    modes: ['coop-online'],
    played: 'recent',
    favorite: true,
    releaseYearMin: 2010,
    releaseYearMax: 2020,
    lengths: ['short', 'unknown'],
    metadata: ['no-match', 'ambiguous'],
    hasCover: false,
  },
  owned: 'true',
  sort: 'timeToBeat',
  dir: 'desc',
  seed: null,
};

describe('library URL codec', () => {
  it('the plain library is plain / and asks for page 1, title A→Z, no filter', () => {
    expect(stateToParams(DEFAULT_STATE).toString()).toBe('');
    expect(vars('')).toEqual({ page: 1, limit: 48, sort: 'title', sortDir: 'asc' });
  });

  it('round-trips the whole GameFilterInput, sort and direction', () => {
    const params = stateToParams(FULL);
    expect(read(`?${params.toString()}`)).toEqual(FULL);
  });

  it('writes multi-values as repeated params, so a value with a comma survives', () => {
    const params = stateToParams(FULL);
    expect(params.getAll('genre')).toEqual(['RPG', 'Card & Board', 'Odd, With Comma']);
    expect(params.get('year')).toBe('2010-2020');
    expect(params.get('fav')).toBe('1');
    expect(params.get('cover')).toBe('0');
  });

  it('reads one-sided year ranges and swaps a reversed one', () => {
    expect(read('?year=2015-').filter).toMatchObject({ releaseYearMin: 2015, releaseYearMax: null });
    expect(read('?year=-1999').filter).toMatchObject({ releaseYearMin: null, releaseYearMax: 1999 });
    expect(read('?year=2020-2010').filter).toMatchObject({ releaseYearMin: 2010, releaseYearMax: 2020 });
    expect(read('?year=banana').filter).toMatchObject({ releaseYearMin: null, releaseYearMax: null });
  });

  it('keeps the old single-value links working', () => {
    const s = read('?shelf=backlog&platform=switch&owned=false&sort=hoursPlayed&dir=asc&q=mario');
    expect(s.filter.shelves).toEqual(['backlog']);
    expect(s.filter.platforms).toEqual(['switch']);
    expect(s.owned).toBe('false');
    expect(vars('?shelf=backlog&platform=switch&owned=false&sort=hoursPlayed&dir=asc&q=mario')).toEqual({
      page: 1,
      limit: 48,
      sort: 'hoursPlayed',
      sortDir: 'asc',
      owned: 'false',
      filter: { q: 'mario', shelves: ['backlog'], platforms: ['switch'] },
    });
    expect(read('?shelf=all').filter.shelves).toEqual([]);
  });

  it('drops unknown enum values and unknown sorts', () => {
    const s = read('?played=sometimes&length=forever&length=short&meta=nope&sort=bogus');
    expect(s.filter.played).toBe('');
    expect(s.filter.lengths).toEqual(['short']);
    expect(s.filter.metadata).toEqual([]);
    expect(s.sort).toBe('title');
  });

  it('a new sort resets the direction; defaults leave the URL; foreign params survive', () => {
    const p = writeLibraryState(new URLSearchParams('?sort=title&dir=desc&genre=RPG&tab=paste'), { sort: 'lastPlayed' });
    expect(p.get('sort')).toBe('lastPlayed');
    expect(p.get('dir')).toBeNull();
    expect(p.get('genre')).toBe('RPG');
    expect(p.get('tab')).toBe('paste');
    const back = writeLibraryState(p, { sort: 'title', genres: [] });
    expect(back.toString()).toBe('tab=paste');
  });

  it('random mints a seed, keeps it in the URL, and sends it with every page', () => {
    const p = writeLibraryState(new URLSearchParams(''), { sort: 'random' });
    const seed = Number(p.get('seed'));
    expect(seed).toBeGreaterThan(0);
    const search = `?${p.toString()}`;
    expect(vars(search, 1).seed).toBe(seed);
    expect(vars(search, 2)).toMatchObject({ page: 2, sort: 'random', seed });
    // Changing a filter under a shuffle keeps the same shuffle.
    const narrowed = writeLibraryState(p, { genres: ['RPG'] });
    expect(Number(narrowed.get('seed'))).toBe(seed);
    // Leaving random drops the seed from the URL and the variables.
    const titled = writeLibraryState(narrowed, { sort: 'title' });
    expect(titled.get('seed')).toBeNull();
    expect(vars(`?${titled.toString()}`).seed).toBeUndefined();
  });

  it('only what narrows goes into GameFilterInput; tagMatch only with genres or tags', () => {
    expect(toFilterInput(EMPTY_FILTER)).toBeNull();
    expect(toFilterInput({ ...EMPTY_FILTER, tagMatch: 'all' })).toBeNull();
    expect(toFilterInput({ ...EMPTY_FILTER, q: '  ', tags: ['Cozy'], tagMatch: 'all', favorite: false })).toEqual({
      tags: ['Cozy'],
      tagMatch: 'all',
      favorite: false,
    });
  });

  it('counts each selected value, not the search', () => {
    expect(activeFilterCount(DEFAULT_STATE)).toBe(0);
    expect(activeFilterCount(read('?genre=RPG&genre=Puzzle&played=never&q=x&year=2000-'))).toBe(4);
  });

  it('applies saved views, new (whole filter JSON) and old (legacy fields)', () => {
    const fresh = savedViewSearch({ id: 'v1', name: 'Short RPGs', filter: { genres: ['RPG'], lengths: ['short'] }, sortBy: 'timeToBeat', sortDir: 'asc' });
    expect(read(fresh).filter).toMatchObject({ genres: ['RPG'], lengths: ['short'] });
    expect(read(fresh).sort).toBe('timeToBeat');
    const legacy = savedViewSearch({ id: 'v0', name: 'Old', searchQuery: 'zelda', shelfFilter: 'backlog', platformFilter: 'switch', ownedFilter: 'true', sortBy: 'rating', sortDir: 'desc' });
    expect(read(legacy)).toMatchObject({ owned: 'true', sort: 'rating', dir: 'desc' });
    expect(read(legacy).filter).toMatchObject({ q: 'zelda', shelves: ['backlog'], platforms: ['switch'] });
  });

  it('canonical search ignores param order and the seed', () => {
    expect(canonicalSearch('?genre=RPG&store=steam')).toBe(canonicalSearch('?store=steam&genre=RPG'));
    expect(canonicalSearch('?sort=random&seed=4')).toBe(canonicalSearch('?sort=random&seed=99'));
  });

  it('a detail-page link adds its value to the library it came from', () => {
    expect(librarySearchWith('?store=steam', 'genres', 'RPG')).toBe('?store=steam&genre=RPG');
    expect(librarySearchWith('?genre=RPG', 'genres', 'RPG')).toBe('?genre=RPG');
    expect(librarySearchWith('', 'tags', 'Cozy')).toBe('?tag=Cozy');
  });
});
