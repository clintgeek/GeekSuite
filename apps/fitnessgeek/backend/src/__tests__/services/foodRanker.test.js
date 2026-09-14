/**
 * foodRanker — the golden set.
 *
 * The fixtures are shaped like what USDA and OpenFoodFacts actually return for
 * these queries, including the results that used to win. Every `topName`
 * assertion here is a search that came back wrong in production.
 *
 * Plan: DOCS/THE_FOOD_SEARCH_PLAN.md §3, §4.1.
 */

import { describe, test, expect } from '@jest/globals';
import { parseFoodQuery } from '../../services/foodQueryParser.js';
import { rankFoodResults, scoreFoodResult, recencyDecay, isConfidentMatch } from '../../services/foodRanker.js';

const food = (name, overrides = {}) => ({
  name,
  brand: '',
  source: 'usda',
  nutrition: { calories_per_serving: 200, protein_grams: 5, carbs_grams: 30, fat_grams: 6 },
  ...overrides
});

/** Rank a result set against the first fragment of a query. */
const rankFor = (query, results, options) => {
  const [fragment] = parseFoodQuery(query).fragments;
  return rankFoodResults(results, fragment, options);
};

const names = (ranked) => ranked.map((r) => r.name);

describe('the pancake case', () => {
  // What the search actually returned: chocolate chips and pancake syrup.
  const results = [
    food('Chocolate chips, semi-sweet'),
    food('Pancake syrup'),
    food('Pancake mix, dry'),
    food('Pancakes, chocolate chip'),
    food('Chocolate chip cookies')
  ];

  test('"chocolate chip pancakes" puts the pancakes first', () => {
    expect(names(rankFor('chocolate chip pancakes', results))[0]).toBe('Pancakes, chocolate chip');
  });

  test('"4 chocolate chip pancakes homemade" puts the pancakes first', () => {
    expect(names(rankFor('4 chocolate chip pancakes homemade', results))[0])
      .toBe('Pancakes, chocolate chip');
  });

  test('a bag of chocolate chips is not in the top two', () => {
    const top2 = names(rankFor('4 chocolate chip pancakes homemade', results)).slice(0, 2);
    expect(top2).not.toContain('Chocolate chips, semi-sweet');
  });

  test('pancake syrup loses to pancakes even for the bare word', () => {
    const ranked = names(rankFor('pancakes', [food('Pancake syrup'), food('Pancakes, plain')]));
    expect(ranked[0]).toBe('Pancakes, plain');
  });
});

describe('what USDA really answers (captured live, 2026-09-14)', () => {
  // The real top-30 for "chocolate chip pancakes", in USDA's own order — which
  // is the order the old search handed to the screen.
  const realUsda = [
    'Pancakes, chocolate',
    'Pancakes, chocolate, frozen',
    'Pancakes, chocolate, fast food / restaurant',
    'Chocolate chips',
    'Chinese pancake',
    'Pancake syrup',
    'Cookie, chocolate chip, reduced fat',
    'Cookie, oatmeal, with chocolate chips'
  ].map((name) => food(name));

  test('pancakes take the top three; the bag of chips does not place', () => {
    const ranked = names(rankFor('4 chocolate chip pancakes homemade', realUsda));

    expect(ranked.slice(0, 3)).toEqual([
      'Pancakes, chocolate',
      'Pancakes, chocolate, frozen',
      'Pancakes, chocolate, fast food / restaurant'
    ]);
    expect(ranked.slice(0, 3)).not.toContain('Chocolate chips');
    expect(ranked[ranked.length - 1]).toMatch(/^Cookie/);
  });

  test('"Pancakes, chocolate" counts as the dish even though it drops a word', () => {
    // It scores ~213 — far below any points floor calibrated on a full-token
    // match, and yet it is obviously the right food. This is why confidence is
    // structural (head noun + coverage) rather than a number.
    const [fragment] = parseFoodQuery('4 chocolate chip pancakes homemade').fragments;
    const [top] = rankFoodResults(realUsda, fragment);

    expect(top.name).toBe('Pancakes, chocolate');
    expect(isConfidentMatch(top, fragment)).toBe(true);
  });

  test('a result that never mentions the dish is never confident', () => {
    const [fragment] = parseFoodQuery('chocolate chip pancakes').fragments;
    const [top] = rankFoodResults([food('Chocolate chips, semi-sweet')], fragment);

    expect(isConfidentMatch(top, fragment)).toBe(false);
  });

  test('a one-word coincidence is not confident either', () => {
    const [fragment] = parseFoodQuery('chocolate chip pancakes').fragments;
    const [top] = rankFoodResults([food('Pancake syrup')], fragment);

    expect(isConfidentMatch(top, fragment)).toBe(false);
  });

  test('an exact match with no calories is not an answer', () => {
    const [fragment] = parseFoodQuery('cheddar').fragments;
    const [top] = rankFoodResults(
      [food('Cheddar', { nutrition: { calories_per_serving: 0 } })],
      fragment
    );

    expect(isConfidentMatch(top, fragment)).toBe(false);
  });
});

describe('extra words are the tiebreaker', () => {
  test('a name that adds nothing beats one that adds a lot', () => {
    const ranked = names(rankFor('greek yogurt', [
      food('Greek yogurt parfait with granola and berries'),
      food('Greek yogurt')
    ]));
    expect(ranked[0]).toBe('Greek yogurt');
  });

  test('exact match wins outright', () => {
    const ranked = names(rankFor('cheddar', [food('Cheddar cheese, sharp'), food('Cheddar')]));
    expect(ranked[0]).toBe('Cheddar');
  });
});

describe('food the person actually eats', () => {
  const personal = {
    favorites: new Set(['fav-1']),
    recent: new Map([['recent-1', { lastUsed: Date.now() - 86_400_000, usageCount: 9 }]]),
    custom: new Set(['custom-1']),
    chosenForQuery: new Set()
  };

  test('a favourite outranks an equally-good stranger', () => {
    const ranked = names(rankFor('greek yogurt', [
      food('Greek yogurt', { id: 'stranger' }),
      food('Greek yogurt', { id: 'fav-1' })
    ], { personal }));
    expect(ranked[0]).toBe('Greek yogurt');
    expect(rankFor('greek yogurt', [
      food('Greek yogurt', { id: 'stranger' }),
      food('Greek yogurt', { id: 'fav-1' })
    ], { personal })[0].id).toBe('fav-1');
  });

  test('their own saved food wins on a partial query', () => {
    const results = [
      food('Yogurt, Greek, plain, nonfat', { id: 'usda-1' }),
      food('Fage Total 0% Greek Yogurt', { id: 'custom-1', source: 'custom', brand: 'Fage' })
    ];
    expect(rankFor('greek yogurt 0', results, { personal })[0].id).toBe('custom-1');
  });

  test('what they picked for this query last time goes to the top', () => {
    const withHistory = { ...personal, chosenForQuery: new Set(['chosen-1']) };
    const results = [
      food('Pancakes, chocolate chip', { id: 'usda-9' }),
      food('Mom pancakes', { id: 'chosen-1', source: 'openfoodfacts' })
    ];
    expect(rankFor('chocolate chip pancakes', results, { personal: withHistory })[0].id)
      .toBe('chosen-1');
  });

  test('recency decays', () => {
    expect(recencyDecay(Date.now())).toBeCloseTo(1, 1);
    expect(recencyDecay(Date.now() - 30 * 86_400_000)).toBeCloseTo(0.5, 1);
    expect(recencyDecay(Date.now() - 120 * 86_400_000)).toBe(0);
    expect(recencyDecay(null)).toBe(0);
  });
});

describe('preparation', () => {
  test('"grilled" finds the grilled one', () => {
    const ranked = names(rankFor('grilled chicken breast', [
      food('Chicken, breast, raw'),
      food('Chicken, breast, grilled')
    ]));
    expect(ranked[0]).toBe('Chicken, breast, grilled');
  });
});

describe('loggability', () => {
  test('an entry with no calories and no macros sinks', () => {
    const ranked = names(rankFor('cheddar', [
      food('Cheddar', { nutrition: { calories_per_serving: 0 } }),
      food('Cheddar cheese', { nutrition: { calories_per_serving: 113, fat_grams: 9 } })
    ]));
    expect(ranked[0]).toBe('Cheddar cheese');
  });
});

describe('source trust', () => {
  test('breaks a tie between otherwise identical results', () => {
    const ranked = rankFor('oat milk', [
      food('Oat milk', { source: 'openfoodfacts', id: 'off' }),
      food('Oat milk', { source: 'usda', id: 'usda' })
    ]);
    expect(ranked[0].id).toBe('usda');
  });
});

describe('mechanics', () => {
  test('ranking is stable for equal scores', () => {
    const results = [food('Toast', { id: 'a' }), food('Toast', { id: 'b' })];
    expect(rankFor('toast', results).map((r) => r.id)).toEqual(['a', 'b']);
  });

  test('every result carries its score and the reasons for it', () => {
    const [top] = rankFor('cheddar', [food('Cheddar')]);
    expect(typeof top.relevanceScore).toBe('number');
    expect(top.relevanceReasons).toHaveProperty('exactName');
  });

  test('limit truncates after ranking, not before', () => {
    const results = [food('Pancake syrup'), food('Pancakes, plain')];
    expect(names(rankFor('pancakes', results, { limit: 1 }))).toEqual(['Pancakes, plain']);
  });

  test('an empty result set ranks to nothing', () => {
    expect(rankFor('toast', [])).toEqual([]);
    expect(rankFor('toast', null)).toEqual([]);
  });

  test('scoring a junk result does not throw', () => {
    const [fragment] = parseFoodQuery('toast').fragments;
    expect(() => scoreFoodResult(null, fragment)).not.toThrow();
    expect(() => scoreFoodResult({}, fragment)).not.toThrow();
    expect(() => scoreFoodResult(food('Toast'), null)).not.toThrow();
  });
});
