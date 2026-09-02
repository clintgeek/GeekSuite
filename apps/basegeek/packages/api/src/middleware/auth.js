import jwt from 'jsonwebtoken';
import { VALID_APPS } from '../config/validApps.js';
import { User } from '../models/user.js';

export const authenticateToken = (req, res, next) => {
  // Cookie-first, then Bearer header
  const cookieToken = req.cookies?.geek_token;
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Validate app claim if present (for backward compatibility)
    if (decoded.app && !VALID_APPS.includes(decoded.app)) {
      return res.status(403).json({ message: 'Invalid app token' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};

/**
 * requireRole — the role half of the admin gate, assuming req.user is set.
 *
 * Role is read from the userGeek document on every request rather than carried
 * in the JWT: tokens are long-lived, so a promotion or demotion must take
 * effect without forcing a re-login. The lookup is one indexed-field
 * projection. On success req.user.role is populated for downstream handlers.
 */
export const requireRole = (role) => async (req, res, next) => {
  try {
    const user = await User.findById(req.user?.id).select('role').lean();

    if (!user || (user.role || 'user') !== role) {
      return res.status(403).json({
        error: `${ role }_required`,
        message: `${ role } role required`,
        code: `${ role.toUpperCase() }_REQUIRED`,
      });
    }

    req.user.role = user.role || 'user';
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
