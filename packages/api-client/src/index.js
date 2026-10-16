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
export const authLink = setContext(async (_, { headers }) => {
    // A refresh in flight (the app just came back to the front, or another
    // operation hit a 401) is about to replace the token: wait for it rather
    // than send the old one. Resolves at once when there is none.
    await waitForRefresh();
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
import {
    logout,
    loginRedirect,
    csrfHeaders,
    isCsrfFailure,
    triggerCsrfReloadOnce,
    refreshSession,
    waitForRefresh,
    isSessionExpiredError,
} from '@geeksuite/auth';

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
/**
 * A tab whose JavaScript is older than the gateway's schema asks for fields
 * that no longer exist, and the gateway rejects the whole operation with
 * `GRAPHQL_VALIDATION_FAILED` (HTTP 400). Nothing about the session is wrong,
 * and retrying cannot help: the page has to load the new bundle. Found
 * 2026-09-25 when a Firefox tab kept a pre-deploy GameGeek bundle and every
 * "Save view" failed silently after `GameProfile.steamId` was removed.
 *
 * Reload at most once per STALE_RELOAD_WINDOW_MS per tab. A real mismatch that
 * a reload cannot fix (a new frontend briefly ahead of basegeek during a
 * deploy) must not become a reload loop.
 */
export const STALE_RELOAD_KEY = 'geeksuite:stale-bundle-reload-at';
export const STALE_RELOAD_WINDOW_MS = 10 * 60 * 1000;

export function isSchemaMismatch(graphQLErrors, networkError) {
    const hit = (errs) => Array.isArray(errs)
        && errs.some((e) => e?.extensions?.code === 'GRAPHQL_VALIDATION_FAILED');
    return hit(graphQLErrors) || hit(networkError?.result?.errors);
}

export function reloadForStaleBundleOnce(now = Date.now()) {
    if (typeof window === 'undefined' || !window.location) return false;
    try {
        const last = Number(window.sessionStorage?.getItem(STALE_RELOAD_KEY) || 0);
        if (last && now - last < STALE_RELOAD_WINDOW_MS) return false;
        window.sessionStorage?.setItem(STALE_RELOAD_KEY, String(now));
    } catch {
        // No sessionStorage (private mode, blocked storage): without a guard
        // a reload could loop, so don't reload at all.
        return false;
    }
    window.location.reload();
    return true;
}

export const errorLink = (appName) => onError(({ graphQLErrors, networkError, response, operation, forward }) => {
    if (isSchemaMismatch(graphQLErrors, networkError)) {
        reloadForStaleBundleOnce();
        return;
    }

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

    // "The session is dead" and "nobody could check the session" are
    // different answers, and only the first justifies throwing the user out.
    //
    // basegeek's auth middleware answers an unreachable validator with a 503 +
    // `Retry-After` (code `AUTH_UNAVAILABLE`) rather than letting the request
    // run anonymously into an UNAUTHENTICATED resolver error — the shape that
    // logged every open tab in the suite out whenever basegeek got slow
    // (BURN_REVIEW_2 §3). A 5xx must therefore stop here: it is a retryable
    // failure of the infrastructure, not a verdict on this session. The
    // substring checks below ('401', 'Unauthorized') are loose enough that a
    // 5xx body could otherwise trip them, so the guard is explicit rather than
    // implied by `statusCode !== 401`.
    if (networkError && networkError.statusCode >= 500) {
        return;
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
        // An expired access token is not an expired session (REVIEW_2026-10
        // B1). The token lives an hour and the 50-minute refresh timer sleeps
        // while Android has the app in the background, so "open the app after
        // a while, tap something" used to land here and log out. Refresh once
        // — shared with every other operation failing at the same moment and
        // with the REST client, see refreshSession() — then send the
        // operation again; authLink re-reads the new token on the way out.
        //
        // Only a refresh that says the session is over (401/403/400) logs out.
        // A refresh that couldn't happen (offline, a 502 mid-restart) is
        // surfaced as this operation's error and the session is left alone.
        //
        // As with the CSRF heal above, onError won't be called again for the
        // retry's own failure, so a second 401 just reaches the caller.
        return new Observable((observer) => {
            let sub = null;
            let closed = false;
            refreshSession().then(
                () => {
                    if (closed) return;
                    sub = forward(operation).subscribe({
                        next: (result) => observer.next(result),
                        error: (retryError) => observer.error(retryError),
                        complete: () => observer.complete(),
                    });
                },
                (refreshError) => {
                    if (closed) return;
                    if (isSessionExpiredError(refreshError)) {
                        // Log out to clear tokens and broadcast to other tabs.
                        logout().then(() => {
                            if (appName) {
                                loginRedirect(appName, window.location.href);
                            }
                        }).catch((e) => console.error('GeekSuite Apollo 401 logout failed:', e));
                        if (networkError) observer.error(networkError);
                        else {
                            observer.next(response);
                            observer.complete();
                        }
                        return;
                    }
                    observer.error(refreshError);
                },
            );
            return () => {
                closed = true;
                if (sub) sub.unsubscribe();
            };
        });
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
