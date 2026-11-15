import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCache } from '@apollo/client';
import { GET_NOTES, GET_NOTE_BY_ID, GET_TAGS } from '../../graphql/queries';
import {
  onNoteCreated,
  onNoteDeleted,
  onNoteUpdated,
  onTagsRewritten,
} from '../../graphql/cacheUpdates';

/**
 * Four mutations that had NO cache consequence at all before the 2026-09-05
 * going-over. The one that actually bit users:
 *
 * `renameTag` / `deleteTag` return a bare `Boolean`, so Apollo has nothing to
 * normalize, and the sidebar's tag tree is a `useQuery(GET_TAGS)` inside
 * `Layout` — which never unmounts, so its `cache-and-network` policy never
 * re-runs. A renamed or deleted tag stayed in the sidebar, and on every note
 * row, for the rest of the session.
 *
 * These run against a real `InMemoryCache`, not a mock, because the thing
 * under test is exactly what the cache does with the eviction.
 */

const NOTES_VARS = { tag: null, prefix: null, type: null, limit: 200 };

const NOTE_A = {
  __typename: 'Note',
  id: 'a',
  title: 'Roof quote',
  content: 'call back',
  preview: 'call back',
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
  cache.writeQuery({ query: GET_TAGS, data: { noteTags: ['home', 'house'] } });
});

const readNotes = () => {
  try {
    return cache.readQuery({ query: GET_NOTES, variables: NOTES_VARS })?.notes ?? null;
  } catch {
    return null;
  }
};
const readTags = () => {
  try {
    return cache.readQuery({ query: GET_TAGS })?.noteTags ?? null;
  } catch {
    return null;
  }
};

describe('onTagsRewritten', () => {
  it('invalidates the tag index a renamed tag would otherwise haunt', () => {
    expect(readTags()).toEqual(['home', 'house']);
    onTagsRewritten(cache);
    // Missing, not stale — the `cache-and-network` watchers that read it now
    // fetch the field instead of serving a tag that no longer exists.
    expect(readTags()).toBeNull();
  });

  it('invalidates the note lists whose rows carry the old tag', () => {
    onTagsRewritten(cache);
    expect(readNotes()).toBeNull();
  });
});

describe('onNoteDeleted', () => {
  it('evicts the deleted note and only the deleted note', () => {
    // Root both notes under `note(id:)` as well, which this update does NOT
    // evict — otherwise `gc()` reaps every unreferenced entity and the test
    // would pass without the eviction doing any targeting at all.
    cache.writeQuery({ query: GET_NOTE_BY_ID, variables: { id: 'a' }, data: { note: { ...NOTE_A, isLocked: false, isEncrypted: false } } });
    cache.writeQuery({ query: GET_NOTE_BY_ID, variables: { id: 'b' }, data: { note: { ...NOTE_B, isLocked: false, isEncrypted: false } } });

    onNoteDeleted('a')(cache, { data: { deleteNote: true } });

    expect(cache.extract()['Note:a']).toBeUndefined();
    expect(cache.extract()['Note:b']).toBeDefined();
  });

  it('leaves the cache alone when the server said it did not delete', () => {
    onNoteDeleted('a')(cache, { data: { deleteNote: false } });
    expect(cache.extract()['Note:a']).toBeDefined();
    expect(readNotes()).not.toBeNull();
  });
});

describe('onNoteCreated / onNoteUpdated', () => {
  it.each([
    ['onNoteCreated', onNoteCreated],
    ['onNoteUpdated', onNoteUpdated],
  ])('%s invalidates the list membership the client cannot recompute', (_name, fn) => {
    // `notes(tag:…, prefix:…, type:…, limit:…)` is filtered, sorted and
    // limited by the server; which cached variants a new or re-tagged note now
    // belongs to is not something the client can decide honestly.
    fn(cache);
    expect(readNotes()).toBeNull();
  });
});

describe('onNoteUpdated — the slim autosave (review 5.7)', () => {
  beforeEach(() => {
    cache.writeQuery({ query: GET_NOTE_BY_ID, variables: { id: 'a' }, data: { note: { ...NOTE_A, isLocked: false, isEncrypted: false } } });
  });

  it('leaves the tag index and the lists alone when the tags did not change', () => {
    onNoteUpdated(cache, { data: { updateNote: { id: 'a' } } }, { variables: { id: 'a', content: 'x' }, context: { tagsChanged: false } });
    expect(readTags()).toEqual(['home', 'house']);
    expect(readNotes()).not.toBeNull();
  });

  it('still evicts them when the tags changed, or when the caller does not say', () => {
    onNoteUpdated(cache, { data: { updateNote: { id: 'a' } } }, { variables: { id: 'a' }, context: { tagsChanged: true } });
    expect(readTags()).toBeNull();
  });

  it('writes the body it sent onto the cached note (the response no longer carries it)', () => {
    onNoteUpdated(cache, { data: { updateNote: { id: 'a' } } }, { variables: { id: 'a', content: 'new body' }, context: { tagsChanged: false } });
    expect(cache.readQuery({ query: GET_NOTE_BY_ID, variables: { id: 'a' } }).note.content).toBe('new body');
  });
});
