import axios from "axios";
import { env } from "../config/env.js";

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

async function fetchUserFromBaseGeek(token) {
  const response = await axios.get(`${env.basegeekUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const user = response.data?.user || response.data?.data?.user || response.data;
  return user;
}

export const requireAuth = (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  fetchUserFromBaseGeek(token)
    .then((user) => {
      req.user = user;
      return next();
    })
    .catch((error) => {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      return res.status(502).json({ message: "Authentication service unavailable" });
    });
};

/**
 * Middleware to extract and validate ownerId from request.
 * ownerId can come from:
 * 1. X-Owner-Id header (preferred)
 * 2. req.body.ownerId
 * 3. req.query.ownerId
 *
 * In production, this should be extracted from the JWT or user context,
 * but for now we allow it to be passed explicitly for flexibility.
 */
export const requireOwner = (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ message: "Authentication token required" });
  }

  fetchUserFromBaseGeek(token)
    .then((user) => {
      req.user = user;

      const headerOwner = req.header("X-Owner-Id");
      const userOwner = req.user?.id || req.user?._id || req.user?.userId || req.user?.ownerId;
      const ownerId = userOwner || headerOwner || req.body?.ownerId || req.query?.ownerId;

      if (!ownerId) {
        return res.status(400).json({
          error: {
            code: "BAD_REQUEST",
            message: "ownerId missing (use X-Owner-Id header or include in request)"
          }
        });
      }

      req.ownerId = ownerId;
      return next();
    })
    .catch((error) => {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return res.status(401).json({ message: "Invalid or expired token" });
      }
      return res.status(502).json({ message: "Authentication service unavailable" });
    });
};
