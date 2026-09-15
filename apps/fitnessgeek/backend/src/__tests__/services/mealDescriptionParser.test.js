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
