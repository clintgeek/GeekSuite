/** Review 2026-11-18 #8: "Played Sep 22", not "Played sep 22". */
import { describe, expect, it } from 'vitest';
import { playedWhen } from '../../utils/dates';

describe('playedWhen', () => {
  it('keeps a month name capitalised', () => {
    expect(playedWhen('Sep 22')).toBe('Sep 22');
    expect(playedWhen('Jan 1, 2025')).toBe('Jan 1, 2025');
  });
  it('lower-cases only the relative words', () => {
    expect(playedWhen('Today')).toBe('today');
    expect(playedWhen('Yesterday')).toBe('yesterday');
    expect(playedWhen('3 days ago')).toBe('3 days ago');
  });
});
