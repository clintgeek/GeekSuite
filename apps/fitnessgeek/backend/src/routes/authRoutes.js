import express from 'express';
const router = express.Router();
import axios from 'axios';
import { authProxyHeaders } from '@geeksuite/user/server/authProxyHeaders';
const BASEGEEK_URL = (process.env.BASEGEEK_URL || process.env.BASE_GEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');
const APP_NAME = process.env.APP_NAME || 'fitnessgeek';

// Cookie + Authorization + X-CSRF-Token, forwarded exactly as the browser sent
// them. The token matters: basegeek's double-submit guard checks it on every
// cookie-authenticated mutation, and under CSRF_TOKEN=enforce a refresh that
// replays the cookie without the header is a 403 — i.e. a suite-wide logout.
// See packages/user/src/server/authProxyHeaders.js.

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

function forwardSetCookieHeaders(req, res, upstreamHeaders) {
  const setCookie = upstreamHeaders && upstreamHeaders['set-cookie'];
  if (!setCookie) return;

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const targetDomain = process.env.LOCAL_AUTH_COOKIE_DOMAIN || req.hostname || 'localhost';
    const isHttps = req.secure || (req.headers['x-forwarded-proto'] || '').includes('https');
    const rewritten = setCookie.map((cookieValue) => {
      let updatedCookie = cookieValue;
      if (/Domain=/i.test(updatedCookie)) {
        updatedCookie = updatedCookie.replace(/Domain=[^;]+/i, `Domain=${targetDomain}`);
      } else {
        updatedCookie = `${updatedCookie}; Domain=${targetDomain}`;
      }

      if (!isHttps) {
        updatedCookie = updatedCookie.replace(/; *Secure/gi, '');
        updatedCookie = updatedCookie.replace(/SameSite=None/gi, 'SameSite=Lax');
      }

      return updatedCookie;
    });

    res.setHeader('Set-Cookie', rewritten);
    return;
  }

  res.setHeader('Set-Cookie', setCookie);
}

/**
 * @route POST /api/auth/login
 * @desc Login user via baseGeek
 * @access Public
 */
router.post('/login', async (req, res, next) => {
  try {
    const identifier = req.body?.identifier || req.body?.email || req.body?.username;
    const password = req.body?.password;
    const app = req.body?.app || APP_NAME;

    // Forward login request to baseGeek
    const response = await axios.post(`${BASEGEEK_URL}/api/auth/login`, {
      identifier,
      password,
      app
    }, { timeout: upstreamTimeoutMs() });

    forwardSetCookieHeaders(req, res, response.headers);
    return res.status(response.status).json(response.data);
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}`
      });
    }

    return res.status(error.response.status || 500).json(error.response.data);
  }
});

/**
 * @route POST /api/auth/register
 * @desc Register new user via baseGeek
 * @access Public
 */
router.post('/register', async (req, res, next) => {
  try {
    const { username, email, password } = req.body;
    const app = req.body?.app || APP_NAME;

    // Forward registration request to baseGeek
    const response = await axios.post(`${BASEGEEK_URL}/api/auth/register`, {
      username,
      email,
      password,
      app
    }, { timeout: upstreamTimeoutMs() });

    forwardSetCookieHeaders(req, res, response.headers);
    return res.status(response.status).json(response.data);
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}`
      });
    }

    return res.status(error.response.status || 500).json(error.response.data);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const bodyRefreshToken = req.body?.refreshToken;
    const cookieRefreshToken = req.cookies?.geek_refresh || req.cookies?.geek_refresh_token;
    const refreshToken = bodyRefreshToken || cookieRefreshToken;
    const app = req.body?.app || APP_NAME;

    const payload = { app };
    if (refreshToken) {
      payload.refreshToken = refreshToken;
    }

    const response = await axios.post(
      `${BASEGEEK_URL}/api/auth/refresh`,
      payload,
      { headers: authProxyHeaders(req), timeout: upstreamTimeoutMs() }
    );

    forwardSetCookieHeaders(req, res, response.headers);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(response.data);
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}`
      });
    }

    return res.status(error.response.status || 500).json(error.response.data);
  }
});

router.post('/validate', async (req, res) => {
  try {
    const response = await axios.post(`${BASEGEEK_URL}/api/auth/validate`, req.body, { timeout: upstreamTimeoutMs() });
    return res.status(response.status).json(response.data);
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}`
      });
    }

    return res.status(error.response.status || 500).json(error.response.data);
  }
});

/**
 * @route GET /api/auth/me
 * @desc Get current user profile
 * @access Private
 */
router.get('/me', async (req, res, next) => {
  try {
    const tokenFromCookie = req.cookies?.geek_token;
    const headerAuth = req.headers.authorization;
    const token = tokenFromCookie || headerAuth?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication token required' }
      });
    }

    const response = await axios.get(`${BASEGEEK_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: upstreamTimeoutMs()
    });

    return res.status(response.status).json(response.data);
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}`
      });
    }

    return res.status(error.response.status || 500).json(error.response.data);
  }
});

/**
 * @route POST /api/auth/logout
 * @desc Logout user (client-side token removal)
 * @access Public
 */
router.post('/logout', (req, res) => {
  (async () => {
    try {
      const response = await axios.post(
        `${BASEGEEK_URL}/api/auth/logout`,
        {},
        { headers: authProxyHeaders(req), timeout: upstreamTimeoutMs() }
      );

      forwardSetCookieHeaders(req, res, response.headers);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(response.status).json(response.data);
    } catch (error) {
      if (!error.response) {
        return res.status(502).json({
          message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}`
        });
      }

      return res.status(error.response.status || 500).json(error.response.data);
    }
  })();
});

export default router;