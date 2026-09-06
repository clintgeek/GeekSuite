import express from 'express';
import axios from 'axios';
import { authenticate } from '../middleware/authMiddleware.js';
import { meHandler } from '@geeksuite/user/server';
import { authProxyHeaders } from '@geeksuite/user/server/authProxyHeaders';

const router = express.Router();

const BASEGEEK_URL = (process.env.BASEGEEK_URL || process.env.BASE_GEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');
const APP_NAME = process.env.APP_NAME || 'bujogeek';

// Every call below is a blocking hop to another host on the user's request
// path, and axios's default timeout is `0` — wait forever. An unresponsive
// basegeek (hung, not refusing) therefore parked the express handler, and the
// browser, until the socket died of its own accord. A bounded wait turns that
// into the 502 branch each handler already has: a timeout raises an error with
// no `.response`, which is exactly what those branches test for.
//
// Same knob and same default as `packages/user/src/server/tokenUtils.js`, which
// bounds the `/api/users/me` call on every authenticated request — one timeout
// to tune for this backend's whole relationship with basegeek, not two.
const DEFAULT_UPSTREAM_TIMEOUT_MS = 8000;
const upstreamTimeoutMs = () => {
  const raw = Number(process.env.BASEGEEK_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_UPSTREAM_TIMEOUT_MS;
};

function forwardSetCookieHeaders(res, upstreamHeaders) {
  const setCookie = upstreamHeaders?.['set-cookie'];
  if (!setCookie) return;
  res.setHeader('Set-Cookie', setCookie);
}

// Cookie + Authorization + X-CSRF-Token, forwarded exactly as the browser sent
// them. The token matters: basegeek's double-submit guard checks it on every
// cookie-authenticated mutation, and under CSRF_TOKEN=enforce a refresh that
// replays the cookie without the header is a 403 — i.e. a suite-wide logout.
// See packages/user/src/server/authProxyHeaders.js.

router.post('/login', async (req, res) => {
  try {
    const identifier = req.body?.identifier || req.body?.email || req.body?.username;
    const password = req.body?.password;
    const app = req.body?.app || APP_NAME;

    const response = await axios.post(`${BASEGEEK_URL}/api/auth/login`, {
      identifier,
      password,
      app
    }, { timeout: upstreamTimeoutMs() });

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
    }, { timeout: upstreamTimeoutMs() });

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
      headers: authProxyHeaders(req),
      timeout: upstreamTimeoutMs()
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
      headers: authProxyHeaders(req),
      timeout: upstreamTimeoutMs()
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