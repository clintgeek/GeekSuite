import { describe, expect, it } from 'vitest';
import {
  buildThingsVariables,
  filterInputFromSearch,
  libraryLinkWith,
  readLibraryState,
  savedViewSearch,
  stateToParams,
  toFilterInput,
  writeLibraryState,
} from '../../utils/libraryFilter';

const read = (s) => readLibraryState(new URLSearchParams(s));

describe('library codec', () => {
  it('reads every filter key from the URL', () => {
    const s = read('?type=ty-boat&type=ty-firearm&in=pl-garage&due=overdue&due=30d&tag=fishing&tag=lake&match=all&missing=receipt&photos=1&docs=0&year=2015-2022&value=500-2000&q=wendy');
    expect(s.filter).toMatchObject({
      q: 'wendy',
      types: ['ty-boat', 'ty-firearm'],
      places: ['pl-garage'],
      due: ['overdue', '30d'],
      tags: ['fishing', 'lake'],
      tagMatch: 'all',
      missing: ['receipt'],
      hasPhotos: true,
      hasDocuments: false,
      acquiredYearMin: 2015,
      acquiredYearMax: 2022,
      valueMin: 500,
      valueMax: 2000,
    });
  });

  it('drops values outside the closed vocabularies', () => {
    const s = read('?due=someday&missing=nope&missing=value');
    expect(s.filter.due).toEqual([]);
    expect(s.filter.missing).toEqual(['value']);
  });

  it('round-trips and never writes defaults', () => {
    const search = 'type=ty-boat&in=pl-garage&missing=receipt&photos=1&year=2015-&value=-2000&sort=value&dir=asc';
    expect(stateToParams(read(`?${search}`)).toString()).toBe(search);
    expect(stateToParams(read('?sort=name&dir=asc&match=any')).toString()).toBe('');
  });

  it('a new sort resets to its natural direction; random mints a seed', () => {
    const p = writeLibraryState(new URLSearchParams('sort=value&dir=asc'), { sort: 'recentlyAdded' });
    expect(p.toString()).toBe('sort=recentlyAdded');
    const r = writeLibraryState(new URLSearchParams(''), { sort: 'random' });
    expect(Number(r.get('seed'))).toBeGreaterThan(0);
  });

  it('builds GetThings variables', () => {
    expect(buildThingsVariables(read('?missing=serial&sort=value'), 2)).toEqual({ page: 2, limit: 48, sort: 'value', sortDir: 'desc', filter: { missing: ['serial'] } });
    expect(buildThingsVariables(read('?sort=random&seed=812'))).toMatchObject({ sort: 'random', sortDir: 'asc', seed: 812 });
    expect(buildThingsVariables(read(''))).toEqual({ page: 1, limit: 48, sort: 'name', sortDir: 'asc' });
  });

  it('sends tagMatch only with tags', () => {
    expect(toFilterInput(read('?match=all').filter)).toBeNull();
    expect(toFilterInput(read('?match=all&tag=a').filter)).toEqual({ tags: ['a'], tagMatch: 'all' });
  });

  it('saved views and one-filter links', () => {
    expect(savedViewSearch({ filter: { types: ['ty-boat'] }, sortBy: 'value', sortDir: 'desc' })).toBe('?type=ty-boat&sort=value');
    expect(savedViewSearch(null)).toBe('');
    expect(libraryLinkWith('missing', 'receipt')).toBe('/?missing=receipt');
    expect(filterInputFromSearch('?in=pl-shelf')).toEqual({ places: ['pl-shelf'] });
  });
});
