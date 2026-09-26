/**
 * Type policies for ThingGeek's slice of the shared Apollo cache, added at
 * runtime (GeekSuiteApolloProvider builds a plain InMemoryCache) before the
 * first query writes anything. GameGeek's cachePolicies.js is the pattern.
 *
 *   - `Thing.value` / `Thing.acquired` have no id: merging them lets the
 *     card's and the sheet's selections share one Thing entry.
 *   - `ThingProfile`, `ThingVocabulary`, `ThingAttention` are singletons
 *     (`keyFields: []`), so a mutation that returns the profile updates every
 *     view of it.
 *   - `Query.thing` reads through to a `Thing:<id>` the library already holds,
 *     so a card tap paints the sheet at once.
 *   - `Query.things` is ONE list per filter + sort (`pagedListPolicy` from
 *     @geeksuite/collection); edits never refetch it — every Thing-returning
 *     mutation updates `Thing:<id>` in place. A create refreshes it in place
 *     (hooks/useLibrary.js `refreshLibraryList`), a trash removes the row
 *     (`removeThingFromLists`). Never `refetch()` it: an overwrite collapses
 *     loaded pages (GameGeek's scroll-to-top bug of 2026-09-25).
 */
import { evictRootFields, installTypePoliciesOnce, pagedListPolicy, removeFromPagedLists } from '@geeksuite/collection';

export const THING_TYPE_POLICIES = {
  Thing: {
    fields: {
      value: { merge: true },
      acquired: { merge: true },
    },
  },
  ThingProfile: { keyFields: [] },
  ThingVocabulary: { keyFields: [] },
  ThingAttention: { keyFields: [] },
  Query: {
    fields: {
      things: pagedListPolicy({ keyArgs: ['filter', 'sort', 'sortDir', 'seed'], itemsField: 'things' }),
      thing: {
        read(existing, { args, toReference }) {
          return existing ?? (args?.id ? toReference({ __typename: 'Thing', id: args.id }) : undefined);
        },
      },
    },
  },
};

/** Take one thing out of every cached list (and its total) — a trash, with no refetch. */
export function removeThingFromLists(cache, thingId) {
  // No `typename`: the entity stays, so an open sheet or the Trash list
  // never reads a half-evicted Thing on the way out.
  removeFromPagedLists(cache, { field: 'things', itemsField: 'things', id: thingId });
}

/**
 * After a change the counts cannot follow in place (a create, a trash, a
 * restore, a type or place edit): drop the counts and summaries so the next
 * view asks again. The list itself is kept — it is refreshed in place.
 */
export function resetCounts(client) {
  evictRootFields(client, ['thingFacets', 'thingAttention', 'thingInsuranceTotals', 'trashedThings']);
}

export function installThingPolicies(client) {
  installTypePoliciesOnce(client, THING_TYPE_POLICIES);
}
