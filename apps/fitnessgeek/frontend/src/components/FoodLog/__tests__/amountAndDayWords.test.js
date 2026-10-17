import { describe, it, expect } from 'vitest';
import { amountLabel } from '../amount.js';
import { mealOnDayL22, mealOnDayShort, dayName } from '../dayWords.js';
import { copySummary, WHOLE_DAY } from '../copyWords.js';

describe('amountLabel (Simple rows, UX review L15)', () => {
  it('says nothing for the one serving she always logs', () => {
    expect(amountLabel({ servings: 1, food_item_id: { serving_size: 4, serving_unit: 'oz' } })).toBe('');
  });
  it('says ×2 for whole servings', () => {
    expect(amountLabel({ servings: 2, food_item_id: { serving_size: 4, serving_unit: 'oz' } })).toBe('×2');
    expect(amountLabel({ servings: '3' })).toBe('×3');
  });
  it('says the unit amount for a part serving of a food with a unit', () => {
    expect(amountLabel({ servings: 1.5, food_item_id: { serving_size: 4, serving_unit: 'oz' } })).toBe('6 oz');
  });
  it('falls back to ×1.5 when the food has no real unit', () => {
    expect(amountLabel({ servings: 1.5, food_item_id: { serving_size: 1, serving_unit: 'serving' } })).toBe('×1.5');
    expect(amountLabel({ servings: 0.5 })).toBe('×0.5');
  });
});

describe('day words (UX review L22)', () => {
  const today = '2026-10-16'; // a Friday
  it('names a backfilled day by weekday, with the relative word in brackets', () => {
    expect(mealOnDayL22('dinner', '2026-10-15', today)).toBe("Thursday's dinner (yesterday)");
    expect(mealOnDayL22('lunch', '2026-10-13', today)).toBe("Tuesday's lunch");
    expect(mealOnDayL22('dinner', '2026-10-16', today)).toBe("today's dinner");
    expect(mealOnDayL22('snacks', '2026-10-03', today)).toBe('snacks on Oct 3');
  });
  it('the short form, for inside a sentence', () => {
    expect(mealOnDayShort('dinner', '2026-10-15', today)).toBe("Thursday's dinner");
    expect(dayName('2026-10-17', today)).toBe('tomorrow');
    expect(dayName('2025-12-30', today)).toBe('Dec 30, 2025');
  });
  it('a copy, in one sentence', () => {
    expect(copySummary({ whose: 'Chef', fromDate: '2026-10-15', fromMeal: 'dinner', toDate: today, toMeal: '', count: 3, today }))
      .toBe("Copy Chef's dinner from Thursday into today's dinner (3 foods)");
    expect(copySummary({ whose: null, fromDate: '2026-10-15', fromMeal: WHOLE_DAY, toDate: today, count: 1, today }))
      .toBe('Copy your whole day from Thursday into today (1 food)');
    expect(copySummary({ whose: null, fromDate: '2026-10-15', fromMeal: 'dinner', toDate: today, toMeal: 'lunch', count: null, today }))
      .toBe("Copy your dinner from Thursday into today's lunch");
  });
});
