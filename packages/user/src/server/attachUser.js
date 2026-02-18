'use strict';

const { getTokenFromRequest, validateToken } = require('./tokenUtils.js');

/**
 * Express middleware that validates the session cookie / Bearer token
 * against BaseGeek and optionally resolves a local app user.
 *
 * After this middleware runs:
 *   req.geek.user       – SSO identity from BaseGeek
 *   req.geek.localUser  – local Mongoose doc (if model supplied)
 *   req.user            – alias for req.geek.user (backward compat)
 *
 * Options:
 *   baseGeekUrl  – BaseGeek API origin (default: env.BASEGEEK_URL)
 *   cookieName   – cookie to read (default: 'geek_token')
 *   model        – Mongoose model for local user lookup/creation
 *   required     – if false, missing/invalid token continues without user
 *   onCreateUser – async (ssoUser) => fields – extra fields when creating a local user
 */
function attachUser(options = {}) {
  const {
    baseGeekUrl,
    cookieName = 'geek_token',
    model = null,
    required = true,
    onCreateUser,
  } = options;

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
      const ssoUser = await validateToken(token, baseGeekUrl);

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
      if (!required) {
        req.geek = null;
        return next();
      }

      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return res.status(401).json({ message: 'Invalid or expired token' });
      }
      return res.status(502).json({ message: 'Authentication service unavailable' });
    }
  };
}

/**
 * Convenience: optional auth version (doesn't reject missing token).
 */
function optionalUser(options = {}) {
  return attachUser({ ...options, required: false });
}

module.exports = { attachUser, optionalUser };

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
