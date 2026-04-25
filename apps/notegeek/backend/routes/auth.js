import express from 'express';
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

/**
 * @route POST /api/auth/refresh
 * @desc Refresh token (proxy to baseGeek)
 * @access Public
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    const hasRefreshCookie = (req.headers.cookie || '').includes('geek_refresh_token=');

    if (!refreshToken && !hasRefreshCookie) {
      return res.status(400).json({ success: false, error: { message: 'refreshToken required' } });
    }

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
          Authorization: req.headers.authorization || '',
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

export default router;
