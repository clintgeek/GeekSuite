const axios = require('axios');
const UserProfile = require('../models/User'); // Now references UserProfile model
const logger = require('../utils/logger');

const BASEGEEK_URL = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

function getForwardAuthHeaders(req) {
  const headers = {};
  if (req.headers.cookie) headers.Cookie = req.headers.cookie;
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  return headers;
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

class AuthController {
  /**
   * Register - proxy to baseGeek
   */
  async register(req, res, next) {
    try {
      const { username, email, password } = req.body;

      logger.info('Registration attempt', { email, username });

      // Register user with baseGeek
      const response = await axios.post(
        `${BASEGEEK_URL}/api/auth/register`,
        {
          username,
          email,
          password,
          app: 'musicgeek',
        },
        {
          headers: getForwardAuthHeaders(req),
        }
      );

      forwardSetCookieHeaders(res, response.headers);

      const payload = response.data?.data || response.data;
      const upstreamUser = payload?.user || payload?.data?.user || response.data?.user;
      const userId = upstreamUser?._id || upstreamUser?.id || upstreamUser?.userId;
      const token = payload?.token;
      const refreshToken = payload?.refreshToken;

      // Create local UserProfile for MusicGeek-specific data
      const userProfile = userId
        ? await UserProfile.create({
          userId,
          email: upstreamUser?.email || email,
          displayName: upstreamUser?.username || email.split('@')[0],
        })
        : null;

      logger.info('User registered successfully', { userId, email: upstreamUser?.email || email });

      res.status(201).json({
        success: true,
        data: {
          token,
          refreshToken,
          user: {
            id: userId,
            email: upstreamUser?.email,
            username: upstreamUser?.username,
            app: upstreamUser?.app || 'musicgeek',
            profile: userProfile,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Registration error:', {
        error: error.response?.data || error.message,
        email: req.body.email,
      });

      if (error.response?.status === 400) {
        const errorMessage = error.response.data?.message || 'Registration failed';
        return res.status(400).json({
          success: false,
          error: { message: errorMessage },
        });
      }

      if (error.response) {
        return res.status(error.response.status).json({
          success: false,
          error: { message: error.response.data.message || 'Registration failed' },
        });
      }
      next(error);
    }
  }

  /**
   * Login - proxy to baseGeek
   */
  async login(req, res, next) {
    try {
      const { email, password, identifier } = req.body;
      const loginIdentifier = identifier || email;

      logger.info('Login attempt', { identifier: loginIdentifier });

      const loginPayload = {
        identifier: loginIdentifier,
        password,
        app: 'musicgeek',
      };

      logger.info('Sending to BaseGeek', {
        url: `${BASEGEEK_URL}/api/auth/login`,
        payload: { ...loginPayload, password: '***' },
      });

      // Login via baseGeek
      const response = await axios.post(`${BASEGEEK_URL}/api/auth/login`, loginPayload, {
        headers: getForwardAuthHeaders(req),
      });

      forwardSetCookieHeaders(res, response.headers);

      const payload = response.data?.data || response.data;
      const upstreamUser = payload?.user || payload?.data?.user || response.data?.user;
      const userId = upstreamUser?._id || upstreamUser?.id || upstreamUser?.userId;
      const token = payload?.token;
      const refreshToken = payload?.refreshToken;

      // Find or create local UserProfile
      let userProfile = userId ? await UserProfile.findOne({ userId }) : null;

      if (!userProfile) {
        // Create profile for existing baseGeek user
        userProfile = userId
          ? await UserProfile.create({
            userId,
            email: upstreamUser?.email,
            displayName: upstreamUser?.username || loginIdentifier.split('@')[0],
          })
          : null;
        logger.info('Created new user profile', { userId });
      }

      logger.info('Login successful', { userId, email: upstreamUser?.email });

      res.json({
        success: true,
        data: {
          token,
          refreshToken,
          user: {
            id: userId,
            email: upstreamUser?.email,
            username: upstreamUser?.username,
            app: upstreamUser?.app || 'musicgeek',
            profile: userProfile,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Login error:', {
        error: error.response?.data || error.message,
        identifier: req.body.email || req.body.identifier,
      });

      if (error.response?.status === 401) {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid credentials' },
        });
      }

      if (error.response?.status === 429) {
        return res.status(429).json({
          success: false,
          error: { message: 'Too many login attempts. Please try again later.' },
        });
      }

      if (error.response) {
        return res.status(error.response.status).json({
          success: false,
          error: { message: error.response.data.message || 'Login failed' },
        });
      }
      next(error);
    }
  }

  /**
   * Get current user profile
   */
  async getMe(req, res, next) {
    try {
      // req.user comes from auth middleware (JWT token)
      res.setHeader('Cache-Control', 'no-store');

      const userId = req.user?.userId || req.user?.id || req.user?._id;

      logger.info('Fetching user profile', { userId });

      // Find or create UserProfile
      let userProfile = userId ? await UserProfile.findOne({ userId }) : null;

      if (!userProfile) {
        // Create profile if it doesn't exist
        userProfile = userId
          ? await UserProfile.create({
            userId,
            email: req.user.email,
            displayName: req.user.username || req.user.email?.split('@')[0] || 'User',
          })
          : null;
        logger.info('Created user profile on-demand', { userId });
      }

      res.json({
        success: true,
        data: {
          user: {
            id: userId,
            email: req.user.email,
            username: req.user.username,
            profile: userProfile,
          },
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Get user profile error:', { userId: req.user?.id, error: error.message });
      next(error);
    }
  }

  /**
   * Validate SSO token (for client-side validation)
   */
  async validateSSO(req, res, next) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          success: false,
          error: { message: 'Token is required' },
        });
      }

      logger.info('Validating SSO token');

      const response = await axios.get(`${BASEGEEK_URL}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const upstreamUser = response?.data?.data?.user || response?.data?.user || response?.data;
      const userId = upstreamUser?._id || upstreamUser?.id || upstreamUser?.userId;

      // Find or create UserProfile
      let userProfile = userId ? await UserProfile.findOne({ userId }) : null;

      if (!userProfile) {
        userProfile = userId
          ? await UserProfile.create({
            userId,
            email: upstreamUser?.email,
            displayName: upstreamUser?.username || upstreamUser?.email?.split('@')[0] || 'User',
          })
          : null;
        logger.info('Created user profile via SSO', { userId });
      }

      logger.info('SSO token validated', { userId });

      res.json({
        success: true,
        data: {
          user: {
            id: userId,
            email: upstreamUser?.email,
            username: upstreamUser?.username,
            profile: userProfile,
          },
          token,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn('SSO validation failed', { error: error.message });

      if (error?.response?.status === 401 || error?.response?.status === 403) {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid token', code: 'TOKEN_INVALID' },
        });
      }
      next(error);
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;

      // BaseGeek handles token from cookie or body
      // if (!refreshToken) return 400;

      logger.info('Token refresh attempt');

      // Forward refresh request to baseGeek
      const response = await axios.post(
        `${BASEGEEK_URL}/api/auth/refresh`,
        {
          refreshToken,
          app: 'musicgeek',
        },
        {
          headers: getForwardAuthHeaders(req),
        }
      );

      forwardSetCookieHeaders(res, response.headers);

      const payload = response.data?.data || response.data;
      const upstreamUser = payload?.user || payload?.data?.user || response.data?.user;
      const userId = upstreamUser?._id || upstreamUser?.id || upstreamUser?.userId;
      const token = payload?.token;
      const newRefreshToken = payload?.refreshToken;

      logger.info('Token refreshed successfully', { userId });

      res.status(response.status).json(response.data);
    } catch (error) {
      logger.error('Token refresh error:', {
        error: error.response?.data || error.message,
      });

      if (error.response?.status === 401) {
        return res.status(401).json({
          success: false,
          error: { message: 'Invalid or expired refresh token', code: 'REFRESH_TOKEN_INVALID' },
        });
      }

      if (error.response) {
        return res.status(error.response.status).json({
          success: false,
          error: { message: error.response.data.message || 'Token refresh failed' },
        });
      }
      next(error);
    }
  }

  /**
   * Logout user (client handles token removal, but we log it)
   */
  async logout(req, res, next) {
    try {
      const response = await axios.post(`${BASEGEEK_URL}/api/auth/logout`, {}, {
        headers: getForwardAuthHeaders(req),
      });

      forwardSetCookieHeaders(res, response.headers);

      res.status(response.status).json(response.data);
    } catch (error) {
      logger.error('Logout error:', { error: error.message });
      next(error);
    }
  }
}

module.exports = new AuthController();
