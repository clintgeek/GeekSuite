/**
 * mealDescriptionParser — one row per plate.
 *
 * The rule under test: `with` binds to the dish before it, and `and` inside
 * that clause stays inside it. Getting this backwards is what made "a dozen
 * nachos with beef and chicken and cheese" return beef, chicken and cheese —
 * and no nachos (Chef's screenshot, 2026-09-15).
 *
 * Plan: DOCS/THE_DESCRIBE_AND_LOG_PLAN.md §3.
 */

import { describe, test, expect } from '@jest/globals';
import { parseMealDescription, mealFromHour } from '../../services/mealDescriptionParser.js';

const parse = (text, hour = 19) => parseMealDescription(text, { hour }).entries;
const shape = (entries) => entries.map((e) => [e.description, e.servings, e.mealType]);

describe('the nachos case', () => {
  test('is ONE plate, not four foods', () => {
    const entries = parse('a dozen nachos with beef and chicken and cheese');

    expect(entries).toHaveLength(1);
    expect(entries[0].dish).toBe('nachos');
    expect(entries[0].components).toEqual(['beef', 'chicken', 'cheese']);
    expect(entries[0].servings).toBe(12);
    expect(entries[0].description).toBe('nachos with beef, chicken and cheese');
  });

  test('"a dozen" is twelve', () => {
    expect(parse('a dozen nachos')[0].servings).toBe(12);
    expect(parse('half a dozen eggs')[0].servings).toBe(6);
    expect(parse('2 dozen eggs')[0].servings).toBe(24);
    expect(parse('a couple tacos')[0].servings).toBe(2);
  });
});

describe('`with` outranks `and`', () => {
  test.each([
    ['nachos with beef and cheese', 1],
    ['greek yogurt with honey and granola', 1],
    ['a burger with fries', 1],
    ['pancakes topped with butter and syrup', 1]
  ])('%s is one entry', (text, count) => {
    expect(parse(text)).toHaveLength(count);
  });

  test('components attach to the dish immediately before them', () => {
    const entries = parse('eggs and toast with butter');
    expect(shape(entries)).toEqual([
      ['eggs', 1, 'dinner'],
      ['toast with butter', 1, 'dinner']
    ]);
    expect(entries[0].components).toEqual([]);
    expect(entries[1].components).toEqual(['butter']);
  });
});

describe('a whole day in one sentence', () => {
  test('lands each dish in the right meal', () => {
    const entries = parse('eggs and toast for breakfast, chicken caesar at lunch, nachos for dinner');
    expect(shape(entries)).toEqual([
      ['eggs', 1, 'breakfast'],
      ['toast', 1, 'breakfast'],
      ['chicken caesar', 1, 'lunch'],
      ['nachos', 1, 'dinner']
    ]);
  });

  test('a meal stated once carries forward', () => {
    const entries = parse('breakfast: eggs, toast, coffee');
    expect(entries.map((e) => e.mealType)).toEqual(['breakfast', 'breakfast', 'breakfast']);
  });

  test('the meal word never survives as a food', () => {
    for (const entry of parse('nachos for dinner')) {
      expect(entry.dish).not.toMatch(/dinner/);
    }
  });

  test('supper is dinner', () => {
    expect(parse('stew for supper')[0].mealType).toBe('dinner');
  });
});

describe('the clock decides when the sentence does not', () => {
  test.each([
    [8, 'breakfast'],
    [12, 'lunch'],
    [19, 'dinner'],
    [23, 'snack']
  ])('%i:00 -> %s', (hour, expected) => {
    expect(mealFromHour(hour)).toBe(expected);
    expect(parse('nachos', hour)[0].mealType).toBe(expected);
  });
});

describe('edges', () => {
  test.each([null, undefined, '', '   ', ',,,'])('%p yields no entries', (input) => {
    expect(parseMealDescription(input).entries).toEqual([]);
  });

  test('a trailing separator does not invent an empty entry', () => {
    expect(parse('nachos and')).toHaveLength(1);
    expect(parse('nachos with')).toHaveLength(1);
  });

  test('preparation words survive onto the entry', () => {
    const [entry] = parse('grilled chicken');
    expect(entry.dish).toBe('grilled chicken');
    expect(entry.preparation).toEqual(['grilled']);
  });

  test('provenance words are stripped from the dish', () => {
    expect(parse('homemade lasagna')[0].dish).toBe('lasagna');
  });
});

// SIMPLE_AND_FULL_PLAN.md item 1: a meal card's "+ Add" already knows the
// meal. That choice beats the clock, and what the person SAID beats both.
describe('a meal the person already picked', () => {
  test('beats the hour: Lunch\'s "+ Add" at 8am logs to lunch', () => {
    const entries = parseMealDescription('two eggs and toast', { hour: 8, mealType: 'lunch' }).entries;
    expect(entries.map((e) => e.mealType)).toEqual(['lunch', 'lunch']);
  });

  test('a meal named in the text still wins', () => {
    const entries = parseMealDescription('eggs for breakfast', { hour: 13, mealType: 'dinner' }).entries;
    expect(entries[0].mealType).toBe('breakfast');
  });

  test('an unknown meal falls back to the hour rather than inventing a slot', () => {
    const entries = parseMealDescription('nachos', { hour: 19, mealType: 'elevenses' }).entries;
    expect(entries[0].mealType).toBe('dinner');
  });
});

describe('day words (Phase 3.17)', () => {
  const full = (text, options = { hour: 13 }) => parseMealDescription(text, options);

  test('"yesterday" is not a food, and is handed back as the hint', () => {
    const result = full('eggs yesterday');
    expect(shape(result.entries)).toEqual([['eggs', 1, 'lunch']]);
    expect(result.dayHint).toBe('yesterday');
    expect(result.dayWords).toEqual(['yesterday']);
  });

  test('"for dinner last night": the meal word still counts', () => {
    const result = full('fried chicken and fries for dinner last night');
    expect(shape(result.entries)).toEqual([['fried chicken', 1, 'dinner'], ['fries', 1, 'dinner']]);
    expect(result.dayHint).toBe('yesterday');
  });

  test('"last night" on its own means dinner, yesterday', () => {
    const result = full('nachos last night');
    expect(shape(result.entries)).toEqual([['nachos', 1, 'dinner']]);
    expect(result.dayHint).toBe('yesterday');
  });

  test('"this morning" is breakfast today: stripped, and no day to ask about', () => {
    const result = full('pancakes this morning');
    expect(shape(result.entries)).toEqual([['pancakes', 1, 'breakfast']]);
    expect(result.dayHint).toBeNull();
    expect(result.dayWords).toEqual(['this morning']);
  });

  test('"on monday" names the day', () => {
    const result = full('pizza on monday');
    expect(shape(result.entries)).toEqual([['pizza', 1, 'lunch']]);
    expect(result.dayHint).toBe('monday');
  });

  test('"last tuesday night", "yesterday morning" — one phrase each', () => {
    expect(shape(full('last tuesday night nachos').entries)).toEqual([['nachos', 1, 'dinner']]);
    expect(full('last tuesday night nachos').dayHint).toBe('tuesday');
    expect(shape(full('yesterday morning oatmeal').entries)).toEqual([['oatmeal', 1, 'breakfast']]);
  });

  test('a phrase that is only a day word logs nothing', () => {
    const result = full('for dinner last night');
    expect(result.entries).toEqual([]);
    expect(result.dayHint).toBe('yesterday');
  });

  test('a bare weekday stays food: "Taco Tuesday" is a saved meal, TGI Fridays a place', () => {
    expect(full('taco tuesday').entries[0].description).toBe('taco tuesday');
    expect(full('taco tuesday').dayHint).toBeNull();
    expect(full('tgi fridays burger').entries[0].description).toBe('tgi fridays burger');
  });

  test('a stated meal in the text still beats the meal the person picked', () => {
    const result = parseMealDescription('eggs for breakfast yesterday, tacos last night, a beer', { hour: 13, mealType: 'lunch' });
    expect(shape(result.entries)).toEqual([['eggs', 1, 'breakfast'], ['tacos', 1, 'dinner'], ['beer', 1, 'dinner']]);
  });

  test('no day words: no hint, nothing changes', () => {
    const result = full('eggs and toast');
    expect(result.dayHint).toBeNull();
    expect(result.dayWords).toEqual([]);
  });
});

describe('a day word covers the whole description (L6)', () => {
  const meals = (text, hour = 12) => parse(text, hour).map((e) => e.mealType);

  test('"fried chicken, fries last night" at noon is all dinner, on yesterday', () => {
    expect(meals('fried chicken, fries last night')).toEqual(['dinner', 'dinner']);
    expect(parseMealDescription('fried chicken, fries last night', { hour: 12 }).dayHint).toBe('yesterday');
  });
  test('"toast, coffee this morning" is all breakfast', () => {
    expect(meals('toast, coffee this morning', 19)).toEqual(['breakfast', 'breakfast']);
  });
  test('stated meals still split as stated', () => {
    expect(meals('eggs for breakfast, a sandwich for lunch', 19)).toEqual(['breakfast', 'lunch']);
  });
  test('"pizza, salad yesterday" keeps both on the yesterday hint', () => {
    const r = parseMealDescription('pizza, salad yesterday', { hour: 12 });
    expect(r.dayHint).toBe('yesterday');
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0].mealType).toBe(r.entries[1].mealType);
  });
});
