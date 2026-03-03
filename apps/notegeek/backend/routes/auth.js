import express from 'express';
import { registerUser, loginUser } from '../controllers/auth.js'; // Import loginUser
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import axios from 'axios';

const router = express.Router();

const getBaseGeekUrl = () => (process.env.USERGEEK_API_URL || process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

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

function forwardSetCookieHeaders(res, upstreamHeaders) {
  const setCookie = upstreamHeaders?.['set-cookie'];
  if (!setCookie) return;

  if (Array.isArray(setCookie)) {
    res.setHeader('Set-Cookie', setCookie);
    return;
  }

  res.setHeader('Set-Cookie', [setCookie]);
}

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post('/register', registerUser);

// @desc    Authenticate user & get token
// @route   POST /api/auth/login
// @access  Public
router.post('/login', loginUser);

/**
 * @route GET /api/auth/me
 * @desc Cookie-first session check (proxy to baseGeek)
 * @access Public
 */
router.get('/me', async (req, res) => {
  try {
    const tokenFromCookie = getCookieFromHeader(req.headers.cookie, 'geek_token');
    const headerAuth = req.headers.authorization;
    const token = tokenFromCookie || (headerAuth?.startsWith('Bearer ') ? headerAuth.substring(7) : null);

    if (!token) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication token required' },
      });
    }

    const response = await axios.get(`${ getBaseGeekUrl() }/api/users/me`, {
      headers: { Authorization: `Bearer ${ token }` },
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(response.data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (!error.response) {
      return res.status(502).json({
        message: `Unable to reach baseGeek auth service at ${ getBaseGeekUrl() }`,
      });
    }

    return res.status(error.response.status || 500).json(error.response.data);
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Cookie-first logout (proxy to baseGeek)
 * @access Public
 */
router.post('/logout', async (req, res) => {
  try {
    const response = await axios.post(
      `${ getBaseGeekUrl() }/api/auth/logout`,
      {},
      {
        headers: {
          Cookie: req.headers.cookie || '',
        },
      }
    );

    forwardSetCookieHeaders(res, response.headers);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(response.data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (!error.response) {
      return res.status(502).json({
        message: `Unable to reach baseGeek auth service at ${ getBaseGeekUrl() }`,
      });
    }
    return res.status(error.response.status || 500).json(error.response.data);
  }
});

// @desc    Refresh token (proxy to baseGeek)
// @route   POST /api/auth/refresh
// @access  Public
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    const app = req.body?.app || 'notegeek';

    const payload = { app };
    if (refreshToken) {
      payload.refreshToken = refreshToken;
    }

    const response = await axios.post(
      `${ getBaseGeekUrl() }/api/auth/refresh`,
      payload,
      {
        headers: {
          Cookie: req.headers.cookie || '',
          Authorization: req.headers.authorization || ''
        },
      }
    );

    forwardSetCookieHeaders(res, response.headers);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(response.data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (!error.response) {
      return res.status(502).json({
        message: `Unable to reach baseGeek auth service at ${ getBaseGeekUrl() }`,
      });
    }
    return res.status(error.response.status || 500).json(error.response.data);
  }
});

// @desc    Validate SSO token from GeekBase
// @route   POST /api/auth/validate-sso
// @access  Public
router.post('/validate-sso', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: 'Token is required' });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Decoded SSO token:', decoded);

    // Find the user by ID
    let user = await User.findById(decoded.id).select('-password');

    // If user doesn't exist, create them
    if (!user) {
      console.log('User not found, creating new user from SSO data');
      user = await User.create({
        email: decoded.email,
        // Don't set password since this is SSO
        passwordHash: 'SSO_USER',
      });
    }

    // Return user data
    res.json({
      _id: user._id,
      email: user.email,
      createdAt: user.createdAt,
      token: token, // Return the same token
    });
  } catch (error) {
    console.error('SSO validation error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired' });
    }
    res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;