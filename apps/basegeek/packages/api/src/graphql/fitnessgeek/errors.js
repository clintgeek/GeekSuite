/**
 * errors.js — what a fitnessgeek resolver failure may say to the client.
 *
 * The gateway has no `formatError`, so whatever a resolver threw went to the
 * browser as-is. For BP that was MongoDB's E11000 text with Heather's user id
 * in it (review B13); a CastError, a ValidationError or a TypeError would
 * have gone the same way.
 *
 * The rule, applied by wrapping every fitnessgeek Query and Mutation:
 *
 *   - A `GraphQLError` is deliberate (validateInput's BAD_USER_INPUT,
 *     BP_DUPLICATE, NOT_FOUND) and passes through.
 *   - A plain `Error` (constructor exactly `Error`) is how these resolvers
 *     have always said "Food item not found", "Unauthorized", "You are not
 *     part of a household" — written for a person, and the frontend shows it.
 *     It passes through too, unless its text looks internal.
 *   - Anything else — a mongoose CastError / ValidationError, a
 *     MongoServerError, an AxiosError from the model provider, a TypeError
 *     from a bug — is logged here, whole, and the client gets one plain
 *     sentence with code INTERNAL_SERVER_ERROR.
 *
 * Why a wrapper and not a gateway-wide `formatError`: the gateway serves
 * every app in the suite, and their frontends were written against today's
 * error text. A global mask would change what nine other apps see in one
 * stroke. This changes fitnessgeek's resolvers only, and nothing else.
 */

import { GraphQLError } from 'graphql';
import logger from '../../lib/logger.js';

export const INTERNAL_MESSAGE = 'Something went wrong on our side. Try again in a moment.';

// Text no person should read, even inside a plain Error. Kept in step with
// the frontend's own list (apps/fitnessgeek/frontend/src/utils/errorMessage.js).
const INTERNAL_TEXT = /E11000|duplicate key|Cast to|validation failed|ValidationError|MongoServerError|MongoNetworkError|buffering timed out|ECONN|ETIMEDOUT|socket hang up|status code \d{3}|Cannot read propert|is not defined|is not a function|Unexpected token/i;

/** True when `err` must not reach the client as written. */
export function isInternalError(err) {
  if (!err || typeof err !== 'object') return true;
  const text = String(err.message || '');
  if (err instanceof GraphQLError) return INTERNAL_TEXT.test(text);
  if (err.constructor !== Error) return true;
  // A numeric code is a driver's (11000), never one of ours.
  if (typeof err.code === 'number') return true;
  return INTERNAL_TEXT.test(text);
}

/** The error to throw in place of `err`: itself, or the masked sentence. */
export function maskError(err, where) {
  if (!isInternalError(err)) return err;
  logger.error({ err, resolver: where }, '[fitnessgeek] resolver error (masked for the client)');
  return new GraphQLError(INTERNAL_MESSAGE, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

/**
 * Wrap each resolver function in `map` (a `Query` or `Mutation` object) so a
 * failure goes through `maskError`. Returns a new object; the functions keep
 * their names' behaviour otherwise.
 */
export function maskResolverErrors(map, typeName) {
  return Object.fromEntries(
    Object.entries(map).map(([name, fn]) => {
      if (typeof fn !== 'function') return [name, fn];
      const wrapped = async (...args) => {
        try {
          return await fn(...args);
        } catch (err) {
          throw maskError(err, `${typeName}.${name}`);
        }
      };
      return [name, wrapped];
    })
  );
}
