import express from "express";
import axios from "axios";
import { authProxyHeaders } from "@geeksuite/user/server/authProxyHeaders";

const router = express.Router();
const BASEGEEK_URL = process.env.BASEGEEK_URL || "https://basegeek.clintgeek.com";

// Cookie + Authorization + X-CSRF-Token, forwarded exactly as the browser sent
// them. The token matters: basegeek's double-submit guard checks it on every
// cookie-authenticated mutation, and under CSRF_TOKEN=enforce a refresh that
// replays the cookie without the header is a 403 — i.e. a suite-wide logout.
// See packages/user/src/server/authProxyHeaders.js.

// Every call below is a blocking hop to another host on the user's request
// path, and axios's default timeout is `0` — wait forever. An unresponsive
// basegeek (hung, not refusing) therefore parked the express handler, and the
// browser, until the socket died of its own accord. A bounded wait turns that
// into a 502 (the 401/429 branches below still get their real status; only
// the "connection-level failure" fallthrough — no `error.response` at all —
// changes shape, and a timeout error has no `.response` either).
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
  const setCookie = upstreamHeaders?.["set-cookie"];
  if (!setCookie) return;
  res.setHeader("Set-Cookie", setCookie);
}

function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header || typeof header !== "string") return {};
  const out = {};
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(val);
  }
  return out;
}

function getTokenFromRequest(req) {
  const authHeader = req.headers?.authorization;
  const bearer = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (bearer) return bearer;

  const cookies = parseCookies(req);
  const cookieToken = cookies.geek_token;
  return cookieToken || null;
}

router.post("/login", async (req, res) => {
  try {
    const { identifier, password, app } = req.body;

    const response = await axios.post(
      `${BASEGEEK_URL}/api/auth/login`,
      {
        identifier,
        password,
        app: app || "bookgeek",
      },
      { timeout: upstreamTimeoutMs() }
    );

    forwardSetCookieHeaders(res, response.headers);

    const { token, refreshToken, user } = response.data;

    res.json({
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          app: user.app,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: { message: `Unable to reach baseGeek at ${BASEGEEK_URL}` },
      });
    }

    const status = error.response.status;

    if (status === 401) {
      return res.status(401).json({
        success: false,
        error: { message: "Invalid credentials" },
      });
    }

    if (status === 429) {
      return res.status(429).json({
        success: false,
        error: { message: "Too many login attempts" },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: "Login failed" },
    });
  }
});

router.post("/register", async (req, res) => {
  try {
    const { username, email, password, app } = req.body;

    const response = await axios.post(
      `${BASEGEEK_URL}/api/auth/register`,
      {
        username,
        email,
        password,
        app: app || "bookgeek",
      },
      { timeout: upstreamTimeoutMs() }
    );

    forwardSetCookieHeaders(res, response.headers);

    const { token, refreshToken, user } = response.data;

    res.status(201).json({
      success: true,
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          app: user.app,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: { message: `Unable to reach baseGeek at ${BASEGEEK_URL}` },
      });
    }

    const status = error.response.status;
    const message =
      error.response.data?.message || error.response.data?.error?.message;

    if (status === 400) {
      return res.status(400).json({
        success: false,
        error: { message: message || "Registration failed" },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: "Registration failed" },
    });
  }
});

router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken, app } = req.body;
    const refreshCookie = req.cookies?.geek_refresh_token;

    if (!refreshToken && !refreshCookie) {
      return res.status(400).json({ success: false, error: { message: "refreshToken required" } });
    }

    const accessToken = getTokenFromRequest(req);
    const response = await axios.post(
      `${BASEGEEK_URL}/api/auth/refresh`,
      {
        refreshToken,
        app: app || "bookgeek",
      },
      {
        headers: authProxyHeaders(req, {
          extra: accessToken ? { Authorization: `Bearer ${accessToken}` } : null,
        }),
        timeout: upstreamTimeoutMs(),
      }
    );

    forwardSetCookieHeaders(res, response.headers);

    return res.status(response.status).json(response.data);
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: { message: `Unable to reach baseGeek at ${BASEGEEK_URL}` },
      });
    }

    const status = error.response.status;
    const message =
      error.response.data?.message || error.response.data?.error?.message;

    if (status === 401) {
      return res.status(401).json({
        success: false,
        error: { message: message || "Invalid refresh token" },
      });
    }

    return res.status(500).json({
      success: false,
      error: { message: "Token refresh failed" },
    });
  }
});

router.get("/me", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { message: "Authentication token required" },
      });
    }

    const response = await axios.get(`${BASEGEEK_URL}/api/users/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Cookie: req.headers.cookie || "",
      },
      timeout: upstreamTimeoutMs(),
    });

    const user = response?.data?.data?.user || response?.data?.user || null;

    res.json({
      success: true,
      data: {
        user,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    if (!error.response) {
      return res.status(502).json({
        success: false,
        error: { message: `Unable to reach baseGeek at ${BASEGEEK_URL}` },
      });
    }

    const status = error.response.status;
    if (status === 401 || status === 403) {
      return res.status(status).json({
        success: false,
        error: { message: "Authentication required" },
      });
    }
    return res.status(500).json({
      success: false,
      error: { message: "Failed to get user profile" },
    });
  }
});

router.post("/logout", (req, res) => {
  (async () => {
    try {
      const token = getTokenFromRequest(req);
      const response = await axios.post(
        `${BASEGEEK_URL}/api/auth/logout`,
        null,
        {
          headers: authProxyHeaders(req, {
            extra: token ? { Authorization: `Bearer ${token}` } : null,
          }),
          timeout: upstreamTimeoutMs(),
        }
      );
      forwardSetCookieHeaders(res, response.headers);
    } catch {
      // Always return success; local logout is best-effort.
    }

    res.json({
      success: true,
      message: "Logout successful",
      timestamp: new Date().toISOString(),
    });
  })();
});

export default router;
