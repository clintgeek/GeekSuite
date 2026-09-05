import { describe, it, expect } from 'vitest';
import { InMemoryCache, gql } from '@apollo/client';
import { GET_TASK_TAGS, GET_JOURNAL_ENTRIES } from '../../graphql/queries';
import { onTaskCreated, onTaskDeleted, onJournalEntryCreated } from '../../graphql/cacheUpdates';

/**
 * These exercise the cache mechanics directly — no MockedProvider, no
 * component mount — the same way `apolloClient.js`'s rule is stated: the
 * `update` functions in `cacheUpdates.js` are the whole surface area, and
 * `cache.watch` is exactly what `useQuery` subscribes through under the hood,
 * so it stands in for "TagsPage is watching this field" without rendering it.
 */

describe('the tag index — TagsPage now watches it instead of fetching it once', () => {
  it('a created task evicts GET_TASK_TAGS and notifies a subscribed watcher', () => {
    const cache = new InMemoryCache();
    cache.writeQuery({
      query: GET_TASK_TAGS,
      data: { taskTags: [{ tag: 'work', count: 2 }] },
    });
    expect(cache.readQuery({ query: GET_TASK_TAGS })).toEqual({
      taskTags: [{ tag: 'work', count: 2 }],
    });

    const diffs = [];
    const cancelWatch = cache.watch({
      query: GET_TASK_TAGS,
      optimistic: true,
      callback: (diff) => diffs.push(diff),
    });

    onTaskCreated(cache, { data: { createTask: { collectionId: null } } });

    // A cache-first `useQuery` reacts to exactly this: notified, and the
    // field it depends on is now missing, so it goes to the network on its
    // own — which is the "refreshes the cloud without a reload" fix.
    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.at(-1).complete).toBe(false);
    expect(cache.readQuery({ query: GET_TASK_TAGS })).toBeNull();

    cancelWatch();
  });

  it('a deleted task evicts GET_TASK_TAGS the same way', () => {
    const cache = new InMemoryCache();
    cache.writeQuery({
      query: GET_TASK_TAGS,
      data: { taskTags: [{ tag: 'errand', count: 1 }] },
    });

    const diffs = [];
    const cancelWatch = cache.watch({
      query: GET_TASK_TAGS,
      optimistic: true,
      callback: (diff) => diffs.push(diff),
    });

    onTaskDeleted('t1', null)(cache, { data: { deleteTask: { success: true } } });

    expect(diffs.length).toBeGreaterThan(0);
    expect(diffs.at(-1).complete).toBe(false);
    expect(cache.readQuery({ query: GET_TASK_TAGS })).toBeNull();

    cancelWatch();
  });
});

describe('onJournalEntryCreated — what TemplateContext.applyTemplate now owns', () => {
  const writeExistingEntry = (cache, entry) => {
    // Simulates the normalization Apollo already does for a mutation's own
    // response before `update` runs — `cache.modify`'s `toReference` doesn't
    // write fields into the store on its own.
    cache.writeFragment({
      id: cache.identify({ __typename: 'JournalEntry', id: entry.id }),
      fragment: gql`
        fragment TestJournalEntry on JournalEntry {
          id
          title
          content
          type
          date
          tags
          status
          preview
          createdAt
          updatedAt
        }
      `,
      data: entry,
    });
  };

  const entry = (overrides = {}) => ({
    __typename: 'JournalEntry',
    id: 'j1',
    title: 'Daily Log',
    content: 'Review yesterday. Plan today.',
    type: 'daily',
    date: '2026-09-05',
    tags: ['daily'],
    status: 'published',
    preview: 'Review yesterday. Plan today.',
    createdAt: '2026-09-05T12:00:00.000Z',
    updatedAt: '2026-09-05T12:00:00.000Z',
    ...overrides,
  });

  it('joins a cached journalEntries list whose type/tags it satisfies (clause 2)', () => {
    const cache = new InMemoryCache();
    cache.writeQuery({
      query: GET_JOURNAL_ENTRIES,
      variables: { type: 'daily' },
      data: { journalEntries: [] },
    });
    const newEntry = entry();
    writeExistingEntry(cache, newEntry);

    onJournalEntryCreated(cache, { data: { createJournalFromTemplate: newEntry } });

    const result = cache.readQuery({
      query: GET_JOURNAL_ENTRIES,
      variables: { type: 'daily' },
    });
    expect(result.journalEntries).toHaveLength(1);
    expect(result.journalEntries[0].id).toBe('j1');
  });

  it('leaves a cached list filtered to a different type alone', () => {
    const cache = new InMemoryCache();
    cache.writeQuery({
      query: GET_JOURNAL_ENTRIES,
      variables: { type: 'weekly' },
      data: { journalEntries: [] },
    });
    const newEntry = entry({ id: 'j2', type: 'daily' });
    writeExistingEntry(cache, newEntry);

    onJournalEntryCreated(cache, { data: { createJournalFromTemplate: newEntry } });

    const result = cache.readQuery({
      query: GET_JOURNAL_ENTRIES,
      variables: { type: 'weekly' },
    });
    expect(result.journalEntries).toHaveLength(0);
  });

  it('does not add the same entry twice to a list it already belongs to', () => {
    const cache = new InMemoryCache();
    const newEntry = entry();
    writeExistingEntry(cache, newEntry);
    cache.writeQuery({
      query: GET_JOURNAL_ENTRIES,
      variables: { type: 'daily' },
      data: { journalEntries: [newEntry] },
    });

    onJournalEntryCreated(cache, { data: { createJournalFromTemplate: newEntry } });

    const result = cache.readQuery({
      query: GET_JOURNAL_ENTRIES,
      variables: { type: 'daily' },
    });
    expect(result.journalEntries).toHaveLength(1);
  });

  it('does nothing when the mutation result carries no entry', () => {
    const cache = new InMemoryCache();
    expect(() => onJournalEntryCreated(cache, { data: {} })).not.toThrow();
  });
});
