/**
 * The gateway's one "not signed in" answer (SUITE_REVIEW_2026-11 S2).
 *
 * Gateway modules grew three shapes for the same thing: a GraphQLError with
 * `extensions.code: 'UNAUTHENTICATED'`, a bare `new Error('Unauthorized')`
 * with `err.code = 'UNAUTHORIZED'` (which Apollo Server 4 ignores — the client
 * sees INTERNAL_SERVER_ERROR), and `extensions.code: 'UNAUTHORIZED'`. The
 * shared Apollo error link only recovered from the last two because it ALSO
 * matched the message text. This module is the shape every module should
 * throw, so the client can match on the code alone:
 *
 *   - `extensions.code: 'UNAUTHENTICATED'` — what `@geeksuite/api-client`
 *     reads as "refresh the session once, then replay" (and StartGeek's
 *     `gql()` reads as UnauthorizedError);
 *   - a message beginning "Unauthorized" — tabs still running a bundle from
 *     before this change match that substring, so they keep healing.
 *
 * Deliberately NO `extensions.http.status: 401`. Apollo Server would turn the
 * whole response into a 401, and when that response also carries `data` (any
 * nullable field, or a sibling field that answered) Apollo Client's HttpLink
 * delivers it TWICE — `next(result)` and then `error(err)` — so the shared
 * error link ran its refresh-and-replay twice and the operation was sent
 * twice after the refresh. The session gate in middleware/auth.js already
 * answers a refused token with a `data`-less 401; a resolver only sees a
 * caller who presented no token, and an HTTP 200 carrying the code is the
 * answer every client reads exactly once.
 *
 * A caller who IS signed in but may not do the thing is a different answer:
 * `forbidden()` — FORBIDDEN, 403 — and a client must not refresh on it.
 */
import { GraphQLError } from 'graphql';

export const UNAUTHENTICATED = 'UNAUTHENTICATED';
export const FORBIDDEN = 'FORBIDDEN';

/** The UNAUTHENTICATED error itself, for code that needs to throw it directly. */
export function unauthenticated(message = 'Unauthorized: sign in to continue') {
  return new GraphQLError(message, {
    extensions: { code: UNAUTHENTICATED },
  });
}

/** Signed in, but not allowed. Never triggers a session refresh. */
export function forbidden(message = 'Forbidden') {
  return new GraphQLError(message, {
    extensions: { code: FORBIDDEN },
  });
}

/**
 * The signed-in user's id as a string, or throw UNAUTHENTICATED.
 *
 * Returning a string (not `context.user.id` as-is) matters: Mongoose strips
 * `undefined` out of a filter, so a filter built from a possibly-missing id
 * becomes an unscoped query over every tenant. Go through this instead.
 *
 * @param {{ user?: { id?: unknown } } | null | undefined} context
 * @param {string} [message]
 * @returns {string}
 */
export function requireUser(context, message) {
  const id = context?.user?.id;
  if (id === undefined || id === null || id === '') throw unauthenticated(message);
  return String(id);
}
