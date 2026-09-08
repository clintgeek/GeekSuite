/**
 * AdapterError — one structured failure for every provider adapter.
 *
 * FINDING F-23, second half. Until Phase 2 every adapter threw
 * `` new Error(`<Name> API error (${status}): ${JSON.stringify(body)}`) `` and
 * two separate readers parsed that sentence back apart:
 * `aiFailureEnvelope.upstreamStatusOf` (a regex on `API error (\d{3})`, so it
 * could map the failure onto a caller-safe status) and
 * `AIFreeTier.classifyFreeTierFailure` (the same regex, indirectly, to decide
 * whether a row was dead or merely having a minute). A status that travels as
 * English inside a string carrying the vendor's raw JSON body is two problems
 * in one: the number is fragile — Together's adapter said "Together AI error"
 * for a while and every Together failure was therefore classified `internal`
 * and answered 500 where a bad model pin is documented to be 404 — and the
 * body is a leak waiting for a caller who prints `error.message`.
 *
 * So the status is now a field, and the message never carries the body:
 *
 *   { provider, status, code, message }
 *
 * - `provider` — the roster id, for logs and for `markFreeTierFailure`.
 * - `status`   — the upstream HTTP status, or `null` for a timeout/socket
 *                failure that never got one. `upstreamStatusOf` reads it
 *                first; the regex survives only as the fallback for anything
 *                still throwing strings.
 * - `code`     — the short credential-free token the free-tier health and the
 *                probe already speak: `http_<status>`, `timeout`, `network`,
 *                `rate_limited`, `empty_content`, `unknown`. Identical
 *                vocabulary to `classifyFreeTierFailure`, on purpose: the
 *                probe and the request path must never disagree about what a
 *                failure was.
 * - `message`  — ≤ 80 characters of the *provider's own words*, whitespace
 *                collapsed, and nothing else: no response body, no
 *                credential, no URL. The body is not kept anywhere: it is not
 *                returned, and since 2026-09-07 it is not logged either (see
 *                `raiseAdapterError`). What an operator gets is the status,
 *                the code, the provider and the model, which is what tells
 *                them what to do; the vendor's dashboard has the rest.
 *
 * The 80-character rule and the ellipsis are `aiCatalogDiscovery.safeErrorText`'s.
 * It is reimplemented here rather than imported because every adapter imports
 * this module and `aiCatalogDiscovery` drags mongoose models and the feature
 * runner in behind it — this file's only dependency is the logger. Two
 * implementations of one `slice` is the cheaper side of that trade; if a third
 * appears, promote this one.
 */

import logger from '../../lib/logger.js';

/** How much of a provider's own error text is safe to carry on a message. */
export const ADAPTER_ERROR_TEXT_LIMIT = 80;

/** Trim provider text to something safe to print. */
export function trimProviderText(text, limit = ADAPTER_ERROR_TEXT_LIMIT) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit - 1)}…`;
}

export class AdapterError extends Error {
  /**
   * @param {object} parts
   * @param {string} parts.provider  roster id (`groq`, `gemini`, …)
   * @param {number|null} [parts.status]  upstream HTTP status, when there was one
   * @param {string} [parts.code]  short classified token (see the header)
   * @param {string} [parts.message]  ≤ 80 chars of the provider's own words
   */
  constructor({ provider, status = null, code = 'unknown', message = '' }) {
    // The message is the *only* thing a careless caller might print, so it is
    // trimmed here rather than at each throw site — a new adapter cannot
    // forget.
    super(trimProviderText(message) || code);
    this.name = 'AdapterError';
    this.provider = provider;
    this.status = Number.isInteger(status) ? status : null;
    this.code = code;
  }
}

/**
 * The `code` for a failure, in the vocabulary above.
 *
 * Mirrors `classifyFreeTierFailure`'s tokens deliberately (`http_<status>`
 * when the provider answered, then timeout / network / rate_limited by the
 * words, then `unknown`). It does not decide *hard vs soft* — that judgement
 * belongs to `AIFreeTier` and stays there, reading `status` off this error.
 *
 * @param {number|null} status
 * @param {unknown} error  the original transport error, for its words
 */
export function adapterErrorCode(status, error) {
  if (Number.isInteger(status)) return `http_${status}`;
  const message = String(error?.message || '');
  const code = String(error?.code || '');
  if (/timeout|etimedout|econnaborted|aborted/i.test(`${code} ${message}`)) return 'timeout';
  if (/econnrefused|enotfound|eai_again|socket hang up|network error/i.test(`${code} ${message}`)) {
    return 'network';
  }
  if (/rate limit|quota|too many requests/i.test(message)) return 'rate_limited';
  return 'unknown';
}

/**
 * Build the error, log it **once**, throw it. Every adapter failure — a
 * provider's 4xx, a socket, a missing account id, an unknown roster id — comes
 * through here, so there is exactly one log line per failed call and exactly
 * one shape to audit.
 *
 * What the line carries: `{ provider, model, status, code }` and the trimmed
 * message. What it must never carry, and this is the whole point:
 *
 *   - `err` — an axios error drags `config` along, which holds the request
 *     `url` and (depending on the serializer) headers and request body. Every
 *     one of those has held a credential at some point.
 *   - `data` — the provider's response body. That is F-23's rule, and it does
 *     not stop being the rule because the destination is a log file: the
 *     bodies name models, organizations, projects and entitlements, and one
 *     discovery run probes ~60 rows. Until 2026-09-07 each failing probe wrote
 *     *two* level-50 lines with the body in the second one, so a nightly job
 *     put dozens of them in the production log for outcomes that are not even
 *     errors.
 *
 * Level is `warn`, not `error`: a free-tier row that has died, a 429, a
 * probe that fails — these are the expected weather of this subsystem, and
 * the code path that cares (free-tier health, the probe's verdict) already
 * records them as data. `error` is for things an operator must act on.
 *
 * @returns {never}
 */
export function raiseAdapterError({ provider, model = null, status = null, code = 'unknown', message = '' }) {
  const error = new AdapterError({ provider, status, code, message });
  logger.warn(
    { provider, model: model ?? null, status: error.status, code: error.code },
    error.message
  );
  throw error;
}

/**
 * The one throw site every adapter's catch block funnels into.
 *
 * `axios` failures carry `error.response` (the provider answered) or not (the
 * socket did). Either way the caller-facing artefact is the same four fields,
 * and the body — `error.response.data` — is read for *nothing*, not even a
 * log line.
 *
 * @param {string} provider  roster id
 * @param {any} error  the transport error
 * @param {string|null} [model]  the model id that was asked for, for the log
 * @returns {never}
 */
export function throwAdapterError(provider, error, model = null) {
  // Already ours (a nested adapter call, or a re-throw): pass it through
  // rather than wrap it and lose the status — and do not log it twice.
  if (error instanceof AdapterError) throw error;

  const status = error?.response?.status ?? null;
  // The provider's own words, when it bothered to send any that are not the
  // whole body: `error.message` on an axios failure is its own sentence
  // ("Request failed with status code 404", "timeout of 60000ms exceeded"),
  // which is safe and useful. The body is never read.
  raiseAdapterError({
    provider,
    model,
    status: Number.isInteger(status) ? status : null,
    code: adapterErrorCode(status, error),
    message: error?.message || 'request failed'
  });
}

export default AdapterError;
