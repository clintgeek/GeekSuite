/**
 * Generic request-validation middleware, backed by zod.
 *
 * `validate({ body, params, query })` runs each provided zod schema against
 * the matching `req.<part>`. On success, `req.<part>` is REPLACED with the
 * parsed value (so coercions are visible to the route handler). On failure,
 * it replies with a 400 in the shape already used across this backend's
 * hand-written checks (see export.js, auth.js): `{ success: false, error: {
 * message, code } }`, extended with a `details` array of `{ path, message }`,
 * one per failed field. Same shape as fitnessgeek's
 * `apps/fitnessgeek/backend/src/validation/validate.js`, which this mirrors.
 *
 * Only schemas that are actually passed in are enforced — omitting `query`,
 * say, leaves `req.query` untouched.
 */

const REQUEST_PARTS = ['body', 'params', 'query'];

function formatIssues(zodError) {
  return zodError.issues.map((issue) => ({
    path: issue.path.length ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}

function validate(schemas = {}) {
  const parts = REQUEST_PARTS.filter((part) => schemas[part]);

  return function validateMiddleware(req, res, next) {
    const details = [];
    const parsed = {};

    for (const part of parts) {
      const result = schemas[part].safeParse(req[part]);
      if (result.success) {
        parsed[part] = result.data;
      } else {
        details.push(...formatIssues(result.error));
      }
    }

    if (details.length > 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details,
        },
      });
    }

    for (const part of parts) {
      req[part] = parsed[part];
    }

    next();
  };
}

export { validate };
export default { validate };
