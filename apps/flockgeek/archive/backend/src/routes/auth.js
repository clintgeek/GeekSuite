import express from 'express';
import axios from 'axios';

const router = express.Router();
const BASEGEEK_URL = process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com';
const APP_NAME = process.env.APP_NAME || 'flockgeek';

// POST /api/auth/login - forward to baseGeek
router.post('/login', async (req, res) => {
  try {
    const { identifier, password, app } = req.body;
    const response = await axios.post(`${BASEGEEK_URL}/api/auth/login`, {
      identifier,
      password,
      app: app || APP_NAME
    });

    const { token, refreshToken, user } = response.data;

    res.json({
      success: true,
      data: { token, refreshToken, user },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || 'Login failed';
    res.status(status).json({ success: false, error: { message } });
  }
});

// POST /api/auth/register - forward to baseGeek
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, app } = req.body;
    const response = await axios.post(`${BASEGEEK_URL}/api/auth/register`, {
      username,
      email,
      password,
      app: app || APP_NAME
    });

    const { token, refreshToken, user } = response.data;

    res.status(201).json({
      success: true,
      data: { token, refreshToken, user },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Registration error:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || 'Registration failed';
    res.status(status).json({ success: false, error: { message } });
  }
});

// GET /api/auth/me - forward to baseGeek profile
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, error: { message: 'Authentication token required' } });
    }

    const response = await axios.get(`${BASEGEEK_URL}/api/auth/profile`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json({ success: true, data: { user: response.data.user }, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Get current user error:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    res.status(status).json({ success: false, error: { message: 'Failed to get user profile' } });
  }
});

// POST /api/auth/refresh - forward to baseGeek
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: { message: 'Refresh token required' } });
    }

    const response = await axios.post(`${BASEGEEK_URL}/api/auth/refresh`, {
      refreshToken,
      app: APP_NAME
    });

    const { token, refreshToken: newRefreshToken, user } = response.data;

    res.json({
      success: true,
      data: { token, refreshToken: newRefreshToken, user },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || 'Token refresh failed';
    res.status(status).json({ success: false, error: { message } });
  }
});

// POST /api/auth/logout - client-side removal
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logout successful', timestamp: new Date().toISOString() });
});

export default router;
