// Going-over 2026-09-05.
//
// Every list handler used to build its window with a bare
// `parseInt(req.query.page)` / `parseInt(req.query.limit)`:
//
//   - `?page=abc` produced `NaN`, and `.skip(NaN)` is a driver error, so a
//     malformed URL was a 500 rather than a first page;
//   - nothing bounded `limit`, so `?limit=1000000` asked Mongo for the whole
//     collection and serialized it into one response.
//
// `readPagination` is now the single place those two decisions are made. These
// pin its contract: always finite integers, page >= 1, 1 <= limit <= MAX.

import { readPagination, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from '../../utils/pagination.js';

describe('readPagination', () => {
  test('defaults to the first page at the default size', () => {
    expect(readPagination({})).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE, skip: 0 });
    expect(readPagination()).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE, skip: 0 });
  });

  test('reads a well-formed page/limit pair', () => {
    expect(readPagination({ page: '3', limit: '25' })).toEqual({ page: 3, limit: 25, skip: 50 });
  });

  test('a non-numeric page falls back to page 1 rather than NaN', () => {
    const { page, skip } = readPagination({ page: 'abc' });
    expect(page).toBe(1);
    expect(Number.isFinite(skip)).toBe(true);
    expect(skip).toBe(0);
  });

  test('a non-numeric limit falls back to the default rather than NaN', () => {
    const { limit } = readPagination({ limit: 'lots' });
    expect(limit).toBe(DEFAULT_PAGE_SIZE);
  });

  test('zero and negative values fall back rather than producing a negative skip', () => {
    expect(readPagination({ page: '0', limit: '0' })).toEqual({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      skip: 0,
    });
    expect(readPagination({ page: '-5' }).page).toBe(1);
    expect(readPagination({ page: '-5' }).skip).toBe(0);
  });

  test('an oversized limit is clamped, not honoured', () => {
    expect(readPagination({ limit: '1000000' }).limit).toBe(MAX_PAGE_SIZE);
  });

  test('a repeated query key (express hands over an array) reads the last value', () => {
    expect(readPagination({ limit: ['5', '7'] }).limit).toBe(7);
    expect(readPagination({ page: ['2', '4'] }).page).toBe(4);
  });

  test('every field is always a finite integer', () => {
    for (const query of [{}, { page: '' }, { limit: null }, { page: {}, limit: [] }]) {
      const result = readPagination(query);
      for (const value of Object.values(result)) {
        expect(Number.isInteger(value)).toBe(true);
      }
    }
  });
});
