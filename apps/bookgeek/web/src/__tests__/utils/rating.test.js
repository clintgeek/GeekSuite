/**
 * Which books get stars, and how a stored rating is drawn.
 */
import { describe, it, expect } from 'vitest';
import { canRate, starFill } from '../../utils/rating';

describe('canRate', () => {
  it('rates the Read and Abandoned shelves', () => {
    expect(canRate({ shelf: 'read' })).toBe(true);
    // Giving up on a book is a verdict too.
    expect(canRate({ shelf: 'abandoned' })).toBe(true);
  });

  it('leaves books you have not read clean', () => {
    for (const shelf of ['want-to-read', 'unread', 'on-reader', 'reading', null]) {
      expect(canRate({ shelf })).toBe(false);
    }
  });

  it('keeps showing a rating a book already has, whatever its shelf', () => {
    // 13 rated books sat off the Read shelf on 2026-09-22. Hiding their stars
    // would have made their ratings look lost.
    expect(canRate({ shelf: null, rating: 4 })).toBe(true);
    expect(canRate({ shelf: 'want-to-read', rating: 3 })).toBe(true);
  });
});

describe('starFill', () => {
  it('fills whole stars', () => {
    expect([1, 2, 3, 4, 5].map((i) => starFill(i, 4))).toEqual(['full', 'full', 'full', 'full', 'empty']);
  });

  it('keeps a stored half star', () => {
    // Five books carry 2.5 or 3.5 from the import. Rounding them on display
    // would show a rating nobody gave.
    expect([1, 2, 3, 4, 5].map((i) => starFill(i, 3.5))).toEqual(['full', 'full', 'full', 'half', 'empty']);
  });

  it('draws nothing for no rating', () => {
    expect([1, 2, 3, 4, 5].map((i) => starFill(i, null))).toEqual(Array(5).fill('empty'));
  });
});
