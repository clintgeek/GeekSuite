/**
 * foodQueryParser — the one-dish rule, and the named queries from
 * DOCS/THE_FOOD_SEARCH_PLAN.md §4.1.
 *
 * Every case in the first block is a real search that used to come back wrong.
 * `4 chocolate chip pancakes homemade` classified as `chocolate chip` ×4 +
 * `pancakes` + an invented `pancake mix`, which is how a query naming one food
 * returned a bag of chocolate chips and no pancakes. These tests are the fence
 * around that.
 */

import { describe, test, expect } from '@jest/globals';
import {
  parseFoodQuery,
  parseFragment,
  itemIsGroundedInQuery,
  normalizeQuery,
  tokenize,
  endsWithDishNoun
} from '../../services/foodQueryParser.js';

const searchTexts = (query) => parseFoodQuery(query).fragments.map((f) => f.searchText);

describe('the named queries (plan §4.1)', () => {
  test('"4 chocolate chip pancakes homemade" is ONE dish, four servings', () => {
    const result = parseFoodQuery('4 chocolate chip pancakes homemade');

    expect(result.fragments).toHaveLength(1);
    expect(result.explicitlySeparated).toBe(false);
    expect(result.isSingleDish).toBe(true);

    const [dish] = result.fragments;
    expect(dish.searchText).toBe('chocolate chip pancakes');
    expect(dish.servings).toBe(4);
    expect(dish.isDish).toBe(true);
    // "homemade" is provenance, not an ingredient, and never reaches a search.
    expect(dish.noise).toContain('homemade');
    expect(dish.searchText).not.toContain('homemade');
  });

  test('"chocolate chip pancakes" does not shatter into chocolate + chip + pancake', () => {
    expect(searchTexts('chocolate chip pancakes')).toEqual(['chocolate chip pancakes']);
  });

  test('"peanut butter and jelly sandwich" is a sandwich, not a shopping list', () => {
    const result = parseFoodQuery('peanut butter and jelly sandwich');
    expect(result.fragments).toHaveLength(1);
    expect(result.fragments[0].searchText).toBe('peanut butter and jelly sandwich');
    expect(result.fragments[0].isDish).toBe(true);
  });

  test('"greek yogurt with honey and granola" DOES separate — the text says so', () => {
    expect(searchTexts('greek yogurt with honey and granola')).toEqual([
      'greek yogurt',
      'honey',
      'granola'
    ]);
  });

  test('"2 eggs and toast" separates, and the quantity lands on the eggs', () => {
    const result = parseFoodQuery('2 eggs and toast');
    expect(result.fragments.map((f) => [f.searchText, f.servings])).toEqual([
      ['eggs', 2],
      ['toast', 1]
    ]);
  });

  test('a duplicated item appears once', () => {
    // The classifier used to return "granola" twice for one query.
    expect(searchTexts('granola, honey and granola')).toEqual(['granola', 'honey']);
  });
});

describe('the grounding guard', () => {
  test('rejects an item the person never typed', () => {
    expect(itemIsGroundedInQuery('pancake mix', '4 chocolate chip pancakes homemade')).toBe(false);
  });

  test('accepts an item drawn from the query', () => {
    expect(itemIsGroundedInQuery('pancakes', '4 chocolate chip pancakes homemade')).toBe(true);
    expect(itemIsGroundedInQuery('chocolate chip', '4 chocolate chip pancakes homemade')).toBe(true);
  });

  test('is singular/plural tolerant', () => {
    expect(itemIsGroundedInQuery('egg', '2 eggs and toast')).toBe(true);
  });

  test('rejects an empty or meaningless item', () => {
    expect(itemIsGroundedInQuery('', 'toast')).toBe(false);
    expect(itemIsGroundedInQuery('and the', 'toast')).toBe(false);
  });
});

describe('quantities and units', () => {
  test.each([
    ['4 pancakes', 4, null],
    ['two eggs', 2, null],
    ['a banana', 1, null],
    ['1/2 cup rice', 0.5, 'cup'],
    ['1.5 cups oats', 1.5, 'cup'],
    ['2x protein bar', 2, null],
    ['a cup of coffee', 1, 'cup'],
    ['12 oz steak', 12, 'oz']
  ])('%s → %p servings, %p unit', (query, servings, unit) => {
    const [fragment] = parseFoodQuery(query).fragments;
    expect(fragment.servings).toBe(servings);
    expect(fragment.unit).toBe(unit);
  });

  test('a bare food gets one serving', () => {
    expect(parseFoodQuery('toast').fragments[0].servings).toBe(1);
  });

  test('an absurd leading number is treated as part of the name, not a quantity', () => {
    const [fragment] = parseFoodQuery('7up').fragments;
    expect(fragment.searchText).toBe('7up');
    expect(fragment.servings).toBe(1);
  });
});

describe('what stays in the search text', () => {
  test('preparation words stay — catalogs index them', () => {
    const [fragment] = parseFoodQuery('grilled chicken breast').fragments;
    expect(fragment.searchText).toBe('grilled chicken breast');
    expect(fragment.preparation).toEqual(['grilled']);
  });

  test('"plain" and "fresh" are catalog words, not noise', () => {
    expect(searchTexts('plain greek yogurt')).toEqual(['plain greek yogurt']);
    expect(searchTexts('fresh mozzarella')).toEqual(['fresh mozzarella']);
  });

  test('provenance words are stripped but remembered', () => {
    const [fragment] = parseFoodQuery('leftover lasagna').fragments;
    expect(fragment.searchText).toBe('lasagna');
    expect(fragment.noise).toEqual(['leftover']);
  });
});

describe('separators', () => {
  test('commas split', () => {
    expect(searchTexts('coffee, toast, banana')).toEqual(['coffee', 'toast', 'banana']);
  });

  test('a dish fragment survives a comma split intact', () => {
    expect(searchTexts('coffee, peanut butter and jelly sandwich')).toEqual([
      'coffee',
      'peanut butter and jelly sandwich'
    ]);
  });

  test('"w/" is a conjunction', () => {
    expect(searchTexts('bagel w/ cream cheese')).toEqual(['bagel', 'cream cheese']);
  });

  test('a fraction is not a separator', () => {
    expect(searchTexts('1/2 avocado')).toEqual(['avocado']);
  });

  test('no separator means no decomposition, however long the query', () => {
    const result = parseFoodQuery('spicy korean fried chicken thigh');
    expect(result.fragments).toHaveLength(1);
    expect(result.explicitlySeparated).toBe(false);
  });
});

describe('head nouns', () => {
  test.each([
    ['chicken pot pie', true],
    ['peanut butter and jelly sandwich', true],
    ['chicken and rice bowl', true],
    ['blueberry pancakes', true],
    ['greek yogurt', false],
    ['honey', false]
  ])('endsWithDishNoun(%s) === %p', (text, expected) => {
    expect(endsWithDishNoun(text)).toBe(expected);
  });

  test('a dish noun suppresses the conjunction split', () => {
    expect(searchTexts('chicken and rice bowl')).toEqual(['chicken and rice bowl']);
  });
});

describe('edges', () => {
  test.each([null, undefined, '', '   ', ',,,', 'and'])('%p yields no fragments', (input) => {
    expect(parseFoodQuery(input).fragments).toEqual([]);
  });

  test('normalizeQuery flattens what people actually type', () => {
    expect(normalizeQuery('  Chocolate   Chip PANCAKES. ')).toBe('chocolate chip pancakes');
  });

  test('tokenize drops grammar words', () => {
    expect(tokenize('peanut butter and jelly')).toEqual(['peanut', 'butter', 'jelly']);
  });

  test('parseFragment returns null for a fragment with no food left', () => {
    expect(parseFragment('   ')).toBeNull();
    expect(parseFragment('homemade')).toBeNull();
  });
});
