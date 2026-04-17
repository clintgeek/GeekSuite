import jwt from 'jsonwebtoken';
import { User } from '../models/user.js';
import bcrypt from 'bcryptjs';

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
const VALID_APPS = ['basegeek', 'notegeek', 'bujogeek', 'fitnessgeek', 'storygeek', 'startgeek', 'flockgeek', 'musicgeek', 'babelgeek', 'bookgeek', 'gamegeek', 'photogeek', 'dashgeek'];

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

// Generate refresh token
export const generateRefreshToken = (user) => {
  if (!user || !user._id) {
    throw new Error('Invalid user object provided for refresh token generation');
  }

  return jwt.sign(
    { userId: user._id },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
};

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

    // Generate tokens
    const token = generateToken(user, app);
    const refreshToken = generateRefreshToken(user);

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

// Refresh token
export const refreshToken = async (refreshToken, app) => {
  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Generate new tokens
    const newToken = generateToken(user, app);
    const newRefreshToken = generateRefreshToken(user);

    return {
      token: newToken,
      refreshToken: newRefreshToken,
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
  refreshToken,
  generateToken,
  generateRefreshToken,
  getUserProfile
};