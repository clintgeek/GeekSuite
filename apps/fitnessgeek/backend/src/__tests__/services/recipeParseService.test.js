// Paste-to-fill for recipes (DOCS/RECIPES_PLAN.md §3): a pasted ingredient
// list becomes builder rows for review. Nothing is logged or saved, and a
// line that can't be identified comes back as `unresolved` instead of
// vanishing — a recipe silently missing its butter has wrong numbers.
//
// The resolver is injected: these pin the line cleaning, the amount → servings
// conversion, and the no-drop rule, not describe-and-log's lookup ladder.
const mod = (p) => new URL(p, import.meta.url).pathname;

import { describe, test, expect, jest } from '@jest/globals';

// describe-and-log pulls in models and the AI client; nothing here needs them.
jest.unstable_mockModule(mod('../../services/describeAndLogService.js'), () => ({
  __esModule: true,
  default: { resolveEntries: jest.fn() },
}));

const { parseRecipeText, cleanRecipeLine } = await import('../../services/recipeParseService.js');

const BEEF = { name: 'Ground beef 80/20', nutrition: { calories_per_serving: 254, protein_grams: 17.2 }, serving: { size: 100, unit: 'g' } };

/** A resolver that knows beef from the catalog and estimates onions. */
const fakeResolve = jest.fn(async (entries) =>
  entries.flatMap((entry) => {
    if (/beef/.test(entry.dish)) return [{ entry, source: 'catalog', foodId: '64b000000000000000000001', ...BEEF }];
    if (/onion/.test(entry.dish)) {
      return [{
        entry, source: 'estimate', servingsOverride: 1, name: 'Yellow onion',
        nutrition: { calories_per_serving: 44 }, serving: { size: 1, unit: 'serving' }, foodId: null,
      }];
    }
    return [];
  })
);

const PASTED = `Ingredients:
- 1 lb ground beef, browned
• 1 (15 oz) onion, diced
3. 1 pinch of unobtainium

Directions
1. Brown the beef.`;

describe('parseRecipeText', () => {
  test('every line comes back — matched with its amount, or visibly unresolved', async () => {
    const { ingredients } = await parseRecipeText(PASTED, { userId: 'u1', resolve: fakeResolve });

    expect(ingredients).toHaveLength(3);
    const [beef, onion, mystery] = ingredients;

    // 1 lb of a food served per 100 g = 4.536 servings.
    expect(beef).toMatchObject({ name: 'Ground beef 80/20', amount: 1, unit: 'lb', estimated: false });
    expect(beef.servings).toBeCloseTo(4.5359, 3);
    expect(beef.food_item_id).toBe('64b000000000000000000001');

    // An estimate already describes the whole amount: one serving of itself.
    expect(onion).toMatchObject({ name: 'Yellow onion', servings: 1, estimated: true });

    expect(mystery).toMatchObject({ unresolved: true });
    expect(mystery.line).toMatch(/unobtainium/);
  });

  test('stops at the directions, and resolves in ONE batched call', async () => {
    fakeResolve.mockClear();
    await parseRecipeText(PASTED, { userId: 'u1', resolve: fakeResolve });
    expect(fakeResolve).toHaveBeenCalledTimes(1);
    const dishes = fakeResolve.mock.calls[0][0].map((e) => e.dish);
    expect(dishes.join(' ')).not.toMatch(/brown the beef/);
  });

  test('a unit that cannot convert is counted as servings and flagged', async () => {
    const { ingredients } = await parseRecipeText('2 cups ground beef', { userId: 'u1', resolve: fakeResolve });
    expect(ingredients[0]).toMatchObject({ servings: 2, unit: 'serving', unitMismatch: true });
  });
});

describe('cleanRecipeLine', () => {
  test.each([
    ['- 2 cloves garlic, minced', '2 cloves garlic'],
    ['1 (15 oz) can kidney beans', '1 can kidney beans'],
    ['  3) 1 cup rice ', '1 cup rice'],
    ['For the sauce:', null],
    ['Ingredients', null],
    ['', null],
  ])('%j → %j', (raw, expected) => {
    expect(cleanRecipeLine(raw)).toBe(expected);
  });
});
