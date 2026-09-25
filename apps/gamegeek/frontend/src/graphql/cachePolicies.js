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
 */
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
      game: {
        read(existing, { args, toReference }) {
          return existing ?? (args?.id ? toReference({ __typename: 'Game', id: args.id }) : undefined);
        },
      },
    },
  },
};

const installed = new WeakSet();

export function installGamePolicies(client) {
  const cache = client?.cache;
  if (!cache?.policies || installed.has(cache)) return;
  cache.policies.addTypePolicies(GAME_TYPE_POLICIES);
  installed.add(cache);
}
