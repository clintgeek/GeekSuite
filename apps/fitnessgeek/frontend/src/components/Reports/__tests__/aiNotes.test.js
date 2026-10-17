/**
 * "Notes from the AI" footer and title (UX review 2026-10-17, D-11).
 */
import { describe, it, expect } from 'vitest';
import { aiFooterText, aiNotesTitle, lastDaysSource, writtenAt } from '../aiNotes.jsx';

describe('aiNotesTitle', () => {
  it('names the range plainly', () => {
    expect(aiNotesTitle(7)).toBe('This week');
    expect(aiNotesTitle('14')).toBe('Last 14 days');
    expect(aiNotesTitle(30)).toBe('Last 30 days');
  });
});

describe('writtenAt', () => {
  const now = new Date(2026, 9, 17, 12, 0);
  it('a time today, "9:40 am" style', () => {
    expect(writtenAt(new Date(2026, 9, 17, 9, 40), now)).toBe('9:40 am');
    expect(writtenAt(new Date(2026, 9, 17, 0, 5), now)).toBe('12:05 am');
    expect(writtenAt(new Date(2026, 9, 17, 12, 0), now)).toBe('12:00 pm');
  });
  it('another day carries its date, never ISO', () => {
    expect(writtenAt(new Date(2026, 9, 16, 21, 40).toISOString(), now)).toBe('Oct 16, 9:40 pm');
  });
  it('nothing for a missing or broken time', () => {
    expect(writtenAt(null, now)).toBeNull();
    expect(writtenAt('not a date', now)).toBeNull();
  });
});

describe('aiFooterText', () => {
  it('source · time · it can be wrong', () => {
    expect(aiFooterText({ source: lastDaysSource(7), generatedAt: new Date(2026, 9, 17, 9, 40), now: new Date(2026, 9, 17, 12) }))
      .toBe('Written by AI from your last 7 days of logs · 9:40 am · It can be wrong — check the numbers above.');
  });
  it('drops the time when there is none', () => {
    expect(aiFooterText({ source: lastDaysSource(14) }))
      .toBe('Written by AI from your last 14 days of logs · It can be wrong — check the numbers above.');
  });
});
