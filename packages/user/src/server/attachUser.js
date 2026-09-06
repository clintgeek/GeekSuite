'use strict';

const {
  getTokenFromRequest,
  validateToken,
  classifyValidationError,
  AUTH_UNAVAILABLE,
  AUTH_RETRY_AFTER_SECONDS,
} = require('./tokenUtils.js');

/**
 * Express middleware that validates the session cookie / Bearer token
 * and optionally resolves a local app user.
 *
 * After this middleware runs:
 *   req.geek.user       – SSO identity
 *   req.geek.localUser  – local Mongoose doc (if model supplied)
 *   req.user            – alias for req.geek.user (backward compat)
 *
 * Options:
 *   baseGeekUrl     – BaseGeek API origin (default: env.BASEGEEK_URL)
 *   cookieName      – cookie to read (default: 'geek_token')
 *   model           – Mongoose model for local user lookup/creation
 *   required        – if false, a missing/invalid token continues without a user
 *   onCreateUser    – async (ssoUser) => fields – extra fields when creating a local user
 *   validateSession – async (token, ctx) => ssoUser|null. Override the default
 *                     HTTP call to basegeek. See below.
 *
 * ## Why `validateSession` exists
 *
 * The default validator asks basegeek over HTTP: `GET BASEGEEK_URL/api/users/me`
 * with the caller's token. That is right for the six consumer backends
 * (bookgeek, bujogeek, fitnessgeek, flockgeek, notegeek, storygeek) — basegeek
 * is a different process and the only holder of `JWT_SECRET`.
 *
 * It is wrong for basegeek itself, which is the seventh caller: its `/graphql`
 * mount runs `optionalUser()`, so every gateway request had basegeek asking
 * *itself* over the network, back out through nginx and in again. Each self-call
 * consumes a request slot to free a request slot, which is a feedback loop with
 * only one stable state, and the 8 s timeout added on 2026-09-05 turned the
 * saturated case from "slow" into "the whole suite logs out" (BURN_REVIEW_2 §3).
 *
 * So basegeek injects a validator that verifies the JWT in-process against its
 * own secret. Nothing about the middleware's contract changes; only who answers
 * the question.
 *
 * The validator is handed `(token, ctx)` where `ctx` is `{ req, baseGeekUrl,
 * cookieName }`. `token` is what `getTokenFromRequest()` found (header first,
 * then cookie); a validator whose app resolves tokens in a different order —
 * basegeek's own middleware is cookie-first — is free to re-read `ctx.req`.
 * It must resolve to the SSO user, or throw `invalidSession()` /
 * `sessionUnavailable()` from `tokenUtils` to say which kind of failure it hit.
 */
function attachUser(options = {}) {
  const {
    baseGeekUrl,
    cookieName = 'geek_token',
    model = null,
    required = true,
    onCreateUser,
    validateSession,
  } = options;

  const validate = typeof validateSession === 'function'
    ? validateSession
    : (token, ctx) => validateToken(token, ctx.baseGeekUrl);

  return async (req, res, next) => {
    const token = getTokenFromRequest(req, cookieName);

    if (!token) {
      if (!required) {
        req.geek = null;
        return next();
      }
      return res.status(401).json({ message: 'Authentication token required' });
    }

    // Ensure Authorization header is set for downstream proxy calls
    if (!req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }

    try {
      const ssoUser = await validate(token, { req, baseGeekUrl, cookieName });

      if (!ssoUser) {
        if (!required) {
          req.geek = null;
          return next();
        }
        return res.status(401).json({ message: 'Invalid user response' });
      }

      let localUser = null;
      if (model) {
        localUser = await ensureLocalUser(model, ssoUser, onCreateUser);
      }

      req.geek = { user: ssoUser, localUser };
      req.user = ssoUser; // backward compat

      return next();
    } catch (error) {
      // "Could not check the token" is never answered with an anonymous
      // request. Falling through anonymously is what let a slow basegeek log
      // the suite out: the resolver downstream has no user, throws
      // UNAUTHENTICATED, and the shared Apollo error link turns that into a
      // logout in every open tab. A 503 is retryable and tells the truth, and
      // no client treats it as a dead session.
      if (classifyValidationError(error) === AUTH_UNAVAILABLE) {
        return sendAuthUnavailable(res);
      }

      if (!required) {
        req.geek = null;
        return next();
      }

      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  };
}

/**
 * The one 503 shape every consumer sends, so a client can recognise it.
 * `Retry-After` is set even though few callers read it — a 503 without one is
 * an invitation to hammer.
 */
function sendAuthUnavailable(res) {
  if (typeof res.set === 'function') {
    res.set('Retry-After', String(AUTH_RETRY_AFTER_SECONDS));
  } else if (typeof res.setHeader === 'function') {
    res.setHeader('Retry-After', String(AUTH_RETRY_AFTER_SECONDS));
  }
  return res.status(503).json({
    message: 'Authentication service unavailable',
    code: 'AUTH_UNAVAILABLE',
    retryAfter: AUTH_RETRY_AFTER_SECONDS,
  });
}

/**
 * Convenience: optional auth version (doesn't reject missing token).
 *
 * "Optional" means *the user may be absent*, not *the check may be skipped*.
 * A missing or invalid token continues anonymously; a check that could not be
 * performed still 503s, exactly as it does when `required`.
 */
function optionalUser(options = {}) {
  return attachUser({ ...options, required: false });
}

module.exports = { attachUser, optionalUser, sendAuthUnavailable };

/**
 * Find or create a local user record from SSO identity.
 * Lookup order: userId → email → create new.
 */
async function ensureLocalUser(Model, ssoUser, onCreateUser) {
  const ssoUserId = ssoUser?.userId;
  const ssoEmail = ssoUser?.email;

  // 1. Find by SSO userId
  if (ssoUserId) {
    const user = await Model.findOne({ userId: ssoUserId });
    if (user) return user;
  }

  // 2. Find by email, backfill userId if missing
  if (ssoEmail) {
    const user = await Model.findOne({ email: ssoEmail });
    if (user) {
      if (!user.userId && ssoUserId) {
        user.userId = ssoUserId;
        await user.save();
      }
      return user;
    }
  }

  // 3. Create new local user
  if (ssoEmail || ssoUserId) {
    const baseFields = {
      userId: ssoUserId,
      email: ssoEmail,
      displayName: ssoUser.username || ssoUser.displayName || ssoEmail?.split('@')[0] || 'User',
    };

    const extraFields = onCreateUser ? await onCreateUser(ssoUser) : {};

    const doc = await Model.create({ ...baseFields, ...extraFields });
    return doc;
  }

  return null;
}
