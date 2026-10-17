import { describe, it, expect } from 'vitest';
import { shortDay, nearDay, dayRange, clockTime, daysAgo, weekdayDay } from '../dates.js';

const TODAY = '2026-10-17'; // a Saturday

describe('dates (review U-5)', () => {
  it('says "Oct 13" in the current year, no zero padding, no ISO', () => {
    expect(shortDay('2026-10-13', TODAY)).toBe('Oct 13');
    expect(shortDay('2026-12-01', TODAY)).toBe('Dec 1');
    expect(shortDay('2026-10-13T00:00:00.000Z', TODAY)).toBe('Oct 13');
  });

  it('adds the year only when it is not this year', () => {
    expect(shortDay('2025-10-13', TODAY)).toBe('Oct 13, 2025');
    expect(shortDay('2027-02-27', TODAY)).toBe('Feb 27, 2027');
    expect(shortDay('2026-10-13', TODAY, { withYear: true })).toBe('Oct 13, 2026');
  });

  it('says Today, Yesterday and a weekday for the last week', () => {
    expect(nearDay('2026-10-17', TODAY)).toBe('Today');
    expect(nearDay('2026-10-16', TODAY)).toBe('Yesterday');
    expect(nearDay('2026-10-18', TODAY)).toBe('Tomorrow');
    expect(nearDay('2026-10-15', TODAY)).toBe('Thursday');
    expect(nearDay('2026-10-11', TODAY)).toBe('Sunday');
    expect(nearDay('2026-10-10', TODAY)).toBe('Oct 10');
    expect(daysAgo('2026-10-10', TODAY)).toBe(7);
  });

  it('writes ranges with an en dash', () => {
    expect(dayRange('2026-10-10', '2026-10-16', TODAY)).toBe('Oct 10–16');
    expect(dayRange('2026-09-28', '2026-10-04', TODAY)).toBe('Sep 28 – Oct 4');
    expect(dayRange('2025-12-29', '2026-01-04', TODAY)).toBe('Dec 29, 2025 – Jan 4, 2026');
    expect(dayRange('2026-10-16', '2026-10-16', TODAY)).toBe('Oct 16');
  });

  it('gives a weekday with the date, and an unpadded clock time', () => {
    expect(weekdayDay('2026-10-16', TODAY)).toBe('Fri, Oct 16');
    expect(clockTime(new Date(2026, 9, 17, 8, 5))).toBe('8:05 AM');
    expect(shortDay('', TODAY)).toBe('');
    expect(clockTime(null)).toBe('');
  });
});

import { macroLine, grams, cal } from '../plainWords.js';

describe('numbers in words (review U-3, U-4)', () => {
  it('puts commas in calories and never says kcal', () => {
    expect(cal(1680)).toBe('1,680 cal');
    expect(cal(980.4)).toBe('980 cal');
  });

  it('writes macros in one order, with a dash for unknown', () => {
    expect(macroLine({ protein: 18.2, carbs: 8, fat: 10 })).toBe('Protein 18g · Carbs 8g · Fat 10g');
    expect(macroLine({ protein: 18.2, carbs: 0.3, fat: 10 }, { dense: true })).toBe('P 18 · C <1 · F 10 g');
    expect(macroLine({})).toBe('Protein — · Carbs — · Fat —');
    expect(grams(null)).toBe('—');
    expect(grams(0)).toBe('0');
  });
});
