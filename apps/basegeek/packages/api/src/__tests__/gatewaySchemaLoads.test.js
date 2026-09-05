// Tripwire: the merged gateway schema must import and build. On 2026-09-05 an
// unescaped backtick inside bujogeek's gql template literal made typeDefs.js a
// SyntaxError; every gateway suite stayed green because none imported
// graphql/index.js, and basegeek crash-looped in production.
import { buildASTSchema } from 'graphql';
import { typeDefs, resolvers } from '../graphql/index.js';

describe('gateway schema', () => {
  it('imports every module and builds an executable schema', () => {
    const schema = buildASTSchema(typeDefs);
    expect(Object.keys(resolvers.Query).length).toBeGreaterThan(10);
    expect(Object.keys(resolvers.Mutation).length).toBeGreaterThan(10);
    expect(schema.getQueryType()).toBeTruthy();
    expect(schema.getMutationType()).toBeTruthy();
  });
});
