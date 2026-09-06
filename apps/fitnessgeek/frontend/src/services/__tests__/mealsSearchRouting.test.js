/**
 * `GET /meals?search=` was a lie all the way down (BURN_REVIEW_2 #13):
 * `apiService.js`'s router matched `base === '/meals'` and returned
 * `{ query: GET_MEALS }` with no variables at all, so
 * `fitnessGeekService.getMeals(null, searchQuery)`'s `?search=` never reached
 * the gateway — and the gateway's `fitnessMeals` declared no `search`
 * argument to receive it either. Every one of `UnifiedFoodSearch.jsx`,
 * `FoodSearch.jsx` and `matcherService.js` typed "chicken" and got back every
 * saved meal. These pin the fixed wire contract: the operation carries a
 * `$search` variable, and it reaches it whether the caller goes through
 * `apiService.get` directly or through `fitnessGeekService.getMeals`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const query = vi.fn(() => Promise.resolve({ data: { fitnessMeals: [] } }));

vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ query, mutate: vi.fn() }),
}));

vi.mock('../restClient.js', () => ({
  restClient: {
    get: vi.fn(() => Promise.reject(new Error('restClient must not be used by meals'))),
    post: vi.fn(() => Promise.reject(new Error('restClient must not be used by meals'))),
    put: vi.fn(() => Promise.reject(new Error('restClient must not be used by meals'))),
    delete: vi.fn(() => Promise.reject(new Error('restClient must not be used by meals'))),
  },
}));

const { apiService } = await import('../apiService.js');
const { fitnessGeekService } = await import('../fitnessGeekService.js');

const operationName = (call) => call.query.definitions[0].name.value;
const lastCall = () => query.mock.calls.at(-1)[0];

beforeEach(() => {
  query.mockClear();
  query.mockResolvedValue({ data: { fitnessMeals: [] } });
});

describe('GET /meals search', () => {
  it('reaches the gateway as the GetFitnessMeals operation with $search set', async () => {
    await apiService.get('/meals', { params: { search: 'chicken' } });

    const call = lastCall();
    expect(operationName(call)).toBe('GetFitnessMeals');
    expect(call.variables.search).toBe('chicken');
  });

  it('an empty search still hits GetFitnessMeals, with search null', async () => {
    await apiService.get('/meals');

    const call = lastCall();
    expect(operationName(call)).toBe('GetFitnessMeals');
    expect(call.variables.search).toBeNull();
  });

  it('fitnessGeekService.getMeals(null, searchQuery) — the shape all three live callers use — passes search through', async () => {
    await fitnessGeekService.getMeals(null, 'chicken');

    const call = lastCall();
    expect(operationName(call)).toBe('GetFitnessMeals');
    expect(call.variables.search).toBe('chicken');
    expect(call.variables.mealType).toBeNull();
  });

  it('fitnessGeekService.getMeals() with no args lists everything — search stays null, not dropped', async () => {
    await fitnessGeekService.getMeals();

    const call = lastCall();
    expect(call.variables.search).toBeNull();
  });
});
