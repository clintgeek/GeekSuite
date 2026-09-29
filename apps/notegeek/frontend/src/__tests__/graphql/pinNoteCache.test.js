import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCache } from '@apollo/client';
import { GET_NOTES } from '../../graphql/queries';
import { onNotePinned } from '../../graphql/cacheUpdates';

/**
 * `onNotePinned` — the cache consequence of `usePinNote`. The note entity
 * merges itself; what doesn't is which `notes` list order it belongs in
 * (the gateway sorts pinned first), so a cached `notes` list must be evicted
 * rather than resorted blindly. Same pattern and rationale as
 * `cacheUpdates.test.js`'s coverage of `onNoteUpdated`.
 */

const NOTES_VARS = { tag: null, prefix: null, type: null, limit: 200 };

const NOTE_A = {
  __typename: 'Note',
  id: 'a',
  title: 'Roof quote',
  content: 'call back',
  type: 'text',
  tags: ['house'],
  pinned: false,
  pinnedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};
const NOTE_B = { ...NOTE_A, id: 'b', title: 'Groceries', tags: ['home'] };

let cache;
beforeEach(() => {
  cache = new InMemoryCache();
  cache.writeQuery({
    query: GET_NOTES,
    variables: NOTES_VARS,
    data: { notes: [NOTE_A, NOTE_B] },
  });
});

const readNotes = () => {
  try {
    return cache.readQuery({ query: GET_NOTES, variables: NOTES_VARS })?.notes ?? null;
  } catch {
    return null;
  }
};

describe('onNotePinned', () => {
  it('evicts the cached notes list so it refetches in the new (pinned-first) order', () => {
    expect(readNotes()).toHaveLength(2);

    onNotePinned(cache);

    expect(readNotes()).toBeNull();
  });

  it('never throws, even against an empty cache', () => {
    const empty = new InMemoryCache();
    expect(() => onNotePinned(empty)).not.toThrow();
  });
});
