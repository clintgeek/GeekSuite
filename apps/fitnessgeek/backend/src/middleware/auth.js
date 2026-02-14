const jwt = require('jsonwebtoken');
const logger = require('../config/logger');

// JWT secret - must match baseGeek's secret
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set');
}

// Verify JWT token middleware
const authenticateToken = (req, res, next) => {
  const cookieToken = req.cookies?.geek_token;
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  const token = cookieToken || headerToken;

  if (cookieToken && !authHeader) {
    req.headers.authorization = `Bearer ${cookieToken}`;
  }

  if (!token) {
    logger.warn('No token provided', { ip: req.ip, path: req.path });
    return res.status(401).json({
      success: false,
      error: {
        message: 'Access token required',
        code: 'TOKEN_REQUIRED'
      }
    });
  }

  try {
    // Verify token using baseGeek's secret
    const decoded = jwt.verify(token, JWT_SECRET);

    // Add user info to request
    const normalizedId = decoded?._id || decoded?.id || decoded?.userId;
    req.user = {
      ...decoded,
      id: normalizedId,
      _id: normalizedId,
      email: decoded.email,
      username: decoded.username
    };

    logger.info('Token verified successfully', {
      userId: req.user.id,
      path: req.path
    });

    return next();
  } catch (error) {
    logger.warn('Invalid token', {
      error: error.message,
      errorName: error.name,
      tokenLength: token.length,
      ip: req.ip,
      path: req.path
    });

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: {
          message: 'Token expired',
          code: 'TOKEN_EXPIRED'
        }
      });
    }

    return res.status(403).json({
      success: false,
      error: {
        message: 'Invalid token',
        code: 'TOKEN_INVALID'
      }
    });
  }
};

// Optional authentication middleware (for public endpoints)
const optionalAuth = (req, res, next) => {
  const cookieToken = req.cookies?.geek_token;
  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const token = cookieToken || headerToken;

  if (cookieToken && !authHeader) {
    req.headers.authorization = `Bearer ${cookieToken}`;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        username: decoded.username
      };
    } catch (error) {
      // Token is invalid, but we don't fail the request
      logger.debug('Optional auth failed', { error: error.message });
    }
  }
  next();
};

module.exports = {
  authenticateToken,
  optionalAuth
};