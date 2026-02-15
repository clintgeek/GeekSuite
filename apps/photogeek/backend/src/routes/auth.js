const express = require('express');
const axios = require('axios');
const router = express.Router();
const { register, login, getMe, logout } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const BASEGEEK_URL = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

// 🔑 START SSO LOGIN FLOW
router.get('/sso/login', (req, res) => {
  const redirect = req.query.redirect || 'https://photogeek.clintgeek.com/';
  const url = `${BASEGEEK_URL}/login?app=photogeek&redirect=${encodeURIComponent(redirect)}`;
  return res.redirect(url);
});

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', logout);

// Token refresh (proxied to BaseGeek)
router.post('/refresh', async (req, res) => {
  try {
    const headers = {};
    if (req.headers.cookie) headers.Cookie = req.headers.cookie;
    if (req.headers.authorization) headers.Authorization = req.headers.authorization;

    const response = await axios.post(`${BASEGEEK_URL}/api/auth/refresh`, {
      ...req.body,
      app: 'photogeek'
    }, { headers });

    const setCookie = response.headers?.['set-cookie'];
    if (setCookie) {
      res.setHeader('Set-Cookie', Array.isArray(setCookie) ? setCookie : [setCookie]);
    }

    return res.json(response.data);
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({ message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}` });
    }
    return res.status(error.response.status || 500).json(error.response.data);
  }
});

// Protected routes
router.get('/me', protect, getMe);

module.exports = router;
