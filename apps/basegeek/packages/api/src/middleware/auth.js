import jwt from 'jsonwebtoken';
import { normalizeSsoUser, invalidSession, sessionUnavailable } from '@geeksuite/user/server';
import { VALID_APPS } from '../config/validApps.js';
import { User } from '../models/user.js';

/**
 * The token this request is presenting, cookie first.
 *
 * Cookie-first is basegeek's own order and predates the shared package's
 * header-first `getTokenFromRequest()`. The two only disagree when a request
 * carries *both* a cookie and a Bearer header naming different sessions, which
 * a browser never does; the order is pinned here so every basegeek code path
 * that reads a session — `authenticateToken` and `localSessionValidator` below
 * — reads the same one.
 */
export function readSessionToken(req) {
  const cookieToken = req.cookies?.geek_token;
  const authHeader = req.headers?.['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  return cookieToken || headerToken || null;
}

/**
 * Verify an access token against this process's own `JWT_SECRET`.
 *
 * The single JWT parser in basegeek. `authenticateToken` (every REST route)
 * and `localSessionValidator` (the GraphQL gateway) both come through here, so
 * there is exactly one place that decides what a valid basegeek session is.
 *
 * @param {string} token
 * @returns {{ok: true, decoded: object} | {ok: false, status: number, message: string}}
 */
export function verifyAccessToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return { ok: false, status: 403, message: 'Invalid or expired token' };
  }

  // Validate app claim if present (for backward compatibility)
  if (decoded.app && !VALID_APPS.includes(decoded.app)) {
    return { ok: false, status: 403, message: 'Invalid app token' };
  }

  return { ok: true, decoded };
}

export const authenticateToken = (req, res, next) => {
  const token = readSessionToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  const result = verifyAccessToken(token);
  if (!result.ok) {
    return res.status(result.status).json({ message: result.message });
  }

  req.user = result.decoded;
  next();
};

/**
 * localSessionValidator — how basegeek validates a session *for itself*.
 *
 * `server.js` mounts `/graphql` behind the shared `optionalUser()`, whose
 * default validator asks `BASEGEEK_URL/api/users/me` over HTTP. Inside
 * basegeek that URL resolves to basegeek: the gateway went out through nginx
 * and back in to ask itself who the caller was, spending an inbound request
 * slot on every inbound request. Under load that is a feedback loop, and once
 * `validateToken` grew an 8 s timeout (2026-09-05) a *slow* basegeek stopped
 * being slow and started being a suite-wide logout — `optionalUser` swallowed
 * the timeout, the request ran anonymous, the resolver threw UNAUTHENTICATED,
 * and the shared Apollo error link logged every open tab out.
 * (BURN_REVIEW_2 §3.)
 *
 * basegeek holds `JWT_SECRET`. It never needed to ask anyone. This validator
 * does in-process what the HTTP round trip did:
 *
 *   1. read the token cookie-first, basegeek's own order (`readSessionToken`);
 *   2. verify it with `verifyAccessToken` — the same parser every REST route
 *      uses, not a second one;
 *   3. refuse a token minted before the user's last password change, the same
 *      rule `rotateRefreshToken` applies to refresh tokens — a password change
 *      ends every session, and the gateway is a session;
 *   4. load the user and return the exact payload `GET /api/users/me` returns,
 *      normalized the way the shared validator normalizes it, so resolvers
 *      reading `context.user.id` cannot tell the two paths apart.
 *
 * Failure kinds are kept distinct on purpose: a bad token is `invalidSession`
 * (the request continues anonymously under `optionalUser`), while a Mongo that
 * will not answer is `sessionUnavailable` — a 503 with `Retry-After`, never an
 * anonymous request that ends in a logout.
 *
 * @param {string} _token  what the shared header-first reader found; ignored
 *                         in favour of basegeek's cookie-first order.
 * @param {{req: import('express').Request}} ctx
 * @returns {Promise<object>} the normalized SSO user
 */
export async function localSessionValidator(_token, ctx = {}) {
  const req = ctx.req;
  const token = readSessionToken(req);
  if (!token) throw invalidSession('Authentication token required');

  const result = verifyAccessToken(token);
  if (!result.ok) throw invalidSession(result.message);

  const { decoded } = result;

  let user;
  try {
    user = await User.findById(decoded.id);
  } catch (err) {
    // The database is the thing that is down, not the session. Anything else
    // here would report a live user as logged out.
    throw sessionUnavailable('User store unavailable', { cause: err });
  }

  if (!user) throw invalidSession('User not found');

  // A password change ends every session, not just the one that made it.
  // `iat` is whole seconds, so the stamp is truncated the same way before
  // comparing — a token minted in the same second as the change is kept, which
  // is the session that made it. Same tolerance, same reasoning, as
  // authService.rotateRefreshToken.
  const changedAt = user.passwordChangedAt;
  if (changedAt && typeof decoded.iat === 'number') {
    if (Math.floor(changedAt.getTime() / 1000) > decoded.iat) {
      throw invalidSession('Token predates a password change');
    }
  }

  // The shape `GET /api/users/me` returns — see routes/user.js formatIdentity.
  // `id` is stringified because the HTTP path went through JSON and resolvers
  // compare `context.user.id` against stored string ids.
  return normalizeSsoUser({
    user: {
      id: String(user._id),
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      role: user.role || 'user',
      profile: user.profile,
      preferences: user.preferences,
    },
  });
}

/**
 * lookupRole — the role on a userGeek document, or null when there is no such
 * user. One indexed-field projection.
 *
 * Role is read from the document on every request rather than carried in the
 * JWT: tokens are long-lived, so a promotion or demotion must take effect
 * without forcing a re-login.
 *
 * Callers must not hand this an API-key caller's id. `apikey_<uuid>` is not an
 * ObjectId, so `findById` throws a CastError — which is why `requireAdminUser`
 * in routes/aiRoutes.js turns a key away before it reaches the role check
 * rather than after.
 *
 * @param {*} userId
 * @returns {Promise<string|null>}
 */
export async function lookupRole(userId) {
  const user = await User.findById(userId).select('role').lean();
  return user ? (user.role || 'user') : null;
}

/**
 * requireRole — the role half of the admin gate, assuming req.user is set.
 *
 * On success req.user.role is populated for downstream handlers.
 */
export const requireRole = (role) => async (req, res, next) => {
  try {
    const found = await lookupRole(req.user?.id);

    if (found !== role) {
      return res.status(403).json({
        error: `${ role }_required`,
        message: `${ role } role required`,
        code: `${ role.toUpperCase() }_REQUIRED`,
      });
    }

    req.user.role = found;
    next();
  } catch (err) {
    req.log?.error({ err }, 'Role check failed');
    return res.status(500).json({ message: 'Role check failed', code: 'ROLE_CHECK_ERROR' });
  }
};

/**
 * requireAdmin — authenticate, then require the 'admin' role.
 *
 * Self-contained so a route can never accidentally be admin-gated without
 * also being authenticated: 401 for a missing token and 403 for an invalid one
 * come from authenticateToken, 403 { error: 'admin_required' } from the role
 * check.
 */
export const requireAdmin = (req, res, next) => {
  authenticateToken(req, res, (err) => {
    if (err) return next(err);
    return requireRole('admin')(req, res, next);
  });
};
