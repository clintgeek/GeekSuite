const User = require('../models/User');

/**
 * @desc    Register new user
 * @route   POST /api/auth/register
 * @access  Public
 */
const axios = require('axios');
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

/**
 * @desc    Register new user via BaseGeek SSO
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // 1. Register with BaseGeek
    let ssoResponse;
    try {
      ssoResponse = await axios.post(
        `${BASEGEEK_URL}/api/auth/register`,
        {
          email,
          password,
          username: firstName ? `${firstName}${lastName || ''}` : email.split('@')[0],
          app: 'photogeek',
        },
        { headers: getForwardAuthHeaders(req) }
      );
    } catch (ssoError) {
      console.error('SSO Register Error:', ssoError.response?.data || ssoError.message);
      return res.status(ssoError.response?.status || 400).json({
        message: ssoError.response?.data?.error?.message || 'SSO Registration failed'
      });
    }

    forwardSetCookieHeaders(res, ssoResponse.headers);

    const { token, user: ssoUser } = ssoResponse.data.data || ssoResponse.data; // Handle potential response structure variations
    const ssoUserId = ssoUser?._id || ssoUser?.id || ssoUser?.userId;

    // 2. Create local user
    const user = await User.create({
      userId: ssoUserId,
      email,
      password: 'sso_managed_password', // Password managed by SSO
      profile: {
        firstName: firstName || '',
        lastName: lastName || '',
      },
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        email: user.email,
        profile: user.profile,
        skillLevel: user.skillLevel,
        xp: user.xp,
        level: user.level,
        token: token, // Return SSO token
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

const logout = async (req, res) => {
  try {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null;
    const response = await axios.post(
      `${BASEGEEK_URL}/api/auth/logout`,
      {},
      {
        headers: {
          ...getForwardAuthHeaders(req),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }
    );

    forwardSetCookieHeaders(res, response.headers);
    const payload = response.data?.data || response.data;

    return res.json({
      success: true,
      data: payload,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Logout error:', error.response?.data || error.message);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * @desc    Login user via BaseGeek SSO
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    // 1. Login with BaseGeek
    let ssoResponse;
    try {
      console.log(`Attempting SSO login for: ${ email }`);
      ssoResponse = await axios.post(
        `${BASEGEEK_URL}/api/auth/login`,
        {
          identifier: email,
          password,
          app: 'photogeek',
        },
        { headers: getForwardAuthHeaders(req) }
      );
      console.log('SSO Login successful');
    } catch (ssoError) {
      console.error('SSO Login Error Details:', {
        status: ssoError.response?.status,
        data: ssoError.response?.data,
        message: ssoError.message,
        url: `${BASEGEEK_URL}/api/auth/login`
      });

      return res.status(ssoError.response?.status || 401).json({
        message: ssoError.response?.data?.message || ssoError.response?.data?.error?.message || 'Invalid email or password'
      });
    }

    forwardSetCookieHeaders(res, ssoResponse.headers);

    const { token, user: ssoUser } = ssoResponse.data.data || ssoResponse.data;
    const ssoUserId = ssoUser?._id || ssoUser?.id || ssoUser?.userId;

    // 2. Find or Create local user
    let user = await User.findOne({ email });

    if (!user) {
      // Create local user if not exists (first time login via SSO)
      user = await User.create({
        userId: ssoUserId,
        email,
        password: 'sso_managed_password',
        profile: {
          firstName: ssoUser.username || 'User',
          lastName: '',
        }
      });
    } else if (!user.userId && ssoUserId) {
      user.userId = ssoUserId;
      await user.save();
    }

    res.json({
      _id: user._id,
      email: user.email,
      profile: user.profile,
      skillLevel: user.skillLevel,
      xp: user.xp,
      level: user.level,
      streak: user.streak,
      token: token, // Return SSO token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
};

/**
 * @desc    Get current user
 * @route   GET /api/auth/me
 * @access  Private
 */
const getMe = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store');

    const localUserId = req.localUser?._id;
    const user = localUserId ? await User.findById(localUserId).select('-password') : null;

    if (user) {
      res.json({
        success: true,
        data: {
          user,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(404).json({ success: false, error: 'User not found' });
    }
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

module.exports = {
  register,
  login,
  getMe,
  logout,
};
