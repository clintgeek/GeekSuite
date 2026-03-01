import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import express from 'express';
import cors from 'cors';

const app = express();

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
    willSendRequest({ request, context }) {
        // Pass the user's token from the context to underlying subgraphs
        if (context.token) {
            request.http.headers.set('authorization', context.token);
        }
    }
}

// Set up the Gateway using IntrospectAndCompose for local development mapping to subgraphs.
const gateway = new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
        subgraphs: [
            { name: 'notegeek', url: 'http://localhost:4002/graphql' },
            { name: 'flockgeek', url: 'http://localhost:4003/graphql' },
            { name: 'bujogeek', url: 'http://localhost:5001/graphql' },
            { name: 'fitnessgeek', url: 'http://localhost:3001/graphql' },
            { name: 'bookgeek', url: 'http://localhost:1800/graphql' }
        ],
    }),
    buildService({ name, url }) {
        return new AuthenticatedDataSource({ url });
    },
});

const server = new ApolloServer({
    gateway,
    // Subscriptions are unsupported with the gateway currently
    subscriptions: false,
});

await server.start();

app.use(cors());
app.use(express.json());

app.use(
    '/graphql',
    expressMiddleware(server, {
        context: async ({ req }) => {
            // Forward the authorization header to the context
            return { token: req.headers.authorization };
        },
    })
);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`🚀 Gateway ready at http://localhost:${PORT}/graphql`);
});
