import axios from "axios";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const SSO_ACCESS_COOKIE = "geek_token";

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "");
  }

  const cookieToken = req.cookies?.[SSO_ACCESS_COOKIE];
  if (cookieToken) return cookieToken;

  return null;
}

function forwardSetCookieHeaders(res, upstreamResponse) {
  const cookies = upstreamResponse?.headers?.["set-cookie"];
  if (!cookies) return;
  res.setHeader("Set-Cookie", cookies);
}

/**
 * POST /api/auth/register
 * Forward registration request to BaseGeek
 */
export const register = async (req, res) => {
  try {
    const { username, email, password, app } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "username, email, and password required"
      });
    }

    const response = await axios.post(`${ env.basegeekUrl }/api/auth/register`, {
      username,
      email,
      password,
      app: app || env.appName
    });

    forwardSetCookieHeaders(res, response);

    const { token, refreshToken, user } = response.data;

    // Normalize user object to ensure id field exists
    if (user && !user.id && user._id) {
      user.id = user._id;
    }

    return res.status(201).json({
      success: true,
      data: { token, refreshToken, user },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Registration error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || "Registration failed";
    return res.status(status).json({
      success: false,
      error: { message }
    });
  }
};

/**
 * POST /api/auth/login
 * Forward login request to BaseGeek and return tokens + user info
 */
export const login = async (req, res) => {
  try {
    const { identifier, password, app } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({
        message: "identifier and password required"
      });
    }

    const response = await axios.post(`${ env.basegeekUrl }/api/auth/login`, {
      identifier,
      password,
      app: app || env.appName
    });

    forwardSetCookieHeaders(res, response);

    const { token, refreshToken, user } = response.data;

    // Normalize user object to ensure id field exists
    if (user && !user.id && user._id) {
      user.id = user._id;
    }

    return res.json({
      success: true,
      data: { token, refreshToken, user },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Login error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || "Login failed";
    return res.status(status).json({
      success: false,
      error: { message }
    });
  }
};

/**
 * GET /api/auth/me
 * Get current user profile from BaseGeek
 */
export const me = async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: "Authentication token required" });
    }

    const response = await axios.get(`${ env.basegeekUrl }/api/users/me`, {
      headers: { Authorization: `Bearer ${ token }` }
    });

    // Normalize user object to ensure id field exists
    const user = response.data.user || response.data;
    if (user && !user.id && user._id) {
      user.id = user._id;
    }

    logger.info("User profile fetched:", { userId: user?.id || user?._id, username: user?.username });

    res.setHeader("Cache-Control", "no-store");
    return res.json({
      success: true,
      data: { user },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Get current user error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    return res.status(status).json({
      success: false,
      error: { message: "Failed to get user profile" }
    });
  }
};

/**
 * POST /api/auth/refresh
 * Refresh access token via BaseGeek
 */
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // BaseGeek handles token from cookie or body
    // if (!refreshToken) return 400;

    const response = await axios.post(
      `${ env.basegeekUrl }/api/auth/refresh`,
      {
        refreshToken,
        app: env.appName
      }
    );

    forwardSetCookieHeaders(res, response);

    const { token, refreshToken: newRefreshToken, user } = response.data;

    // Normalize user object to ensure id field exists
    if (user && !user.id && user._id) {
      user.id = user._id;
    }

    return res.json({
      success: true,
      data: { token, refreshToken: newRefreshToken, user },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error("Token refresh error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || "Token refresh failed";
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
      const cookie = req.headers.cookie;
      const upstream = await axios.post(
        `${ env.basegeekUrl }/api/auth/logout`,
        {},
        {
          headers: cookie ? { Cookie: cookie } : undefined
        }
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
