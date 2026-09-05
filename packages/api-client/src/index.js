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

// Exported (not just used below) so it can be unit-tested directly without
// standing up a whole ApolloClient/link chain.
export const authLink = setContext((_, { headers }) => {
    // Extract token. In GeekSuite, it might be stored in localStorage by auth pkg
    const token = localStorage.getItem('geek_token');
    // Double-submit CSRF token for basegeek (see DOCS/CONTEXT.md "CSRF: the
    // double-submit token"). GraphQL is POST-only, so every query and mutation
    // goes through this link; csrfHeaders() with no method reads geek_csrf off
    // document.cookie and returns {} when there is none yet, so it's harmless
    // to attach on queries too.
    const nextHeaders = { ...headers, ...csrfHeaders() };
    if (token) {
        nextHeaders.authorization = `Bearer ${ token }`;
    }
    return { headers: nextHeaders };
});

import { onError } from '@apollo/client/link/error';
import { Observable } from '@apollo/client/utilities';
import { logout, loginRedirect, csrfHeaders, isCsrfFailure, triggerCsrfReloadOnce } from '@geeksuite/auth';

/**
 * errorLink, exported for testing: the shared Apollo error link every
 * consumer app's client goes through.
 *
 * ## Stale-tab CSRF heal (2026-09-05)
 *
 * A tab whose JS predates the CSRF rollout — or whose `geek_csrf` cookie
 * rotated out from under it (another tab refreshed) — posts a mutation with
 * no header, or a stale one. basegeek's csrfTokenGuard rejects it as a plain
 * HTTP 403 *before* GraphQL ever executes, which Apollo Client surfaces as a
 * `networkError` (not a `graphQLErrors` entry) carrying `statusCode: 403` and
 * `result: { error: 'csrf_token_missing' | 'csrf_token_invalid' }`.
 *
 * `forward(operation)` re-sends the operation through the rest of the chain
 * — `authLink` then `httpLink` — and `authLink` re-reads `geek_csrf` off
 * `document.cookie` fresh on every pass (see its comment above), so simply
 * forwarding again already picks up a cookie that was just (re)issued or
 * rotated; there is nothing extra to stamp here.
 *
 * `onError` only invokes this handler once per *original* failure — if the
 * observable we hand back from a retry fails too, Apollo just propagates
 * that new error without calling us again. So "retry once, then reload if it
 * fails the same way" has to be handled by hand inside the Observable we
 * return, rather than by relying on a second invocation of this function.
 * `triggerCsrfReloadOnce()` is the same reload guard `@geeksuite/auth`'s
 * axios interceptor uses, so a tab that trips this from both a GraphQL call
 * and a REST call still only reloads once.
 */
export const errorLink = (appName) => onError(({ graphQLErrors, networkError, operation, forward }) => {
    if (networkError && isCsrfFailure(networkError.statusCode, networkError.result)) {
        return new Observable((observer) => {
            const sub = forward(operation).subscribe({
                next: (result) => observer.next(result),
                error: (retryError) => {
                    // Never reaches here for any other networkError —
                    // isCsrfFailure() gates on basegeek's specific CSRF codes.
                    if (isCsrfFailure(retryError.statusCode, retryError.result)) {
                        triggerCsrfReloadOnce();
                    }
                    observer.error(retryError);
                },
                complete: () => observer.complete(),
            });
            return () => sub.unsubscribe();
        });
    }

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
