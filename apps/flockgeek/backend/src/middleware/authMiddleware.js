import { attachUser } from "@geeksuite/user/server";

export const requireAuth = attachUser();

/**
 * Middleware to extract and validate ownerId from request.
 * Runs attachUser first, then extracts ownerId from the authenticated user.
 */
const _attachUser = attachUser();
export const requireOwner = (req, res, next) => {
  _attachUser(req, res, (err) => {
    if (err) return next(err);
    if (!req.user) return res.status(401).json({ message: "Authentication token required" });

    const headerOwner = req.header("X-Owner-Id");
    const userOwner = req.user?.id || req.user?._id || req.user?.userId || req.user?.ownerId;
    const ownerId = userOwner || headerOwner || req.body?.ownerId || req.query?.ownerId;

    if (!ownerId) {
      return res.status(400).json({
        error: {
          code: "BAD_REQUEST",
          message: "ownerId missing (use X-Owner-Id header or include in request)"
        }
      });
    }

    req.ownerId = ownerId;
    return next();
  });
};
