import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_SHELF_ORDER,
  RATING_MEANINGS,
  SHELF_MEANINGS,
  ratingMeaningFor,
  ratingMeaningLine,
  shelfMeaning,
} from '../../utils/tasteModel';
import { BUILT_IN_SHELVES } from '../../utils/vocab';

describe('tasteModel — shelves', () => {
  it('has a meaning for every built-in shelf vocab.js knows about', () => {
    for (const id of BUILT_IN_SHELVES) {
      expect(SHELF_MEANINGS[id], `missing meaning for shelf "${id}"`).toBeTruthy();
      expect(shelfMeaning(id).short.length).toBeGreaterThan(0);
    }
    expect(new Set(BUILT_IN_SHELF_ORDER)).toEqual(new Set(BUILT_IN_SHELVES));
  });

  it('marks Backlog and Wishlist provisional, and the rest not', () => {
    expect(SHELF_MEANINGS.backlog.provisional).toBe(true);
    expect(SHELF_MEANINGS.wishlist.provisional).toBe(true);
    expect(SHELF_MEANINGS.playing.provisional).toBeFalsy();
    expect(SHELF_MEANINGS.finished.provisional).toBeFalsy();
    expect(SHELF_MEANINGS['on-hold'].provisional).toBeFalsy();
    expect(SHELF_MEANINGS.abandoned.provisional).toBeFalsy();
  });

  it('a custom shelf has no meaning', () => {
    expect(shelfMeaning('custom-couch-coop')).toBeNull();
    expect(shelfMeaning('unshelved')).toBeNull();
  });

  it('carries Chef’s exact short lines', () => {
    expect(SHELF_MEANINGS.playing.short).toBe('Installed and ready to go');
    expect(SHELF_MEANINGS.finished.short).toBe('Got what I wanted out of it — a restart would be a fresh start');
    expect(SHELF_MEANINGS['on-hold'].short).toBe('Played it; haven’t admitted I’ve abandoned it yet');
    expect(SHELF_MEANINGS.abandoned.short).toBe('Abandoned is abandoned');
  });
});

describe('tasteModel — ratings', () => {
  it('has a full quote and a short line for every star 1-5', () => {
    for (const star of [1, 2, 3, 4, 5]) {
      expect(RATING_MEANINGS[star], `missing rating ${star}`).toBeTruthy();
      expect(RATING_MEANINGS[star].short.length).toBeGreaterThan(0);
      expect(RATING_MEANINGS[star].full.length).toBeGreaterThan(0);
    }
  });

  it('the 5-star full quote is Chef’s own words, verbatim', () => {
    expect(RATING_MEANINGS[5].full).toBe(
      'I love this game, you should play this game like 10 times, do you have 2 hours to talk about it?'
    );
  });

  it('ratingMeaningFor reads a whole star', () => {
    expect(ratingMeaningFor(4)).toMatchObject({ star: 4, isHalf: false, short: RATING_MEANINGS[4].short });
  });

  it('ratingMeaningFor is null for unrated', () => {
    expect(ratingMeaningFor(0)).toBeNull();
    expect(ratingMeaningFor(null)).toBeNull();
    expect(ratingMeaningFor(undefined)).toBeNull();
  });

  it('a half value shows the meaning of its LOWER whole star, with the half noted', () => {
    const m = ratingMeaningFor(3.5);
    expect(m.star).toBe(3);
    expect(m.isHalf).toBe(true);
    expect(m.short).toBe(RATING_MEANINGS[3].short);
    expect(ratingMeaningLine(3.5)).toBe(`3½ of 5 — ${RATING_MEANINGS[3].short}`);
  });

  it('ratingMeaningLine formats a whole value plainly', () => {
    expect(ratingMeaningLine(5)).toBe(`5 of 5 — ${RATING_MEANINGS[5].short}`);
  });
});
