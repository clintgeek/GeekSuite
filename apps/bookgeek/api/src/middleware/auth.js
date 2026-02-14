import axios from "axios";

const BASEGEEK_URL = process.env.BASEGEEK_URL || "https://basegeek.clintgeek.com";

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

async function validateTokenWithBaseGeek(token) {
  const response = await axios.get(`${BASEGEEK_URL}/api/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const user = response?.data?.data?.user || response?.data?.user || null;
  if (!user) {
    const err = new Error("Invalid user response from BaseGeek");
    err.status = 401;
    throw err;
  }
  return user;
}

export async function authenticateToken(req, res, next) {
  try {
    const token = getTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Authentication token required",
          code: "TOKEN_REQUIRED",
        },
      });
    }

    const user = await validateTokenWithBaseGeek(token);
    const userId = user._id || user.id;

    req.user = {
      id: userId,
      userId,
      ownerId: userId,
      email: user.email,
      username: user.username,
      app: user.app,
    };
    req.userRaw = user;

    return next();
  } catch (error) {
    const status = error.response?.status || error.status;

    if (status === 401 || status === 403) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Unauthorized",
          code: "UNAUTHORIZED",
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: {
        message: "Authentication failed",
        code: "AUTH_FAILED",
      },
    });
  }
}

export async function optionalAuth(req, res, next) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return next();

    const user = await validateTokenWithBaseGeek(token);
    const userId = user._id || user.id;
    req.user = {
      id: userId,
      userId,
      ownerId: userId,
      email: user.email,
      username: user.username,
      app: user.app,
    };
    req.userRaw = user;
  } catch {
    // Ignore optional auth failures
  }

  return next();
}
