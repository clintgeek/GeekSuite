/**
 * fitnessgeekQuickAddParser.test.js
 *
 * The deterministic half of natural-language quick-add (AI_IDEAS.md idea #2,
 * stream R115). This file is the pin on the half that must never need a model:
 * it is what the person sees when the daily cap is spent, when aiGeek is down
 * or slow, and when the model answers something that will not validate.
 *
 * No Mongo, no network, no aiService — this module has no imports beyond
 * itself, on purpose.
 */

import {
  MAX_FRAGMENTS,
  MAX_QUERY_LENGTH,
  deterministicParse,
  hourFromDateHint,
  isValidProposal,
  mealTypeForHour,
  mealTypeFromText,
  normalizeProposal,
  parseQuantity,
  splitFragments,
} from '../graphql/fitnessgeek/quickAddParser.js';

const queries = (text, opts) => deterministicParse(text, opts).fragments.map((f) => f.query);

describe('splitFragments', () => {
  test('splits on commas, newlines, semicolons and the word "and"', () => {
    expect(splitFragments('two eggs, toast and black coffee')).toEqual([
      'two eggs',
      'toast',
      'black coffee',
    ]);
    expect(splitFragments('rice;\nbeans')).toEqual(['rice', 'beans']);
  });

  test('"with" is NOT a separator — "toast with butter" is one thing a person logs', () => {
    expect(splitFragments('toast with butter')).toEqual(['toast with butter']);
  });

  test('empty and punctuation-only input yields nothing', () => {
    expect(splitFragments('')).toEqual([]);
    expect(splitFragments(' , ; , ')).toEqual([]);
  });
});

describe('parseQuantity', () => {
  test.each([
    ['2 eggs', 2, null, 'eggs'],
    ['1.5 bananas', 1.5, null, 'bananas'],
    ['1 cup oatmeal', 1, 'cup', 'oatmeal'],
    ['1 cup of oats', 1, 'cup', 'oats'],
    ['half a banana', 0.5, null, 'banana'],
    ['a couple of eggs', 2, null, 'eggs'],
    ['a few crackers', 3, null, 'crackers'],
    ['three slices of bacon', 3, 'slice', 'bacon'],
    ['2 tbsp. olive oil', 2, 'tbsp', 'olive oil'],
    ['a bowl of oatmeal', 1, 'bowl', 'oatmeal'],
    ['black coffee', 1, null, 'black coffee'],
    ['dozen wings', 12, null, 'wings'],
  ])('%s', (input, servings, unit, rest) => {
    expect(parseQuantity(input)).toEqual({ servings, unit, rest });
  });

  test('fractions: a leading "1/2" is half of something, not one of "/2"', () => {
    // The single-regex-with-everything-optional version of this read "1/2 cup
    // rice" as ONE serving of "/2 cup rice", because the optional fraction
    // group matched empty and the engine never backtracked.
    expect(parseQuantity('1/2 cup rice')).toEqual({ servings: 0.5, unit: 'cup', rest: 'rice' });
    expect(parseQuantity('1 1/2 cups greek yogurt')).toEqual({ servings: 1.5, unit: 'cup', rest: 'greek yogurt' });
    expect(parseQuantity('½ avocado')).toEqual({ servings: 0.5, unit: null, rest: 'avocado' });
    expect(parseQuantity('1½ cups milk')).toEqual({ servings: 1.5, unit: 'cup', rest: 'milk' });
  });

  test('a zero denominator cannot produce Infinity or NaN', () => {
    const { servings } = parseQuantity('1/0 cup rice');
    expect(Number.isFinite(servings)).toBe(true);
    expect(servings).toBeGreaterThan(0);
  });

  test('a bare article is not a quantity', () => {
    expect(parseQuantity('a')).toEqual({ servings: 1, unit: null, rest: 'a' });
  });
});

describe('meal type', () => {
  test('the hour bands match the FoodLog FAB exactly', () => {
    expect([0, 9].map(mealTypeForHour)).toEqual(['breakfast', 'breakfast']);
    expect([10, 14].map(mealTypeForHour)).toEqual(['lunch', 'lunch']);
    expect([15, 20].map(mealTypeForHour)).toEqual(['dinner', 'dinner']);
    expect([21, 23].map(mealTypeForHour)).toEqual(['snack', 'snack']);
  });

  test('a meal word is intent in a phrase, a label or at the end — never mid-name', () => {
    expect(mealTypeFromText('eggs for breakfast')).toBe('breakfast');
    expect(mealTypeFromText('lunch: chicken salad')).toBe('lunch');
    expect(mealTypeFromText('soup, lunch')).toBe('lunch');
    expect(mealTypeFromText('supper was pasta')).toBeNull();
    // The one that matters: "breakfast burrito" is a food, not a time of day.
    expect(mealTypeFromText('breakfast burrito')).toBeNull();
  });

  test('brunch counts as breakfast and supper as dinner', () => {
    expect(mealTypeFromText('omelette for brunch')).toBe('breakfast');
    expect(mealTypeFromText('pasta for supper')).toBe('dinner');
  });

  test('a named meal beats the clock, and applies to every fragment in the sentence', () => {
    const fragments = deterministicParse('two eggs and toast for breakfast', { hour: 19 }).fragments;
    expect(fragments.map((f) => f.mealType)).toEqual(['breakfast', 'breakfast']);
  });

  test('with no meal word the clock decides', () => {
    expect(deterministicParse('eggs', { hour: 8 }).fragments[0].mealType).toBe('breakfast');
    expect(deterministicParse('eggs', { hour: 19 }).fragments[0].mealType).toBe('dinner');
  });

  test('an explicit mealType from the caller overrides both', () => {
    const [only] = deterministicParse('eggs for breakfast', { hour: 8, mealType: 'snack' }).fragments;
    expect(only.mealType).toBe('snack');
  });
});

describe('hourFromDateHint', () => {
  test('reads the hour off the caller\'s local wall clock', () => {
    expect(hourFromDateHint('2026-09-06T19:30')).toBe(19);
    expect(hourFromDateHint('2026-09-06 07:05')).toBe(7);
  });

  test('a bare calendar date carries no hour and falls back to this process\'s UTC hour', () => {
    // The gateway runs UTC (BURN_REVIEW #13). Documented fallback, never taken
    // by the frontend, which always sends the wall clock.
    const noon = new Date(Date.UTC(2026, 8, 6, 12, 0));
    expect(hourFromDateHint('2026-09-06', noon)).toBe(12);
    expect(hourFromDateHint(null, noon)).toBe(12);
    expect(hourFromDateHint('nonsense', noon)).toBe(12);
  });

  test('an out-of-range hour is ignored rather than trusted', () => {
    const five = new Date(Date.UTC(2026, 8, 6, 5, 0));
    expect(hourFromDateHint('2026-09-06T99:00', five)).toBe(5);
  });
});

describe('deterministicParse', () => {
  test('the headline case from AI_IDEAS.md', () => {
    const { fragments } = deterministicParse('two eggs, toast with butter, black coffee', { hour: 8 });
    expect(fragments).toEqual([
      { text: 'two eggs', query: 'eggs', servings: 2, unit: null, mealType: 'breakfast' },
      { text: 'toast with butter', query: 'toast with butter', servings: 1, unit: null, mealType: 'breakfast' },
      { text: 'black coffee', query: 'black coffee', servings: 1, unit: null, mealType: 'breakfast' },
    ]);
  });

  test('a search query never carries the quantity, the unit or the meal word', () => {
    expect(queries('2 slices of pizza for dinner', { hour: 19 })).toEqual(['pizza']);
    expect(queries('1 cup oatmeal and half a banana', { hour: 8 })).toEqual(['oatmeal', 'banana']);
  });

  test('a compound stays one fragment — splitting it is the model\'s job', () => {
    expect(queries('a bowl of oatmeal w/ blueberries', { hour: 8 })).toEqual(['oatmeal w/ blueberries']);
  });

  test('punctuation alone is not a food', () => {
    expect(deterministicParse('...', { hour: 8 }).fragments).toEqual([]);
    expect(deterministicParse('', { hour: 8 }).fragments).toEqual([]);
  });

  test('unreadable-but-real text still yields one searchable fragment', () => {
    const { fragments } = deterministicParse('zzzz', { hour: 8 });
    expect(fragments).toHaveLength(1);
    expect(fragments[0].query).toBe('zzzz');
  });

  test('the fragment count is capped', () => {
    const many = Array.from({ length: 30 }, (_, i) => `food${i}`).join(', ');
    expect(deterministicParse(many, { hour: 8 }).fragments).toHaveLength(MAX_FRAGMENTS);
  });

  test('a query is bounded at 80 characters', () => {
    const long = 'x'.repeat(300);
    const [only] = deterministicParse(long, { hour: 8 }).fragments;
    expect(only.query).toHaveLength(MAX_QUERY_LENGTH);
  });

  test('every fragment the deterministic pass produces satisfies the model contract', () => {
    // The fallback is the thing the resolver returns when validation rejects
    // the model — so it had better validate itself.
    for (const text of [
      'two eggs, toast with butter, black coffee',
      '1/2 cup rice for lunch',
      'a bowl of oatmeal w/ blueberries',
      'zzzz',
    ]) {
      expect(isValidProposal(deterministicParse(text, { hour: 9 }))).toBe(true);
    }
  });
});

describe('isValidProposal', () => {
  const ok = { fragments: [{ text: 'two eggs', query: 'eggs', servings: 2, unit: null, mealType: 'lunch' }] };

  test('accepts a well-formed proposal', () => {
    expect(isValidProposal(ok)).toBe(true);
  });

  test.each([
    ['not an object', null],
    ['no fragments array', { fragments: 'eggs' }],
    ['zero fragments', { fragments: [] }],
    ['too many fragments', { fragments: Array.from({ length: 13 }, () => ok.fragments[0]) }],
    ['empty query', { fragments: [{ ...ok.fragments[0], query: '   ' }] }],
    ['punctuation-only query', { fragments: [{ ...ok.fragments[0], query: '---' }] }],
    ['query over 80 chars', { fragments: [{ ...ok.fragments[0], query: 'x'.repeat(81) }] }],
    ['servings 0', { fragments: [{ ...ok.fragments[0], servings: 0 }] }],
    ['servings negative', { fragments: [{ ...ok.fragments[0], servings: -1 }] }],
    ['servings over 50', { fragments: [{ ...ok.fragments[0], servings: 51 }] }],
    ['servings not a number', { fragments: [{ ...ok.fragments[0], servings: 'two' }] }],
    ['unit not a string', { fragments: [{ ...ok.fragments[0], unit: 7 }] }],
    ['meal type off the enum', { fragments: [{ ...ok.fragments[0], mealType: 'elevenses' }] }],
  ])('rejects: %s', (_label, value) => {
    expect(isValidProposal(value)).toBe(false);
  });
});

describe('normalizeProposal', () => {
  test('coerces a sloppy model answer into the exact GraphQL shape', () => {
    const { fragments } = normalizeProposal(
      { fragments: [{ query: '  Scrambled   Eggs ', servings: '2', unit: '', mealType: 'elevenses' }] },
      { mealType: 'dinner' }
    );
    expect(fragments).toEqual([
      { text: 'Scrambled Eggs', query: 'Scrambled Eggs', servings: 2, unit: null, mealType: 'dinner' },
    ]);
  });

  test('clamps servings and drops queries that are not searchable', () => {
    const { fragments } = normalizeProposal({
      fragments: [
        { text: 'a', query: 'rice', servings: 9999, unit: 'cup', mealType: 'lunch' },
        { text: 'b', query: '   ', servings: 1, unit: null, mealType: 'lunch' },
        { text: 'c', query: 'beans', servings: -3, unit: null, mealType: 'lunch' },
      ],
    });
    expect(fragments).toEqual([
      { text: 'a', query: 'rice', servings: 50, unit: 'cup', mealType: 'lunch' },
      { text: 'c', query: 'beans', servings: 1, unit: null, mealType: 'lunch' },
    ]);
  });

  test('never returns more than the cap, whatever the model sent', () => {
    const flood = { fragments: Array.from({ length: 40 }, (_, i) => ({ query: `f${i}`, servings: 1, mealType: 'snack' })) };
    expect(normalizeProposal(flood).fragments).toHaveLength(MAX_FRAGMENTS);
  });
});
