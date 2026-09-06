import { attachUser } from "@geeksuite/user/server";

export const requireAuth = attachUser();

/**
 * Middleware to extract and validate ownerId from request.
 * Runs attachUser first, then extracts ownerId from the authenticated user.
 *
 * Going-over 2026-09-05: this used to fall back to an `X-Owner-Id` header and
 * then to `req.body.ownerId` / `req.query.ownerId` when the session's user
 * carried none of the four id shapes below. That is the same class of hole
 * BURN_REVIEW #4/#18 closed inside the controllers — ownership arriving from
 * the request instead of the session — only one layer earlier and wider: it
 * set `req.ownerId` itself, so every owner-scoped filter in this backend would
 * have been built around a value the caller chose. Ownership now comes only
 * from the authenticated session; a session with no usable id is a 401, not an
 * invitation to name one.
 */
const _attachUser = attachUser();
export const requireOwner = (req, res, next) => {
  _attachUser(req, res, (err) => {
    if (err) return next(err);
    if (!req.user) return res.status(401).json({ message: "Authentication token required" });

    const ownerId = req.user?.id || req.user?._id || req.user?.userId || req.user?.ownerId;

    if (!ownerId) {
      return res.status(401).json({ message: "Authentication token required" });
    }

    req.ownerId = ownerId;
    return next();
  });
};
