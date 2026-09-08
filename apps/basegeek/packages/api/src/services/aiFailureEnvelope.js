/**
 * aiFailureEnvelope — the one vocabulary aiGeek uses to describe an upstream
 * failure, shared by every surface that can suffer one.
 *
 * FINDING F-23 (openaiProxy) / Q46 (aiRoutes): `error.message` went straight
 * into the response, and those messages are built as
 * `` `Gemini API error (${status}): ${JSON.stringify(error.response.data)}` ``
 * in every call*() adapter in aiService. So any `ai:call` key
 * holder learned which vendor sits behind the rotation and read its raw error
 * body — org and project ids, quota and entitlement detail, and on a
 * bad-credential case a vendor-redacted key fragment. None of that is the
 * caller's; the credential that failed is baseGeek's, not theirs.
 *
 * `267c4e3` fixed the three OpenAI-compat sites and filed the rest: the REST
 * `/api/ai/call` (its catch, and its streaming error frame) and
 * `/api/ai/parse-json` (`error.details`) relayed the same strings on their own
 * envelope. Two copies of one allowlist is how a surface drifts back into
 * leaking, so the allowlist lives here now and both routers import it. The
 * proxy renders it into the OpenAI error shape, aiRoutes into baseGeek's
 * `{ success: false, error: {...} }` — the *words* are the same either way,
 * which is what the caller-facing contract in DOCS/AIGEEK_USAGE.md documents.
 *
 * The provider bodies still exist in full, in the logs, where the redacting
 * logger writes them (`logger.error({ err: error, ... })`) and an operator can
 * correlate them by the request id the response carries.
 *
 * Statuses follow what OpenAI answers for the same situation: a provider rate
 * limit is the caller's 429 (their request really was throttled), a provider's
 * rejection of the request shape is their 400, and everything that is
 * baseGeek's problem — a bad provider key, a provider 500, nothing left in the
 * rotation — is a 5xx, because it is.
 */

export const UPSTREAM_FAILURES = {
  invalid_request: {
    status: 400,
    type: 'invalid_request_error',
    code: 'upstream_invalid_request',
    message: 'The upstream model provider rejected this request.'
  },
  model_not_found: {
    status: 404,
    type: 'invalid_request_error',
    code: 'model_not_found',
    message: 'The requested model is not available from the provider that owns it.'
  },
  rate_limited: {
    status: 429,
    type: 'rate_limit_error',
    code: 'rate_limit_exceeded',
    message: 'The upstream model provider rate-limited this request. Retry later.'
  },
  timeout: {
    status: 504,
    type: 'server_error',
    code: 'upstream_timeout',
    message: 'The upstream model provider did not respond in time.'
  },
  unavailable: {
    status: 503,
    type: 'server_error',
    code: 'upstream_unavailable',
    message: 'No upstream model provider was able to serve this request.'
  },
  invalid_json_response: {
    status: 502,
    type: 'server_error',
    code: 'invalid_json_response',
    message: 'The model did not return valid JSON.'
  },
  upstream_error: {
    status: 502,
    type: 'server_error',
    code: 'upstream_error',
    message: 'The upstream model provider failed to complete this request.'
  },
  internal: {
    status: 500,
    type: 'server_error',
    code: 'internal_error',
    message: 'The request could not be completed.'
  }
};

/**
 * The HTTP status a provider answered with, if the failure carries one.
 *
 * Read in order of trust:
 *
 *   1. `error.response.status` — a raw axios failure, from code that talks to
 *      a provider without going through an adapter.
 *   2. `error.status` — an `AdapterError`, which is what every provider
 *      adapter has thrown since Phase 2. A number in a field, which is what
 *      this function always wanted.
 *   3. The regex, kept for anything still throwing a string. `<Provider> API
 *      error (<status>): <body>` was the wire format between the adapters and
 *      this function for a year; the sentence is gone from the adapters, but
 *      test doubles, older log-shaped errors and any code path that builds
 *      one by hand still parse correctly here. None of the string is ever
 *      returned to a caller.
 */
export function upstreamStatusOf(error) {
  const direct = error?.response?.status ?? error?.status;
  if (Number.isInteger(direct) && direct >= 400) return direct;
  const match = /API error \((\d{3})\)/.exec(String(error?.message || ''));
  return match ? Number(match[1]) : null;
}

/**
 * Which entry of UPSTREAM_FAILURES a thrown error is. Unrecognised failures
 * are `internal` — a 500 that says nothing, which is the right answer for a
 * bug in this file and a safe one for anything else.
 */
export function classifyFailure(error) {
  const message = String(error?.message || '');
  const status = upstreamStatusOf(error);

  if (status) {
    if (status === 429) return 'rate_limited';
    if (status === 404) return 'model_not_found';
    if (status === 408 || status === 504) return 'timeout';
    if (status === 401 || status === 403) return 'upstream_error';
    if (status >= 400 && status < 500) return 'invalid_request';
    return 'upstream_error';
  }

  // An AdapterError that never got a status still says what happened, in the
  // one vocabulary the probe and the free-tier health also speak. Read before
  // the message patterns below, because a `code` is a fact and a regex over
  // 80 characters of a vendor's prose is a guess.
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'timeout') return 'timeout';
  if (code === 'rate_limited') return 'rate_limited';
  if (code === 'network') return 'upstream_error';

  // aiService.parseJSONResponse's own words, for the one caller that asks for
  // JSON (`/api/ai/parse-json`). The model answered, and answered with
  // something that was not JSON — which is a distinct and actionable thing to
  // be told, and says nothing about the provider. The answer itself goes to the
  // log, never to the caller.
  if (/invalid ai response format|no json found in response/i.test(message)) {
    return 'invalid_json_response';
  }

  // baseGeek's own free-tier accounting, not a provider's: callAI records it as
  // `Model not available for <provider>: <reason>` and moves on, so it only
  // reaches here when it was the last word.
  if (/model not available for/i.test(message)) return 'rate_limited';
  if (/rate limit|quota|too many requests/i.test(message)) return 'rate_limited';
  if (/timeout|etimedout|econnaborted/i.test(message)) return 'timeout';
  if (/all ai providers failed|failed to initialize|no .*providers/i.test(message)) return 'unavailable';
  if (/econnrefused|enotfound|eai_again|socket hang up|network error/i.test(message)) {
    return 'upstream_error';
  }
  return 'internal';
}

/**
 * Log the real failure, and return the allowlisted one to render.
 *
 * Everything a response needs and nothing about its shape: the status, the
 * fixed message with the request id appended, the `type`/`code` pair. The
 * request id in the message is the thread back to the log line — it is the
 * only thing here that varies with the request, and it is ours, not the
 * provider's. `Retry-After` and `X-Request-Id` are set here too, because a 429
 * without the former disables the automatic retry in every official OpenAI SDK
 * and the id in the message is worthless if the header disagrees with it.
 *
 * Callers that have already sent headers (a streaming error frame) get the
 * same object; setting a header on a flushed response is a no-op and the frame
 * carries the words.
 */
export function resolveFailure(req, res, error, context = {}, logMessage = '[ai] upstream failure') {
  const kind = classifyFailure(error);
  const mapped = UPSTREAM_FAILURES[kind];

  req.log?.error(
    { err: error, ...context, mappedTo: mapped.code, mappedStatus: mapped.status },
    logMessage
  );

  if (!res.headersSent) {
    if (mapped.status === 429 && !res.getHeader('Retry-After')) {
      res.setHeader('Retry-After', '60');
    }
  }

  const requestId = res.getHeader('X-Request-Id') || req.id;
  if (requestId && !res.headersSent && !res.getHeader('X-Request-Id')) {
    res.setHeader('X-Request-Id', String(requestId));
  }

  const message = requestId
    ? `${mapped.message} (request id: ${requestId})`
    : mapped.message;

  return {
    kind,
    status: mapped.status,
    type: mapped.type,
    code: mapped.code,
    message,
    requestId: requestId ? String(requestId) : null
  };
}
