import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { meHandler, authProxyHeaders } from '@geeksuite/user/server';

const router = express.Router();

const BASEGEEK_URL = (process.env.BASEGEEK_URL || 'https://basegeek.clintgeek.com').replace(/\/$/, '');
const APP_NAME = 'gamegeek';

// Every call below is a blocking hop to another host on the user's request
// path. Node's global fetch has no default timeout — an unresponsive
// basegeek (hung, not refusing) would otherwise park the handler and its
// socket indefinitely. Same knob/default as the other five consumer
// backends' proxies (packages/user/src/server/tokenUtils.js): 8s.
const DEFAULT_UPSTREAM_TIMEOUT_MS = 8000;
function upstreamTimeoutMs() {
  const raw = Number(process.env.BASEGEEK_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_UPSTREAM_TIMEOUT_MS;
}

function forwardSetCookieHeaders(res, upstreamHeaders) {
  // Node 20's fetch (undici) exposes the individual Set-Cookie values via
  // getSetCookie() — headers.get('set-cookie') would fold multiple cookies
  // into one comma-joined string, which is not a valid Set-Cookie value.
  const cookies = typeof upstreamHeaders.getSetCookie === 'function'
    ? upstreamHeaders.getSetCookie()
    : (upstreamHeaders.get('set-cookie') ? [upstreamHeaders.get('set-cookie')] : []);
  if (cookies.length) res.setHeader('Set-Cookie', cookies);
}

async function postJson(path, body, { headers = {} } = {}) {
  return fetch(`${BASEGEEK_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(upstreamTimeoutMs()),
  });
}

function upstreamUnreachable(res) {
  return res.status(502).json({
    message: `Unable to reach baseGeek auth service at ${BASEGEEK_URL}`,
    code: 'UPSTREAM_UNREACHABLE',
  });
}

router.post('/login', async (req, res) => {
  try {
    const identifier = req.body?.identifier || req.body?.email || req.body?.username;
    const password = req.body?.password;
    const app = req.body?.app || APP_NAME;

    const upstream = await postJson('/api/auth/login', { identifier, password, app });
    const data = await upstream.json().catch(() => ({}));
    forwardSetCookieHeaders(res, upstream.headers);

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        success: false,
        error: { message: data?.message || data?.error?.message || 'Login failed' },
      });
    }

    return res.json({ success: true, data, timestamp: new Date().toISOString() });
  } catch {
    return upstreamUnreachable(res);
  }
});

router.post('/register', async (req, res) => {
  try {
    const upstream = await postJson('/api/auth/register', { ...req.body, app: req.body?.app || APP_NAME });
    const data = await upstream.json().catch(() => ({}));
    forwardSetCookieHeaders(res, upstream.headers);

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        success: false,
        error: { message: data?.message || data?.error?.message || 'Registration failed' },
      });
    }

    return res.status(201).json({ success: true, data, timestamp: new Date().toISOString() });
  } catch {
    return upstreamUnreachable(res);
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;

    const upstream = await postJson(
      '/api/auth/refresh',
      { refreshToken, app: req.body?.app || APP_NAME },
      { headers: authProxyHeaders(req) },
    );
    const data = await upstream.json().catch(() => ({}));
    forwardSetCookieHeaders(res, upstream.headers);

    return res.status(upstream.status).json(data);
  } catch {
    return upstreamUnreachable(res);
  }
});

router.post('/logout', async (req, res) => {
  try {
    const upstream = await postJson('/api/auth/logout', {}, { headers: authProxyHeaders(req) });
    forwardSetCookieHeaders(res, upstream.headers);
  } catch {
    // ignore upstream errors — logout should still clear local tokens
  }

  return res.json({ success: true, message: 'Logout successful', timestamp: new Date().toISOString() });
});

router.get('/me', authenticate, meHandler());

export default router;
