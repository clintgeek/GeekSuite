import express from 'express';
import axios from 'axios';

const router = express.Router();

const getBaseGeekUrl = () =>
  (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');

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
      { headers: { Cookie: req.headers.cookie || '' } }
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
router.post('/refresh', async (req, res) => {
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
      return res.status(502).json({ message: `Unable to reach baseGeek at ${getBaseGeekUrl()}` });
    }
    return res.status(error.response.status || 500).json(error.response.data);
  }
});

export default router;
