import { describe, expect, it } from 'vitest';
import { RATING_LABELS, ratingLabelFor, ratingLine } from '../ratings';

describe('ratings', () => {
  it('carries Chef\'s five labels, verbatim', () => {
    expect(RATING_LABELS).toEqual({
      5: 'LOVED IT!',
      4: 'It was great!',
      3: 'It was ok',
      2: 'Meh',
      1: 'It actively offended me',
    });
  });

  it('is null for unrated values', () => {
    for (const v of [0, null, undefined, NaN, -1, 'x']) expect(ratingLabelFor(v)).toBeNull();
    expect(ratingLine(0)).toBeNull();
  });

  it('reads a whole star plainly', () => {
    expect(ratingLabelFor(4)).toEqual({ star: 4, isHalf: false, label: 'It was great!' });
    expect(ratingLine(1)).toBe('1 of 5 — It actively offended me');
  });

  it('reads a half as its lower whole star, with the half noted', () => {
    expect(ratingLabelFor(3.5)).toEqual({ star: 3, isHalf: true, label: 'It was ok' });
    expect(ratingLine(4.5)).toBe('4½ of 5 — It was great!');
  });
});
