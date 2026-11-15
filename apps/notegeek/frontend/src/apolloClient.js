import { createApolloClient } from '@geeksuite/api-client';

export const apolloClient = createApolloClient('notegeek');

/**
 * `note(id)` reads the cached `Note:<id>` (review 2026-11, 3.1). Without it a
 * note already in the cache from another query (a list row, search, Related)
 * was still a cache MISS for `note(id: …)`, so every open waited on the
 * network. When the entity lacks a field the query wants (list rows carry
 * `preview`, not `content`), Apollo sees the gap and fetches as before.
 *
 * Added to the shared client's cache here rather than in
 * `@geeksuite/api-client`, which every app shares.
 */
try {
  apolloClient.cache.policies.addTypePolicies({
    Query: {
      fields: {
        note: {
          read(existing, { args, toReference }) {
            if (existing !== undefined) return existing;
            return args?.id ? toReference({ __typename: 'Note', id: args.id }) : existing;
          },
        },
      },
    },
  });
} catch {
  // A cache without policies (a test double) just goes without the redirect.
}
