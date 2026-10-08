import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryCache } from '@apollo/client';
import { GET_NOTES, GET_TAGS, SEARCH_NOTES } from '../../graphql/queries';
import { ARCHIVED_NOTES, NOTE_ARCHIVE_STATE } from '../../graphql/archive';
import { onNotesArchived } from '../../graphql/cacheUpdates';

/**
 * Archive / restore's cache consequence (DOCS/COMPOSE_MANY_AND_ARCHIVE_SPEC.md
 * U8): every list, tag count and search reflects it without a reload, and an
 * open note's banner flips. Against a real InMemoryCache, like
 * cacheUpdates.test.js, because what is under test is what the cache does.
 */

const NOTES_VARS = { tag: null, prefix: null, under: null, type: null, limit: 200 };
const NOTE = (id, extra = {}) => ({
  __typename: 'Note', id, title: id, content: 'x', type: 'markdown', tags: ['house'],
  pinned: false, pinnedAt: null, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', ...extra,
});

let cache;
beforeEach(() => {
  cache = new InMemoryCache();
  cache.writeQuery({ query: GET_NOTES, variables: NOTES_VARS, data: { notes: [NOTE('a'), NOTE('b')] } });
  cache.writeQuery({ query: GET_TAGS, data: { noteTags: ['house'] } });
  cache.writeQuery({
    query: SEARCH_NOTES,
    variables: { q: 'roof', hybrid: true },
    data: { searchNotes: [] },
  });
  cache.writeQuery({ query: ARCHIVED_NOTES, variables: { limit: 200 }, data: { archivedNotes: [] } });
  cache.writeQuery({
    query: NOTE_ARCHIVE_STATE,
    variables: { id: 'a' },
    data: { note: { __typename: 'Note', id: 'a', archived: false, archivedAt: null } },
  });
});

const read = (query, variables) => {
  try { return cache.readQuery({ query, variables }); } catch { return null; }
};

describe('onNotesArchived', () => {
  it('archiving: every list, the tag index, search and Archived refetch', () => {
    onNotesArchived(true)(cache, { data: { archiveNotes: { ids: ['a'], count: 1 } } });
    expect(read(GET_NOTES, NOTES_VARS)).toBeNull();
    expect(read(GET_TAGS)).toBeNull();
    expect(read(SEARCH_NOTES, { q: 'roof', hybrid: true })).toBeNull();
    expect(read(ARCHIVED_NOTES, { limit: 200 })).toBeNull();
  });

  it('archiving: the note itself says archived at once (the banner flips)', () => {
    onNotesArchived(true)(cache, { data: { archiveNotes: { ids: ['a'], count: 1 } } });
    const state = read(NOTE_ARCHIVE_STATE, { id: 'a' });
    expect(state.note.archived).toBe(true);
    expect(typeof state.note.archivedAt).toBe('string');
  });

  it('restoring: the note says not archived, and the lists refetch', () => {
    cache.writeQuery({
      query: NOTE_ARCHIVE_STATE,
      variables: { id: 'a' },
      data: { note: { __typename: 'Note', id: 'a', archived: true, archivedAt: '2026-10-08T00:00:00.000Z' } },
    });
    onNotesArchived(false)(cache, { data: { restoreNotes: { ids: ['a'], count: 1 } } });
    const state = read(NOTE_ARCHIVE_STATE, { id: 'a' });
    expect(state.note.archived).toBe(false);
    expect(state.note.archivedAt).toBeNull();
    expect(read(GET_NOTES, NOTES_VARS)).toBeNull();
  });

  it('only touches the notes that changed', () => {
    cache.writeQuery({
      query: NOTE_ARCHIVE_STATE,
      variables: { id: 'b' },
      data: { note: { __typename: 'Note', id: 'b', archived: false, archivedAt: null } },
    });
    onNotesArchived(true)(cache, { data: { archiveNotes: { ids: ['a'], count: 1 } } });
    expect(read(NOTE_ARCHIVE_STATE, { id: 'b' }).note.archived).toBe(false);
  });

  it('never throws, whatever comes back', () => {
    expect(() => onNotesArchived(true)(cache, {})).not.toThrow();
    expect(() => onNotesArchived(true)(cache, { data: null })).not.toThrow();
    expect(() => onNotesArchived(true)({ evict: () => { throw new Error('boom'); } }, { data: { archiveNotes: { ids: [] } } })).not.toThrow();
  });
});

describe('the store behind Home and search (U8)', () => {
  vi.mock('../../services/api', () => ({
    getNotesApi: vi.fn(async () => ({ data: [{ id: 'a' }, { id: 'b' }] })),
    getNoteByIdApi: vi.fn(),
    createNoteApi: vi.fn(),
    updateNoteApi: vi.fn(),
    deleteNoteApi: vi.fn(),
    searchNotesApi: vi.fn(async () => ({ data: [{ _id: 'a' }, { _id: 'c' }] })),
  }));

  it('archived notes leave Home and search at once; a restore re-reads both', async () => {
    const api = await import('../../services/api');
    const { default: useNoteStore } = await import('../../store/noteStore');
    const store = useNoteStore.getState();
    await store.fetchNotes({ limit: 50 });
    await store.searchNotes('roof');
    expect(useNoteStore.getState().notes.map((n) => n.id)).toEqual(['a', 'b']);

    useNoteStore.getState().dropNotes(['a']);
    expect(useNoteStore.getState().notes.map((n) => n.id)).toEqual(['b']);
    expect(useNoteStore.getState().searchResults.map((n) => n._id)).toEqual(['c']);

    api.getNotesApi.mockClear();
    api.searchNotesApi.mockClear();
    useNoteStore.getState().refreshLists();
    await vi.waitFor(() => expect(useNoteStore.getState().notes.map((n) => n.id)).toEqual(['a', 'b']));
    expect(api.getNotesApi).toHaveBeenCalledWith({ limit: 50 });
    expect(api.searchNotesApi).toHaveBeenCalledWith('roof');
  });
});
