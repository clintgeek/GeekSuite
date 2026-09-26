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
 *     (`pagedListPolicy`, @geeksuite/collection). Edits never refetch it: every Game-returning
 *     mutation updates `Game:<id>` in place (views/detail/useDetailActions.js).
 *     A create refreshes it IN PLACE with one page-1 request as long as what
 *     is loaded (hooks/useLibrary.js `refreshLibraryList`). Note `refetch()` /
 *     `refetchQueries` would not do: Apollo writes a refetch with
 *     `overwrite`, so the merge sees no existing list and three loaded pages
 *     collapse to one — the scroll-to-top bug of 2026-09-25.
 *   - `gameFacets` answers are kept per filter (the default, keyed by args),
 *     so going back to a filter shows its counts at once.
 */
import { evictRootFields, installTypePoliciesOnce, pagedListPolicy, removeFromPagedLists } from '@geeksuite/collection';

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
      games: pagedListPolicy({
        keyArgs: ['q', 'shelf', 'platform', 'owned', 'sort', 'sortDir', 'filter', 'seed'],
        itemsField: 'games',
      }),
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
  evictRootFields(client, ['games', 'gameFacets']);
}

/** Take one game out of every cached list (and its total) — a delete, with no refetch. */
export function removeGameFromLists(cache, gameId) {
  removeFromPagedLists(cache, { field: 'games', itemsField: 'games', typename: 'Game', id: gameId });
}

export function installGamePolicies(client) {
  installTypePoliciesOnce(client, GAME_TYPE_POLICIES);
}
