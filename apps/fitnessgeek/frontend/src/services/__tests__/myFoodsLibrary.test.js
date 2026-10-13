/**
 * My Foods asked the gateway for "all foods" and got the caller's rows plus
 * the whole shared catalog (USDA / OpenFoodFacts / AI rows), sorted A→Z and
 * capped at 100 — so a person's own foods competed with strangers' rows for
 * the slots. It never selected `source` either, which MyFoods' search filter
 * reads. The library now asks for `mine: true` and selects `source`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { print } from 'graphql';

const query = vi.fn(() => Promise.resolve({ data: { fitnessFoods: [] } }));

vi.mock('@geeksuite/api-client', () => ({
  createApolloClient: () => ({ query, mutate: vi.fn() }),
}));

const { fitnessGeekService } = await import('../fitnessGeekService.js');

describe('My Foods library query', () => {
  beforeEach(() => query.mockClear());

  it('asks for the caller’s own foods, with their source', async () => {
    await fitnessGeekService.getAllFoods();

    const op = query.mock.calls[0][0];
    expect(op.variables).toMatchObject({ mine: true });
    expect(print(op.query)).toMatch(/fitnessFoods\(search: \$search, mine: \$mine\)/);
    expect(print(op.query)).toMatch(/\bsource\b/);
  });
});
