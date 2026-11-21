/**
 * Review 2026-11-18 #8: "Played Sep 22", not "Played sep 22" — and "Last ran
 * today", not "Last ran Today". Only relative words are lower-cased, decided
 * from which answer was given, not by matching the formatted words.
 */
import { describe, expect, it } from 'vitest';
import { instantParts, relativeInstantInSentence } from '../../utils/dates';

// vitest runs with TZ=America/Chicago (vitest.config.js).
const EVENING = new Date('2026-09-26T00:08:00Z'); // 19:08 CDT on the 25th

describe('relativeInstantInSentence', () => {
  it('keeps a month name capitalised', () => {
    expect(relativeInstantInSentence('2026-09-12T15:00:00Z', EVENING)).toMatch(/^Sep 12$/);
    expect(relativeInstantInSentence('2025-01-01T18:00:00Z', EVENING)).toMatch(/^Jan 1, 2025$/);
  });

  it('lower-cases only the relative words', () => {
    expect(relativeInstantInSentence('2026-09-26T00:03:00Z', EVENING)).toBe('today');
    expect(relativeInstantInSentence('2026-09-25T03:00:00Z', EVENING)).toBe('yesterday');
    expect(relativeInstantInSentence('2026-09-22T15:00:00Z', EVENING)).toBe('3 days ago');
  });

  it('empty and junk are empty', () => {
    expect(relativeInstantInSentence(null, EVENING)).toBe('');
    expect(relativeInstantInSentence('nope', EVENING)).toBe('');
  });

  it('instantParts says which kind of answer it is', () => {
    expect(instantParts('2026-09-26T00:03:00Z', EVENING)).toEqual({ text: 'Today', relative: true });
    expect(instantParts('2026-09-12T15:00:00Z', EVENING)).toMatchObject({ relative: false });
  });
});
