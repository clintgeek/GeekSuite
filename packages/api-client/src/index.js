import React from 'react';
import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Use env var if set, otherwise fallback to relative /graphql
const envUri = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GRAPHQL_API_URL : process.env.VITE_GRAPHQL_API_URL;
const GRAPHQL_API_URI = envUri || '/graphql';

const httpLink = createHttpLink({
    uri: GRAPHQL_API_URI,
});

const authLink = setContext((_, { headers }) => {
    // Extract token. In GeekSuite, it might be stored in localStorage by auth pkg
    const token = localStorage.getItem('token');
    return {
        headers: {
            ...headers,
            authorization: token ? `Bearer ${ token }` : "",
        }
    }
});

const client = new ApolloClient({
    link: authLink.concat(httpLink),
    cache: new InMemoryCache()
});

/**
 * A shared provider so all GeekSuite frontend apps use the same Apollo Client configuration.
 */
export function GeekSuiteApolloProvider({ children }) {
    return React.createElement(ApolloProvider, { client }, children);
}
