const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');

const BASEGEEK_URL = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

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

function normalizeSsoUser(upstreamUser) {
  const upstreamId = upstreamUser?._id || upstreamUser?.id || upstreamUser?.userId;
  return {
    ...upstreamUser,
    userId: upstreamId,
    id: upstreamId,
    _id: upstreamId,
  };
}

/**
 * Middleware to protect routes - requires valid JWT token
 */
const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const cookieToken = getCookieFromHeader(req.headers.cookie, 'geek_token');
  const token = headerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  try {
    // Backward compatibility: if this is a local PhotoGeek JWT, allow it.
    // New standard: validate via BaseGeek and attach req.user.userId.
    let decoded = null;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      decoded = null;
    }

    if (decoded && (decoded.id || decoded.email)) {
      req.localUser = decoded.email
        ? await User.findOne({ email: decoded.email }).select('-password')
        : await User.findById(decoded.id).select('-password');

      if (req.localUser) {
        req.user = {
          userId: decoded.id || req.localUser.id,
          id: decoded.id || req.localUser.id,
          _id: decoded.id || req.localUser.id,
          email: decoded.email || req.localUser.email,
          username: decoded.username,
        };
        return next();
      }

      // If token verifies but we don't have a local user, fall through to BaseGeek validation.
    }

    if (!req.headers.authorization) {
      req.headers.authorization = `Bearer ${token}`;
    }

    const response = await axios.get(`${BASEGEEK_URL}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const upstreamUser = response?.data?.data?.user || response?.data?.user || response?.data;
    const ssoUser = normalizeSsoUser(upstreamUser);
    req.user = ssoUser;

    // Find or create local PhotoGeek user record for app-specific data.
    let localUser = null;
    if (ssoUser?.userId) {
      localUser = await User.findOne({ userId: ssoUser.userId }).select('-password');
    }

    if (!localUser && ssoUser?.email) {
      localUser = await User.findOne({ email: ssoUser.email }).select('-password');
      if (localUser && !localUser.userId && ssoUser.userId) {
        localUser.userId = ssoUser.userId;
        await localUser.save();
      }
    }

    if (!localUser && ssoUser?.email) {
      localUser = await User.create({
        userId: ssoUser.userId,
        email: ssoUser.email,
        password: 'sso_managed_password',
        profile: {
          firstName: ssoUser.username || '',
          lastName: '',
        },
      });

      // Hide password hash from downstream handlers
      localUser = await User.findById(localUser._id).select('-password');
    }

    req.localUser = localUser;
    return next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

/**
 * Generate JWT token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '30d', // Token expires in 30 days
  });
};

module.exports = { protect, generateToken };
