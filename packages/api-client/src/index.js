import React from 'react';
import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';

// Use env var if set, otherwise fallback to relative /graphql
const envUri = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_GRAPHQL_API_URL : process.env.VITE_GRAPHQL_API_URL;
const GRAPHQL_API_URI = envUri || '/graphql';

const httpLink = createHttpLink({
    uri: GRAPHQL_API_URI,
    credentials: 'include',
});

const authLink = setContext((_, { headers }) => {
    // Extract token. In GeekSuite, it might be stored in localStorage by auth pkg
    const token = localStorage.getItem('geek_token');
    return {
        headers: {
            ...headers,
            authorization: token ? `Bearer ${ token }` : "",
        }
    }
});

import { onError } from '@apollo/client/link/error';
import { logout, loginRedirect } from '@geeksuite/auth';

const errorLink = (appName) => onError(({ graphQLErrors, networkError }) => {
    let unauthenticated = false;

    if (graphQLErrors) {
        for (let err of graphQLErrors) {
            if (
                err.extensions?.code === 'UNAUTHENTICATED' ||
                err.message?.includes('Unauthorized') ||
                err.message?.includes('401')
            ) {
                unauthenticated = true;
                break;
            }
        }
    }

    if (networkError && networkError.statusCode === 401) {
        unauthenticated = true;
    }

    if (unauthenticated) {
        // Asynchronously log out to clear tokens and broadcast to other tabs.
        logout().then(() => {
            if (appName) {
                loginRedirect(appName, window.location.href);
            }
        }).catch((e) => console.error('GeekSuite Apollo 401 logout failed:', e));
    }
});

export const createApolloClient = (appName) => new ApolloClient({
    link: errorLink(appName).concat(authLink).concat(httpLink),
    cache: new InMemoryCache()
});

/**
 * A shared provider so all GeekSuite frontend apps use the same Apollo Client configuration.
 */
export function GeekSuiteApolloProvider({ children, appName }) {
    const client = React.useMemo(() => createApolloClient(appName), [appName]);
    return React.createElement(ApolloProvider, { client }, children);
}
