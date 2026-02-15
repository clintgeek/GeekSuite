import axios from 'axios';
import User from '../models/User.js';

const BASEGEEK_URL = (process.env.USERGEEK_API_URL || process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

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

// Middleware to protect routes (cookie-first SSO)
const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const cookieToken = getCookieFromHeader(req.headers.cookie, 'geek_token');
  const token = headerToken || cookieToken;

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }

  // Normalize: if cookie provided, ensure Authorization exists for downstream proxy calls
  if (cookieToken && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${cookieToken}`;
  }

  try {
    const response = await axios.get(`${BASEGEEK_URL}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const upstreamUser = response?.data?.data?.user || response?.data?.user || response?.data;
    const ssoUser = normalizeSsoUser(upstreamUser);
    req.ssoUser = ssoUser;

    // NoteGeek stores ownership by local Mongo User._id, so map BaseGeek userId -> local user.
    const ssoUserId = ssoUser?.userId;
    const ssoEmail = ssoUser?.email;

    let localUser = null;
    if (ssoUserId) {
      localUser = await User.findOne({ userId: ssoUserId }).select('-passwordHash');
    }

    if (!localUser && ssoEmail) {
      localUser = await User.findOne({ email: ssoEmail }).select('-passwordHash');
      if (localUser && !localUser.userId && ssoUserId) {
        localUser.userId = ssoUserId;
        await localUser.save();
      }
    }

    if (!localUser && ssoEmail) {
      localUser = await User.create({
        userId: ssoUserId,
        email: ssoEmail,
        passwordHash: 'SSO_USER',
      });
      localUser = await User.findById(localUser._id).select('-passwordHash');
    }

    if (!localUser) {
      return res.status(401).json({ message: 'Not authorized, user not found' });
    }

    req.user = localUser;
    return next();
  } catch (error) {
    console.error('Auth middleware error:', error.response?.data || error.message);
    return res.status(401).json({ message: 'Not authorized, token failed' });
  }
};

export { protect };