/**
 * The message a person should see for a failed request.
 *
 * Calls through `apiService` reject with an ApolloError, whose server text
 * lives in `graphQLErrors[0].message` ("Household not found", "You are
 * already part of a household"). REST calls (`restClient`) reject
 * Axios-shaped, with the server text in `response.data.error.message`.
 *
 * Transport failures get a plain sentence of their own: no signal, the
 * server restarting (every push to main restarts the fleet), a timeout, an
 * expired sign-in. A raw `err.message` ("Request failed with status code
 * 502", "Network Error") is never shown — it is not written for a person.
 * Server text that looks like an internal error (a Mongo E11000, a stack
 * trace) is not shown either; the caller's fallback is.
 */

export const OFFLINE_MESSAGE = "No signal right now. Try again when you're back online.";
export const RESTARTING_MESSAGE = 'FitnessGeek is restarting. Try again in a moment.';
export const TIMEOUT_MESSAGE = 'That took too long. Try again.';
export const SIGNED_OUT_MESSAGE = 'Please sign in again.';

const TECHNICAL = /E11000|duplicate key|Cast to|ValidationError|MongoServerError|stack|at \w+ \(|Unexpected token|Cannot read propert|is not defined|undefined|status code \d{3}|ECONN|ETIMEDOUT|socket hang up|Network Error/i;

const statusOf = (err) =>
  err?.response?.status ??
  err?.networkError?.statusCode ??
  err?.networkError?.response?.status ??
  err?.status ??
  null;

function isOffline(err) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(err?.message || err?.networkError?.message || '');
  if (err?.code === 'ERR_NETWORK' || /Network Error|Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return true;
  }
  return false;
}

function isTimeout(err) {
  const msg = String(err?.message || '');
  return err?.code === 'ECONNABORTED' || err?.code === 'ETIMEDOUT' || err?.name === 'TimeoutError' || /timeout of \d+ms|timed out/i.test(msg);
}

/** A failure the person can't fix by changing what they typed. */
export function transportMessage(err) {
  if (!err) return null;
  if (isTimeout(err)) return TIMEOUT_MESSAGE;
  const status = statusOf(err);
  if (status === 401) return SIGNED_OUT_MESSAGE;
  if (status === 502 || status === 503 || status === 504) return RESTARTING_MESSAGE;
  if (status == null && isOffline(err)) return OFFLINE_MESSAGE;
  return null;
}

function serverText(err) {
  const text =
    err?.graphQLErrors?.[0]?.message ||
    err?.response?.data?.error?.message ||
    (typeof err?.response?.data?.error === 'string' ? err.response.data.error : null) ||
    err?.response?.data?.message ||
    null;
  if (!text || TECHNICAL.test(text)) return null;
  return text;
}

export function errorMessage(err, fallback = "That didn't go through. Try again.") {
  return transportMessage(err) || serverText(err) || fallback;
}

export default errorMessage;
