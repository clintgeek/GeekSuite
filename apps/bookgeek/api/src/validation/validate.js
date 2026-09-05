/**
 * Generic request-validation middleware, backed by zod.
 *
 * `validate({ body, params, query })` runs each provided zod schema against
 * the matching `req.<part>`. On success, `req.<part>` is REPLACED with the
 * parsed value (so coercions — e.g. a numeric query string turned into a
 * Number — are visible to the route handler). On failure, it replies with
 * the 400 shape already used across the suite's other zod passes
 * (fitnessgeek's `apps/fitnessgeek/backend/src/validation/validate.js`,
 * storygeek's `apps/storygeek/backend/src/validation/validate.js`, which
 * this mirrors exactly): `{ success: false, error: { message, code } }`,
 * extended with a `details` array of `{ path, message }`, one per failed
 * field. Same envelope, so the suite has one error contract across apps.
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
