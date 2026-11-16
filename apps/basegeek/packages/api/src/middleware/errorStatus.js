/**
 * clientErrorResponse — what the last-resort error handler in server.js
 * should answer for an error that is the CLIENT's, not ours
 * (SUITE_REVIEW_2026-11 S4).
 *
 * body-parser raises `http-errors` with a 4xx `status` and a `type`
 * (`entity.parse.failed` for malformed JSON, `entity.too.large` past the
 * 50 MB / AI_BODY_LIMIT cap, `charset.unsupported`, ...), and the cors origin
 * callback in server.js raises a 403. The handler used to answer every one of
 * them 500 "Internal Server Error": logs read it as a server bug, and Apollo
 * Client treats a 5xx as "infrastructure, say nothing", so the person saw
 * nothing either.
 *
 * Returns `null` for anything that is not a 4xx — that stays a 500, exactly
 * as before. The message is only passed through when the error says it is
 * safe to show (`expose`, which http-errors sets for every 4xx).
 *
 * @param {any} err
 * @param {string} [requestId]
 * @returns {{ status: number, body: object } | null}
 */
export function clientErrorResponse(err, requestId) {
  const status = Number(err?.status ?? err?.statusCode);
  if (!Number.isInteger(status) || status < 400 || status > 499) return null;
  return {
    status,
    body: {
      message: err.expose ? String(err.message || 'Bad request') : 'Bad request',
      code: typeof err.type === 'string' && err.type ? err.type : 'BAD_REQUEST',
      requestId,
    },
  };
}

/** The cors() origin rejection, as a 403 the handler above recognises. */
export function corsOriginError() {
  const err = new Error('The CORS policy for this site does not allow access from the specified Origin.');
  err.status = 403;
  err.expose = true;
  err.type = 'cors.origin_denied';
  return err;
}
