/**
 * cacheUpdates.js — what each mutation owes the Apollo cache.
 *
 * The rule is the suite's, written down in full at the top of
 * `apps/bujogeek/frontend/src/apolloClient.js`: **every mutation owns the cache
 * consequences of its own write.** notegeek's client is a bare
 * `new InMemoryCache()` with no type policies (`packages/api-client`), so
 * nothing is handled centrally, and until the 2026-09-05 going-over four of its
 * mutations had no cache consequence at all.
 *
 * The one that actually bit:
 *
 * > `renameTag` / `deleteTag` return a bare `Boolean`, so there is nothing for
 * > Apollo to normalize. The sidebar's tag tree is a `useQuery(GET_TAGS)` that
 * > lives inside `Layout` and therefore **never unmounts** — its
 * > `cache-and-network` fetch policy only re-runs on mount. So a renamed or
 * > deleted tag stayed in the sidebar, and stayed on every note row, for the
 * > rest of the session.
 *
 * Field changes still need nothing (`updateNote` selects the note's whole
 * shape, so `Note:<id>` merges itself). What needs handling is membership: a
 * note leaving a list, a tag leaving the index, a note's `tags` changing which
 * `notes(tag:)` lists it belongs to.
 *
 * Nothing here throws. A cache update that fails must never take a successful
 * write down with it.
 */

/**
 * Root fields the gateway derives from notes. Evicting a ROOT_QUERY field
 * marks it missing, so the `cache-and-network` queries reading it fetch just
 * that field on their next run instead of serving a stale answer forever.
 *
 * `notes` is here rather than being surgically edited because it is a
 * *filtered, sorted, limited* list keyed by four arguments — the client cannot
 * honestly decide which cached variants a changed note now belongs to, and
 * guessing wrong is worse than refetching.
 */
const NOTE_DERIVED_ROOT_FIELDS = ['notes', 'noteTags', 'searchNotes'];

const evictNoteDerived = (cache) => {
  for (const fieldName of NOTE_DERIVED_ROOT_FIELDS) {
    cache.evict({ id: 'ROOT_QUERY', fieldName });
  }
  cache.gc();
};

/** A note was created: it joins lists the client cannot recompute. */
export const onNoteCreated = (cache) => {
  evictNoteDerived(cache);
};

/**
 * A note was deleted. Drop the entity so no cached list can hold a dangling
 * reference to it — `deleteNote` returns only `Boolean`, so the id has to be
 * closed over from the call site.
 */
export const onNoteDeleted = (noteId) => (cache, { data }) => {
  if (data && data.deleteNote === false) return;
  const ref = cache.identify({ __typename: 'Note', id: String(noteId) });
  if (ref) cache.evict({ id: ref });
  evictNoteDerived(cache);
};

/**
 * A note's own fields merge themselves (it selects its whole shape). What does
 * not is which `notes(tag:)` lists it now belongs to, or the tag index it may
 * have just added a brand-new tag to.
 */
export const onNoteUpdated = (cache) => {
  evictNoteDerived(cache);
};

/**
 * A tag was renamed or deleted across every note that carried it.
 *
 * The mutation returns a bare `Boolean` and touches an unbounded set of notes
 * server-side, so there is nothing to merge and no way to know which rows
 * changed. Every cached `Note` is therefore evicted along with the derived
 * root fields: the alternative is a sidebar and a set of note rows showing a
 * tag that no longer exists.
 */
export const onTagsRewritten = (cache) => {
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'note' });
  evictNoteDerived(cache);
  // `gc()` alone will not drop a `Note:<id>` that a live query still
  // references, which is what we want — the eviction of the list fields makes
  // those queries refetch, and the fresh result overwrites the stale `tags`.
};
