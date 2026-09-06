/**
 * The wire contract for natural-language quick-add (AI_IDEAS.md idea #2,
 * stream R115).
 *
 * Two things this pins, and both are the kind of drift `gql-arg-audit` exists
 * to shout about one layer up:
 *
 *   1. `/quick-add/parse` reaches the gateway as the `ParseFoodEntry` query
 *      with `$text` and `$date` actually set. A variable the document never
 *      declares is dropped in silence, and a `date` that never arrives means
 *      every meal type is guessed from the server's UTC hour.
 *   2. `date` is the caller's LOCAL wall clock (`YYYY-MM-DDTHH:mm`), not a
 *      calendar date and not an ISO instant. The gateway runs UTC (BURN_REVIEW
 *      #13) and reads the hour off this string to pick a meal type; send it a
 *      bare `YYYY-MM-DD` and everyone west of UTC gets the wrong meal all
 *      evening.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.fn();

vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ query, mutate: vi.fn() }),
}));

vi.mock('../restClient.js', () => ({
  restClient: {
    get: vi.fn(() => Promise.reject(new Error('quick-add must not touch restClient'))),
    post: vi.fn(() => Promise.reject(new Error('quick-add must not touch restClient'))),
    put: vi.fn(() => Promise.reject(new Error('quick-add must not touch restClient'))),
    delete: vi.fn(() => Promise.reject(new Error('quick-add must not touch restClient'))),
  },
}));

const { apiService } = await import('../apiService.js');
const { quickAddService, localWallClock } = await import('../quickAddService.js');

const EMPTY = {
  data: {
    parseFoodEntry: {
      fragments: [{ text: 'two eggs', query: 'eggs', servings: 2, unit: null, mealType: 'breakfast' }],
      provenance: { source: 'model', reason: null, model: 'llama', provider: 'groq', cached: false, callsToday: 1, cap: 40 },
    },
  },
};

const lastCall = () => query.mock.calls.at(-1)[0];
const operationName = (call) => call.query.definitions[0].name.value;

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue(EMPTY);
});

describe('localWallClock', () => {
  it('is the browser\'s own YYYY-MM-DDTHH:mm, zero-padded', () => {
    expect(localWallClock(new Date(2026, 8, 6, 8, 5))).toBe('2026-09-06T08:05');
    expect(localWallClock(new Date(2026, 11, 31, 21, 0))).toBe('2026-12-31T21:00');
  });
});

describe('GET /quick-add/parse', () => {
  it('reaches the gateway as ParseFoodEntry with $text and $date set', async () => {
    await apiService.get('/quick-add/parse', { params: { text: 'two eggs', date: '2026-09-06T08:30' } });

    const call = lastCall();
    expect(operationName(call)).toBe('ParseFoodEntry');
    expect(call.variables).toEqual({ text: 'two eggs', date: '2026-09-06T08:30' });
  });

  it('every variable the document declares is passed, and none is passed undeclared', async () => {
    await apiService.get('/quick-add/parse', { params: { text: 'x', date: '2026-09-06T08:30' } });

    const call = lastCall();
    const declared = call.query.definitions[0].variableDefinitions
      .map((v) => v.variable.name.value)
      .sort();
    expect(declared).toEqual(['date', 'text']);
    expect(Object.keys(call.variables).sort()).toEqual(declared);
  });

  it('quickAddService.parse sends the local wall clock and unwraps the proposal', async () => {
    const result = await quickAddService.parse('two eggs', { now: new Date(2026, 8, 6, 19, 45) });

    expect(lastCall().variables).toEqual({ text: 'two eggs', date: '2026-09-06T19:45' });
    expect(result.fragments).toHaveLength(1);
    expect(result.provenance.source).toBe('model');
  });

  it('trims the sentence and never calls the gateway for an empty one', async () => {
    const result = await quickAddService.parse('   ');
    expect(query).not.toHaveBeenCalled();
    expect(result).toEqual({ fragments: [], provenance: null });
  });

  it('a gateway answer with no fragments degrades to an empty proposal, not a crash', async () => {
    query.mockResolvedValue({ data: { parseFoodEntry: { fragments: null, provenance: null } } });
    await expect(quickAddService.parse('zzz')).resolves.toEqual({ fragments: [], provenance: null });
  });
});
