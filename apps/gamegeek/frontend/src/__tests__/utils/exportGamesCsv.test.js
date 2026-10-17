/**
 * The library export: everything the filter matches (every page), escaped so
 * a spreadsheet can't be tricked, named for what's inside. Mirrors BookGeek's.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  GAME_CSV_COLUMNS, buildGamesCsv, csvField, fetchAllMatchingGames, gameToRow, gamesCsvFilename,
} from '../../utils/exportGamesCsv';
import { formatLabel, platformLabel, storefrontLabel } from '../../utils/vocab';

const game = (over = {}) => ({
  id: 'g1',
  title: 'Hollow Knight',
  releaseYear: 2017,
  releaseDate: '2017-02-24T00:00:00.000Z',
  developers: ['Team Cherry'],
  publishers: ['Team Cherry'],
  series: { name: 'Hollow Knight', index: 1 },
  genres: ['Metroidvania'],
  tags: ['Favorites'],
  autoTags: ['hand-drawn', 'Favorites'],
  owned: true,
  createdAt: '2026-09-25T15:00:00.000Z',
  timeToBeat: { main: 26.5 },
  copies: [{ id: 'c1', platform: 'switch', format: 'physical', storefront: null }, { id: 'c2', platform: 'pc', storefront: 'steam' }],
  me: { shelf: 'finished', rating: 5, favorite: true, lastPlayedAt: '2026-10-01T02:00:00.000Z' },
  ...over,
});

describe('csvField', () => {
  it('quotes commas, quotes and newlines, and defuses formulas', () => {
    expect(csvField('Eats, Shoots')).toBe('"Eats, Shoots"');
    expect(csvField('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField(false)).toBe('No');
    expect(csvField(null)).toBe('');
  });
});

describe('gameToRow', () => {
  it('flattens a game into plain columns, with labels people read', () => {
    const row = gameToRow(game());
    expect(row.seriesName).toBe('Hollow Knight');
    expect(row.seriesIndex).toBe(1);
    expect(row.shelf).toBe('Finished');
    expect(row.platforms).toEqual([`${platformLabel('switch')} · ${formatLabel('physical')}`, `${platformLabel('pc')} · ${storefrontLabel('steam')}`]);
    expect(row.tags).toEqual(['Favorites', 'hand-drawn']);
    expect(row.releaseDate).toBe('2017-02-24');
    expect(row.timeToBeat).toBe(26.5);
  });

  it('has no hours-played column (playtime is not tracked)', () => {
    expect(GAME_CSV_COLUMNS.some((c) => /hours played/i.test(c.label))).toBe(false);
  });

  it('a custom shelf uses its own name', () => {
    const row = gameToRow(game({ me: { shelf: 'custom-couch' } }), { customShelves: [{ id: 'custom-couch', label: 'Couch co-op' }] });
    expect(row.shelf).toBe('Couch co-op');
  });
});

describe('buildGamesCsv', () => {
  it('has a header, one CRLF row per game, and a comma-safe title', () => {
    const csv = buildGamesCsv([game({ title: 'Papers, Please' })]);
    const lines = csv.split('\r\n');
    expect(lines[0].startsWith('Title,Year,Release date')).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[1].startsWith('"Papers, Please",2017,2017-02-24')).toBe(true);
  });

  it('a filter matching nothing is still a valid file with a header', () => {
    expect(buildGamesCsv([]).split('\r\n')).toHaveLength(1);
  });
});

describe('gamesCsvFilename', () => {
  it('says what the filter was, and the day', () => {
    const name = gamesCsvFilename({ shelves: ['backlog'], q: 'zelda' }, new Date(2026, 9, 17, 12));
    expect(name).toBe('gamegeek-backlog-search-zelda-2026-10-17.csv');
  });
});

describe('fetchAllMatchingGames', () => {
  it('walks every page of the SAME filter and sort, 100 at a time — not just the rows loaded', async () => {
    const query = vi.fn(async ({ variables }) => ({
      data: { games: { games: variables.page === 1 ? Array.from({ length: 100 }, (_, i) => game({ id: `a${i}` })) : [game({ id: 'last' })], total: 101, page: variables.page, pages: 2 } },
    }));
    const vars = { page: 1, limit: 48, sort: 'rating', sortDir: 'desc', filter: { shelves: ['backlog'] } };
    const all = await fetchAllMatchingGames({ query }, vars);
    expect(all).toHaveLength(101);
    expect(query).toHaveBeenCalledTimes(2);
    for (const [call] of query.mock.calls) {
      expect(call.variables).toMatchObject({ limit: 100, sort: 'rating', sortDir: 'desc', filter: { shelves: ['backlog'] } });
      expect(call.fetchPolicy).toBe('no-cache');
    }
  });

  it('stops on an empty page even if total lies', async () => {
    const query = vi.fn(async () => ({ data: { games: { games: [], total: 999, pages: 99 } } }));
    expect(await fetchAllMatchingGames({ query }, {})).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
