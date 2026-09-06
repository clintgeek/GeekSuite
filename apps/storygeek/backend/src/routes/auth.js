import express from 'express';
import axios from 'axios';
import { validate } from '../validation/validate.js';
import { refreshSchema } from '../validation/schemas/auth.js';
import { authProxyHeaders } from '@geeksuite/user/server/authProxyHeaders';

const router = express.Router();

const getBaseGeekUrl = () =>
  (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

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

function forwardSetCookieHeaders(res, upstreamHeaders) {
  const setCookie = upstreamHeaders?.['set-cookie'];
  if (!setCookie) return;
  res.setHeader('Set-Cookie', Array.isArray(setCookie) ? setCookie : [setCookie]);
}

// GET /api/auth/me — proxy to baseGeek
router.get('/me', async (req, res) => {
  try {
    const tokenFromCookie = req.cookies?.geek_token;
    const headerAuth = req.headers.authorization;
    const token = tokenFromCookie || (headerAuth?.startsWith('Bearer ') ? headerAuth.substring(7) : null);

    if (!token) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(401).json({ success: false, error: { message: 'Authentication token required' } });
    }

    const response = await axios.get(`${getBaseGeekUrl()}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: upstreamTimeoutMs(),
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(response.data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (!error.response) {
      return res.status(502).json({ message: `Unable to reach baseGeek at ${getBaseGeekUrl()}` });
    }
    return res.status(error.response.status || 500).json(error.response.data);
  }
});

// POST /api/auth/logout — proxy to baseGeek
router.post('/logout', async (req, res) => {
  try {
    const response = await axios.post(
      `${getBaseGeekUrl()}/api/auth/logout`,
      {},
      { headers: authProxyHeaders(req), timeout: upstreamTimeoutMs() }
    );
    forwardSetCookieHeaders(res, response.headers);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(response.data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (!error.response) {
      return res.status(502).json({ message: `Unable to reach baseGeek at ${getBaseGeekUrl()}` });
    }
    return res.status(error.response.status || 500).json(error.response.data);
  }
});

// POST /api/auth/refresh — proxy to baseGeek
router.post('/refresh', validate({ body: refreshSchema }), async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    const refreshCookie = req.cookies?.geek_refresh_token;

    if (!refreshToken && !refreshCookie) {
      return res.status(400).json({ success: false, error: { message: 'refreshToken required' } });
    }

    const app = req.body?.app || 'storygeek';

    const payload = { app };
    if (refreshToken) payload.refreshToken = refreshToken;

    const response = await axios.post(
      `${getBaseGeekUrl()}/api/auth/refresh`,
      payload,
      { headers: authProxyHeaders(req), timeout: upstreamTimeoutMs() }
    );

    forwardSetCookieHeaders(res, response.headers);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(response.data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    if (!error.response) {
      return res.status(502).json({ message: `Unable to reach baseGeek at ${getBaseGeekUrl()}` });
    }
    return res.status(error.response.status || 500).json(error.response.data);
  }
});

export default router;
