/**
 * Type policies for GameGeek's slice of the shared Apollo cache.
 *
 * `GeekSuiteApolloProvider` builds a plain InMemoryCache the app cannot
 * configure up front, so these are added at runtime with
 * `cache.policies.addTypePolicies` — before the first query writes anything.
 *
 *   - `GameMyState` has no id; merging it (not replacing it) means a library
 *     card's slim `me` and the detail sheet's full `me` can share one Game
 *     entry without either wiping the other's fields.
 *   - `GameProfile`, `GameShelfStats` and `GameVocabulary` are singletons per
 *     user (`keyFields: []`), so a mutation that returns the profile updates
 *     every view of it with no hand-written cache update.
 *   - `Query.game` reads through to a `Game:<id>` the library already holds,
 *     so a card tap shows the hero instantly while the rest loads.
 *   - `Query.games` is ONE list per filter + sort (keyArgs leave out `page`
 *     and `limit`); page 1 refreshes its head, later pages append
 *     (mergeGamesPage). Edits never refetch it: every Game-returning
 *     mutation updates `Game:<id>` in place (views/detail/useDetailActions.js).
 *     A create refreshes it IN PLACE with one page-1 request as long as what
 *     is loaded (hooks/useRefreshLibraryList.js). Note `refetch()` /
 *     `refetchQueries` would not do: Apollo writes a refetch with
 *     `overwrite`, so the merge sees no existing list and three loaded pages
 *     collapse to one — the scroll-to-top bug of 2026-09-25.
 *   - `gameFacets` answers are kept per filter (the default, keyed by args),
 *     so going back to a filter shows its counts at once.
 */
/**
 * Merge one incoming `GamePage` into the cached list for its filter + sort.
 *
 *   - page 1 is a refresh: its rows replace the head of the list, and any
 *     rows already loaded beyond it stay (so nothing collapses);
 *   - a later page appends the rows the list does not have yet.
 * Either way a game is in the list once. Appending (rather than writing at
 * a fixed offset) is what keeps paging honest after a delete or a create
 * has shifted the server's pages under the loaded list.
 */
export function mergeGamesPage(existing, incoming, { args }) {
  if (!incoming) return existing;
  const keyOf = (ref) => ref?.__ref ?? ref?.id;
  const old = existing?.games ?? [];
  const fresh = incoming.games ?? [];
  const page = args?.page ?? 1;
  const ordered = page <= 1 ? [...fresh, ...old.slice(fresh.length)] : [...old, ...fresh];
  const seen = new Set();
  const games = ordered.filter((ref) => {
    const key = keyOf(ref);
    if (!ref || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...incoming, games };
}

export const GAME_TYPE_POLICIES = {
  Game: {
    fields: {
      me: { merge: true },
    },
  },
  GameProfile: { keyFields: [] },
  GameShelfStats: { keyFields: [] },
  GameVocabulary: { keyFields: [] },
  Query: {
    fields: {
      games: {
        keyArgs: ['q', 'shelf', 'platform', 'owned', 'sort', 'sortDir', 'filter', 'seed'],
        merge: mergeGamesPage,
      },
      game: {
        read(existing, { args, toReference }) {
          return existing ?? (args?.id ? toReference({ __typename: 'Game', id: args.id }) : undefined);
        },
      },
    },
  },
};

/**
 * After a bulk change (an import, a metadata run) the cached lists and counts
 * are stale in ways a page-1 refetch cannot fix. Drop them; the library
 * reloads fresh the next time it shows.
 */
export function resetLibraryLists(client) {
  const cache = client?.cache;
  if (!cache) return;
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'games' });
  cache.evict({ id: 'ROOT_QUERY', fieldName: 'gameFacets' });
  cache.gc();
}

/** Take one game out of every cached list (and its total) — a delete, with no refetch. */
export function removeGameFromLists(cache, gameId) {
  cache.modify({
    id: 'ROOT_QUERY',
    fields: {
      games(existing, { readField }) {
        if (!existing?.games) return existing;
        const games = existing.games.filter((ref) => readField('id', ref) !== gameId);
        if (games.length === existing.games.length) return existing;
        return { ...existing, games, total: Math.max(0, (existing.total ?? 1) - 1) };
      },
    },
  });
  cache.evict({ id: cache.identify({ __typename: 'Game', id: gameId }) });
  cache.gc();
}

const installed = new WeakSet();

export function installGamePolicies(client) {
  const cache = client?.cache;
  if (!cache?.policies || installed.has(cache)) return;
  cache.policies.addTypePolicies(GAME_TYPE_POLICIES);
  installed.add(cache);
}
