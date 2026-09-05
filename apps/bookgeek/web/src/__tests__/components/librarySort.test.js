import { describe, it, expect } from 'vitest';
import { SORT_LABELS, SORT_ORDER } from '../../components/librarySort';

describe('SORT_LABELS', () => {
  it('has a human label for every sort key the books query accepts', () => {
    expect(SORT_LABELS).toEqual({
      title: 'Title',
      author: 'Author',
      dateAdded: 'Added',
      rating: 'Rating',
      dateFinished: 'Date finished',
      pageCount: 'Page count',
      publishedDate: 'Published',
      owned: 'Owned',
    });
  });
});

describe('SORT_ORDER', () => {
  it('puts the four common sorts first, in order', () => {
    expect(SORT_ORDER.slice(0, 4)).toEqual(['title', 'author', 'dateAdded', 'rating']);
  });

  it('lists every id exactly once, with a matching label', () => {
    expect(new Set(SORT_ORDER).size).toBe(SORT_ORDER.length);
    for (const id of SORT_ORDER) {
      expect(SORT_LABELS[id]).toBeTruthy();
    }
  });

  it('cannot drift from SORT_LABELS — same key set, either direction', () => {
    expect([...SORT_ORDER].sort()).toEqual(Object.keys(SORT_LABELS).sort());
  });
});
