import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { authProxyHeaders } from "@geeksuite/user/server/authProxyHeaders";

// Night 2 — 2026-09-06 (Q22): register/login/me are gone. Nothing in this
// repo called them — the frontend redirects the browser straight to
// basegeek's hosted login/register pages (@geeksuite/auth's loginRedirect())
// rather than posting credentials to this backend, and the session check
// goes through GET /api/me (routes/api.js, @geeksuite/user's meHandler()),
// not a local decode. Only the two real server-to-server proxies remain.

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

function forwardSetCookieHeaders(res, upstreamResponse) {
  const cookies = upstreamResponse?.headers?.["set-cookie"];
  if (!cookies) return;
  res.setHeader("Set-Cookie", cookies);
}

/**
 * POST /api/auth/refresh
 * Refresh access token via BaseGeek
 */
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const refreshCookie = req.cookies?.geek_refresh_token;

    if (!refreshToken && !refreshCookie) {
      return res.status(400).json({ success: false, error: { message: "refreshToken required" } });
    }

    const response = await axios.post(
      `${env.basegeekUrl}/api/auth/refresh`,
      {
        refreshToken,
        app: env.appName
      },
      { headers: authProxyHeaders(req), timeout: upstreamTimeoutMs() }
    );

    forwardSetCookieHeaders(res, response);

    const { token, refreshToken: newRefreshToken, user } = response.data;

    // Normalize user object to ensure id field exists
    if (user && !user.id && user._id) {
      user.id = user._id;
    }

    return res.status(response.status).json(response.data);
  } catch (error) {
    logger.error("Token refresh error:", error.response?.data || error.message);
    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: { message: `Unable to reach baseGeek at ${env.basegeekUrl}` }
      });
    }
    const status = error.response.status || 500;
    const message = error.response.data?.message || "Token refresh failed";
    return res.status(status).json({
      success: false,
      error: { message }
    });
  }
};

/**
 * POST /api/auth/logout
 * Client-side logout (tokens removed on client)
 */
export const logout = (req, res) => {
  (async () => {
    try {
      const upstream = await axios.post(
        `${env.basegeekUrl}/api/auth/logout`,
        {},
        { headers: authProxyHeaders(req), timeout: upstreamTimeoutMs() }
      );
      forwardSetCookieHeaders(res, upstream);
    } catch (error) {
      logger.error("Logout proxy error:", error.response?.data || error.message);
    } finally {
      return res.json({
        success: true,
        message: "Logout successful",
        timestamp: new Date().toISOString()
      });
    }
  })();
};
