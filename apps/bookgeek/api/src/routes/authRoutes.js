import express from "express";
import axios from "axios";

const router = express.Router();
const BASEGEEK_URL = process.env.BASEGEEK_URL || "https://basegeek.clintgeek.com";

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
      {
        headers: {
          Cookie: req.headers.cookie || "",
        },
      }
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
    const status = error.response?.status;

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
      {
        headers: {
          Cookie: req.headers.cookie || "",
        },
      }
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
    const status = error.response?.status;
    const message =
      error.response?.data?.message || error.response?.data?.error?.message;

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

    const accessToken = getTokenFromRequest(req);
    const response = await axios.post(
      `${BASEGEEK_URL}/api/auth/refresh`,
      {
        refreshToken,
        app: app || "bookgeek",
      },
      {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          Cookie: req.headers.cookie || "",
        },
      }
    );

    forwardSetCookieHeaders(res, response.headers);

    const { token: newToken, refreshToken: newRefreshToken, user } = response.data;

    return res.status(response.status).json(response.data);
  } catch (error) {
    const status = error.response?.status;
    const message =
      error.response?.data?.message || error.response?.data?.error?.message;

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
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Cookie: req.headers.cookie || "",
          },
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
