import jwt from 'jsonwebtoken';
import { normalizeSsoUser, invalidSession, sessionUnavailable, optionalUser } from '@geeksuite/user/server';
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
  const cookieToken = usableToken(req?.cookies?.geek_token);
  const authHeader = req?.headers?.['authorization'];
  const headerToken = usableToken(authHeader && authHeader.split(' ')[1]);
  return cookieToken || headerToken || null;
}

/**
 * A client that stored nothing can still send `Bearer null` or
 * `Bearer undefined` (a template string over an empty localStorage read).
 * That is no token at all, not a bad one: it must stay anonymous on the
 * gateway rather than be answered 401, or a signed-out page would be sent
 * round the refresh path for presenting the word "null".
 */
function usableToken(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v === 'null' || v === 'undefined') return null;
  return v;
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
    // 401, not 403 (SUITE_REVIEW_2026-11 S6). An expired or unreadable token
    // is "who are you?", which is what 401 means and what makes a client
    // refresh. 403 is kept for "I know who you are and the answer is no"
    // (admin-required, a household denial). The shared axios interceptor
    // refreshes on both, so tabs running an older bundle are unaffected.
    return { ok: false, status: 401, message: 'Invalid or expired token' };
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
 * (answered 401 by `gatewaySession` below — it used to continue anonymously),
 * while a Mongo that
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
 * The answer the gateway gives a request whose session token was presented
 * and refused. Shaped so both ends of the suite read it the same way:
 *
 *   - HTTP 401 with no `data` key: Apollo Client's HttpLink raises it as a
 *     `networkError` with `statusCode: 401`, which the shared error link in
 *     `@geeksuite/api-client` turns into "refresh once, then replay"
 *     (and has done since REVIEW_2026-10 B1, so tabs on older bundles heal too);
 *   - `errors[0].extensions.code === 'UNAUTHENTICATED'` and a message that
 *     starts "Unauthorized", for clients that read the body instead —
 *     StartGeek's `gql()` and any hand-rolled fetch.
 */
export const GATEWAY_UNAUTHENTICATED_BODY = Object.freeze({
  errors: [Object.freeze({
    message: 'Unauthorized: your session has expired, sign in again',
    extensions: Object.freeze({ code: 'UNAUTHENTICATED' }),
  })],
});

export function sendGatewayUnauthenticated(res) {
  if (typeof res.set === 'function') res.set('Cache-Control', 'no-store');
  return res.status(401).json(GATEWAY_UNAUTHENTICATED_BODY);
}

/**
 * gatewaySession — the `/graphql` mount's session stage.
 *
 * `optionalUser()` on its own answered three different requests the same
 * way: no token, a valid token, and a token that was presented but refused
 * (expired, bad signature, user gone, minted before a password change). The
 * third ran anonymously, every owner-scoped list answered `[]` with HTTP 200,
 * and nothing told the client its session needed a refresh — "the app is
 * empty after lunch" (SUITE_REVIEW_2026-11 S1).
 *
 *   - no token at all          → anonymous, exactly as before. Signed-out
 *                                 pages and public operations keep working;
 *   - a valid token            → `req.user`, exactly as before;
 *   - a refused token          → 401 UNAUTHENTICATED (see above), so the
 *                                 client refreshes and replays;
 *   - a check that could not run (Mongo down) → 503 AUTH_UNAVAILABLE from
 *                                 `optionalUser`, unchanged. Never a 401: a
 *                                 slow database must not look like a dead
 *                                 session (BURN_REVIEW_2 §3).
 *
 * Only the access token is considered. The refresh cookie rides along on
 * every request (path `/`) and is deliberately ignored here: a request with
 * no access token but a refresh cookie is still "no token", because
 * answering it 401 would send every signed-out browser holding a stale
 * refresh cookie round refresh → logout → login on any anonymous call.
 * The refresh itself is REST (`POST /api/auth/refresh`), never routed
 * through this stage, so an expired access token cannot block it.
 *
 * @param {{ validateSession?: Function }} [options]
 */
export function gatewaySession({ validateSession = localSessionValidator } = {}) {
  const REFUSED = Symbol('gatewaySessionRefused');
  const stage = optionalUser({
    validateSession: async (token, ctx) => {
      try {
        return await validateSession(token, ctx);
      } catch (err) {
        // optionalUser decides what kind of failure this was: an
        // unavailable check answers 503 itself and never calls next(), so the
        // mark is only read when the request was let through anonymously.
        if (ctx?.req) ctx.req[REFUSED] = err;
        throw err;
      }
    },
  });

  return (req, res, next) => stage(req, res, (err) => {
    if (err) return next(err);
    if (req[REFUSED] && readSessionToken(req)) {
      const reason = req[REFUSED]?.message;
      delete req[REFUSED];
      req.log?.info?.({ reason }, '[GQL] presented session refused: 401');
      return sendGatewayUnauthenticated(res);
    }
    return next();
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
 * also being authenticated: 401 for a missing, expired or invalid token
 * (403 only for a token minted for an app we don't serve) come from
 * authenticateToken, 403 { error: 'admin_required' } from the role
 * check.
 */
export const requireAdmin = (req, res, next) => {
  authenticateToken(req, res, (err) => {
    if (err) return next(err);
    return requireRole('admin')(req, res, next);
  });
};
