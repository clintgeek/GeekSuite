// Going-over 2026-09-05: every list handler in this backend built its window
// with a bare `parseInt(req.query.page)` / `parseInt(req.query.limit)`.
//
// Two things went wrong with that. A non-numeric value (`?page=abc`, or a
// repeated query key, which express hands over as an array) produced `NaN`,
// and `.skip(NaN)` is a driver error — an ordinary 500 on a malformed URL. And
// nothing bounded `limit`, so `?limit=1000000` asked Mongo for the whole
// collection and serialized it in one response.
//
// `readPagination` is the one place those two decisions are made.

/** Largest page a caller may ask for. Above this the value is clamped, not rejected. */
export const MAX_PAGE_SIZE = 200;

/** What a caller gets when they ask for nothing. */
export const DEFAULT_PAGE_SIZE = 20;

const toPositiveInt = (value, fallback, max) => {
  // express gives an array for a repeated query key; take the last one, the
  // same value a naive `parseInt` on the array would have stringified badly.
  const raw = Array.isArray(value) ? value[value.length - 1] : value;
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return max ? Math.min(n, max) : n;
};

/**
 * Read `page`/`limit` off a query string into a safe `{ page, limit, skip }`.
 *
 * Always returns finite integers: `page >= 1`, `1 <= limit <= MAX_PAGE_SIZE`,
 * `skip = (page - 1) * limit`.
 *
 * @param {object} [query] `req.query`
 * @returns {{ page: number, limit: number, skip: number }}
 */
export function readPagination(query = {}) {
  const page = toPositiveInt(query.page, 1);
  const limit = toPositiveInt(query.limit, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return { page, limit, skip: (page - 1) * limit };
}
