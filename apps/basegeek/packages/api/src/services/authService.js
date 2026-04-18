import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { User } from '../models/user.js';
import bcrypt from 'bcryptjs';
import { VALID_APPS } from '../config/validApps.js';
import logger from '../lib/logger.js';
import * as refreshTokenStore from './refreshTokenStore.js';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long');
}
if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
  throw new Error('JWT_REFRESH_SECRET must be set and at least 32 characters long');
}
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a token expiry spec like '30d', '24h', '1h', or raw seconds string.
 * Returns the value in seconds.
 * @param {string} spec
 * @returns {number}
 */
export function parseTokenTtlSeconds(spec) {
  if (typeof spec !== 'string' || !spec) throw new Error(`Invalid token TTL spec: ${spec}`);
  const dMatch = spec.match(/^(\d+)d$/);
  if (dMatch) return parseInt(dMatch[1], 10) * 86400;
  const hMatch = spec.match(/^(\d+)h$/);
  if (hMatch) return parseInt(hMatch[1], 10) * 3600;
  const mMatch = spec.match(/^(\d+)m$/);
  if (mMatch) return parseInt(mMatch[1], 10) * 60;
  const sMatch = spec.match(/^(\d+)$/);
  if (sMatch) return parseInt(sMatch[1], 10);
  throw new Error(`Unsupported token TTL spec: ${spec}`);
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

// Token generation with app context
export const generateToken = (user, app = null) => {
  if (!user || !user._id) {
    throw new Error('Invalid user object provided for token generation');
  }

  const payload = {
    id: user._id,
    username: user.username,
    email: user.email,
    app
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * Generate a refresh token with jti + family, and register it in Redis.
 * @param {object} user - Mongoose user document
 * @param {string} [app] - optional app context (not currently in refresh payload)
 * @param {string} [family] - family UUID; supply the same one when rotating, omit for new login
 * @returns {Promise<string>} signed JWT refresh token
 */
export const generateRefreshToken = async (user, app = null, family = null) => {
  if (!user || !user._id) {
    throw new Error('Invalid user object provided for refresh token generation');
  }

  const jti = randomUUID();
  const tokenFamily = family || randomUUID();
  const ttlSeconds = parseTokenTtlSeconds(REFRESH_TOKEN_EXPIRES_IN);

  const token = jwt.sign(
    { userId: user._id, jti, family: tokenFamily },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );

  await refreshTokenStore.issue({
    jti,
    userId: String(user._id),
    family: tokenFamily,
    ttlSeconds,
  });

  return token;
};

// ---------------------------------------------------------------------------
// Rotation + reuse detection
// ---------------------------------------------------------------------------

// TTL for family revocation keys: 35 days (slightly longer than 30d refresh life)
const FAMILY_REVOKE_TTL_SECONDS = 35 * 86400;

/**
 * Rotate a refresh token.
 * @param {string} oldRefreshToken
 * @returns {Promise<
 *   { token: string, refreshToken: string, user: object } |
 *   { reuse: true, family: string }
 * >}
 */
export const rotateRefreshToken = async (oldRefreshToken, app = null) => {
  // Validate JWT signature first
  let decoded;
  try {
    decoded = jwt.verify(oldRefreshToken, JWT_REFRESH_SECRET);
  } catch (err) {
    // Invalid signature or malformed token — let the caller surface a 401
    throw err;
  }

  const { jti, family, userId } = decoded;

  // Atomically consume the jti entry from Redis
  const stored = await refreshTokenStore.consume(jti);

  if (stored === null) {
    // Entry not found — expired OR already-rotated (possible reuse)
    const isRevoked = await refreshTokenStore.isFamilyRevoked(family);
    if (!isRevoked) {
      // Family was still active → this is a reuse event; revoke it
      logger.warn({ userId, family }, 'Refresh-token reuse detected — revoking family');
      await refreshTokenStore.revokeFamily(family, FAMILY_REVOKE_TTL_SECONDS);
    }
    // Either way, reject
    return { reuse: true, family };
  }

  // jti was found; defensive check that family is not already revoked
  const isRevoked = await refreshTokenStore.isFamilyRevoked(family);
  if (isRevoked) {
    return { reuse: true, family };
  }

  // Look up the user
  const user = await User.findById(stored.userId || userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Issue new token pair (same family)
  const token = generateToken(user, app);
  const refreshToken = await generateRefreshToken(user, app, family);

  return {
    token,
    refreshToken,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      app
    }
  };
};

// ---------------------------------------------------------------------------
// Logout helpers
// ---------------------------------------------------------------------------

/**
 * Revoke the family of a refresh token extracted from a cookie.
 * Best-effort: malformed or expired tokens are silently ignored.
 * @param {string} refreshToken
 */
export const revokeRefreshTokenFromCookie = async (refreshToken) => {
  if (!refreshToken) return;
  try {
    // Decode without verification (we just need the family claim)
    const decoded = jwt.decode(refreshToken);
    if (decoded && decoded.family) {
      await refreshTokenStore.revokeFamily(decoded.family, FAMILY_REVOKE_TTL_SECONDS);
    }
  } catch {
    // Tolerate malformed tokens — logout should always succeed
  }
};

// ---------------------------------------------------------------------------
// Existing service functions (unchanged signatures)
// ---------------------------------------------------------------------------

// Login user
export const login = async (identifier, password, app) => {
  try {
    // Validate app
    if (!app || !VALID_APPS.includes(app.toLowerCase())) {
      throw new Error('Invalid app');
    }

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() }
      ]
    }).select('+passwordHash');

    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check for missing passwordHash
    if (!user.passwordHash) {
      throw new Error('User does not have a password set');
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Generate tokens — fresh family for each login
    const token = generateToken(user, app);
    const refreshToken = await generateRefreshToken(user, app); // new family

    return {
      token,
      refreshToken,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        app
      }
    };
  } catch (error) {
    throw error;
  }
};

// Validate token
export const validateToken = async (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user._id,
      username: user.username,
      email: user.email,
      app: decoded.app
    };
  } catch (error) {
    throw error;
  }
};

// Get user profile
export const getUserProfile = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user._id,
      username: user.username,
      email: user.email,
      profile: user.profile,
      lastLogin: user.lastLogin
    };
  } catch (error) {
    throw error;
  }
};

export default {
  login,
  validateToken,
  generateToken,
  generateRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenFromCookie,
  parseTokenTtlSeconds,
  getUserProfile
};
