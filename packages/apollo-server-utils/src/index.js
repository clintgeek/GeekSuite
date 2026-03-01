import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { baseTypeDefs } from '@geeksuite/graphql-config';

/**
 * Utility to set up a GeekSuite subgraph on an Express app.
 * Adheres to KISS principle by hiding boilerplate.
 *
 * @param {import('express').Application} app - The Express application instance
 * @param {object} options
 * @param {import('graphql').DocumentNode} options.typeDefs - The GraphQL schema for this microservice
 * @param {object} options.resolvers - The resolvers for this schema
 * @param {string} [options.path='/graphql'] - The route to mount the GraphQL server
 */
export async function setupGeekSuiteSubgraph(app, { typeDefs, resolvers, path = '/graphql' }) {
    // Combine the local typeDefs with the shared baseTypeDefs
    const schema = buildSubgraphSchema([
        { typeDefs: baseTypeDefs },
        { typeDefs, resolvers }
    ]);

    const server = new ApolloServer({
        schema,
    });

    await server.start();

    app.use(
        path,
        expressMiddleware(server, {
            context: async ({ req }) => {
                // Extract basic user info from req.user if already populated by @geeksuite/user middlewares
                // or extract from headers here. We assume auth middleware runs before GraphQL or at Gateway
                return {
                    user: req.user || null,
                    token: req.headers.authorization || '',
                };
            },
        })
    );

    return server;
}
