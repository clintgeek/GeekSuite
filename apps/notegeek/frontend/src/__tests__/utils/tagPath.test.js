import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeTags,
  isInSubtree,
  isDescendant,
  swapPrefix,
  tagHref,
  rowTagLabels,
} from '../../utils/tagPath';

// The same cases as the gateway's notegeekNestedTags.test.js — this file is a
// copy of `graphql/notegeek/tags.js`, and the two must agree.
describe('normalizeTag', () => {
  it.each([
    [' house // garage/ ', 'house/garage'],
    ['house / garage', 'house/garage'],
    ['/house/', 'house'],
    ['House/Garage', 'House/Garage'],
    ['  work  ', 'work'],
    ['/', ''],
    [' // ', ''],
    ['', ''],
    [null, ''],
    ['a b/c d', 'a b/c d'],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });
});

describe('normalizeTags', () => {
  it('drops empties and dedupes in order, keeping case', () => {
    expect(normalizeTags(['b', ' a ', 'house / garage', '', '/', 'b', 'house/garage', 'B']))
      .toEqual(['b', 'a', 'house/garage', 'B']);
  });
  it('is [] for a non-array', () => {
    expect(normalizeTags(null)).toEqual([]);
  });
});

describe('subtree helpers', () => {
  it('isInSubtree needs the slash — house is not over houseboat', () => {
    expect(isInSubtree('house', 'house')).toBe(true);
    expect(isInSubtree('house/garage', 'house')).toBe(true);
    expect(isInSubtree('houseboat', 'house')).toBe(false);
    expect(isInSubtree('home', 'house')).toBe(false);
  });
  it('isDescendant excludes the tag itself', () => {
    expect(isDescendant('house', 'house')).toBe(false);
    expect(isDescendant('house/garage', 'house')).toBe(true);
  });
  it('swapPrefix moves the subtree and leaves the rest', () => {
    expect(swapPrefix('house/garage/door', 'house', 'home')).toBe('home/garage/door');
    expect(swapPrefix('house', 'house', 'home')).toBe('home');
    expect(swapPrefix('houseboat', 'house', 'home')).toBe('houseboat');
  });
  it('tagHref encodes the whole path', () => {
    expect(tagHref('house/garage')).toBe('/tags/house%2Fgarage');
  });
});

describe('rowTagLabels', () => {
  it('without a context, each tag is its last segment', () => {
    expect(rowTagLabels(['house/garage', 'work'])).toEqual(['garage', 'work']);
  });
  it('inside a tag view, sub-tags read relative and come first; the viewed tag is dropped', () => {
    expect(rowTagLabels(['misc', 'house', 'house/garage/door', 'houseboat'], 'house'))
      .toEqual(['garage/door', 'misc', 'houseboat']);
  });
});
