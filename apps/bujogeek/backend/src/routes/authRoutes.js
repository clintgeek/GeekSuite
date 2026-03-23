import express from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/authMiddleware.js';
import { meHandler } from '@geeksuite/user/server';

const router = express.Router();

const BASEGEEK_URL = (process.env.BASEGEEK_URL || process.env.BASE_GEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');
const APP_NAME = process.env.APP_NAME || 'bujogeek';

function forwardSetCookieHeaders(res, upstreamHeaders) {
  const setCookie = upstreamHeaders?.['set-cookie'];
  if (!setCookie) return;
  res.setHeader('Set-Cookie', setCookie);
}

function getForwardAuthHeaders(req) {
  const headers = {};
  if (req.headers.cookie) headers.Cookie = req.headers.cookie;
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  return headers;
}

router.post('/login', async (req, res) => {
  try {
    const identifier = req.body?.identifier || req.body?.email || req.body?.username;
    const password = req.body?.password;
    const app = req.body?.app || APP_NAME;

    const response = await axios.post(`${BASEGEEK_URL}/api/auth/login`, {
      identifier,
      password,
      app
    });

    forwardSetCookieHeaders(res, response.headers);

    return res.json({
      success: true,
      data: response.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: { message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}` }
      });
    }

    const status = error.response.status || 500;
    return res.status(status).json({
      success: false,
      error: { message: error.response?.data?.message || 'Login failed' }
    });
  }
});

router.post('/register', async (req, res) => {
  try {
    const response = await axios.post(`${BASEGEEK_URL}/api/auth/register`, {
      ...req.body,
      app: req.body?.app || APP_NAME
    });

    forwardSetCookieHeaders(res, response.headers);

    return res.status(201).json({
      success: true,
      data: response.data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: { message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}` }
      });
    }

    const status = error.response.status || 500;
    return res.status(status).json({
      success: false,
      error: { message: error.response?.data?.message || 'Registration failed' }
    });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    // BaseGeek handles token from cookie or body, so we just pass through
    // console.log('[DEBUG /api/auth/refresh] Passing through to BaseGeek');

    const response = await axios.post(`${BASEGEEK_URL}/api/auth/refresh`, {
      refreshToken,
      app: req.body?.app || APP_NAME
    }, {
      headers: getForwardAuthHeaders(req)
    });

    forwardSetCookieHeaders(res, response.headers);

    return res.status(response.status).json(response.data);
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: { message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}` }
      });
    }

    const status = error.response.status || 500;
    return res.status(status).json({
      success: false,
      error: { message: error.response?.data?.message || 'Token refresh failed' }
    });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const response = await axios.post(`${BASEGEEK_URL}/api/auth/logout`, {}, {
      headers: getForwardAuthHeaders(req)
    });
    forwardSetCookieHeaders(res, response.headers);
  } catch {
    // ignore upstream errors – logout should still clear local tokens
  }

  return res.json({
    success: true,
    message: 'Logout successful',
    timestamp: new Date().toISOString()
  });
});

router.get('/me', authenticate, meHandler());

export default router;