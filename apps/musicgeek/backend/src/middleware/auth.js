const config = require('../config/config');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');
const axios = require('axios');

const BASEGEEK_URL = (process.env.BASEGEEK_URL || config.baseGeekUrl || 'https://basegeek.clintgeek.com').replace(
  /\/$/,
  ''
);

function getCookieFromHeader(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    const key = idx >= 0 ? trimmed.slice(0, idx) : trimmed;
    if (key !== name) continue;
    const value = idx >= 0 ? trimmed.slice(idx + 1) : '';
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function normalizeUser(upstreamUser) {
  const normalizedId = upstreamUser?._id || upstreamUser?.id || upstreamUser?.userId;
  return {
    ...upstreamUser,
    _id: normalizedId,
    id: normalizedId,
    userId: normalizedId,
  };
}

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const cookieToken = getCookieFromHeader(req.headers.cookie, 'geek_token');
    const token = headerToken || cookieToken;

    if (!token) {
      logger.warn('Authentication failed: No token provided', {
        ip: req.ip,
        path: req.path,
      });
      throw new UnauthorizedError('No token provided');
    }

    req.authToken = token;
    if (!req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }

    axios
      .get(`${BASEGEEK_URL}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((response) => {
        const upstreamUser = response?.data?.data?.user || response?.data?.user || response?.data;
        req.user = normalizeUser(upstreamUser);

        logger.debug('Token validated via BaseGeek', {
          userId: req.user?.id,
          path: req.path,
        });

        next();
      })
      .catch((error) => {
        const status = error?.response?.status;
        logger.warn('Authentication failed', {
          status,
          error: error.message,
          errorName: error.name,
          ip: req.ip,
          path: req.path,
        });

        if (status === 401 || status === 403) {
          return next(new UnauthorizedError('Unauthorized'));
        }
        return next(error);
      });
  } catch (error) {
    logger.warn('Authentication failed', {
      error: error.message,
      errorName: error.name,
      ip: req.ip,
      path: req.path,
    });

    next(error);
  }
};

const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
    const cookieToken = getCookieFromHeader(req.headers.cookie, 'geek_token');
    const token = headerToken || cookieToken;

    if (!token) return next();

    axios
      .get(`${BASEGEEK_URL}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then((response) => {
        const upstreamUser = response?.data?.data?.user || response?.data?.user || response?.data;
        req.user = normalizeUser(upstreamUser);

        logger.debug('Optional auth: Token validated via BaseGeek', {
          userId: req.user?.id,
          path: req.path,
        });

        next();
      })
      .catch((error) => {
        logger.debug('Optional auth: Token invalid, continuing without user', {
          error: error.message,
          path: req.path,
        });
        next();
      });
  } catch (error) {
    // Continue without user if token invalid
    logger.debug('Optional auth: Token invalid, continuing without user', {
      error: error.message,
      path: req.path,
    });
    next();
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError());
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

module.exports = { authenticate, optionalAuth, authorize };
