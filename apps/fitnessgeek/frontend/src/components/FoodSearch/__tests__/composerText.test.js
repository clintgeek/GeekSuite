/**
 * What the composer reads off the words, client-side: sentence or name, and
 * the day words (a mirror of the backend's, Phase 3.17).
 */
import { describe, it, expect } from 'vitest';
import { isSentence, detectDayWords, resolveDayHint, dayInWords, mealOnDay, describeFailure, sheetDayWords, sheetMealOnDay, sheetTitle } from '../composerText.js';

describe('isSentence', () => {
  it.each([
    ['fage', false], ['greek yogurt', false], ['', false],
    ['2 eggs', true], ['eggs and toast', true], ['coffee with cream', true], ['pb&j', true],
    ['eggs, toast', true], ['eggs + toast', true], ['a bowl of soup', true],
  ])('%j → %s', (text, expected) => expect(isSentence(text)).toBe(expected));
});

describe('day words, like the backend', () => {
  it.each([
    ['fried chicken last night', 'yesterday'],
    ['yesterday morning eggs', 'yesterday'],
    ['the day before yesterday pizza', 'day_before_yesterday'],
    ['tacos on monday', 'monday'],
    ['last friday a burger', 'friday'],
    ['sunday for dinner roast', 'sunday'],
    ['saturday night pizza', 'saturday'],
  ])('%j → %s', (text, hint) => expect(detectDayWords(text)?.hint).toBe(hint));

  it.each(['taco tuesday', 'tgi fridays burger', 'eggs this morning', 'pizza tonight', 'soup today'])(
    '%j says no other day', (text) => expect(detectDayWords(text)).toBeNull()
  );

  it('resolves a hint against today (Wednesday 2026-10-14)', () => {
    const today = '2026-10-14';
    expect(resolveDayHint('yesterday', today)).toBe('2026-10-13');
    expect(resolveDayHint('day_before_yesterday', today)).toBe('2026-10-12');
    expect(resolveDayHint('monday', today)).toBe('2026-10-12');
    expect(resolveDayHint('wednesday', today)).toBe(today);
    expect(resolveDayHint('wednesday', today, { last: true })).toBe('2026-10-07');
  });
});

describe('days in words', () => {
  const today = '2026-10-14';
  it('names it the way a person would', () => {
    expect(dayInWords(today, today)).toBe('today');
    expect(dayInWords('2026-10-13', today)).toBe('yesterday');
    expect(dayInWords('2026-10-15', today)).toBe('tomorrow');
    expect(dayInWords('2026-10-12', today)).toBe('Monday');
    expect(dayInWords('2026-10-03', today)).toBe('Saturday, October 3');
  });
  it('a meal on a day', () => {
    expect(mealOnDay('dinner', today, today)).toBe('dinner');
    expect(mealOnDay('dinner', '2026-10-13', today)).toBe("yesterday's dinner");
    expect(mealOnDay('dinner', '2026-10-12', today)).toBe("Monday's dinner");
    expect(mealOnDay('dinner', '2026-10-03', today)).toBe('dinner on Saturday, October 3');
  });
});

describe('describeFailure', () => {
  it('a 422 says how to fix it', () => {
    expect(describeFailure({ response: { status: 422, data: {} } }).message).toBe("I couldn't find a food in that. Try naming the food, like 'chicken soup'.");
  });
  it('a dropped connection is "tap Log it to try again", never raw text', () => {
    const msg = describeFailure(Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })).message;
    expect(msg).toBe("No signal. That didn't go through. Tap Log it to try again.");
  });
  it('signed out is its own sentence', () => {
    expect(describeFailure({ response: { status: 401, data: {} } }).message).toBe('Please sign in again.');
  });
});

describe('L21: number words count as a number', () => {
  it.each([
    ['two eggs', true], ['a couple eggs', true], ['half bagel', true], ['a few crackers', true],
    ['dozen wings', true], ['twelve almonds', true], ['one banana', true],
    ['twix', false], ['tenderloin', false], ['honeydew', false],
  ])('%j → %s', (text, expected) => expect(isSentence(text)).toBe(expected));
});

describe('L22: one way of naming days in a sheet', () => {
  // Wednesday.
  const today = '2026-10-14';

  it("today's sheet speaks relatively", () => {
    expect(sheetDayWords('2026-10-13', today, today)).toBe('yesterday');
    expect(sheetMealOnDay('lunch', '2026-10-13', today, today)).toBe("yesterday's lunch");
    expect(sheetTitle('lunch', today, today)).toBe('Add to lunch');
  });

  it('a backfilled sheet uses weekdays throughout, and the title says which one yesterday was', () => {
    expect(sheetTitle('dinner', '2026-10-13', today)).toBe("Add to Tuesday's dinner (yesterday)");
    expect(sheetMealOnDay('dinner', '2026-10-12', today, '2026-10-13')).toBe("Monday's dinner");
    expect(sheetDayWords('2026-10-13', today, '2026-10-13')).toBe('Tuesday');
    expect(sheetDayWords(today, today, '2026-10-13')).toBe('today');
    expect(sheetTitle('dinner', '2026-10-12', today)).toBe("Add to Monday's dinner");
    expect(sheetTitle('dinner', '2026-10-03', today)).toBe('Add to dinner on Saturday, October 3');
  });
});
