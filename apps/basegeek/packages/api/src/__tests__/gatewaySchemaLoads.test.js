// Tripwire: the merged gateway schema must import and build — the *same* way
// the server boots it. On 2026-09-05 an unescaped backtick inside bujogeek's
// gql template literal made typeDefs.js a SyntaxError; every gateway suite
// stayed green because none imported graphql/index.js, and basegeek
// crash-looped in production.
//
// The first version of this tripwire used `buildASTSchema(typeDefs)`, which
// only parses the SDL and never looks at the resolver map. `server.js:430`
// boots `new ApolloServer({ typeDefs, resolvers })`, which runs
// `makeExecutableSchema` and THROWS on a resolver field the schema does not
// declare. So a stream renaming a typeDefs field while another edits
// resolvers the same day left CI green and basegeek crash-looping — exactly
// the outage this file exists to prevent (BURN_REVIEW #12).
//
// It now constructs the real ApolloServer and starts it. `@graphql-tools/schema`
// is not a direct dependency of this package (only a transitive one under
// `@apollo/server`, so it does not resolve from here) — `@apollo/server` is,
// and it is the thing the boot path actually uses, which makes it the better
// guard anyway.
import { ApolloServer } from '@apollo/server';
import { typeDefs, resolvers } from '../graphql/index.js';

describe('gateway schema', () => {
  it('imports every module and boots the real ApolloServer', async () => {
    const server = new ApolloServer({ typeDefs, resolvers });
    try {
      await server.start();
      expect(Object.keys(resolvers.Query).length).toBeGreaterThan(10);
      expect(Object.keys(resolvers.Mutation).length).toBeGreaterThan(10);
    } finally {
      await server.stop();
    }
  });

  // The negative half — proof the tripwire is actually armed. A resolver
  // field with no matching typeDefs field is precisely the drift that
  // `buildASTSchema` waved through; if this test ever stops throwing, the
  // guard above has gone slack and the positive test means nothing.
  it('rejects a resolver field the schema does not declare', async () => {
    const bogusResolvers = {
      ...resolvers,
      Query: { ...resolvers.Query, thisFieldDoesNotExistInTypeDefs: () => 1 },
    };
    await expect(
      (async () => {
        const server = new ApolloServer({ typeDefs, resolvers: bogusResolvers });
        await server.start();
        await server.stop();
      })()
    ).rejects.toThrow(/thisFieldDoesNotExistInTypeDefs/);
  });
});
